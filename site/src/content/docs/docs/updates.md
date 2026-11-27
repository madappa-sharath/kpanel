---
title: "Updates"
seoTitle: "Updating kpanel: release checks and the 72-hour delay"
description: "How kpanel checks for new releases, why it waits 72 hours before offering one, and how to update with the pinned install command."
---

kpanel does not update itself. It tells you when a new release is available and gives you the command to install it.

## How the check works

At startup and every 6 hours, the kpanel server asks the GitHub API for the repository's recent releases. It offers a release only if:

- it is not a draft or a prerelease,
- its tag is a plain version such as `v1.2.3`,
- it includes both install scripts, and
- it has been public for at least **72 hours**.

The 72-hour wait gives time to find and pull a bad or compromised release before anyone is asked to install it. If a newer release is still waiting, kpanel shows the date it becomes available.

If the check fails, for example when you are offline, kpanel shows no banner and works as usual.

## Install an update

When an update is available, a banner at the top of the UI shows the new version, a link to the release notes, and an install command. The command is pinned to that release's tag and uses the install script attached to that release:

```bash
# macOS and Linux
curl -fsSL https://github.com/madappa-sharath/kpanel/releases/download/vX.Y.Z/install.sh | VERSION=vX.Y.Z sh
```

```powershell
# Windows
$env:VERSION='vX.Y.Z'; irm https://github.com/madappa-sharath/kpanel/releases/download/vX.Y.Z/install.ps1 | iex
```

Copy the command, stop kpanel, run the command, and start kpanel again. The install script verifies the archive as described in [Verify a release](/docs/installation/#verify-a-release).

You can dismiss the banner. It comes back when you reload the page.

Your connections and keychain entries are not touched by an update.
