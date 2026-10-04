import { ChatAttentionIndicator } from '~/common/personal/ChatAttention';
import * as React from 'react';

import type { SxProps } from '@mui/joy/styles/types';
import { Avatar, Box, Dropdown, IconButton, ListDivider, ListItem, ListItemButton, ListItemDecorator, Menu, MenuButton, MenuItem, Sheet, styled, Typography } from '@mui/joy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CopyAllIcon from '@mui/icons-material/CopyAll';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import TelegramIcon from '@mui/icons-material/Telegram';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { SystemPurposeId, SystemPurposes } from '../../../../data';

import { autoConversationTitle } from '~/modules/aifn/autotitle/autoTitle';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import type { DFolder } from '~/common/stores/folders/store-chat-folders';
import { ANIM_BUSY_TYPING } from '~/common/util/dMessageUtils';
import { ChatBeamIcon } from '~/common/components/icons/ChatBeamIcon';
import { InlineTextarea } from '~/common/components/InlineTextarea';
import { joyKeepPopup } from '~/common/components/CloseablePopup';
import { themeZIndexOverMobileDrawer } from '~/common/app.theme';
import { isDeepEqual } from '~/common/util/hooks/useDeep';
import { useChatStore } from '~/common/stores/chat/store-chats';

import { CHAT_NOVEL_TITLE } from '../../AppChat';


// set to true to display the conversation IDs
// const DEBUG_CONVERSATION_IDS = false;


export const FadeInButton = styled(IconButton)({
  opacity: 0.5,
  transition: 'opacity 0.16s',
  '&:hover': { opacity: 1 },
});

const chatActionsMenuSx: SxProps = {
  zIndex: themeZIndexOverMobileDrawer,
  minWidth: 200,
  '--List-padding': '4px',
  '--List-gap': '1px',
  '--ListDivider-gap': '4px',
  '--ListItem-minHeight': '2.25rem',
  '--ListItem-paddingX': '0.625rem',
  '--ListItem-paddingY': '0.25rem',
  '--ListItem-radius': '6px',
  '--ListItemDecorator-size': '1.75rem',
  '--Icon-fontSize': '1.0625rem',
  fontSize: '0.8125rem',
  backgroundColor: 'background.popup',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '10px',
  boxShadow: '0 12px 32px -12px rgba(0, 0, 0, .6)',
  '& .MuiMenuItem-root': {
    fontSize: 'inherit',
    transition: 'background-color 120ms ease-out, color 120ms ease-out',
    '& .MuiListItemDecorator-root': { color: 'text.tertiary', transition: 'color 120ms ease-out' },
    '&:not(.Mui-disabled):hover': {
      backgroundColor: 'neutral.softHoverBg',
      color: 'text.primary',
      '& .MuiListItemDecorator-root': { color: 'text.primary' },
      '&.MuiMenuItem-colorDanger': {
        backgroundColor: 'danger.softHoverBg',
        color: 'danger.softColor',
        '& .MuiListItemDecorator-root': { color: 'inherit' },
      },
    },
    '&.Mui-focusVisible, &:focus-visible': {
      outline: '2px solid var(--joy-palette-focusVisible)',
      outlineOffset: '-2px',
    },
    '&.MuiMenuItem-colorDanger .MuiListItemDecorator-root': { color: 'inherit' },
  },
  '@media (pointer: coarse)': { '--ListItem-minHeight': '2.75rem' },
  '@media (prefers-reduced-motion: reduce)': {
    '& .MuiMenuItem-root, & .MuiListItemDecorator-root': { transition: 'none' },
  },
  '@media (forced-colors: active)': {
    borderColor: 'CanvasText',
    '& .MuiMenuItem-root.Mui-focusVisible, & .MuiMenuItem-root:focus-visible': { outline: '2px solid Highlight' },
  },
};


export const ChatDrawerItemMemo = React.memo(ChatDrawerItem, (prev, next) =>
  // usign a custom function because `ChatNavigationItemData` is a complex object and memo won't work
  isDeepEqual(prev.item, next.item) &&
  prev.showSymbols === next.showSymbols &&
  prev.bottomBarBasis === next.bottomBarBasis &&
  prev.onConversationActivate === next.onConversationActivate &&
  prev.onConversationBranch === next.onConversationBranch &&
  prev.onConversationDeleteNoConfirmation === next.onConversationDeleteNoConfirmation &&
  prev.onConversationExport === next.onConversationExport &&
  prev.onConversationFolderChange === next.onConversationFolderChange,
);

