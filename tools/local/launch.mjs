import { spawn, spawnSync } from 'node:child_process';
import { buildFolderPicker } from './build-folder-picker.mjs';

const mode = process.argv[2] || 'dev';
if (!['dev', 'start'].includes(mode)) throw new Error('Use dev or start.');
const folderPicker = await buildFolderPicker();
let key = process.env.BIFROST_API_KEY;
if (!key && process.platform === 'darwin') {
  const lookup = spawnSync('security', ['find-generic-password', '-a', process.env.BIFROST_KEYCHAIN_ACCOUNT || 'adriaan.van.erps', '-s', process.env.BIFROST_KEYCHAIN_SERVICE || 'telenet-bifrost-dev-virtual-key', '-w'], { encoding: 'utf8' });
  if (lookup.status === 0) key = lookup.stdout.trim();
}
if (!key) throw new Error('Set BIFROST_API_KEY or configure the Bifrost password to Keychain.');
const base = process.env.BIFROST_ANTHROPIC_BASE_URL || 'https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/anthropic';
const gateway = new URL(base);
if (!['http:', 'https:'].includes(gateway.protocol) || gateway.username || gateway.password) throw new Error('BIFROST_URL must be an HTTP(S) URL without credentials.');
const env = { ...process.env, ...(folderPicker ? { SECTOR7_FOLDER_PICKER: folderPicker } : {}), ANTHROPIC_API_KEY: key, ANTHROPIC_API_HOST: base.replace(/\/$/, '') };
const args = ['node_modules/next/dist/bin/next', mode, '-H', '127.0.0.1', '-p', process.env.PORT || '3000'];
const command = process.platform === 'darwin' ? 'caffeinate' : process.execPath;
const child = spawn(command, process.platform === 'darwin' ? ['-i', process.execPath, ...args] : args, { stdio: 'inherit', env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
