import { gcProjectCache } from './project-gc';
import { attentionLabel } from './attention';
import { ChatAttentionIndicator } from './ChatAttention';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Alert, Box, Button, Dropdown, IconButton, Input, Menu, MenuButton, MenuItem, Modal, ModalDialog, Textarea, Typography } from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useFolderStore, DFolder } from '~/common/stores/folders/store-chat-folders';
import { themeZIndexOverMobileDrawer } from '~/common/app.theme';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useProjectFilesStore } from './store-project-files';
import { flushDisk, localJSON } from './disk-storage';
import { connectedFolderSchema, ConnectedFolder } from './folder-tools';
import { ProjectFile } from './project-context';

export function ProjectSidebar({ onActivate, activeConversationId }: { onActivate: (id: string) => void; activeConversationId: string | null }) {
  const { folders, migrationSummary } = useFolderStore(useShallow(state => ({ folders: state.folders, migrationSummary: state.migrationSummary })));
  const conversations = useChatStore(state => state.conversations);
  const files = useProjectFilesStore(state => state.files);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState('');
  const [editorSession, setEditorSession] = React.useState(0);
  const menuButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const openEditor = (projectId: string, opener?: HTMLElement) => {
    returnFocus.current = opener || menuButtons.current.get(projectId) || null;
    setError('');
    setEditorSession(session => session + 1);
    setEditingId(projectId);
  };
  const closeEditor = (restoreFocus = true) => {
    setEditingId(null);
    const opener = returnFocus.current;
    if (restoreFocus) requestAnimationFrame(() => { if (opener?.isConnected) opener.focus(); });
  };
  const editing: DFolder | undefined = editingId === '' ? { id: '', title: 'New project', instructions: '', connectedFolders: [], fileIds: [], conversationIds: [], revision: 0 } : folders.find(project => project.id === editingId);
  const newChat = (projectId: string) => {
    const chat = useChatStore.getState().prependNewConversation(undefined, false);
    useFolderStore.getState().addConversationToFolder(projectId, chat);
    setExpanded(state => ({ ...state, [projectId]: true }));
    onActivate(chat);
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[aria-label="New Message"] textarea')?.focus());
  };
  const removeProject = (projectId: string) => {
    useFolderStore.getState().deleteFolder(projectId);
    void gcProjectCache().catch(error => setError(error instanceof Error ? error.message : 'Could not clean up project context.'));
  };
  return <Box sx={{
    px: 2, py: 1, display: 'grid', gap: 0.5, minWidth: 0,
    '& .sector7-nav-control': {
      minHeight: { xs: 40, sm: 36 }, minWidth: 0, px: 1, borderRadius: 'sm',
      justifyContent: 'flex-start', textAlign: 'left', fontSize: 'sm', fontWeight: 500,
      color: 'text.secondary', boxShadow: 'none',
      '&.sector7-nav-icon': { flexShrink: 0, width: { xs: 40, sm: 32 }, justifyContent: 'center' },
      '&.sector7-nav-project': { color: 'text.primary', fontWeight: 600 },
      '&:not(:disabled):not([aria-disabled="true"]):hover': {
        transform: 'none', boxShadow: 'none', bgcolor: 'rgba(0, 255, 179, .06)', color: 'text.primary',
      },
      '&:not(:disabled):active': { transform: 'none', bgcolor: 'rgba(0, 255, 179, .1)' },
      '&.Mui-focusVisible:not(:focus-visible)': { outline: 'none' },
      '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: -2 },
      '@media (forced-colors: active)': {
        '&:focus-visible': { outlineColor: 'Highlight' },
        '&:not(:disabled):not([aria-disabled="true"]):hover': { outline: '2px solid Highlight' },
      },
    },
  }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pl: 1, mb: 0.5 }}>
      <Typography level='title-sm' sx={{ color: 'text.secondary', fontSize: 'xs' }}>Projects</Typography>
      <Button className='sector7-nav-control' size='sm' variant='plain' color='neutral' startDecorator={<AddIcon sx={{ fontSize: 16 }} />} onClick={event => openEditor('', event.currentTarget)}>New</Button>
    </Box>
    {migrationSummary && <Alert size='sm' endDecorator={<IconButton size='sm' aria-label='Dismiss migration notice' onClick={() => useFolderStore.getState().dismissMigrationSummary()}><CloseIcon /></IconButton>}>{migrationSummary}</Alert>}
    {folders.map((project, index) => {
      const projectChats = conversations.filter(chat => project.conversationIds.includes(chat.id));
      const attentionCount = projectChats.filter(chat => attentionLabel(chat)).length;
      const toggleExpanded = () => setExpanded(state => ({ ...state, [project.id]: !state[project.id] }));
      return <Box key={project.id} sx={{ minWidth: 0 }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0,
          '& .sector7-project-actions': { opacity: 0 },
          '&:hover .sector7-project-actions, &:focus-within .sector7-project-actions, & .sector7-project-actions[aria-expanded="true"]': { opacity: 1 },
          '@media (hover: none)': { '& .sector7-project-actions': { opacity: 1 } },
        }}>
          <IconButton className='sector7-nav-control sector7-nav-icon' size='sm' variant='plain' color='neutral' aria-label={`${expanded[project.id] ? 'Collapse' : 'Expand'} ${project.title}`} aria-expanded={!!expanded[project.id]} onClick={toggleExpanded}>{expanded[project.id] ? <FolderOpenOutlinedIcon sx={{ fontSize: 18 }} /> : <FolderOutlinedIcon sx={{ fontSize: 18 }} />}</IconButton>
          <Button className='sector7-nav-control sector7-nav-project' size='sm' variant='plain' color='neutral' aria-expanded={!!expanded[project.id]} onClick={toggleExpanded} sx={{ flex: 1, overflow: 'hidden' }}>
            <Box component='span' sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}{attentionCount ? ` (${attentionCount})` : ''}</Box>
          </Button>
          <Dropdown>
            <MenuButton ref={button => { if (button) menuButtons.current.set(project.id, button); else menuButtons.current.delete(project.id); }} className='sector7-nav-control sector7-nav-icon sector7-project-actions' size='sm' variant='plain' color='neutral' aria-label={`Actions for ${project.title}`}><MoreHorizIcon sx={{ fontSize: 18 }} /></MenuButton>
            <Menu placement='bottom-start' sx={{ zIndex: themeZIndexOverMobileDrawer, p: 1, width: 'min(340px, calc(100vw - 32px))', borderRadius: 'lg', boxShadow: 'lg', '--ListItem-radius': '8px' }}>
              <Box component='li' role='presentation' sx={{ px: 1.25, py: 1, minWidth: 0 }}>
                <Typography level='title-md' startDecorator={<FolderOutlinedIcon sx={{ fontSize: 18 }} />} sx={{ overflowWrap: 'anywhere' }}>{project.title}</Typography>
                <Typography level='body-sm' sx={{ mt: 0.5, color: 'text.secondary' }}>{projectChats.length} {projectChats.length === 1 ? 'chat' : 'chats'}</Typography>
              </Box>
              <Box component='li' role='presentation' sx={{ borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', py: 0.75, my: 0.5 }}>
                {(project.connectedFolders || []).map(folder => <Box key={folder.id} sx={{ display: 'flex', gap: 1, px: 1.25, py: 0.5, alignItems: 'flex-start' }}><FolderOutlinedIcon sx={{ fontSize: 17, mt: 0.2, color: 'text.tertiary', flexShrink: 0 }} /><Typography level='body-xs' sx={{ fontFamily: 'code', overflowWrap: 'anywhere' }}>{folder.path}</Typography></Box>)}
                {!project.connectedFolders?.length && <Typography level='body-sm' sx={{ px: 1.25, py: 0.5, color: 'text.tertiary' }}>No source folders</Typography>}
              </Box>
              <MenuItem onClick={() => openEditor(project.id)}>Edit project</MenuItem>
              <MenuItem onClick={() => newChat(project.id)}>New chat in project</MenuItem>
              <MenuItem disabled={!index} onClick={() => useFolderStore.getState().moveFolder(index, index - 1)}>Move up</MenuItem>
              <MenuItem disabled={index === folders.length - 1} onClick={() => useFolderStore.getState().moveFolder(index, index + 1)}>Move down</MenuItem>
              <MenuItem color='danger' onClick={() => removeProject(project.id)}>Remove local project</MenuItem>
            </Menu>
          </Dropdown>
        </Box>
        {expanded[project.id] && <Box sx={{ ml: { xs: '40px', sm: '32px' }, pl: 0.25, display: 'grid', gap: 0.25, minWidth: 0 }}>
          {projectChats.filter(chat => !chat.isArchived).map(chat => <Button className='sector7-nav-control' size='sm' key={chat.id} variant='plain' color='neutral' aria-current={activeConversationId === chat.id ? 'page' : undefined} onClick={() => onActivate(chat.id)} sx={{ overflow: 'hidden', gap: 1, bgcolor: activeConversationId === chat.id ? 'rgba(180, 198, 209, .08)' : undefined }}><Box component='span' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.userTitle || chat.autoTitle || 'New chat'}</Box><ChatAttentionIndicator id={chat.id} isCurrent={activeConversationId === chat.id} /></Button>)}
          {!projectChats.some(chat => !chat.isArchived) && <Typography level='body-xs' sx={{ px: 1, py: 0.5, color: 'text.tertiary' }}>No chats yet</Typography>}
          <Button className='sector7-nav-control' size='sm' variant='plain' color='neutral' startDecorator={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => newChat(project.id)}>New chat</Button>
        </Box>}
      </Box>;
    })}
    {error && <Alert size='sm' color='danger'>{error}</Alert>}
    {editing && <ProjectEditor key={editorSession} project={editing} files={files} onClose={() => closeEditor()} onRemove={() => { removeProject(editing.id); closeEditor(); }} onSaved={(projectId, created, removedContext) => { closeEditor(!created); if (created) newChat(projectId); void (removedContext ? gcProjectCache() : flushDisk()).catch(error => setError(error instanceof Error ? error.message : 'Could not save project.')); }} />}
  </Box>;
}

