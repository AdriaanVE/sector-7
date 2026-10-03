# Repository structure

Sector 7 retains big-AGI's module structure instead of replacing the engine. The repository is a complete source checkout; dependencies and generated builds are installed locally.

```text
sector-7/
  app/api/                  App Router API endpoints
    local/                  Disk workspace, folder tools, command jobs, backup and skills
  pages/                    Pages Router application entry points
  src/
    apps/chat/              Chat layout, composer, message actions and execution
    common/personal/        Personal settings, projects, folder context and attention
    common/stores/          Shared Zustand stores and chat data models
    common/layout/optima/   Existing responsive layout engine
    modules/aix/            Provider protocol, streaming, native history and adapters
    modules/llms/           Models and vendor configuration
    modules/dblobs/         Browser asset cache
    server/local/           Disk service, live folder tools, command jobs and skills
    server/trpc/            Existing API routing
  public/                   Static assets, icons and browser manifest
  tools/
    local/                  Loopback launcher and Bifrost configuration
    develop/                Existing generation/development tooling
  docs/
    releases/               Version scope, checks and known gaps
    roadmap/planned/        Approved plan and reviews
    upstream/               Original big-AGI reference documentation
    stylesheet/             Supplied Sector 7 visual reference
    configuration.md        Local settings
    local-workspace-data.md Storage, backups and recovery
    structure.md            This map
  kb/                       Upstream architecture knowledge base
  .github/workflows/ci.yml  Offline verification on pushes
  package.json              Application version, npm commands and dependencies
  package-lock.json         Complete dependency lock
  next.config.ts            Next/Webpack configuration
  tsconfig.json             Application type-check configuration
  eslint.config.mjs         Repository lint rules
  LICENSE                   Preserved MIT license
  README.md                 Sector 7 setup and scope
```

Tests live beside their modules in `*.test.ts` files. Tools use their own `tools/tsconfig.json`. The personal layer extends typed message fragments, provider adapters, converters and durable assets already in big-AGI.

Runtime data, credentials, browser caches, `node_modules`, `.next`, temporary review logs and local implementation checkpoints are excluded from the release source. Install dependencies with `npm ci`; create output with `npm run build`. The initial GitHub upload is a clean source snapshot tagged `v0.1.0`, with the upstream MIT license and original attribution preserved.
