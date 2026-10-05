cask "sector-7" do
  version "0.1.1"
  sha256 "1613ff4aa8e8247455c0dbca3d13b7049cbbdf2a23ff8287dddd707aed1752e8"

  url "https://github.com/AdriaanVE/sector-7/releases/download/desktop-v#{version}/Sector-7-arm64.app.zip"
  name "Sector 7"
  desc "Local AI workspace with Claude chat, projects and terminal tools"
  homepage "https://github.com/AdriaanVE/sector-7"

  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "Sector 7.app"
  uninstall quit: "com.adriaanve.sector7"
end
