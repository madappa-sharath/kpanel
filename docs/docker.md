# Running kpanel in Docker

The image is `ghcr.io/madappa-sharath/kpanel`. It is built for linux/amd64 and linux/arm64 from the same attested archives as the install scripts use. The base is distroless `static-debian12:nonroot`: no shell and no package manager, and it runs as a non-root user.

Tags:

- `vX.Y.Z` is pushed when the release is built.
- `latest` moves to a release only after the release has been public for 72 hours. This is the same delay that the in-app update offer uses.

## Run

```bash
mkdir -p ~/.kpanel
docker run --rm \
  -p 127.0.0.1:8080:8080 \
  --user "$(id -u):$(id -g)" \
  -v ~/.kpanel:/config \
  -v ~/.aws:/home/nonroot/.aws \
  -e AWS_PROFILE -e AWS_REGION \
  ghcr.io/madappa-sharath/kpanel:latest
```

Then open <http://localhost:8080>.

- `-p 127.0.0.1:8080:8080` publishes the port on loopback only. If you use `-p 8080:8080`, every host on your network can reach kpanel, and kpanel uses your Kafka and AWS access.
- `--user` runs kpanel as your host user, so it can read `~/.aws` and write `~/.kpanel`.
- `-v ~/.kpanel:/config` keeps your connections between runs. They are in the same file as a native install uses.
- `-e AWS_PROFILE -e AWS_REGION` passes the variables only if they are set in your shell.

## AWS credentials

You can use one of two methods.

### Mount `~/.aws` (SSO, profiles, static keys)

This is the method that the command above uses. Run `aws sso login` on the host as usual. kpanel reads the cached SSO token from the mount. When the token expires, kpanel refreshes it and writes it back to `~/.aws/sso/cache`.

Do not mount `~/.aws` read-only if you use SSO. The AWS SDK cannot refresh the token without write access, and calls fail with `unable to cache refreshed SSO token`.

A profile that uses `credential_process` (for example aws-vault or granted) does not work in the container, because the helper program is on the host. For these profiles, use the next method.

### Pass short-lived credentials as environment variables (no mount)

```bash
docker run --rm \
  -p 127.0.0.1:8080:8080 \
  --user "$(id -u):$(id -g)" \
  -v ~/.kpanel:/config \
  --env-file <(aws configure export-credentials --profile my-profile --format env-no-export) \
  -e AWS_REGION=us-east-1 \
  ghcr.io/madappa-sharath/kpanel:latest
```

`aws configure export-credentials` (AWS CLI v2) resolves the profile on the host, including SSO and `credential_process`. It then prints temporary keys. The container gets only these keys and no files from `~/.aws`. The keys are not refreshed. When they expire, stop the container and run the command again.

`<( … )` works in bash and zsh. In fish, use `(aws configure export-credentials … | psub)`.

## Limits in the container

- **SASL passwords cannot be saved.** kpanel keeps SASL passwords in the OS keychain, and the image has no keychain service. IAM and unauthenticated connections work.
- **Brokers on the host.** In the container, `localhost` is the container itself. To reach a broker on your machine, use `host.docker.internal:9092` (Docker Desktop). On Linux, add `--add-host=host.docker.internal:host-gateway`. If you use `--network host` instead, `-p` has no effect, so also set `-e KPANEL_HOST=127.0.0.1`. Otherwise kpanel listens on all interfaces of the host.

## Verify the image

```bash
VERSION=vX.Y.Z
gh attestation verify "oci://ghcr.io/madappa-sharath/kpanel:$VERSION" \
  --hostname github.com \
  --repo madappa-sharath/kpanel \
  --signer-workflow madappa-sharath/kpanel/.github/workflows/release.yml \
  --source-ref "refs/tags/$VERSION"
```

The image also carries BuildKit provenance and an SBOM:

```bash
docker buildx imagetools inspect ghcr.io/madappa-sharath/kpanel:$VERSION --format '{{json .SBOM}}'
```

## Updates

When a new release passes the 72-hour delay, kpanel shows `docker pull ghcr.io/madappa-sharath/kpanel:vX.Y.Z`. Pull it, then start the container again with that tag (or with `latest`).
