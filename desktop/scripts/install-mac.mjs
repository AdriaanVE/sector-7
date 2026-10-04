import { spawnSync } from 'node:child_process';
import { access, cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') throw new Error('Mac installation requires macOS.');
const desktop = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(desktop, 'out', 'mac-arm64', 'Sector 7.app');
const destination = resolve(process.argv[2] ?? join(desktop, 'local', 'Sector 7.app'));
await access(source);
const running = spawnSync('/usr/bin/pgrep', ['-f', '/Sector 7.app/Contents/MacOS/Sector 7'], { stdio: 'ignore' });
if (running.status === 0) throw new Error('Quit Sector 7 before installing.');
try { await access(destination); throw new Error(`Install destination already exists: ${destination}. Choose another path or remove the old app after quitting.`); }
catch (error) { if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error; }
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true, verbatimSymlinks: true });
const verified = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination], { stdio: 'inherit' });
if (verified.status !== 0) throw new Error('Installed app signature verification failed.');
console.log(`Installed: ${destination}\nOpen with: open ${JSON.stringify(destination)}`);
