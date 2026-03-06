# Artifact Verification

For each release tag, download:

- target artifact (for example `kpanel_v0.1.0_darwin_arm64.tar.gz`)
- `checksums.txt`
- matching `*.sig` and `*.pem`

## 1) Verify checksum

```bash
sha256sum -c checksums.txt --ignore-missing
```

## 2) Verify cosign keyless signature

```bash
cosign verify-blob \
  --certificate kpanel_v0.1.0_darwin_arm64.tar.gz.pem \
  --signature kpanel_v0.1.0_darwin_arm64.tar.gz.sig \
  --certificate-identity-regexp 'https://github.com/.+' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  kpanel_v0.1.0_darwin_arm64.tar.gz
```

## 3) Verify provenance attestation

Use GitHub artifact attestations for the release run:

```bash
gh attestation verify \
  --repo kpanel/kpanel \
  kpanel_v0.1.0_darwin_arm64.tar.gz
```

## 4) Tamper test (expected failure)

```bash
cp kpanel_v0.1.0_darwin_arm64.tar.gz tampered.tar.gz
printf 'tamper' >> tampered.tar.gz
cosign verify-blob \
  --certificate kpanel_v0.1.0_darwin_arm64.tar.gz.pem \
  --signature kpanel_v0.1.0_darwin_arm64.tar.gz.sig \
  --certificate-identity-regexp 'https://github.com/.+' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  tampered.tar.gz
```

The tampered verification command must fail.
