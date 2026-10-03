import { artifactSourceSchema, type ArtifactReference, type ArtifactSource, type ArtifactAttach } from './artifact-schema';
import { currentWorkspace, flushDisk, persistAsset, loadDiskAsset } from './disk-storage';
import { _createAssetObject, DBlobAssetType, DBlobMimeType } from '~/modules/dblobs/dblobs.types';
import { convert_UInt8Array_To_Base64 } from '~/common/util/blobUtils';

function sameSource(a: ArtifactSource, b: ArtifactSource) {
  return a.provider === b.provider && a.deployment === b.deployment && a.fileId === b.fileId && a.containerId === b.containerId;
}
export function cachedArtifactId(source: ArtifactSource) {
  return Object.entries(currentWorkspace().assets).find(([, asset]) => {
    const parsed = artifactSourceSchema.safeParse(asset.metadata.artifactSource);
    return parsed.success && sameSource(parsed.data, source);
  })?.[0];
}

/** Legacy downloads have no deployment identity. Reuse locally, never bind them to a new gateway. */
export function legacyCachedArtifact(fileId: string): ArtifactReference | undefined {
  const matches = Object.entries(currentWorkspace().assets).filter(([, asset]) => !asset.metadata.artifactSource && asset.metadata.upstreamFileId === fileId);
  if (matches.length !== 1) return undefined;
  const [assetId, asset] = matches[0];
  const meta = asset.metadata.metadata;
  const fileName = meta && typeof meta === 'object' && 'fileName' in meta && typeof meta.fileName === 'string' ? meta.fileName : fileId;
  const mimeType = meta && typeof meta === 'object' && 'mimeType' in meta && typeof meta.mimeType === 'string' ? meta.mimeType : asset.mime;
  return { assetId, source: { provider: 'anthropic', deployment: 'legacy-unscoped', fileId }, fileName, mimeType };
}

/** The message owns the exact original before any preview or destructive operation succeeds. */
export async function saveArtifact(source: ArtifactSource, fileName: string, blob: Blob, attach: ArtifactAttach) {
  let id = cachedArtifactId(source);
  if (!id) {
    const asset = _createAssetObject(DBlobAssetType.DOCUMENT, fileName,
      { mimeType: DBlobMimeType.DOCUMENT_BINARY, base64: convert_UInt8Array_To_Base64(new Uint8Array(await blob.arrayBuffer()), 'artifact') },
      { ot: 'user', source: 'attachment', media: 'remote-sandbox', fileName }, { fileName, mimeType: blob.type });
    await persistAsset({ ...asset, artifactSource: source, scopeId: 'app-chat', contextId: 'global' });
    id = asset.id;
  }
  const reference: ArtifactReference = { assetId: id, source, fileName, mimeType: blob.type };
  const stillOwned = attach(reference);
  await flushDisk();
  // A removed or concurrently replaced message must not authorize remote deletion or replacement.
  if (!stillOwned() || !currentWorkspace().assets[id]) throw new Error('The file is no longer owned by a saved message. Keep the remote original.');
  return reference;
}
export async function cachedArtifactBlob(reference: ArtifactReference): Promise<Blob | undefined> {
  const manifest = currentWorkspace().assets[reference.assetId];
  if (!manifest) return undefined;
  const source = artifactSourceSchema.safeParse(manifest.metadata.artifactSource);
  const legacy = !manifest.metadata.artifactSource && manifest.metadata.upstreamFileId === reference.source.fileId && reference.source.provider === 'anthropic' && reference.source.deployment === 'legacy-unscoped';
  if (!legacy && (!source.success || !sameSource(source.data, reference.source))) throw new Error('Saved file source does not match this message.');
  const asset = await loadDiskAsset(reference.assetId);
  if (!asset) return undefined;
  const bytes = Uint8Array.from(atob(asset.data.base64), char => char.charCodeAt(0));
  return new Blob([bytes], { type: reference.mimeType });
}
