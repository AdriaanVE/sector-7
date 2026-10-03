import { collectFragmentAssetIds } from '~/common/stores/chat/chat.gc';
import { estimateTokensForFragments } from '~/common/stores/chat/chat.tokens';
import { findLLMOrThrow } from '~/common/stores/llms/store-llms';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { diskStorage } from './disk-storage';
import { createAttachmentDraftsVanillaStore } from '~/common/attachment-drafts/store-attachment-drafts_vanilla';
import { _addDBAsset, deleteDBAsset } from '~/modules/dblobs/dblobs.db';
import { _createAssetObject, DBlobAssetType, DBlobMimeType } from '~/modules/dblobs/dblobs.types';
import { convert_UInt8Array_To_Base64 } from '~/common/util/blobUtils';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { ProjectFile } from './project-context';
import { withProjectAssetOperation } from './project-asset-operation';
import { planProjectFolder, PROJECT_FILE_LIMIT, PROJECT_FILE_BYTES } from './project-folder-selection';

interface ProjectFilesState { files: Record<string, ProjectFile> }
export const useProjectFilesStore = create<ProjectFilesState>()(persist(() => ({ files: {} }), {
  name: 'app-project-files', version: 1, skipHydration: true, storage: diskStorage<ProjectFilesState>(),
}));

async function processProjectFile(projectId: string, file: File, folderSnapshot?: ProjectFile['folderSnapshot']) {
  const project = useFolderStore.getState().folders.find(project => project.id === projectId);
  if (!project) throw new Error('Project no longer exists.');
  if (project.fileIds.length >= PROJECT_FILE_LIMIT) throw new Error('Each project supports up to 20 files. Remove a file first.');
  if (file.size > PROJECT_FILE_BYTES) throw new Error(`${file.name}: original exceeds the 10 MB limit.`);
  const refPath = folderSnapshot ? file.webkitRelativePath : file.name;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const original = _createAssetObject(DBlobAssetType.DOCUMENT, refPath,
    { mimeType: DBlobMimeType.DOCUMENT_BINARY, base64: convert_UInt8Array_To_Base64(bytes, 'project-file') },
    { ot: 'user', source: 'attachment', media: 'file-open', fileName: refPath }, { fileName: refPath, mimeType: file.type });
  await _addDBAsset(original, 'global', 'app-projects');
  const current = useFolderStore.getState().folders.find(project => project.id === projectId);
  if (!current || current.fileIds.length >= PROJECT_FILE_LIMIT) {
    await deleteDBAsset(original.id);
    throw new Error(current ? 'Project file limit changed while importing. Remove files and retry.' : 'Project was deleted while importing.');
  }
  const record: ProjectFile = { id: original.id, assetId: original.id, version: hash, name: file.name, mime: file.type,
    size: file.size, ...(folderSnapshot && { folderSnapshot, relativePath: refPath }), convertedAssetIds: [], status: 'processing', warnings: [], fragments: [], tokenEstimates: {} };
  useProjectFilesStore.setState(state => ({ files: { ...state.files, [record.id]: record } }));
  // No asynchronous gap between the capacity check and membership update.
  useFolderStore.getState().updateProject(projectId, { fileIds: [...current.fileIds, record.id] });
  const drafts = createAttachmentDraftsVanillaStore();
  try {
    await drafts.getState().createAttachmentDraft({ media: 'file', origin: 'file-open', fileWithHandle: file, refPath }, { hintAddImages: true });
    const draft = drafts.getState().attachmentDrafts[0];
    if (draft?.inputError || !draft?.outputFragments.length) throw new Error(draft?.inputError || 'No content extracted. Scanned PDFs require OCR.');
    const fragments = await drafts.getState().takeAllFragments('global', 'app-projects');
    const convertedIds = new Set<string>(); collectFragmentAssetIds(fragments, convertedIds);
    const ready: ProjectFile = { ...record, convertedAssetIds: [...convertedIds], status: 'ready', warnings: draft.outputWarnings || [], fragments,
      tokenEstimates: Object.fromEntries(['claude-opus-5-5', 'claude-sonnet-5-5'].map(model => [`${model}:tiktoken-fallback:v1`, estimateTokensForFragments(findLLMOrThrow(model), 'user', fragments, true, 'project-file')])) };
    useProjectFilesStore.setState(state => state.files[record.id] ? ({ files: { ...state.files, [record.id]: ready } }) : state);
  } catch (error) {
    useProjectFilesStore.setState(state => state.files[record.id] ? ({ files: { ...state.files, [record.id]: { ...record, status: 'failed', warnings: [error instanceof Error ? error.message : 'Extraction failed. Remove this file and try again.'] } } }) : state);
  } finally { drafts.getState().removeAllAttachmentDrafts(); }
}

const importingProjects = new Set<string>();
async function withProjectImport<T>(projectId: string, action: () => Promise<T>): Promise<T> {
  if (importingProjects.has(projectId)) throw new Error('This project is already importing files. Wait for it to finish and try again.');
  importingProjects.add(projectId);
  try { return await withProjectAssetOperation(action); } finally { importingProjects.delete(projectId); }
}

export async function addProjectFile(projectId: string, file: File) {
  return withProjectImport(projectId, () => processProjectFile(projectId, file));
}

export async function addProjectFolder(projectId: string, selected: readonly File[], onProgress: (completed: number, total: number) => void) {
  return withProjectImport(projectId, async () => {
    const project = useFolderStore.getState().folders.find(project => project.id === projectId);
    if (!project) throw new Error('Project no longer exists.');
    // Validate the entire eligible selection before uploading any original.
    const plan = planProjectFolder(selected, project.fileIds.length);
    const snapshot = { id: crypto.randomUUID(), name: plan.name, selectedAt: Date.now(), excludedCount: plan.excludedCount };
    onProgress(0, plan.files.length);
    for (const [index, file] of plan.files.entries()) {
      try { await processProjectFile(projectId, file, snapshot); }
      catch (error) { throw new Error(`${file.webkitRelativePath}: ${error instanceof Error ? error.message : 'Import failed.'} Folder import stopped at ${index}/${plan.files.length} files. Review or remove the visible snapshot before retrying.`); }
      onProgress(index + 1, plan.files.length);
    }
    return snapshot;
  });
}
