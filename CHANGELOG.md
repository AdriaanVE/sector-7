# Sector 7 changelog

## Unreleased

- Publish the Homebrew cask directly to `AdriaanVE/homebrew-tap` after a successful desktop release, without a cask PR. Existing installs migrate through Homebrew tap metadata.

## Desktop 0.1.1

- Fixed the extra `exec` Dock icon by running the local backend through Electron's background helper. Sector 7 now has one entry in the Dock and app switcher.

## Desktop 0.1.0

- Initial Apple silicon Mac app with a bundled local backend, native folder selection and save-on-close behavior.
- Versioned ZIP and DMG downloads, with installation and updates through the Homebrew cask.

[Desktop 0.1.0 release](https://github.com/AdriaanVE/sector-7/releases/tag/desktop-v0.1.0). See [source preview status](docs/releases/0.1.0.md) for the browser app's earlier development history and acceptance limits. The [upstream changelog](docs/changelog.md) records inherited big-AGI releases.
