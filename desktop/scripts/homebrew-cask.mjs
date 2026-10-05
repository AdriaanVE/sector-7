import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const { version } = JSON.parse(await readFile(join(root, 'desktop', 'package.json'), 'utf8'));
const repository = process.env.GITHUB_REPOSITORY || 'AdriaanVE/sector-7';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Desktop version must have three numeric components.');
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository.');
if (!process.argv[2]) throw new Error('Pass the built app ZIP path.');
const hash = createHash('sha256');
for await (const chunk of createReadStream(resolve(process.argv[2]))) hash.update(chunk);
const output = resolve(process.argv[3] || join(root, 'Casks', 'sector-7.rb'));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `cask "sector-7" do
  version "${version}"
  sha256 "${hash.digest('hex')}"

  url "https://github.com/${repository}/releases/download/desktop-v#{version}/Sector-7-arm64.app.zip"
  name "Sector 7"
  desc "Local AI workspace with Claude chat, projects and terminal tools"
  homepage "https://github.com/${repository}"

  depends_on arch: :arm64
  depends_on macos: :ventura

  app "Sector 7.app"
  uninstall quit: "com.adriaanve.sector7"
end
`);
console.log(`Prepared Homebrew cask for desktop ${version}.`);
