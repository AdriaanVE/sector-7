# Sector 7

Personal local Claude workspace, built by remodeling the MIT-licensed [big-AGI](https://github.com/enricoros/big-AGI) application. The name references Final Fantasy VII. Sector 7 is an independent personal project.

Version **0.1.0** is an early working preview. It keeps big-AGI's Next.js, React, Joy UI, Zustand and AIX engine, with a simpler chat layout and deep-night and mako-green styling based on the Sector 7 brand board.

## Start on your Mac

Use Node 22, 24 or 26 and npm. Clone the complete repository, then run from its root:

```sh
npm ci
PORT=3004 npm run dev:local
```

Open [127.0.0.1:3004](http://127.0.0.1:3004/). The launcher binds to loopback. No login or account setup is needed. For a production build:

```sh
npm run build
PORT=3004 npm run start:local
```

Stop the running app before rebuilding its production output. Source archives need `NEXT_PUBLIC_BUILD_HASH=v0.1.0` for the build; Git clones provide build identity automatically. Browser dictation uses Chrome Web Speech and sends audio to Google.

## Bifrost connection

The launcher reads `BIFROST_API_KEY` or the existing macOS Keychain entry: account `adriaan.van.erps`, service `telenet-bifrost-dev-virtual-key`. Override these names with `BIFROST_KEYCHAIN_ACCOUNT` and `BIFROST_KEYCHAIN_SERVICE`. Set `BIFROST_ANTHROPIC_BASE_URL` to change the Anthropic-compatible gateway endpoint. Keep credentials in your environment or Keychain, never in source files or browser storage. [Configuration reference](docs/configuration.md).

Chat models are `claude-opus-5-5` and `claude-sonnet-5-5`, with medium effort by default. Claude's native web search and web fetch travel through Bifrost, preserving citations and full provider history. Future OpenAI support will use provider-specific adapters.

## Workspace

Projects group chats and share instructions. Use Add folder to choose a local repository in the macOS folder browser, then Save the project to give models live file and terminal tools. Files are read only when requested, rather than bulk imported. The connected path is stored locally. Models can inspect and change files and run commands using Sector 7's local process permissions; setting a command's working directory does not create a sandbox. Project file uploads are replaced by these folder connections. Message attachments remain separate.

Chats, projects, processed context and owned assets save automatically on disk. The existing data directory stays `~/Library/Application Support/AI GUI`, including after the Sector 7 rename. Set `AI_GUI_DATA_DIR` to choose another location. Browser caches are disposable. Settings provides backup and recovery controls. [Storage and backup](docs/local-workspace-data.md).

The UI retains Markdown/code/math, attachments, editing, retry, branching, archive, local exports, voice input and explicit questions requiring your decision. Local slash skills follow the selected model's Claude/Codex folder. Automatic AI extras can be disabled in Settings. Detailed tool calls are hidden by default; a concise neon activity line shows the current task. Enable Settings > Conversation > Show all tool calls to inspect saved tool inputs and results.

## Preview limits

Hosted code execution is unsupported by the current Bifrost deployment. Local coding tasks use the connected workspace file and terminal tools. Image generation and a dedicated voice input model need connections selected later. Browser/native-tool integration and the remaining storage/question lifecycle acceptance checks are still in progress. [0.1 release status](docs/releases/0.1.0.md) records the verified scope and gaps. This preview is not final roadmap acceptance.

The original upstream Docker/deployment assets remain for reference; the supported 0.1 launch path is the local npm launcher. Automated container publishing and upstream issue-response automation are disabled for this personal repository.

## Code and checks

The repository includes the complete application, static assets, tests, tooling, lockfile, configuration, license and planning documents. [Folder and file structure](docs/structure.md).

```sh
npm run tscheck
npm run lint
npm test
```

Network tests skip when their credentials are absent. See [implementation plan](docs/roadmap/planned/impl_plan.md) for the broader scope. The upstream MIT license and attribution remain in [LICENSE](LICENSE); [upstream README](docs/upstream/README.md) preserves the original project documentation.
