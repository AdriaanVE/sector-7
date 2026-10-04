# Desktop backend Dock icon

Sector 7 Desktop 0.1.0 launched the local server through the main app executable in Electron's Node mode. macOS registered the backend as another regular application, producing an extra generic Dock icon.

Desktop 0.1.1 launches the server through the existing Electron Helper bundle. Its `LSUIElement` metadata keeps the backend out of the Dock and app switcher. Development Electron launches use the corresponding Electron Helper; ordinary Node test runs retain their current executable. Request authentication, environment, logging and shutdown behavior stay the same.

The desktop check now runs the existing backend process/HTTP test under both Node and Electron so the helper launch path is exercised in CI. No new test boundary was added. The desktop package and lockfile are bumped to 0.1.1 for the next manual release; the published 0.1.0 cask remains unchanged until the release workflow generates its update.

Verification: the quality gate passes root/tools types, lint and 230 offline tests with 22 network skips. Desktop types and eight tests pass, along with the backend test repeated under Electron. A real bundled-server smoke check returned HTTP 200 for the UI, health and workspace, HTTP 403 without authentication, background activation policy 1 for the helper, and clean shutdown with the port released. It used temporary workspace data and a dummy gateway key, with no vendor requests.

Production web compilation and Electron native ABI verification passed. The local worktree used linked dependencies, so its standalone staging copy initially contained an external node_modules symlink and failed strict signing validation. After replacing that verification-stage symlink with the already bundled 0.1.0 runtime dependencies, the isolated 0.1.1 app and DMG built successfully, strict deep signature verification passed, and the new app repeated the HTTP/background-policy/shutdown smoke check. The packaged launcher matches the source fix. Clean CI installations remain the release-build check; no build-script change is included.
