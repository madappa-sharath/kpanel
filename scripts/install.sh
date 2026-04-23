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
EXPECTED=$(grep "$ARCHIVE" "$TMP/checksums.txt" | awk '{print $1}')
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

tar xzf "$TMP/$ARCHIVE" -C "$TMP"

mkdir -p "$INSTALL_DIR"
mv "$TMP/kpanel" "$INSTALL_DIR/kpanel"
chmod +x "$INSTALL_DIR/kpanel"

echo "Installed to $INSTALL_DIR/kpanel"

# Warn if INSTALL_DIR is not on PATH
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "Note: $INSTALL_DIR is not in your PATH. Add it to your shell config." ;;
esac

"$INSTALL_DIR/kpanel" --version
