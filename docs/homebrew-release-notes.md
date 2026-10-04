Apple silicon macOS preview, signed ad hoc and not notarized. Quit Sector 7 before updating. The Homebrew cask update arrives through a separate PR; install or upgrade after that PR is merged.

Desktop 0.1.1 removes the extra backend Dock icon by running the local server through Electron's background helper.

```sh
brew tap AdriaanVE/sector-7 https://github.com/AdriaanVE/sector-7
brew install --cask sector-7
# Later:
brew update
brew upgrade --cask sector-7
```

Homebrew installs Sector 7.app into Applications. Uninstalling the cask preserves chats, projects, configuration and logs. Downloaded builds may need macOS approval before opening.
