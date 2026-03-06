class Kpanel < Formula
  desc "Lightweight Kafka GUI"
  homepage "https://github.com/kpanel/kpanel"
  version "0.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kpanel/kpanel/releases/download/v0.0.0/kpanel_v0.0.0_darwin_arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/kpanel/kpanel/releases/download/v0.0.0/kpanel_v0.0.0_darwin_amd64.tar.gz"
      sha256 "1111111111111111111111111111111111111111111111111111111111111111"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kpanel/kpanel/releases/download/v0.0.0/kpanel_v0.0.0_linux_arm64.tar.gz"
      sha256 "2222222222222222222222222222222222222222222222222222222222222222"
    else
      url "https://github.com/kpanel/kpanel/releases/download/v0.0.0/kpanel_v0.0.0_linux_amd64.tar.gz"
      sha256 "3333333333333333333333333333333333333333333333333333333333333333"
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
