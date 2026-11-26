#!/bin/sh
set -e

REPO="madappa-sharath/kpanel"
INSTALL_DIR="${KPANEL_INSTALL_DIR:-$HOME/.local/bin}"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2 && exit 1 ;;
esac

case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS" >&2 && exit 1 ;;
esac

# Resolve version: use $VERSION env var or fetch latest from GitHub API
if [ -z "$VERSION" ]; then
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' \
    | head -1 \
    | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "Could not determine latest version. Set VERSION env var to install a specific release." >&2
  exit 1
fi

ARCHIVE="kpanel_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
URL="$BASE_URL/$ARCHIVE"
CHECKSUMS_URL="$BASE_URL/checksums.txt"

echo "Installing kpanel $VERSION ($OS/$ARCH)..."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "$TMP/$ARCHIVE"
curl -fsSL "$CHECKSUMS_URL" -o "$TMP/checksums.txt"

# Verify checksum before extracting
echo "Verifying checksum..."
EXPECTED=$(awk -v f="$ARCHIVE" '$2 == f {print $1; exit}' "$TMP/checksums.txt")
if [ -z "$EXPECTED" ]; then
  echo "Could not find checksum for $ARCHIVE in checksums.txt." >&2
  exit 1
fi
if command -v shasum > /dev/null 2>&1; then
  ACTUAL=$(shasum -a 256 "$TMP/$ARCHIVE" | awk '{print $1}')
elif command -v sha256sum > /dev/null 2>&1; then
  ACTUAL=$(sha256sum "$TMP/$ARCHIVE" | awk '{print $1}')
else
  echo "Warning: neither shasum nor sha256sum found — skipping checksum verification." >&2
  ACTUAL="$EXPECTED"
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Checksum verification failed. Aborting." >&2
  exit 1
fi
echo "Checksum OK."

# Verify build provenance. checksums.txt comes from the same release as the
# archive, so it cannot detect a swapped release. The GitHub attestation ties
# the archive to this repo's release workflow.
# Check for a github.com credential (login or GH_TOKEN) rather than `gh auth
# status`, which also fails because of unrelated hosts.
if command -v gh > /dev/null 2>&1 && gh auth token --hostname github.com > /dev/null 2>&1; then
  echo "Verifying build provenance with gh attestation verify..."
  # --source-ref stops an attested archive from an older tag being passed
  # off as this version.
  if ! gh attestation verify "$TMP/$ARCHIVE" \
      --hostname github.com \
      --repo "$REPO" \
      --signer-workflow "$REPO/.github/workflows/release.yml" \
      --source-ref "refs/tags/$VERSION"; then
    echo "Build provenance verification failed for $ARCHIVE. Aborting." >&2
    exit 1
  fi
  echo "Provenance OK."
else
  echo "Warning: GitHub CLI (gh) is not installed or not logged in." >&2
  echo "Warning: skipping build provenance verification; only the SHA-256 checksum was checked." >&2
  echo "Warning: install gh and run 'gh auth login' to verify that this release was built by $REPO." >&2
fi

tar xzf "$TMP/$ARCHIVE" -C "$TMP"

mkdir -p "$INSTALL_DIR"
mv "$TMP/kpanel" "$INSTALL_DIR/kpanel"
chmod +x "$INSTALL_DIR/kpanel"

echo "Installed to $INSTALL_DIR/kpanel"

# Warn if INSTALL_DIR is not on PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not in your PATH."
    echo "Add this to your shell config, then restart the terminal:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    echo "zsh:   echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc"
    echo "bash:  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc"
    ;;
esac

"$INSTALL_DIR/kpanel" --version
