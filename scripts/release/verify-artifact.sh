#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <artifact-path>" >&2
  exit 1
fi

artifact="$1"

if [[ ! -f "checksums.txt" ]]; then
  echo "checksums.txt not found in current directory" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum -c checksums.txt --ignore-missing
else
  shasum -a 256 -c checksums.txt
fi
cosign verify-blob \
  --certificate "${artifact}.pem" \
  --signature "${artifact}.sig" \
  --certificate-identity-regexp "https://github.com/.+" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "${artifact}"

echo "verification succeeded for ${artifact}"
