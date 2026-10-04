# Development data directory

Development previously shared the installed app's workspace directory. `NODE_ENV=development` now defaults to `sector-7-dev` inside the OS temporary directory, separating development chats, assets and tool receipts from installed data. The folder is reused across restarts, but system cleanup can remove it.

Production retains `~/Library/Application Support/AI GUI`. `AI_GUI_DATA_DIR` still overrides both defaults. Existing files are not moved or deleted. The change applies to the server's shared directory resolver, covering `next dev` and the local development launcher without changing production Electron behavior.

The installed Electron backend explicitly runs with `NODE_ENV=production`, so it retains the persistent workspace directory. The existing CI quality gate discovers the workspace HTTP regression through `npm test` on pushes and pull requests.

## Verification

The new workspace HTTP regression failed before implementation because development selected Application Support. All eight workspace HTTP tests pass after the change. The regression saves different workspaces in development and production, verifies that development data remains retrievable after switching back, and checks an explicit directory override.

After rebasing onto `main`, `npm run precommit` passed whitespace checks, both TypeScript projects, source lint and 229 tests, with 22 opt-in network skips. Desktop type checking and all eight desktop tests passed. The running development server on port 3004 returned HTTP 200 and reported its `sector-7-dev` temporary directory. Reload the browser to hydrate the selected workspace. A final simplification pass found no additional changes needed. No server was started or stopped, and no existing workspace was moved.
