import { canMarkSeen } from './attention';

export interface ViewportRect { top: number; right: number; bottom: number; left: number }

export function intersectViewport(a: ViewportRect, b: ViewportRect): ViewportRect {
  return { top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom), left: Math.max(a.left, b.left) };
}

export function replyEndFits(end: ViewportRect, viewport: ViewportRect): boolean {
  return end.bottom > end.top && end.right > end.left && viewport.bottom > viewport.top && viewport.right > viewport.left
    && end.top >= viewport.top && end.bottom <= viewport.bottom && end.left >= viewport.left && end.right <= viewport.right;
}

export function findChatScrollRoot(list: HTMLElement | null): HTMLElement | null {
  return list?.closest<HTMLElement>('[data-chat-scroll-root]') ?? null;
}

function composerFor(root: HTMLElement): HTMLElement | null {
  return root.closest('#app-chat-panels')?.parentElement?.querySelector<HTMLElement>('[data-chat-composer]') ?? null;
}

/** Restrict the reply end to the scroll viewport and any ancestor/composer clipping. */
export function chatViewportRect(root: HTMLElement): ViewportRect {
  const view = window.visualViewport;
  let viewport = intersectViewport(root.getBoundingClientRect(), {
    top: view?.offsetTop ?? 0, left: view?.offsetLeft ?? 0,
    bottom: (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight),
    right: (view?.offsetLeft ?? 0) + (view?.width ?? window.innerWidth),
  });
  for (let parent = root.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) viewport = { ...viewport, top: Math.max(viewport.top, rect.top), bottom: Math.min(viewport.bottom, rect.bottom) };
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) viewport = { ...viewport, left: Math.max(viewport.left, rect.left), right: Math.min(viewport.right, rect.right) };
  }
  const composer = composerFor(root)?.getBoundingClientRect();
  if (composer && composer.bottom > composer.top && composer.left < viewport.right && composer.right > viewport.left && composer.bottom > viewport.top && composer.top < viewport.bottom)
    viewport = { ...viewport, bottom: Math.min(viewport.bottom, composer.top) };
  return viewport;
}

export function observeReplyEnd(marker: HTMLElement, root: HTMLElement, onSeen: () => void): () => void {
  const check = () => {
    if (!marker.isConnected) return;
    const end = marker.getBoundingClientRect();
    if (!canMarkSeen(replyEndFits(end, chatViewportRect(root)), document.visibilityState === 'visible', document.hasFocus())) return;
    // A modal or another surface covering the end does not count as having read it.
    const visible = document.elementFromPoint((end.left + end.right) / 2, (end.top + end.bottom) / 2);
    if (!visible || !marker.parentElement?.contains(visible)) return;
    onSeen();
  };
  const observer = new IntersectionObserver(check, { root, threshold: 1 });
  observer.observe(marker);
  const resize = new ResizeObserver(check);
  resize.observe(root); resize.observe(marker);
  const composer = composerFor(root);
  if (composer) resize.observe(composer);
  root.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check); window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  window.visualViewport?.addEventListener('resize', check);
  window.visualViewport?.addEventListener('scroll', check);
  check();
  return () => {
    observer.disconnect(); resize.disconnect();
    root.removeEventListener('scroll', check);
    window.removeEventListener('resize', check); window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
    window.visualViewport?.removeEventListener('resize', check);
    window.visualViewport?.removeEventListener('scroll', check);
  };
}
