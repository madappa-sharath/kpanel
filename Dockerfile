# kpanel container image.
#
# The release workflow builds this from the attested linux release archives:
# it extracts each archive to linux/<arch>/kpanel in the build context, so the
# image runs exactly the binary that `gh attestation verify` covers. There is
# no build stage and no RUN step, so buildx needs no emulation for arm64.
#
# To build locally, put a linux binary at linux/<arch>/kpanel and make an
# empty config/ directory, then run `docker buildx build .` in that directory.

# distroless static: CA certificates, tzdata, /etc/passwd, no shell.
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab

ARG TARGETARCH

COPY --chmod=0755 linux/${TARGETARCH}/kpanel /usr/local/bin/kpanel
# Empty, owned by the image user, so the container starts without a mount.
COPY --chown=65532:65532 config /config

# HOME is where the AWS SDK looks for ~/.aws, also when the container runs
# with --user set to the host uid.
ENV HOME=/home/nonroot \
    KPANEL_CONFIG_DIR=/config \
    KPANEL_PORT=8080 \
    KPANEL_HOST=0.0.0.0 \
    KPANEL_INSTALL_METHOD=docker

USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/kpanel"]
