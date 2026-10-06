# Sector 7 changelog

## Unreleased

- Cap the owned Phonon process's reusable MLX allocation cache at 256 MiB to prevent memory growth during live dictation. Keep the model loaded for fast reuse.

- Add live local Phonon-2 English dictation to the Apple silicon desktop Composer, with lazy startup, a Voice input toggle, configurable command/port and final transcript recovery. Prepare Desktop 0.1.4.
- Suppress quiet microphone noise before Phonon decoding, with a short speech lead-in and tail. Disable automatic microphone gain so room tone is not amplified into false speech.
- Expose noise threshold, speech lead-in/tail and automatic mic gain in Voice input settings. Changes apply during dictation and survive backups. Extend the default speech tail to 600 ms.
- Add a Warm up now button that loads Phonon and primes Metal without recording the microphone, reducing the wait on the next mic press.

- Project settings load repository-root `AGENTS.md` or `CLAUDE.md` when the matching agent checkbox is enabled and saved, followed by instructions in its agent folder. Projects with only a root instruction file can enable the matching checkbox.
- Automatically build and publish the Mac app and update Homebrew when a desktop version bump reaches `main`. Package edits without a version change skip the build; manual retries remain available.

- Prepare Desktop 0.1.2 with the token-estimate dropdown and the unreleased chat improvements below.

- Move token usage and estimated input cost into the model dropdown so typing and replies do not shift the composer. Keep the last estimate visible while updating.

- Let chats and subagents continue beyond the previous tool-count, round and total runtime limits. Paused runs retain an incomplete status, and parent chats can continue saved children.

- Publish the Homebrew cask directly to `AdriaanVE/homebrew-tap` after a successful desktop release, without a cask PR. Existing installs migrate through Homebrew tap metadata.
- Fixed the Homebrew macOS dependency warning in the cask and release generator. The minimum remains macOS Ventura.

## Desktop 0.1.1

- Fixed the extra `exec` Dock icon by running the local backend through Electron's background helper. Sector 7 now has one entry in the Dock and app switcher.

[Desktop 0.1.1 release](https://github.com/AdriaanVE/sector-7/releases/tag/desktop-v0.1.1).

## Desktop 0.1.0

- Initial Apple silicon Mac app with a bundled local backend, native folder selection and save-on-close behavior.
- Versioned ZIP and DMG downloads, with installation and updates through the Homebrew cask.

[Desktop 0.1.0 release](https://github.com/AdriaanVE/sector-7/releases/tag/desktop-v0.1.0). See [source preview status](docs/releases/0.1.0.md) for the browser app's earlier development history and acceptance limits. The [upstream changelog](docs/changelog.md) records inherited big-AGI releases.
