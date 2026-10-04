import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const desktop = join(root, 'desktop');
if (![22, 24, 26].includes(Number(process.versions.node.split('.')[0]))) throw new Error('Build with Node 22, 24 or 26, matching the root dependency installation.');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('v0.1 packaging requires an Apple silicon Mac.');

/** @param {string} command @param {string[]} args @param {string} [cwd] @param {NodeJS.ProcessEnv} [env] */
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.error?.message}).`);
}

// Next must not import local .env credentials or inherited provider/analytics settings into this build.
/** @type {NodeJS.ProcessEnv} */
const buildEnv = { NODE_ENV: 'production', BIG_AGI_BUILD: 'standalone', AGI_DIST_DIR: 'dist',
  NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_DEPLOYMENT_TYPE: 'desktop', __NEXT_PROCESSED_ENV: 'true' };
for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG']) if (process.env[key]) buildEnv[key] = process.env[key];
buildEnv.PATH = dirname(process.execPath) + ':' + (process.env.PATH ?? '/usr/bin:/bin');
if (process.env.NEXT_PUBLIC_BUILD_HASH) buildEnv.NEXT_PUBLIC_BUILD_HASH = process.env.NEXT_PUBLIC_BUILD_HASH;
await access(join(desktop, 'node_modules', 'electron', 'package.json'));
run('/usr/bin/xcode-select', ['-p']);
if (!process.argv.includes('--skip-web-build')) run('npm', ['run', 'build'], root, buildEnv);
else await access(join(root, 'dist', 'BUILD_ID'));
const stage = join(desktop, '.stage');
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, 'server'), { recursive: true });
await cp(join(root, 'dist', 'standalone'), join(stage, 'server'), { recursive: true, verbatimSymlinks: true,
  filter: source => { const path = relative(join(root, 'dist', 'standalone'), source); return !path.split('/').some(name => name.startsWith('.env')) && path !== 'dist/cache' && !path.startsWith('dist/cache/'); } });
await access(join(stage, 'server', 'server.js'));
await cp(join(root, 'dist', 'static'), join(stage, 'server', 'dist', 'static'), { recursive: true, verbatimSymlinks: true });
await cp(join(root, 'public'), join(stage, 'server', 'public'), { recursive: true, verbatimSymlinks: true });
await cp(join(desktop, 'server-entry.cjs'), join(stage, 'server', 'server-entry.cjs'));
const electronVersion = JSON.parse(await readFile(join(desktop, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
run(join(desktop, 'node_modules', '.bin', 'electron-rebuild'), ['-f', '-w', 'fs-ext', '-t', 'dev', '-a', 'arm64', '-v', electronVersion], desktop);
await cp(join(desktop, 'node_modules', 'fs-ext', 'build', 'Release', 'fs_ext.node'), join(stage, 'server', 'node_modules', 'fs-ext', 'build', 'Release', 'fs_ext.node'));
const electronBinary = join(desktop, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
run(electronBinary, ['-e', `console.log('Electron backend ABI',process.versions);require(${JSON.stringify(join(stage, 'server', 'node_modules', 'fs-ext'))}).flockSync;`], root, { ...buildEnv, ELECTRON_RUN_AS_NODE: '1' });

// Scan names and concrete secret formats. Do not inspect or print the user's Keychain value.
/** @param {string} directory */
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.startsWith('.env') || entry.name.endsWith('.pem')) throw new Error(`Secret file in package: ${relative(stage, path)}`);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile() && /\.(?:json|js|cjs|mjs|html|txt)$/.test(entry.name)) {
      const content = await readFile(path, 'utf8');
      if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(content)) throw new Error(`Credential-shaped content in package: ${relative(stage, path)}`);
    }
  }
}
await scan(stage);
run(join(desktop, 'node_modules', '.bin', 'electron-builder'), ['--mac', 'dir', 'dmg', '--arm64', '--config', 'electron-builder.yml', '--publish', 'never'], desktop);
const appPath = join(desktop, 'out', 'mac-arm64', 'Sector 7.app');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
console.log(`Mac app: ${appPath}\nDMG: ${join(desktop, 'out', 'Sector-7-0.1.0-arm64.dmg')}`);
