# Distribution and Release Pipeline

This repository ships cross-platform binaries and trust metadata without GoReleaser Pro.

## Release artifacts

Tag pushes matching `v*` trigger `.github/workflows/release.yml` and publish:

- `kpanel_<tag>_darwin_amd64.tar.gz`
- `kpanel_<tag>_darwin_arm64.tar.gz`
- `kpanel_<tag>_linux_amd64.tar.gz`
- `kpanel_<tag>_linux_arm64.tar.gz`
- `kpanel_<tag>_windows_amd64.zip`
- `checksums.txt`
- SBOM files (`*.spdx.json`)
- Cosign signatures (`*.sig`) and certificates (`*.pem`)
- Homebrew formula snapshot (`homebrew-kpanel.rb`)
- Scoop manifest snapshot (`scoop-kpanel.json`)

## Security controls

- Deterministic Go build settings: `-trimpath` and release metadata via `-ldflags`.
- Artifact checksums (`sha256`) via GoReleaser.
- Keyless signing via `cosign` using GitHub OIDC identity.
- Build provenance attestation via `actions/attest-build-provenance`.
- SBOM generation via Syft for each release artifact.

## macOS signing and notarization

`notarize-macos.yml` signs and notarizes Darwin archives post-release.

Required repository secrets:

- `APPLE_SIGNING_CERT_BASE64`
- `APPLE_SIGNING_CERT_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_NOTARY_APPLE_ID`
- `APPLE_NOTARY_TEAM_ID`
- `APPLE_NOTARY_APP_PASSWORD`

The workflow uploads `_notarized.tar.gz` artifacts and `notarized-checksums.txt`.

## Package manager channels

Wave 1 channels are Homebrew and Scoop.

- Formula/manifest generation scripts:
  - `scripts/release/generate-homebrew-formula.sh`
  - `scripts/release/generate-scoop-manifest.sh`
- Optional auto-publish workflow: `publish-package-metadata.yml`

Optional repository variables/secrets for auto-publish:

- `vars.HOMEBREW_TAP_REPO` (for example `kpanel/homebrew-tap`)
- `secrets.HOMEBREW_TAP_PUSH_TOKEN`
- `vars.SCOOP_BUCKET_REPO` (for example `kpanel/scoop-bucket`)
- `secrets.SCOOP_BUCKET_PUSH_TOKEN`

## Phase 2 expansion hooks

- Linux `.deb` and `.rpm` packages: `linux-packages.yml` (nfpm).
- Winget manifest automation and PR flow: `winget-pr.yml`.
  - `vars.WINGET_MANIFEST_REPO` (fork where branch is pushed)
  - `vars.WINGET_UPSTREAM_REPO` (target repo for PR, for example `microsoft/winget-pkgs`)
  - `secrets.WINGET_REPO_TOKEN`

## Install smoke tests

`install-smoke.yml` validates:

- Homebrew install/uninstall on macOS runner
- Scoop install/uninstall on Windows runner

Both tests validate binary execution using `kpanel --version`.
