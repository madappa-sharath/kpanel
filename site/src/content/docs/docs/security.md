---
title: "Security model"
seoTitle: "kpanel security: local Kafka GUI, OS keychain, releases"
description: "How kpanel handles credentials: it runs on your machine, keeps passwords in the OS keychain, uses your own AWS identity, and ships attested releases."
---

kpanel is a program you run on your own machine. There is no kpanel service, account or sign-up, and nothing is sent to the kpanel project.

## Where it runs

The kpanel binary starts an HTTP server and opens the UI in your browser. The UI talks only to that server. The server talks to your Kafka brokers and, for MSK, to AWS.

The server listens on port 8080 (or `KPANEL_PORT`) on all network interfaces, and it has no login of its own. Anyone who can reach that port on your machine can use kpanel with your saved connections. On a shared network, block the port with your firewall.

## Network connections

kpanel makes these outbound connections:

- To the Kafka brokers in your connections.
- To AWS, for MSK connections and discovery: STS, the MSK (`kafka`) API and CloudWatch, with your credentials.
- To `api.github.com`, at startup and every 6 hours, to check for a new kpanel release. See [Updates](/docs/updates/). The request contains no data about you or your clusters.

It sends no telemetry or analytics.

## Credentials

- **SASL usernames and passwords** are stored in the OS keychain under the service name `kpanel`: macOS Keychain, the Secret Service on Linux, or Windows Credential Manager. `config.json` holds only a reference to the keychain entry. Deleting a connection deletes its keychain entry.
- **AWS credentials** are never stored by kpanel. It reads them from the standard AWS SDK chain (SSO, profiles, environment variables, instance profile) each time it needs them. You sign in as yourself, so kpanel can do only what your IAM identity is allowed to do.
- **CA certificates** you upload are saved in `~/.kpanel/certs/` with file mode `0600`.

## Changes to your clusters

kpanel starts read-only. Actions that change a cluster appear only after you turn on [write mode](/docs/write-mode/).

## Releases

- Release archives published since attestations were added have [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) (SLSA build provenance). They prove an archive was built by the repository's release workflow from the release tag.
- The install scripts check the SHA-256 checksum, and verify the attestation when `gh` is installed and logged in. See [Verify a release](/docs/installation/#verify-a-release).
- Each archive has an SBOM file. The install scripts do not check it.
- kpanel offers a new release only after it has been public for 72 hours. See [Updates](/docs/updates/).
- The install scripts write only to your user directories and never use `sudo` or admin rights.

## Dependencies

Frontend dependencies are installed through [Socket Firewall](https://docs.socket.dev/docs/socket-firewall-free), with Bun set to skip packages published in the last 3 days and to skip install scripts.

## Reporting a vulnerability

See [SECURITY.md](https://github.com/madappa-sharath/kpanel/blob/main/SECURITY.md).
