#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <version> <windows_amd64_sha256>" >&2
  exit 1
fi

version="$1"
windows_sha="$2"

cat > packaging/scoop/kpanel.json <<MANIFEST
{
  "version": "${version#v}",
  "description": "Lightweight Kafka GUI",
  "homepage": "https://github.com/kpanel/kpanel",
  "license": "MIT",
  "architecture": {
    "64bit": {
      "url": "https://github.com/kpanel/kpanel/releases/download/${version}/kpanel_${version}_windows_amd64.zip",
      "hash": "${windows_sha}"
    }
  },
  "bin": "kpanel.exe",
  "checkver": {
    "github": "https://github.com/kpanel/kpanel"
  },
  "autoupdate": {
    "architecture": {
      "64bit": {
        "url": "https://github.com/kpanel/kpanel/releases/download/v\$version/kpanel_v\$version_windows_amd64.zip"
      }
    }
  }
}
MANIFEST

echo "wrote packaging/scoop/kpanel.json"
