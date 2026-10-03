import { gcDBAssetsByScope } from '~/modules/dblobs/dblobs.db';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useProjectFilesStore } from './store-project-files';
import { diskReady, flushDisk } from './disk-storage';
import { withProjectAssetOperation } from './project-asset-operation';
import { projectAssetKeepIds } from './project-context';
export async function gcProjectCache() {
  if (!diskReady()) return;
  return withProjectAssetOperation(async () => {
    await flushDisk();
    const historical = useChatStore.getState().conversations.flatMap(chat => chat.messages.flatMap(message => message.generator?.projectContext?.files || []));
    const projects = useFolderStore.getState().folders;
    const owned = new Set([...projects.flatMap(project => project.fileIds), ...historical.map(ref => ref.id)]);
    useProjectFilesStore.setState(state => ({ files: Object.fromEntries(Object.entries(state.files).filter(([id]) => owned.has(id))) }));
    await flushDisk();
    const currentHistorical = useChatStore.getState().conversations.flatMap(chat => chat.messages.flatMap(message => message.generator?.projectContext?.files || []));
    const keep = projectAssetKeepIds(useFolderStore.getState().folders, useProjectFilesStore.getState().files, currentHistorical);
    await gcDBAssetsByScope('global', 'app-projects', null, keep);
  });
}
