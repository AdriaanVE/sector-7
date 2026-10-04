cask "sector-7" do
  version "0.1.0"
  sha256 "b6df72b135bdf296d19e787e9f755e023386e9a81fb077e595e685221b1e8608"

  url "https://github.com/AdriaanVE/sector-7/releases/download/desktop-v#{version}/Sector-7-arm64.app.zip"
  name "Sector 7"
  desc "Local AI workspace with Claude chat, projects and terminal tools"
  homepage "https://github.com/AdriaanVE/sector-7"

  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "Sector 7.app"
  uninstall quit: "com.adriaanve.sector7"
end
