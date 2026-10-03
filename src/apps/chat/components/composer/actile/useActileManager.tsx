import * as React from 'react';
import { ActileQuery, actileLabelQuery, actileSelectionKey } from './ActileQuery';

import type { ActileItem, ActileProvider } from './ActileProvider';
import { ActilePopup } from './ActilePopup';


export const useActileManager = (providers: ActileProvider[], anchorRef: React.RefObject<HTMLElement | null>, conversationId?: string | null) => {

  const query = React.useRef(new ActileQuery()).current;

  // state
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [itemsByProvider, setItemsByProvider] = React.useState<{ provider: ActileProvider, searchPrefix: string, items: ActileItem[] }[]>([]);
  const [activeSearchString, setActiveSearchString] = React.useState<string>('');
  const [activeItemIndex, setActiveItemIndex] = React.useState<number>(0);

  // derived state
  const activeItemsByProvider = React.useMemo(() => {
    return itemsByProvider.map(({ provider, searchPrefix, items }) => ({
      provider,
      searchPrefix,
      activePrefixLength: actileLabelQuery(activeSearchString, searchPrefix).length,
      items: items.filter(item => item.label?.toLowerCase().startsWith(actileLabelQuery(activeSearchString, searchPrefix))),
    })).filter(({ items }) => items.length > 0);
  }, [itemsByProvider, activeSearchString]);

  const flatActiveItems = React.useMemo(() => {
    return activeItemsByProvider.flatMap(({ items }) => items);
  }, [activeItemsByProvider]);
  const totalItems = flatActiveItems.length;
  const activeItem = totalItems > 0 && activeItemIndex >= 0 && activeItemIndex < totalItems ? flatActiveItems[activeItemIndex] : null;

  const handleClose = React.useCallback(() => {
    query.close();
    setPopupOpen(false);
    setItemsByProvider([]);
    setActiveSearchString('');
    setActiveItemIndex(0);
  }, [query]);

  const handlePopupItemClicked = React.useCallback((item: ActileItem) => {
    const provider = providers.find(p => p.key === item.providerKey);
    provider?.onItemSelect(item);
    handleClose();
  }, [providers, handleClose]);

  const handleEnterKey = React.useCallback(() => {
    if (activeItem)
      handlePopupItemClicked(activeItem);
  }, [activeItem, handlePopupItemClicked]);

  const actileInterceptTextChange = React.useCallback((trailingText: string) => {
    if (popupOpen) {
      query.update(trailingText);
      if (/\s/.test(query.query) || !itemsByProvider.some(({ items, searchPrefix }) => items.some(item => item.label?.toLowerCase().startsWith(actileLabelQuery(query.query, searchPrefix))))) handleClose();
      else { setActiveSearchString(query.query); setActiveItemIndex(0); }
      return false;
    }
    // Collect all providers whose trigger matches
    const matchingProviders = providers.filter(provider => provider.fastCheckTriggerText(trailingText));

    if (matchingProviders.length > 0) {
      const generation = query.begin(trailingText);
      // Fetch items from all matching providers
      Promise.all(matchingProviders.map(provider =>
        provider.fetchItems().then(({ searchPrefix, items }) => ({
          provider,
          searchPrefix,
          items: items.map(item => ({ ...item, providerKey: provider.key })),
        })),
      )).then((results) => {
        if (!query.isCurrent(generation)) return;
        query.settle();
        results = results.filter(result => result.items.some(item => item.label?.toLowerCase().startsWith(actileLabelQuery(query.query, result.searchPrefix))));
        if (results.length) {
          setPopupOpen(true);
          setItemsByProvider(results.map(result => ({ provider: result.provider, searchPrefix: result.searchPrefix, items: result.items })));
          setActiveSearchString(query.query);
          setActiveItemIndex(0);
        } else handleClose();
      }).catch(error => {
        if (!query.isCurrent(generation)) return;
        handleClose();
        console.error('Failed to fetch popup items:', error);
      });
      return true;
    }
    if (query.pending) {
      query.update(trailingText);
      if (!query.query || /\s/.test(query.query)) handleClose();
    }
    return false;
  }, [handleClose, providers, query, popupOpen, itemsByProvider]);

  const actileInterceptKeydown = React.useCallback((_event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const { key, currentTarget, ctrlKey, metaKey } = _event;

    if (query.pending && !popupOpen) {
      if (key === 'Escape' || key === 'ArrowLeft' || key === 'Enter' || key === ' ') handleClose();
      else if (key === 'Backspace') { query.update(currentTarget.value.slice(0, -1)); if (!query.query) handleClose(); }
      else if (key.length === 1 && !ctrlKey && !metaKey) query.update(currentTarget.value + key);
      return false;
    }

    if (popupOpen) {
      if (!totalItems) { handleClose(); return false; }
      if (key === 'Escape' || key === 'ArrowLeft') {
        _event.preventDefault();
        handleClose();
      } else if (key === 'ArrowUp') {
        _event.preventDefault();
        setActiveItemIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : totalItems - 1));
      } else if (key === 'ArrowDown') {
        _event.preventDefault();
        setActiveItemIndex((prevIndex) => (prevIndex < totalItems - 1 ? prevIndex + 1 : 0));
      } else if (actileSelectionKey(key, activeSearchString, totalItems)) {
        _event.preventDefault();
        handleEnterKey();
      } else if (key === 'Backspace') {
        handleClose();
      } else if (key.length === 1 && !ctrlKey && !metaKey) {
        const next = activeSearchString + key;
        if (/\s/.test(next) || !itemsByProvider.some(({ items, searchPrefix }) => items.some(item => item.label?.toLowerCase().startsWith(actileLabelQuery(next, searchPrefix))))) { handleClose(); return false; }
        setActiveSearchString(next);
        setActiveItemIndex(0);
      }
      return true;
    }

    // Popup closed: Check for triggers
    const trailingText = (currentTarget.value || '') + key;
    return actileInterceptTextChange(trailingText);

  }, [actileInterceptTextChange, handleClose, handleEnterKey, popupOpen, totalItems, query, activeSearchString, itemsByProvider]);

  React.useEffect(() => { handleClose(); return () => query.close(); }, [handleClose, query, providers, conversationId]);

  const actileComponent = React.useMemo(() => {
    return !popupOpen || !totalItems ? null : (
      <ActilePopup
        anchorEl={anchorRef.current}
        onClose={handleClose}
        itemsByProvider={activeItemsByProvider}
        activeItemIndex={activeItemIndex}
        onItemClick={handlePopupItemClicked}
      />
    );
  }, [activeItemIndex, activeItemsByProvider, anchorRef, handleClose, handlePopupItemClicked, popupOpen, totalItems]);

  return {
    actileComponent,
    actileInterceptKeydown,
    actileInterceptTextChange,
  };
};
