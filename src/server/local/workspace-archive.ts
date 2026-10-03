import { crc32, inflateRawSync } from 'node:zlib';
import { strFromU8 } from 'fflate';
import { WorkspaceError } from './workspace';

export const WORKSPACE_BYTE_LIMIT = 250 * 1024 * 1024;
export const BACKUP_ENTRY_LIMIT = 10_000;
export const LOCAL_JSON_BYTE_LIMIT = 2 * 1024 * 1024;

export function backupSizeError() { return new WorkspaceError('Backup exceeds the 250 MB limit. Remove large attachments or export individual chats before retrying.', 413); }

/** Includes stored ZIP headers, so an exported archive also fits the upload limit. */
export function storedBackupSize(files: { name: string; size: number }[]) {
  if (files.length > BACKUP_ENTRY_LIMIT) throw new WorkspaceError('Backup exceeds the 10,000 entry limit. Remove unused attachments before retrying.', 413);
  const size = files.reduce((total, file) => total + file.size + 76 + 2 * Buffer.byteLength(file.name), 22);
  if (size > WORKSPACE_BYTE_LIMIT) throw backupSizeError();
  return size;
}

/** Central-directory parsing never allocates from an entry's declared decoded size. */
export function decodeBackup(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length > WORKSPACE_BYTE_LIMIT) throw backupSizeError();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => new WorkspaceError('Backup ZIP is invalid or unsupported.', 422);
  const range = (offset: number, length: number) => { if (offset < 0 || length < 0 || offset + length > bytes.length) throw invalid(); };
  const u16 = (offset: number) => { range(offset, 2); return view.getUint16(offset, true); };
  const u32 = (offset: number) => { range(offset, 4); return view.getUint32(offset, true); };
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65_557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65_557)) throw invalid();
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw invalid();
  const count = u16(end + 10);
  if (count > BACKUP_ENTRY_LIMIT) throw new WorkspaceError('Backup exceeds the 10,000 entry limit.', 413);
  let offset = u32(end + 16);
  const centralEnd = offset + u32(end + 12);
  if (centralEnd !== end) throw invalid(); // ZIP64 and multi-disk archives are unnecessary below 250 MB.
  const entries: { name: string; compressed: Uint8Array; size: number; method: number; checksum: number }[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    range(offset, 46);
    if (u32(offset) !== 0x02014b50) throw invalid();
    const flags = u16(offset + 8); const method = u16(offset + 10);
    const compressedSize = u32(offset + 20); const size = u32(offset + 24);
    const nameLength = u16(offset + 28); const extraLength = u16(offset + 30); const commentLength = u16(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > centralEnd || flags & ~0x080e || (method !== 0 && method !== 8) || u16(offset + 34)) throw invalid();
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = strFromU8(nameBytes);
    if (name !== 'workspace.json' && !/^assets\/[a-zA-Z0-9_-]{1,128}$/.test(name)) throw new WorkspaceError('Backup contains an unexpected path.', 422);
    if (names.has(name)) throw new WorkspaceError('Backup contains a duplicate entry.', 422);
    names.add(name);
    const local = u32(offset + 42);
    range(local, 30);
    if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== nameLength) throw invalid();
    const dataStart = local + 30 + nameLength + u16(local + 28);
    if (local >= u32(end + 16) || dataStart + compressedSize > u32(end + 16)) throw invalid();
    const localName = bytes.subarray(local + 30, local + 30 + nameLength);
    if (!Buffer.from(localName).equals(Buffer.from(nameBytes))) throw invalid();
    if (!(flags & 8) && (u32(local + 14) !== u32(offset + 16) || u32(local + 18) !== compressedSize || u32(local + 22) !== size)) throw invalid();
    entries.push({ name, compressed: bytes.subarray(dataStart, dataStart + compressedSize), size, method, checksum: u32(offset + 16) });
    offset = next;
  }
  if (offset !== centralEnd) throw invalid();
  const files: Record<string, Uint8Array> = Object.create(null);
  const overhead = storedBackupSize(entries.map(entry => ({ name: entry.name, size: 0 })));
  const expandedLimit = WORKSPACE_BYTE_LIMIT - overhead;
  let expanded = 0;
  for (const entry of entries) {
    let decoded: Uint8Array;
    try {
      decoded = entry.method === 0 ? entry.compressed : inflateRawSync(entry.compressed, { maxOutputLength: Math.max(1, expandedLimit - expanded) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw backupSizeError();
      throw invalid();
    }
    expanded += decoded.length;
    if (expanded > expandedLimit) throw backupSizeError();
    if (decoded.length !== entry.size || crc32(decoded) !== entry.checksum) throw new WorkspaceError('Backup contains damaged entry data.', 422);
    files[entry.name] = decoded;
  }
  return files;
}
