# Release Security Incident Playbook

Use this when a release artifact, signature, or package channel is compromised or suspected compromised.

## 1. Contain

- Mark the affected GitHub release as pre-release or remove it.
- Remove compromised artifacts from the release.
- Revoke package-channel references:
  - Homebrew tap formula rollback
  - Scoop bucket manifest rollback
- Pause automated package metadata publishing workflows.

## 2. Assess

- Identify impacted versions and platforms.
- Verify whether compromise affects source, CI, signing, or only distribution metadata.
- Validate unaffected releases with checksum + cosign + attestation checks.

## 3. Eradicate and recover

- Rotate credentials/tokens involved:
  - GitHub tokens used for tap/bucket push
  - Apple notarization/signing credentials if exposed
- Cut a clean replacement release with a new tag.
- Re-generate checksums, signatures, SBOMs, and attestations.

## 4. Communicate

- Publish GitHub Security Advisory with:
  - affected versions
  - compromise window (UTC timestamps)
  - remediation version
  - verification instructions
- Post mitigation steps in release notes and README security section.

## 5. Post-incident hardening

- Add or tighten CI release gates.
- Restrict workflow permissions to minimum needed.
- Require branch protection and signed tags for release branches.
- Add retrospective with corrective actions and due dates.
