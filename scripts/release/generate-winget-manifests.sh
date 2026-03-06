#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <version> <windows_amd64_sha256>" >&2
  exit 1
fi

tag="$1"
sha="$2"
version="${tag#v}"

base="packaging/winget/manifests/k/kpanel/kpanel/${version}"
mkdir -p "$base"

cat > "${base}/kpanel.kpanel.yaml" <<YAML
PackageIdentifier: kpanel.kpanel
PackageVersion: ${version}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML

cat > "${base}/kpanel.kpanel.locale.en-US.yaml" <<YAML
PackageIdentifier: kpanel.kpanel
PackageVersion: ${version}
PackageLocale: en-US
Publisher: kpanel maintainers
PublisherUrl: https://github.com/kpanel/kpanel
PublisherSupportUrl: https://github.com/kpanel/kpanel/issues
Author: kpanel maintainers
PackageName: kpanel
PackageUrl: https://github.com/kpanel/kpanel
License: MIT
LicenseUrl: https://github.com/kpanel/kpanel/blob/main/LICENSE
ShortDescription: Lightweight Kafka GUI
Moniker: kpanel
Tags:
  - kafka
  - msk
  - developer-tools
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML

cat > "${base}/kpanel.kpanel.installer.yaml" <<YAML
PackageIdentifier: kpanel.kpanel
PackageVersion: ${version}
InstallerType: zip
NestedInstallerType: portable
NestedInstallerFiles:
  - RelativeFilePath: kpanel.exe
    PortableCommandAlias: kpanel
Installers:
  - Architecture: x64
    InstallerUrl: https://github.com/kpanel/kpanel/releases/download/${tag}/kpanel_${tag}_windows_amd64.zip
    InstallerSha256: ${sha}
ManifestType: installer
ManifestVersion: 1.6.0
YAML

echo "wrote ${base}"
