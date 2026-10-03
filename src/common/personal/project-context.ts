import type { DFolder } from '~/common/stores/folders/store-chat-folders';
import type { DMessageAttachmentFragment } from '~/common/stores/chat/chat.fragments';

export interface ProjectFile {
  id: string;
  version: string;
  assetId: string;
  name: string;
  // Optional for compatibility with individual files and existing backups.
  folderSnapshot?: { id: string; name: string; selectedAt: number; excludedCount: number };
  relativePath?: string;
  mime: string;
  size: number;
  convertedAssetIds?: string[];
  status: 'processing' | 'ready' | 'failed';
  warnings: string[];
  fragments: DMessageAttachmentFragment[];
  tokenEstimates: Record<string, number>;
}

export function migrateProjects(folders: DFolder[]): { folders: DFolder[]; removedMemberships: number } {
  const owned = new Set<string>();
  let removedMemberships = 0;
  return {
    folders: folders.map(folder => ({
      ...folder,
      instructions: folder.instructions || '', fileIds: folder.fileIds || [], revision: folder.revision || 0,
      conversationIds: folder.conversationIds.filter(id => {
        if (owned.has(id)) { removedMemberships++; return false; }
        owned.add(id); return true;
      }),
    })),
    get removedMemberships() { return removedMemberships; },
  };
}

export function estimateContextBudget(inputTokens: number, windowTokens: number, outputTokens = 16384, thinkingTokens = 16384) {
  const total = inputTokens + outputTokens + thinkingTokens + Math.ceil(windowTokens * .1);
  return { total, limit: windowTokens, fits: total <= windowTokens };
}

export function projectAssetKeepIds(projects: DFolder[], files: Record<string, ProjectFile>, historical: { id: string; version: string }[]) {
  const keep = new Set<string>();
  const owned = new Set(projects.flatMap(project => project.fileIds));
  for (const ref of historical) if (files[ref.id]?.version === ref.version) owned.add(ref.id);
  for (const id of owned) if (files[id]) {
    keep.add(files[id].assetId);
    for (const converted of files[id].convertedAssetIds || []) keep.add(converted);
  }
  return [...keep];
}
