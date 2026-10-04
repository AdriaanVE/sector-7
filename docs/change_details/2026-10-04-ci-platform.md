# macOS verification runner

GitHub CI now uses macos-14, matching Sector 7's supported local Mac runtime. The previous Linux runner completed installation, types and lint but failed the command and native picker tests: production commands run through /bin/zsh, and the picker correctly rejects non-macOS hosts. Six test failures in run 37165573877 were isolated to those platform-specific paths.

The workflow keeps the same pinned checkout/setup actions, .nvmrc Node version, clean npm installation, both type projects, lint and complete offline test suite. No test is skipped or disabled to accommodate Linux. Browser/gateway acceptance still requires the separate local checks in the implementation plan.

The local Mac suite passed 193 tests with 22 credential-dependent skips before this workflow-only change. No application behavior changed. Claude approved the runner change. Hosted macOS run 37166206931 for commit 83737ad completed successfully: clean installation, application/tooling types, lint and the full suite all passed. The run reported 193 passed tests and 22 credential-dependent skips. This establishes hosted verification for that commit; browser and gateway acceptance remain separate.

Hosted evidence: https://github.com/AdriaanVE/sector-7/actions/runs/37166206931 .
