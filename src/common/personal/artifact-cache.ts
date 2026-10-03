import { currentWorkspace, flushDisk, persistAsset, loadDiskAsset } from './disk-storage';
import { _createAssetObject, DBlobAssetType, DBlobMimeType } from '~/modules/dblobs/dblobs.types';
import { convert_UInt8Array_To_Base64 } from '~/common/util/blobUtils';

export function cachedArtifactId(fileId: string) {
  return Object.entries(currentWorkspace().assets).find(([, asset]) => asset.metadata.upstreamFileId === fileId)?.[0];
}
export async function saveArtifact(fileId: string, fileName: string, blob: Blob) {
  const existing = cachedArtifactId(fileId); if (existing) return existing;
  const asset = _createAssetObject(DBlobAssetType.DOCUMENT, fileName,
    { mimeType: DBlobMimeType.DOCUMENT_BINARY, base64: convert_UInt8Array_To_Base64(new Uint8Array(await blob.arrayBuffer()), 'artifact') },
    { ot: 'user', source: 'attachment', media: 'remote-sandbox', fileName }, { fileName, mimeType: blob.type });
  await persistAsset({ ...asset, upstreamFileId: fileId, scopeId: 'app-chat', contextId: 'global' }); await flushDisk(); return asset.id;
}
export async function cachedArtifactBlob(fileId: string): Promise<Blob | undefined> {
  const id = cachedArtifactId(fileId); if (!id) return undefined;
  const asset = await loadDiskAsset(id); if (!asset) return undefined;
  const data = asset.data;
  const bytes = Uint8Array.from(atob(data.base64), char => char.charCodeAt(0));
  const rawMetadata = currentWorkspace().assets[id].metadata.metadata;
  const metadata = rawMetadata as { mimeType?: string } | undefined;
  return new Blob([bytes], { type: metadata?.mimeType || data.mimeType });
}
