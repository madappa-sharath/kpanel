#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "usage: $0 <version> <darwin_arm64_sha256> <darwin_amd64_sha256> <linux_arm64_sha256> <linux_amd64_sha256>" >&2
  exit 1
fi

version="$1"
darwin_arm64_sha="$2"
darwin_amd64_sha="$3"
linux_arm64_sha="$4"
linux_amd64_sha="$5"

cat > packaging/homebrew/kpanel.rb <<FORMULA
class Kpanel < Formula
  desc "Lightweight Kafka GUI"
  homepage "https://github.com/kpanel/kpanel"
  version "${version#v}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kpanel/kpanel/releases/download/${version}/kpanel_${version}_darwin_arm64.tar.gz"
      sha256 "${darwin_arm64_sha}"
    else
      url "https://github.com/kpanel/kpanel/releases/download/${version}/kpanel_${version}_darwin_amd64.tar.gz"
      sha256 "${darwin_amd64_sha}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kpanel/kpanel/releases/download/${version}/kpanel_${version}_linux_arm64.tar.gz"
      sha256 "${linux_arm64_sha}"
    else
      url "https://github.com/kpanel/kpanel/releases/download/${version}/kpanel_${version}_linux_amd64.tar.gz"
      sha256 "${linux_amd64_sha}"
    end
  end

  def install
    bin.install "kpanel"
  end

  test do
    output = shell_output("#{bin}/kpanel --version")
    assert_match "kpanel", output
  end
end
FORMULA

echo "wrote packaging/homebrew/kpanel.rb"
