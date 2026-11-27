---
title: Installation
seoTitle: Install kpanel — Kafka GUI for macOS, Linux and Windows
description: Install the kpanel Kafka GUI on macOS, Linux or Windows with the install script or a direct download, and verify the release with GitHub artifact attestations.
---

kpanel ships as one binary for macOS, Linux and Windows. There is no runtime to install and no server to deploy.

## Install script (macOS and Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/madappa-sharath/kpanel/main/scripts/install.sh | sh
```

The script installs to `~/.local/bin/kpanel`. Set `KPANEL_INSTALL_DIR` to install somewhere else. It does not use `sudo`. If the install directory is not in your `PATH`, the script prints the shell commands to add it.

To install a specific release, set `VERSION`:

```bash
curl -fsSL https://raw.githubusercontent.com/madappa-sharath/kpanel/main/scripts/install.sh | VERSION=v0.0.18 sh
```

## Install script (Windows)

In PowerShell:

```powershell
irm https://raw.githubusercontent.com/madappa-sharath/kpanel/main/scripts/install.ps1 | iex
```

This installs to `%LOCALAPPDATA%\kpanel\kpanel.exe` and adds that directory to your user `PATH`. It does not need admin rights.

You can read both scripts before you run them: [`install.sh`](https://github.com/madappa-sharath/kpanel/blob/main/scripts/install.sh) and [`install.ps1`](https://github.com/madappa-sharath/kpanel/blob/main/scripts/install.ps1).

## Direct download

Each [release](https://github.com/madappa-sharath/kpanel/releases) has archives for these platforms:

| Platform | Archive |
|---|---|
| macOS, Apple Silicon | `kpanel_darwin_arm64.tar.gz` |
| macOS, Intel | `kpanel_darwin_amd64.tar.gz` |
| Linux, x86-64 | `kpanel_linux_amd64.tar.gz` |
| Linux, ARM64 | `kpanel_linux_arm64.tar.gz` |
| Windows, x86-64 | `kpanel_windows_amd64.zip` |
| Windows, ARM64 | `kpanel_windows_arm64.zip` |

macOS or Linux:

```bash
curl -fLO https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_darwin_arm64.tar.gz
tar xzf kpanel_darwin_arm64.tar.gz
install -m 0755 kpanel ~/.local/bin/kpanel
kpanel
```

Windows (PowerShell):

```powershell
Invoke-WebRequest -Uri https://github.com/madappa-sharath/kpanel/releases/latest/download/kpanel_windows_amd64.zip -OutFile kpanel.zip
Expand-Archive kpanel.zip -DestinationPath .; .\kpanel.exe
```

## Run it

```bash
kpanel
```

kpanel prints its URL and config directory, then opens the URL in your default browser. The default URL is `http://localhost:8080`. If port 8080 is in use, kpanel picks a free port and prints it. Stop it with `Ctrl+C`.

`kpanel --version` prints the version and exits.

For AWS MSK, sign in to AWS first:

```bash
aws sso login   # or aws configure, or set AWS_PROFILE / AWS_ACCESS_KEY_ID
kpanel
```

## Verify a release

Release archives (`kpanel_*.tar.gz` and `kpanel_*.zip`) published since attestations were added have a [GitHub artifact attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) (SLSA build provenance). The attestation proves that the archive was built by the repository's [release workflow](https://github.com/madappa-sharath/kpanel/blob/main/.github/workflows/release.yml) from that release's tag.

A `checksums.txt` file only proves that the archive matches a file in the same release. It cannot detect a release where both files were replaced. The attestation can.

### What the install scripts check

The scripts verify the archive before they extract it:

- If the [GitHub CLI](https://cli.github.com) (`gh`) is installed and logged in to github.com (or `GH_TOKEN` is set), the script runs `gh attestation verify`. If verification fails, or the release has no attestation, the install stops.
- If `gh` is not installed or not logged in, the script prints a warning and checks only the SHA-256 checksum.
- The script always checks the SHA-256 checksum from `checksums.txt`.

Releases published before attestations were added cannot be installed with the install scripts while `gh` is logged in.

### Verify by hand

```bash
VERSION=vX.Y.Z   # an attested release tag
ARCHIVE=kpanel_darwin_arm64.tar.gz
curl -fLO https://github.com/madappa-sharath/kpanel/releases/download/$VERSION/$ARCHIVE
gh attestation verify "$ARCHIVE" \
  --hostname github.com \
  --repo madappa-sharath/kpanel \
  --signer-workflow madappa-sharath/kpanel/.github/workflows/release.yml \
  --source-ref "refs/tags/$VERSION"
```

To check the checksum:

```bash
curl -fLO https://github.com/madappa-sharath/kpanel/releases/download/$VERSION/checksums.txt
grep "$ARCHIVE" checksums.txt | sha256sum --check
```

Releases also include an SBOM file (`*.sbom.json`) for each archive.

## Uninstall

Delete the binary. kpanel keeps its config in `~/.kpanel` (or `KPANEL_CONFIG_DIR`), and passwords in your OS keychain under the service name `kpanel`. Delete connections in the UI first if you want their keychain entries removed, then delete the config directory.
