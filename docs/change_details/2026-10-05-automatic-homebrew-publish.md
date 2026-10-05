# Automatic Homebrew publication

Manual desktop releases previously opened a cask PR in the protected app repository. Homebrew stayed on the previous version until that PR reached main.

The release workflow now publishes the app assets, then updates `Casks/sector-7.rb` directly in `AdriaanVE/homebrew-tap`. A separate `SECTOR7_HOMEBREW_TOKEN` in the main-only release environment needs Contents write access only to that tap. The app-release token no longer needs Pull requests permission. Initial tap content was published from desktop 0.1.1 with its release ZIP digest verified against GitHub.

The Homebrew job is separate from release publication so failed-job retries do not recreate the release. It skips identical content, refuses older versions and supplies the current file SHA to reject concurrent edits. No PR merge or branch-protection change is involved. The app repository removes its old cask and adds `tap_migrations.json` pointing existing Homebrew users to `adriaanve/tap`. The unused cask-PR body is removed. The generator accepts an optional output path and uses Homebrew's supported Ventura symbol syntax.

Verification: the required pre-commit gate passed root/tools types, lint and 230 offline tests with 22 network skips. Desktop types passed. Workflow YAML, shell syntax, job ordering, migration JSON and documentation links passed. Publisher smoke checks exercised update, unchanged skip and downgrade refusal with the GitHub boundary replaced. The generator produced a cask outside the app checkout. Homebrew loaded the initial dedicated-tap cask as 0.1.1 with macOS >= 13. The first full hosted publication and installed-cask migration remain unverified until the workflow and migration metadata reach main and the new secret is configured.
