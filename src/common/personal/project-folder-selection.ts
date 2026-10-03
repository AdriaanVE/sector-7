/** Folder imports are explicit snapshots. Nothing outside this selection is read or watched. */
export const PROJECT_FILE_LIMIT = 20;
export const PROJECT_FILE_BYTES = 10 * 1024 * 1024;
export const PROJECT_FOLDER_BYTES = 20 * 1024 * 1024;

const excludedDirectories = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'out', 'target', '__pycache__']);
const privateFiles = /^(?:credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519|ecdsa)(?:\..*)?)$/i;
const privateExtensions = /\.(?:pem|key|p12|pfx|keystore)$/i;

export function isExcludedProjectPath(path: string): boolean {
  const parts = path.split('/');
  return parts.some(part => part.startsWith('.') || excludedDirectories.has(part.toLowerCase()))
    || privateFiles.test(parts.at(-1) || '') || privateExtensions.test(path);
}

export function planProjectFolder<T extends { name: string; size: number; webkitRelativePath: string }>(selected: readonly T[], existingCount: number) {
  if (!selected.length) throw new Error('The folder is empty or could not be read. Choose a folder containing files.');
  const paths = selected.map(file => file.webkitRelativePath);
  if (paths.some(path => !path.includes('/') || path.split('/').some(part => !part || part === '..') || path.includes('\\'))) throw new Error('Folder paths are unavailable or invalid. Use Add files instead.');
  const name = paths[0].split('/')[0];
  if (paths.some(path => path.split('/')[0] !== name)) throw new Error('Choose one folder at a time.');
  const files = selected.filter(file => !isExcludedProjectPath(file.webkitRelativePath));
  if (!files.length) throw new Error('No eligible files. Hidden, private and build files are excluded. Choose another folder or use Add files for specific documents.');
  if (new Set(files.map(file => file.webkitRelativePath)).size !== files.length) throw new Error('The folder contains duplicate paths. Choose the folder again.');
  if (existingCount + files.length > PROJECT_FILE_LIMIT) throw new Error(`Folder has ${files.length} eligible files; this project has room for ${Math.max(0, PROJECT_FILE_LIMIT - existingCount)}. Nothing added. Choose a smaller subfolder or remove project files.`);
  const oversized = files.find(file => file.size > PROJECT_FILE_BYTES);
  if (oversized) throw new Error(`${oversized.webkitRelativePath}: exceeds 10 MB. Nothing added. Choose a smaller subfolder or remove this file from the selection folder.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > PROJECT_FOLDER_BYTES) throw new Error('Folder exceeds 20 MB of originals. Nothing added. Choose a smaller subfolder.');
  return { name, files: [...files].sort((a, b) => a.webkitRelativePath.localeCompare(b.webkitRelativePath)), excludedCount: selected.length - files.length };
}