export interface ChatNavigationItemData {
  type: 'nav-item-chat-data',
  conversationId: DConversationId;
  isActive: boolean;
  isAlsoOpen: string | false;
  isEmpty: boolean;
  isIncognito: boolean;
  title: string;
  isArchived: boolean;
  userSymbol: string | undefined;
  userFlagsSummary: string | undefined;
  containsDocAttachments: boolean;
  containsImageAssets: boolean;
  folder: DFolder | null | undefined; // null: 'All', undefined: do not show folder select
  updatedAt: number;
  hasBeamOpen: boolean;
  messageCount: number;
  beingGenerated: boolean;
  systemPurposeId: SystemPurposeId;
  searchFrequency: number;
}

export interface FolderChangeRequest {
  conversationId: DConversationId;
  anchorEl: HTMLButtonElement;
  currentFolder: DFolder | null;
}

function ChatDrawerItem(props: {
  // NOTE: always update the Memo comparison if you add or remove props
  item: ChatNavigationItemData,
  showSymbols: boolean | 'gif',
  bottomBarBasis: number,
  onConversationActivate: (conversationId: DConversationId, closeMenu: boolean) => void,
  onConversationBranch: (conversationId: DConversationId, messageId: string | null, addSplitPane: boolean) => void,
  onConversationDeleteNoConfirmation: (conversationId: DConversationId) => void,
  onConversationExport: (conversationId: DConversationId, exportAll: boolean) => void,
  onConversationFolderChange: (folderChangeRequest: FolderChangeRequest) => void,
}) {

  // state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [isAutoEditingTitle, setIsAutoEditingTitle] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const actionsButtonRef = React.useRef<HTMLButtonElement>(null);

  // derived state
  const { onConversationBranch, onConversationExport, onConversationFolderChange } = props;
  const {
    conversationId,
    isActive,
    isAlsoOpen,
    isIncognito,
    title,
    userSymbol,
    userFlagsSummary,
    containsDocAttachments,
    containsImageAssets,
    folder,
    hasBeamOpen,
    messageCount,
    beingGenerated,
    systemPurposeId,
    searchFrequency,
  } = props.item;
  const isNew = messageCount === 0;


  // [effect] auto-disarm when inactive
  const shallClose = (deleteArmed || actionsOpen) && !isActive;
  React.useEffect(() => {
    if (shallClose) {
      setDeleteArmed(false);
      setActionsOpen(false);
    }
  }, [shallClose]);


  // Activate

  const handleConversationActivate = () => props.onConversationActivate(conversationId, true);


  // branch

  const handleConversationBranch = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    conversationId && onConversationBranch(conversationId, null, false /* no pane from Drawer duplicate */);
  }, [conversationId, onConversationBranch]);


  // export

  const handleConversationExport = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    conversationId && onConversationExport(conversationId, false);
  }, [conversationId, onConversationExport]);


  // Folder change

  const handleFolderChangeBegin = React.useCallback(() => {
    if (!actionsButtonRef.current) return;
    onConversationFolderChange({
      conversationId,
      anchorEl: actionsButtonRef.current,
      currentFolder: folder ?? null,
    });
  }, [conversationId, folder, onConversationFolderChange]);


  // Title Edit

  const handleTitleEditBegin = React.useCallback(() => setIsEditingTitle(true), []);

  const handleTitleEditCancel = React.useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  const handleTitleEditChange = React.useCallback((text: string) => {
    setIsEditingTitle(false);
    useChatStore.getState().setUserTitle(conversationId, text.trim());
  }, [conversationId]);

  const handleTitleEditAuto = React.useCallback(async () => {
    setIsAutoEditingTitle(true);
    await autoConversationTitle(conversationId, true);
    setIsAutoEditingTitle(false);
  }, [conversationId]);


  // Delete

  const { onConversationDeleteNoConfirmation } = props;
  const handleDeleteButtonShow = React.useCallback((event: React.MouseEvent) => {
    // special case: if 'Shift' is pressed, delete immediately
    if (event.shiftKey) { // immediately delete:conversation
      event.stopPropagation();
      setActionsOpen(false);
      onConversationDeleteNoConfirmation(conversationId);
      return;
    }
    setDeleteArmed(true);
  }, [conversationId, onConversationDeleteNoConfirmation]);

  const handleDeleteButtonHide = React.useCallback(() => setDeleteArmed(false), []);

  const handleConversationDelete = React.useCallback((event: React.MouseEvent) => {
    if (deleteArmed) {
      setDeleteArmed(false);
      event.stopPropagation();
      onConversationDeleteNoConfirmation(conversationId);
    }
  }, [conversationId, deleteArmed, onConversationDeleteNoConfirmation]);


  const personaSymbol = userSymbol || SystemPurposes[systemPurposeId]?.symbol || '❓';
  const personaImageURI = SystemPurposes[systemPurposeId]?.imageUri ?? undefined;


  const progress = props.bottomBarBasis ? 100 * (searchFrequency || messageCount) / props.bottomBarBasis : 0;

  const titleRowComponent = React.useMemo(() => <>

    {/* Symbol, if globally enabled */}
    {(props.showSymbols || isIncognito) && (
      <ListItemDecorator>
        {hasBeamOpen ? (
          <ChatBeamIcon sx={{ fontSize: 'xl' }} />
        ) : isIncognito ? (
          <Avatar variant='soft' sx={{ backgroundColor: `#9C27B022`, width: '1.5rem', height: '1.5rem' }}>
            <VisibilityOffIcon sx={{ fontSize: 'md', color: `#9C27B0` }} />
          </Avatar>
        ) : (beingGenerated && props.showSymbols === 'gif') ? (
          <Avatar
            alt='chat activity'
            variant='plain'
            src={ANIM_BUSY_TYPING}
            sx={{
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: 'var(--joy-radius-sm)',
            }}
          />
        ) : beingGenerated ? (
          <TelegramIcon sx={{ fontSize: 'xl' }} />
        ) : (personaImageURI && props.showSymbols === 'gif') ? (
          <Avatar
            alt={personaSymbol}
            src={personaImageURI}
            sx={{
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: 'var(--joy-radius-sm)',
            }}
          />
        ) : (
          <Typography sx={isNew ? { opacity: 0.4, filter: 'grayscale(0.75)' } : undefined}>
            {personaSymbol}
          </Typography>
        )}
      </ListItemDecorator>
    )}

    {/* Title */}
    {!isEditingTitle ? (
      // using Box to not reset the parent font scaling
      <Box
        onDoubleClick={handleTitleEditBegin}
        sx={{
          color: isActive ? 'text.primary' : 'text.secondary',
          overflowWrap: 'anywhere',
          flex: 1,
          minWidth: 0,
        }}
      >
        {/*{DEBUG_CONVERSATION_IDS && `${conversationId} - `}*/}
        {title.trim() ? title : CHAT_NOVEL_TITLE}
      </Box>
    ) : (
      <InlineTextarea
        invertedColors
        initialText={title}
        onEdit={handleTitleEditChange}
        onCancel={handleTitleEditCancel}
        sx={{
          flexGrow: 1,
          ml: -1.5, mr: -0.5,
        }}
      />
    )}

    {/* Right text */}
    {searchFrequency > 0 ? (
      // Display search frequency if it exists and is greater than 0
      <Typography level='body-sm'>
        {Math.round(searchFrequency * 10) / 10}
      </Typography>
    ) : (props.showSymbols && (userFlagsSummary || containsDocAttachments || containsImageAssets)) ? (
      <Box sx={{
        fontSize: 'xs',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        {userFlagsSummary}{containsDocAttachments && '📄'}{containsImageAssets && '🖍️'}
      </Box>
    ) : null}

    <ChatAttentionIndicator id={conversationId} isCurrent={isActive} />

  </>, [beingGenerated, containsDocAttachments, containsImageAssets, conversationId, handleTitleEditBegin, handleTitleEditCancel, handleTitleEditChange, hasBeamOpen, isActive, isEditingTitle, isIncognito, isNew, personaImageURI, personaSymbol, props.showSymbols, searchFrequency, title, userFlagsSummary]);

  const progressBarFixedComponent = React.useMemo(() =>
    progress > 0 && (
      <Box sx={{
        backgroundColor: 'neutral.softHoverBg',
        position: 'absolute', left: 0, bottom: 0, width: progress + '%', height: 4,
      }} />
    ), [progress]);

  return (isActive || isAlsoOpen) ? (

    // Active or Also Open
    <Sheet
      aria-current={isActive ? 'true' : undefined}
      variant={isActive ? 'solid' : 'outlined'}
      invertedColors={isActive}
      onClick={!isActive ? handleConversationActivate : undefined}
      sx={{
        // common
        // position: 'relative', // for the progress bar (now disabled)
        '--ListItem-minHeight': '2.75rem',

        // differences between primary and secondary variants
        ...(isActive ? {
          border: 'none', // there's a default border of 1px and invisible.. hmm
        } : {
          // '--variant-borderWidth': '0.125rem',
          cursor: 'pointer',
        }),

        // style
        fontSize: 'inherit',
        backgroundColor: isActive ? 'rgba(180, 198, 209, .08)' : 'transparent',
        borderRadius: 'md',
        mx: 2,
        '& .chat-actions-menu': { opacity: 0 },
        '&:hover .chat-actions-menu, &:focus-within .chat-actions-menu, & .chat-actions-menu[aria-expanded="true"]': { opacity: 1 },
        '@media (hover: none)': { '& .chat-actions-menu': { opacity: 1 } },
        ...(isIncognito && {
          backgroundColor: 'background.level2',
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 10px, transparent 10px, transparent 20px)',
          // border: 'none',
          // border: '1px dashed',
          borderColor: 'background.level3',
          // purple icon to further indicate incognito mode
          '& .MuiListItemDecorator-root': {
            color: '#9C27B0',
          },
          // filter: 'brightness(0.5) contrast(0.5)',
        }),
      }}
    >

      <ListItem sx={{ border: 'none', display: 'grid', gap: 0, px: 1 }}>

        {/* Title row */}
        <Box sx={{ display: 'flex', gap: 'var(--ListItem-gap)', minHeight: '2.25rem', alignItems: 'center' }}>
          {titleRowComponent}
          {isActive && <Dropdown open={actionsOpen} onOpenChange={(_, open) => { setActionsOpen(open); if (!open) setDeleteArmed(false); }}>
            <MenuButton ref={actionsButtonRef} className='chat-actions-menu' size='sm' variant='plain' color='neutral'
              aria-label={`Actions for ${title.trim() || CHAT_NOVEL_TITLE}`} sx={{ flexShrink: 0, px: 0.5, minWidth: 28 }}>
              <MoreHorizIcon sx={{ fontSize: 18 }} />
            </MenuButton>
            <Menu placement='bottom-end' sx={chatActionsMenuSx}>
              {!deleteArmed ? <>
                {folder !== undefined && <MenuItem onClick={() => requestAnimationFrame(() => requestAnimationFrame(handleFolderChangeBegin))}>
                  <ListItemDecorator><FolderOutlinedIcon /></ListItemDecorator>{folder ? `Change folder (${folder.title})` : 'Add to folder'}
                </MenuItem>}
                <MenuItem disabled={isEditingTitle || isAutoEditingTitle} onClick={() => requestAnimationFrame(() => requestAnimationFrame(handleTitleEditBegin))}>
                  <ListItemDecorator><EditRoundedIcon /></ListItemDecorator>Rename
                </MenuItem>
                {!isNew && <>
                  <MenuItem disabled={isEditingTitle || isAutoEditingTitle} onClick={handleTitleEditAuto}>
                    <ListItemDecorator><AutoFixHighIcon /></ListItemDecorator>Auto-title
                  </MenuItem>
                  <MenuItem onClick={handleConversationBranch}><ListItemDecorator><CopyAllIcon /></ListItemDecorator>Duplicate</MenuItem>
                  <MenuItem onClick={handleConversationExport}><ListItemDecorator><FileUploadOutlinedIcon /></ListItemDecorator>Export chat</MenuItem>
                </>}
              </> : null}
              {!deleteArmed && <ListDivider />}
              <MenuItem key='delete' color='danger' onClick={deleteArmed ? handleConversationDelete : joyKeepPopup(handleDeleteButtonShow)}>
                <ListItemDecorator>{deleteArmed ? <DeleteForeverIcon /> : <DeleteOutlineIcon />}</ListItemDecorator>{deleteArmed ? 'Confirm deletion' : 'Delete'}
              </MenuItem>
              {deleteArmed && <MenuItem onClick={joyKeepPopup(handleDeleteButtonHide)}>Cancel delete</MenuItem>}
            </Menu>
          </Dropdown>}

        </Box>

        {/* View places row */}
        {isAlsoOpen && (
          <Typography level='body-xs' sx={{ mx: 'auto' }}>
            <em>In view {isAlsoOpen}</em>
          </Typography>
        )}

      </ListItem>

      {/* Optional progress bar, underlay */}
      {/* NOTE: disabled on 20240204: quite distracting on the active chat sheet */}
      {/*{progressBarFixedComponent}*/}

    </Sheet>

  ) : (

    // Inactive Conversation - click to activate
    <ListItem
      sx={{ mx: 2, px: 0 }}
    >

      <ListItemButton
        onClick={handleConversationActivate}
        sx={{
          border: 'none', // there's a default border of 1px and invisible.. hmm
          position: 'relative', // for the progress bar
          borderRadius: 'md',
          minWidth: 0,
          mx: 0,
          px: 1,
          ...isIncognito && {
            filter: 'contrast(0)',
          },
        }}
      >
        {titleRowComponent}

        {/* Optional progress bar, underlay */}
        {progressBarFixedComponent}

      </ListItemButton>

    </ListItem>
  );
}
