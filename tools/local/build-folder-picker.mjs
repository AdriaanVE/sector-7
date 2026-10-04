import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const source = fileURLToPath(new URL('./native/folder-picker.m', import.meta.url));
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>folder-picker</string>
<key>CFBundleIdentifier</key><string>com.adriaanve.sector7.folder-picker</string>
<key>CFBundleName</key><string>Sector 7 Folder Picker</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>\n`;

/** Compile once during startup, never while opening a dialog. */
export async function buildFolderPicker(output = fileURLToPath(new URL('../../build/native', import.meta.url))) {
  if (process.platform !== 'darwin') return undefined;
  const bundle = join(output, 'Sector 7 Folder Picker.app', 'Contents');
  const binary = join(bundle, 'MacOS', 'folder-picker');
  const checksum = join(output, 'folder-picker.sha256');
  const fingerprint = createHash('sha256').update(await readFile(source)).update(plist).update(process.arch).digest('hex');
  try {
    if (await readFile(checksum, 'utf8') === fingerprint) {
      await access(binary, constants.X_OK);
      await access(join(bundle, 'Info.plist'));
      return binary;
    }
  } catch { /* First launch or source changed. */ }
  await mkdir(dirname(binary), { recursive: true });
  const temporary = `${binary}.${randomUUID()}`;
  try {
    const result = spawnSync('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-O2', '-framework', 'AppKit', source, '-o', temporary], { encoding: 'utf8', timeout: 60000 });
    if (result.error || result.status !== 0) throw new Error(`Could not build the macOS folder picker. Install Xcode Command Line Tools with xcode-select --install. ${result.stderr || result.error?.message || ''}`);
    await writeFile(join(bundle, 'Info.plist'), plist);
    await rename(temporary, binary);
    await rm(`${binary}.sha256`, { force: true });
    const signing = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', dirname(bundle)], { encoding: 'utf8', timeout: 30000 });
    if (signing.error || signing.status !== 0) throw new Error(`Could not sign the macOS folder picker. ${signing.stderr || signing.error?.message || ''}`);
    await writeFile(checksum, fingerprint);
    return binary;
  } finally { await rm(temporary, { force: true }); }
}
