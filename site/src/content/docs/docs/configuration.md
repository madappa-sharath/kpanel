---
title: Configuration
seoTitle: kpanel configuration — environment variables and config directory
description: kpanel environment variables (KPANEL_PORT, KPANEL_CONFIG_DIR, AWS_PROFILE, AWS_REGION) and the files in its config directory.
---

kpanel has no config file to write by hand. You add connections in the UI. A few environment variables change how it starts.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `KPANEL_PORT` | `8080` | HTTP port. If the port is in use, kpanel picks a free one and prints it. |
| `KPANEL_CONFIG_DIR` | `~/.kpanel` | Config directory. |
| `KPANEL_NO_BROWSER` | unset | Set to any value to stop kpanel from opening your browser at startup. |
| `AWS_PROFILE` | `default` | AWS profile for MSK discovery and for imported MSK connections. `AWS_DEFAULT_PROFILE` also works. |
| `AWS_REGION` | the profile's region | Default region for MSK discovery. `AWS_DEFAULT_REGION` also works. |
| `AWS_CONFIG_FILE` | `~/.aws/config` | Where kpanel reads the list of AWS profiles. |

The standard AWS SDK variables, such as `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN`, work as usual.

Example:

```bash
KPANEL_PORT=9000 KPANEL_CONFIG_DIR=~/work/kpanel AWS_PROFILE=prod kpanel
```

## Config directory

kpanel creates the directory on first start.

| Path | Contents |
|---|---|
| `config.json` | Your connections: name, ID, platform, color, brokers, auth mechanism, TLS setting, and AWS profile, region and cluster name for MSK. No passwords. |
| `certs/<connection-id>.pem` | CA certificates you uploaded for TLS connections. |

Passwords for SASL connections are in the OS keychain, not in this directory. See [Security model](/docs/security/).

To move your connections to another machine, copy `config.json`. You will need to enter SASL passwords again, because they stay in the old machine's keychain.

## Command line

| Command | Description |
|---|---|
| `kpanel` | Start the server and open the UI in your browser. |
| `kpanel --version` | Print the version and exit. |
