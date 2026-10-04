import { ProjectSidebar } from '~/common/personal/ProjectSidebar';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Box, Button, Chip, Dropdown, IconButton, ListDivider, ListItem, ListItemButton, ListItemDecorator, Menu, MenuButton, MenuItem, Tooltip, Typography } from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import FolderIcon from '@mui/icons-material/Folder';
import FormatPaintOutlinedIcon from '@mui/icons-material/FormatPaintOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { LayoutSidebarRight } from '~/common/components/icons/LayoutSidebarRight';
import SettingsIcon from '@mui/icons-material/Settings';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import { CloseablePopup } from '~/common/components/CloseablePopup';
import { DFolder, useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { DebouncedInputMemo } from '~/common/components/DebouncedInput';
import { FoldersToggleOff } from '~/common/components/icons/FoldersToggleOff';
import { FoldersToggleOn } from '~/common/components/icons/FoldersToggleOn';
import { OPTIMA_DRAWER_BACKGROUND } from '~/common/layout/optima/optima.config';
import { OptimaDrawerList } from '~/common/layout/optima/drawer/OptimaDrawerList';
import { capitalizeFirstLetter } from '~/common/util/textUtils';
import { getIsMobile, useIsMobile } from '~/common/components/useMatchMedia';
import { optimaCloseDrawer, optimaOpenPreferences } from '~/common/layout/optima/useOptima';
import { themeScalingMap, themeZIndexOverMobileDrawer } from '~/common/app.theme';
import { useUIPreferencesStore } from '~/common/stores/store-ui';

import { ChatDrawerItemMemo, FolderChangeRequest } from './ChatDrawerItem';
import { ChatFolderList } from './folders/ChatFolderList';
import { ChatNavGrouping, ChatSearchDepth, ChatSearchSorting, isDrawerSearching, useChatDrawerRenderItems } from './useChatDrawerRenderItems';
import { ClearFolderText } from '../layout-bar/useFolderDropdown';
import { useChatDrawerFilters } from '../../store-app-chat';


// this is here to make shallow comparisons work on the next hook
const noFolders: DFolder[] = [];

// 'Older than' age filter presets (days of last activity; null = off)
const AGE_FILTER_OPTIONS: { days: number | null, label: string, shortLabel: string }[] = [
  { days: null, label: 'Any age', shortLabel: 'Any' },
  { days: 7, label: 'Older than 1 week', shortLabel: '>1w' },
  { days: 14, label: 'Older than 2 weeks', shortLabel: '>2w' },
  { days: 30, label: 'Older than 1 month', shortLabel: '>1m' },
  { days: 90, label: 'Older than 3 months', shortLabel: '>3m' },
];

/*
 * Lists folders and returns the active folder
 */
export const useFolders = (activeFolderId: string | null) => useFolderStore(useShallow(({ enableFolders, folders, toggleEnableFolders }) => {

  // finds the active folder if any
  const activeFolder = (enableFolders && activeFolderId)
    ? folders.find(folder => folder.id === activeFolderId) ?? null
    : null;

  return {
    activeFolder,
    allFolders: enableFolders ? folders : noFolders,
    enableFolders,
    toggleEnableFolders,
  };
}));


export const ChatDrawerMemo = React.memo(ChatDrawer);

function ChatDrawer(props: {
  activeConversationId: DConversationId | null,
  activeFolderId: string | null,
  chatPanesConversationIds: DConversationId[],
  disableNewButton: boolean,
  onConversationActivate: (conversationId: DConversationId) => void,
  onConversationBranch: (conversationId: DConversationId, messageId: string | null, addSplitPane: boolean) => void,
  onConversationNew: (forceNoRecycle: boolean, isIncognito: boolean) => void,
  onConversationsDelete: (conversationIds: DConversationId[], bypassConfirmation: boolean) => void,
  onConversationsExportDialog: (conversationId: DConversationId | null, exportAll: boolean) => void,
  onConversationsImportDialog: () => void,
  setActiveFolderId: (folderId: string | null) => void,
}) {

  const { onConversationActivate, onConversationBranch, onConversationNew, onConversationsDelete, onConversationsExportDialog } = props;

  // local state
  const [navGrouping, setNavGrouping] = React.useState<ChatNavGrouping>('date');
  const [searchSorting, setSearchSorting] = React.useState<ChatSearchSorting>('date');
  const [searchDepth, setSearchDepth] = React.useState<ChatSearchDepth>('attachments'); // default: full search
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');
  const [folderChangeRequest, setFolderChangeRequest] = React.useState<FolderChangeRequest | null>(null);
  const [renderLimit, setRenderLimit] = React.useState(200); // progressive loading limit

  // external state
  const isMobile = useIsMobile();
  const {
    clearFilters,
    filterHasBeamOpen,
    filterHasDocFragments, toggleFilterHasDocFragments,
    filterHasImageAssets, toggleFilterHasImageAssets,
    filterHasStars, toggleFilterHasStars,
    filterIsArchived, toggleFilterIsArchived,
    filterOlderThanDays, setFilterOlderThanDays,
    showRelativeSize, toggleShowRelativeSize,
  } = useChatDrawerFilters();
  const { activeFolder, allFolders, enableFolders, toggleEnableFolders } = useFolders(props.activeFolderId);
  const { filteredChatsCount, filteredChatIDs, filteredChatsAreEmpty, filteredChatsBarBasis, filteredChatsIncludeActive, renderNavItems } = useChatDrawerRenderItems(
    props.activeConversationId, props.chatPanesConversationIds, debouncedSearchQuery, null, allFolders, false, filterHasStars, filterHasImageAssets, filterHasDocFragments, filterIsArchived, filterOlderThanDays, navGrouping, searchSorting, showRelativeSize, searchDepth,
  );
  const contentScaling = useUIPreferencesStore(state => state.contentScaling);

  // Calculate chat counts per folder
  // TODO: restore this, but also check if conversations are active? or move the computation to the renderNavItems hook?
  // const folderChatCounts = React.useMemo(() => {
  //   const counts: Record<string, number> = {};
  //   allFolders.forEach(folder => {
  //     counts[folder.id] = folder.conversationIds.length;
  //   });
  //   return counts;
  // }, [allFolders]);


  // New/Activate/Delete Conversation

  // const isMultiPane = props.chatPanesConversationIds.length >= 2;
  const disableNewButton = props.disableNewButton && filteredChatsIncludeActive;
  const newButtonDontRecycle = /*isMultiPane ||*/ !filteredChatsIncludeActive;

  const handleButtonNew = React.useCallback((event: React.MouseEvent) => {
    // FIXME: undocumented: shift+click to force incognito mode
    onConversationNew(newButtonDontRecycle, event.shiftKey);
    if (getIsMobile())
      optimaCloseDrawer();
  }, [newButtonDontRecycle, onConversationNew]);

  const handleConversationActivate = React.useCallback((conversationId: DConversationId, closeMenu: boolean) => {
    onConversationActivate(conversationId);
    if (closeMenu && getIsMobile())
      optimaCloseDrawer();
  }, [onConversationActivate]);

  const handleConversationsDeleteFiltered = React.useCallback(() => {
    !!filteredChatIDs?.length && onConversationsDelete(filteredChatIDs, false);
  }, [filteredChatIDs, onConversationsDelete]);

  const handleConversationDeleteNoConfirmation = React.useCallback((conversationId: DConversationId) => {
    conversationId && onConversationsDelete([conversationId], true);
  }, [onConversationsDelete]);

  const handleConversationsExport = React.useCallback(() => {
    // null conversationId is fine: the dialog disables the single-chat buttons and still offers the all-chats/flash backups
    onConversationsExportDialog(props.activeConversationId, true);
  }, [onConversationsExportDialog, props.activeConversationId]);


  // Folder change request

  const handleConversationFolderChange = React.useCallback((folderChangeRequest: FolderChangeRequest) => setFolderChangeRequest(folderChangeRequest), []);

  const handleConversationFolderCancel = React.useCallback(() => setFolderChangeRequest(null), []);

  const handleConversationFolderSet = React.useCallback((conversationId: DConversationId, nextFolderId: string | null) => {
    // Remove conversation from existing folders
    const { addConversationToFolder, folders, removeConversationFromFolder } = useFolderStore.getState();
    folders.forEach(folder => folder.conversationIds.includes(conversationId) && removeConversationFromFolder(folder.id, conversationId));

    // Add conversation to the selected folder
    nextFolderId && addConversationToFolder(nextFolderId, conversationId);

    // Close the menu
    setFolderChangeRequest(null);
  }, []);


  // Render limit - load more items

  const handleRenderLimitIncrease = React.useCallback(() => {
    setRenderLimit(prevValue => {
      // Thresholds: 200 --(+200)--> 400 --(+500)--> 900 --(+1000)--> 1900 --> Infinity --> 200 (cycle)
      if (prevValue === 200)
        return (filteredChatsCount > 400 ? 400 : Infinity); // if less than 400, show all
      else if (prevValue === 400)
        return (filteredChatsCount > 900 ? 900 : Infinity); // if less than 900, show all
      else if (prevValue === 900)
        return (filteredChatsCount > 1900 ? 1900 : Infinity); // if less than 1900, show all
      else if (prevValue === 1900)
        return Infinity; // no limit
      else
        return 200; // go back to optimized view
    });
  }, [filteredChatsCount]);

  // Reset render limit when search query changes
  React.useEffect(() => {
    setRenderLimit(200);
  }, [debouncedSearchQuery]);


  // memoize the group dropdown
  const { isSearching } = isDrawerSearching(debouncedSearchQuery);
  const groupingComponent = React.useMemo(() => (
    <Dropdown>
      <MenuButton
        aria-label='View options'
        slots={{ root: IconButton }}
        slotProps={{ root: { size: 'sm' } }}
      >
        <MoreVertIcon />
      </MenuButton>

      {!isSearching ? (
        // Search/Filter default menu: Grouping, Filtering, ...
        <Menu placement='bottom-start' sx={{ minWidth: 200, zIndex: themeZIndexOverMobileDrawer /* need to be on top of the Modal on Mobile */ }}>
          <ListItem>
            <Typography level='body-sm'>Group By</Typography>
          </ListItem>
          {(['date', 'dimension'] as Exclude<ChatNavGrouping, false>[]).map(_gName => (
            <MenuItem
              key={'group-' + _gName}
              aria-label={`Group by ${_gName}`}
              selected={navGrouping === _gName}
              onClick={() => setNavGrouping(grouping => grouping === _gName ? false : _gName)}
            >
              <ListItemDecorator>{navGrouping === _gName && <CheckRoundedIcon />}</ListItemDecorator>
              {capitalizeFirstLetter(_gName)}
            </MenuItem>
          ))}

          <ListDivider />
          <ListItem>
            <Typography level='body-sm'>Filter</Typography>
          </ListItem>
          <MenuItem onClick={toggleFilterHasStars}>
            <ListItemDecorator>{filterHasStars && <CheckRoundedIcon />}</ListItemDecorator>
            Starred <StarOutlineRoundedIcon />
          </MenuItem>
          <MenuItem onClick={toggleFilterIsArchived}>
            <ListItemDecorator>{filterIsArchived && <CheckRoundedIcon />}</ListItemDecorator>
            Archived <ArchiveOutlinedIcon />
          </MenuItem>
          <MenuItem onClick={toggleFilterHasImageAssets}>
            <ListItemDecorator>{filterHasImageAssets && <CheckRoundedIcon />}</ListItemDecorator>
            Has Images <FormatPaintOutlinedIcon />
          </MenuItem>
          <MenuItem onClick={toggleFilterHasDocFragments}>
            <ListItemDecorator>{filterHasDocFragments && <CheckRoundedIcon />}</ListItemDecorator>
            Has Attachments <AttachFileRoundedIcon />
          </MenuItem>
          {/* Age filter (compact chip row for mobile) */}
          <ListDivider />
          <ListItem sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <ListItemDecorator><Typography level='body-sm'>Age</Typography></ListItemDecorator>
            {AGE_FILTER_OPTIONS.map(({ days, label, shortLabel }) => (
              <Chip
                key={label}
                aria-label={label}
                // size='sm'
                variant={filterOlderThanDays === days ? 'solid' : 'soft'}
                onClick={() => setFilterOlderThanDays(days)}
              >
                {shortLabel}
              </Chip>
            ))}
          </ListItem>

          <ListDivider />
          <ListItem>
            <Typography level='body-sm'>Show</Typography>
          </ListItem>
          <MenuItem onClick={toggleShowRelativeSize}>
            <ListItemDecorator>{showRelativeSize && <CheckRoundedIcon />}</ListItemDecorator>
            Relative Size
          </MenuItem>
        </Menu>
      ) : (
        // While searching, show the sorting and depth options
        <Menu placement='bottom-start' sx={{ minWidth: 180, zIndex: themeZIndexOverMobileDrawer /* need to be on top of the Modal on Mobile */ }}>
          <ListItem>
            <Typography level='body-sm'>Sort By</Typography>
          </ListItem>
          <MenuItem selected={searchSorting === 'frequency'} onClick={() => setSearchSorting('frequency')}>
            <ListItemDecorator>{searchSorting === 'frequency' && <CheckRoundedIcon />}</ListItemDecorator>
            Matches
          </MenuItem>
          <MenuItem selected={searchSorting === 'date'} onClick={() => setSearchSorting('date')}>
            <ListItemDecorator>{searchSorting === 'date' && <CheckRoundedIcon />}</ListItemDecorator>
            Date
          </MenuItem>
          <ListDivider />
          <ListItem>
            <Typography level='body-sm'>Search In</Typography>
          </ListItem>
          <MenuItem selected={searchDepth === 'titles'} onClick={() => setSearchDepth('titles')}>
            <ListItemDecorator>{searchDepth === 'titles' && <CheckRoundedIcon />}</ListItemDecorator>
            Titles
          </MenuItem>
          <MenuItem selected={searchDepth === 'content'} onClick={() => setSearchDepth('content')}>
            <ListItemDecorator>{searchDepth === 'content' && <CheckRoundedIcon />}</ListItemDecorator>
            Titles + Content
          </MenuItem>
          <MenuItem selected={searchDepth === 'attachments'} onClick={() => setSearchDepth('attachments')}>
            <ListItemDecorator>{searchDepth === 'attachments' && <CheckRoundedIcon />}</ListItemDecorator>
            Full
          </MenuItem>
        </Menu>
      )}
    </Dropdown>
  ), [
    filterHasDocFragments, filterHasImageAssets, filterHasStars, isSearching, navGrouping, searchSorting, searchDepth, filterIsArchived, showRelativeSize, filterOlderThanDays,
    toggleFilterHasDocFragments, toggleFilterHasImageAssets, toggleFilterHasStars, toggleFilterIsArchived, toggleShowRelativeSize, setFilterOlderThanDays,
  ]);

  const displayNavItems = React.useMemo(() => {
    if (renderLimit === Infinity || renderLimit >= renderNavItems.length) return renderNavItems;

    // return sliced if it contains the active conversation
    const sliced = renderNavItems.slice(0, renderLimit);
    if (!props.activeConversationId || sliced.some(i => i.type === 'nav-item-chat-data' && i.conversationId === props.activeConversationId)) return sliced;

    // include the active conversation if it's beyond the fold
    const activeItem = renderNavItems.find((i, idx) => idx >= renderLimit && i.type === 'nav-item-chat-data' && i.conversationId === props.activeConversationId);
    return activeItem ? [...sliced, activeItem] : sliced;
  }, [renderNavItems, renderLimit, props.activeConversationId]);


  // when filters/search transition from active to inactive, the active chat may end up
  // submerged below the fold of a much longer list - scroll it back into view
  const chatsListRef = React.useRef<HTMLDivElement>(null);
  const isFiltering = isSearching || filterHasBeamOpen || filterHasDocFragments || filterHasImageAssets || filterHasStars || filterIsArchived || filterOlderThanDays !== null;
  React.useLayoutEffect(() => {
    if (isFiltering) return;
    const activeEl = chatsListRef.current?.querySelector('[aria-current="true"]') as HTMLElement | null;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [isFiltering]);


  return <>

    {isMobile && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56, px: 2, flexShrink: 0 }}>
      <Box component='img' src='/icons/icon-192x192.png' alt='' width={28} height={28} />
      <Typography level='title-md' sx={{ flex: 1, fontWeight: 650, letterSpacing: '.015em' }}>Sector 7</Typography>
      <IconButton aria-label='Collapse sidebar' title='Collapse sidebar' size='sm' variant='plain' color='neutral' onClick={optimaCloseDrawer}><LayoutSidebarRight sx={{ fontSize: 20, transform: 'rotate(180deg)' }} /></IconButton>
    </Box>}
    <Box sx={{ display: 'grid', gap: 1, mx: 2, mt: 1, mb: 1.5, flexShrink: 0 }}>
      <Button variant='outlined' color='neutral' disabled={disableNewButton} onClick={handleButtonNew} startDecorator={<AddIcon sx={{ fontSize: 18 }} />}
        sx={{ justifyContent: 'flex-start', minHeight: { xs: 40, sm: 36 }, px: 1.25, '&:hover': { borderColor: '#A855F7', transform: 'none', boxShadow: 'none' } }}>
        New chat
      </Button>
      <DebouncedInputMemo minChars={2} onDebounce={setDebouncedSearchQuery} debounceTimeout={300} placeholder='Search chats' aria-label='Search' endDecorator={groupingComponent} />
    </Box>
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <ProjectSidebar onActivate={props.onConversationActivate} activeConversationId={props.activeConversationId} />
      <Typography level='title-sm' sx={{ mx: 3, mt: 2, mb: 1, fontSize: 'xs', color: 'text.secondary' }}>Chats</Typography>
      <OptimaDrawerList variant='plain' noTopPadding noBottomPadding>

      {/* Chat Titles List (shrink as half the rate as the Folders List) */}
      <Box key='chatlist' ref={chatsListRef} sx={{ minWidth: 0, ...themeScalingMap[contentScaling].chatDrawerItemSx }}>
        {displayNavItems.map((item, idx) => item.type === 'nav-item-chat-data' ? (
            <ChatDrawerItemMemo
              key={'nav-chat-' + item.conversationId}
              item={item}
              showSymbols={false}
              bottomBarBasis={filteredChatsBarBasis}
              onConversationActivate={handleConversationActivate}
              onConversationBranch={onConversationBranch}
              onConversationDeleteNoConfirmation={handleConversationDeleteNoConfirmation}
              onConversationExport={onConversationsExportDialog}
              onConversationFolderChange={handleConversationFolderChange}
            />
          ) : item.type === 'nav-item-group' ? (
            <Typography key={'nav-divider-' + idx} level='body-xs' sx={{
              textAlign: 'left',
              mx: 3, my: 1, color: 'text.tertiary',
              // my: 'calc(var(--ListItem-minHeight) / 4)',
              // keeps the group header sticky to the top
              position: 'sticky',
              top: 0,
              backgroundColor: OPTIMA_DRAWER_BACKGROUND,
              zIndex: 1,
            }}>
              {item.title}
            </Typography>
          ) : item.type === 'nav-item-info-message' ? (
            <Box key={'nav-info-' + idx} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1, mx: 3 }}>
              <Typography level='body-xs' sx={{ color: 'text.tertiary', my: 1 }}>
                {filterHasStars && <StarOutlineRoundedIcon sx={{ color: 'primary.softColor', fontSize: 'xl', mb: -0.5, mr: 1 }} />}
                {item.message}
              </Typography>
              {(filterHasBeamOpen || filterHasStars || filterHasImageAssets || filterHasDocFragments || filterIsArchived || filterOlderThanDays !== null) && (
                <Tooltip title='Clear Filters'>
                  <IconButton size='sm' color='primary' onClick={clearFilters}>
                    <ClearIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          ) : null,
        )}

        {/* Load More Button */}
        {filteredChatsCount > 200 && (
          <ListItem>
            <ListItemButton
              variant='soft'
              onClick={handleRenderLimitIncrease}
              sx={{ justifyContent: 'center', py: 3 }}
            >
              {renderLimit === Infinity
                ? 'Show less'
                : (renderLimit === 200 && filteredChatsCount > 400)
                  ? 'Show 200 more'
                  : (renderLimit === 400 && filteredChatsCount > 900)
                    ? 'Show 500 more'
                    : (renderLimit === 900 && filteredChatsCount > 1900)
                      ? 'Show 1000 more'
                      : 'Show all'
              } {renderLimit !== Infinity && `(${filteredChatsCount - renderLimit} hidden)`}
            </ListItemButton>
          </ListItem>
        )}
      </Box>


      </OptimaDrawerList>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, px: 2, py: 1, flexShrink: 0 }}>
      {isMobile && <Button variant='plain' color='neutral' size='sm' startDecorator={<SettingsIcon sx={{ fontSize: 18 }} />} onClick={() => optimaOpenPreferences()}
        sx={{ flex: 1, justifyContent: 'flex-start', minHeight: { xs: 40, sm: 36 } }}>Settings</Button>}
      <Dropdown>
        <MenuButton variant='plain' color='neutral' size='sm' aria-label='Chat data actions'><MoreVertIcon sx={{ fontSize: 20 }} /></MenuButton>
        <Menu sx={{ zIndex: themeZIndexOverMobileDrawer }}>
          <MenuItem onClick={props.onConversationsImportDialog}><ListItemDecorator><FileDownloadOutlinedIcon /></ListItemDecorator>Import chats</MenuItem>
          <MenuItem onClick={handleConversationsExport}><ListItemDecorator><FileUploadOutlinedIcon /></ListItemDecorator>Export chats</MenuItem>
          <MenuItem color='danger' disabled={filteredChatsAreEmpty} onClick={handleConversationsDeleteFiltered}><ListItemDecorator><DeleteOutlineIcon /></ListItemDecorator>Delete {filteredChatsCount >= 2 ? `all ${filteredChatsCount} chats` : 'chat'}</MenuItem>
        </Menu>
      </Dropdown>
    </Box>

    {/* [Menu] Chat Item Folder Change */}
    {!!folderChangeRequest?.anchorEl && (
      <CloseablePopup
        menu anchorEl={folderChangeRequest.anchorEl} onClose={handleConversationFolderCancel}
        bigIcons
        minWidth={200}
        placement='bottom-start'
        zIndex={themeZIndexOverMobileDrawer /* need to be on top of the Modal on Mobile */}
      >

        {/* Folder Assignment Buttons */}
        {allFolders.map(folder => {
          const isRequestFolder = folder === folderChangeRequest.currentFolder;
          return (
            <ListItem
              key={folder.id}
              variant={isRequestFolder ? 'soft' : 'plain'}
              onClick={() => handleConversationFolderSet(folderChangeRequest.conversationId, folder.id)}
            >
              <ListItemButton>
                <ListItemDecorator>
                  <FolderIcon sx={{ color: folder.color }} />
                </ListItemDecorator>
                {folder.title}
              </ListItemButton>
            </ListItem>
          );
        })}

        {/* Remove Folder Assignment */}
        {!!folderChangeRequest.currentFolder && (
          <ListItem onClick={() => handleConversationFolderSet(folderChangeRequest.conversationId, null)}>
            <ListItemButton>
              <ListItemDecorator>
                <ClearIcon />
              </ListItemDecorator>
              {ClearFolderText}
            </ListItemButton>
          </ListItem>
        )}

      </CloseablePopup>
    )}

  </>;
}