function ProjectEditor({ project, files, onClose, onRemove, onSaved }: {
  project: DFolder;
  files: Record<string, ProjectFile>;
  onClose: () => void;
  onRemove: () => void;
  onSaved: (projectId: string, created: boolean, removedContext: boolean) => void;
}) {
  const [title, setTitle] = React.useState(project.title);
  const [instructions, setInstructions] = React.useState(project.instructions);
  const [folders, setFolders] = React.useState<ConnectedFolder[]>(project.connectedFolders || []);
  const [fileIds, setFileIds] = React.useState(project.fileIds);
  const originalFileIds = React.useRef(project.fileIds);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const active = React.useRef(false);
  const picking = React.useRef(false);
  const pickerRequest = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    active.current = true;
    return () => { active.current = false; pickerRequest.current?.abort(); };
  }, []);

  const addFolder = async () => {
    if (picking.current) return;
    picking.current = true;
    const controller = new AbortController();
    pickerRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await localJSON('folders', { method: 'POST', body: JSON.stringify({ action: 'pick' }), signal: controller.signal });
      if (!active.current || result.cancelled) return;
      const folder = connectedFolderSchema.parse(result.folder);
      if (folders.some(item => item.path === folder.path)) throw new Error('This folder is already connected.');
      setFolders(current => [...current, folder]);
    } catch (error) {
      if (active.current) setError(error instanceof Error ? error.message : 'Could not select folder.');
    } finally {
      if (pickerRequest.current === controller) pickerRequest.current = null;
      picking.current = false;
      if (active.current) setLoading(false);
    }
  };
  const save = () => {
    if (!title.trim() || picking.current) return;
    const store = useFolderStore.getState();
    let current = store.folders.find(folder => folder.id === project.id);
    if (!project.id) {
      store.createFolder(title.trim());
      current = useFolderStore.getState().folders.at(-1);
    }
    if (!current) { setError('This project was removed. Close this editor and create a new project.'); return; }
    store.setFolderName(current.id, title.trim());
    // Keep context added elsewhere while this editor was open; remove only selected original entries.
    const removed = originalFileIds.current.filter(id => !fileIds.includes(id));
    store.updateProject(current.id, { instructions, connectedFolders: folders, fileIds: current.fileIds.filter(id => !removed.includes(id)) });
    onSaved(current.id, !project.id, removed.length > 0);
  };
  const removeFiles = (ids: string[]) => setFileIds(current => current.filter(id => !ids.includes(id)));
  return <Modal open disableRestoreFocus onClose={onClose} sx={{ zIndex: themeZIndexOverMobileDrawer }}>
    <ModalDialog aria-labelledby='sector7-project-editor-title' sx={{ width: 'min(600px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 32px)', overflow: 'auto', p: { xs: 2, sm: 3 }, gap: 2.5, borderRadius: 'xl' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography id='sector7-project-editor-title' level='h3'>{project.id ? 'Edit project' : 'New project'}</Typography>
        <IconButton size='sm' color='neutral' variant='plain' aria-label='Close project editor' onClick={onClose}><CloseIcon /></IconButton>
      </Box>
      <Input autoFocus aria-label='Project name' startDecorator={<FolderOutlinedIcon />} value={title} onChange={event => setTitle(event.target.value)} sx={{ minHeight: 48, borderRadius: 'md' }} />
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Typography level='title-sm'>Source folders</Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 'lg', overflow: 'hidden' }}>
          {folders.map(folder => <Box key={folder.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <FolderOutlinedIcon sx={{ color: 'text.tertiary', flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}><Typography level='body-sm' sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{folder.name}</Typography><Typography level='body-xs' sx={{ mt: 0.25, fontFamily: 'code', color: 'text.tertiary', overflowWrap: 'anywhere' }}>{folder.path}</Typography></Box>
            <IconButton size='sm' variant='plain' color='neutral' aria-label={`Disconnect ${folder.name}`} disabled={loading} onClick={() => setFolders(current => current.filter(item => item.id !== folder.id))}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
          </Box>)}
          <Button size='sm' variant='plain' color='neutral' loading={loading} disabled={loading} startDecorator={<AddIcon />} onClick={() => void addFolder()} sx={{ width: '100%', minHeight: 48, justifyContent: 'flex-start', borderRadius: 0, p: 1.5, bgcolor: 'rgba(180, 198, 209, .06)' }}>Add folder</Button>
        </Box>
        <Typography level='body-xs' sx={{ color: 'text.secondary' }}>Files stay on your Mac and are read on demand. Save grants this project file and command access with the app’s permissions, including beyond these folders. Disconnecting stops future access.</Typography>
      </Box>
      <Box component='details' sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 'md', p: 1.5 }}>
        <Box component='summary' sx={{ cursor: 'pointer', fontSize: 'sm', fontWeight: 600 }}>Shared instructions</Box>
        <Typography level='body-xs' sx={{ mt: 1, mb: 1, color: 'text.secondary' }}>Apply to future replies in this project.</Typography>
        <Textarea aria-label='Project instructions' placeholder='Instructions for this project' minRows={4} value={instructions} onChange={event => setInstructions(event.target.value)} sx={{ borderRadius: 'sm' }} />
      </Box>
      {!!fileIds.length && <Box component='details' sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 'md', p: 1.5 }}>
        <Box component='summary' sx={{ cursor: 'pointer', fontSize: 'sm', fontWeight: 600 }}>Legacy attached context ({fileIds.length})</Box>
        <Box sx={{ display: 'grid', gap: 1.5, mt: 1.5 }}>
          {fileIds.filter(id => !files[id]?.folderSnapshot).map(id => <ProjectFileRow key={id} file={files[id]} loading={loading} onRemove={() => removeFiles([id])} />)}
          {[...new Set(fileIds.flatMap(id => files[id]?.folderSnapshot ? [files[id].folderSnapshot!.id] : []))].map(snapshotId => {
            const members = fileIds.map(id => files[id]).filter(file => file?.folderSnapshot?.id === snapshotId);
            const snapshot = members[0].folderSnapshot!;
            return <Box key={snapshotId} component='details' sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 'sm' }}>
              <Box component='summary' sx={{ cursor: 'pointer', overflowWrap: 'anywhere', fontSize: 'sm' }}>{snapshot.name} ({members.filter(file => file.status === 'ready').length}/{members.length} ready)</Box>
              <Typography level='body-xs' sx={{ mt: 1 }}>Snapshot from {new Date(snapshot.selectedAt).toLocaleString()}. {snapshot.excludedCount} hidden, private or build files excluded. Changes on your Mac are not watched.</Typography>
              <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>{members.map(file => <ProjectFileRow key={file.id} file={file} loading={loading} onRemove={() => removeFiles([file.id])} />)}</Box>
              <Button size='sm' variant='plain' color='neutral' disabled={loading} onClick={() => removeFiles(members.map(file => file.id))}>Remove folder snapshot</Button>
            </Box>;
          })}
        </Box>
      </Box>}
      {error && <Alert role='alert' color='danger' size='sm'>{error}</Alert>}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
        {!!project.id && <Button size='sm' variant='soft' color='danger' onClick={onRemove} sx={{ borderRadius: 'md' }}>Remove local project</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant='plain' color='neutral' onClick={onClose}>Cancel</Button>
        <Button disabled={!title.trim() || loading} onClick={save} sx={{ borderRadius: 'md' }}>Save</Button>
      </Box>
      {!!project.id && <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: -1.5 }}>Removing this project keeps your chats and local files.</Typography>}
    </ModalDialog>
  </Modal>;
}

function ProjectFileRow({ file, loading, onRemove }: { file?: ProjectFile; loading: boolean; onRemove: () => void }) {
  return <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ overflowWrap: 'anywhere', fontFamily: file?.relativePath ? 'code' : undefined, fontSize: 'sm' }}>{file?.relativePath || file?.name || 'Missing file'}</Typography>
      <Typography level='body-xs' color={file?.status === 'failed' ? 'danger' : 'neutral'}>{file?.status === 'processing' ? 'Extracting content...' : file?.status === 'failed' ? 'Extraction failed. Remove and add again to retry.' : file ? 'Ready' : 'Unavailable. Remove and add again.'}</Typography>
      {file?.warnings.map(warning => <Typography key={warning} color='warning' level='body-xs' sx={{ overflowWrap: 'anywhere' }}>{warning}</Typography>)}
    </Box><Button size='sm' variant='plain' disabled={loading} onClick={onRemove}>Remove</Button>
  </Box>;
}
