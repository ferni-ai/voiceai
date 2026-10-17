/**
 * F6 landmark hotkey for the toast region (the Base UI toast convention):
 * F6 moves focus to the region when it has toasts, Escape inside it returns
 * focus to where the reader was. Focus inside the region also pauses the
 * toasts' timers (toast-region.ts), so a keyboard reader gets time to act.
 *
 * @module ui/overlay/toast-region-keys
 */

export function installRegionHotkey(root: HTMLElement, hasContent: () => boolean): () => void {
  let returnTo: HTMLElement | null = null;
  const onKeyDown = (event: KeyboardEvent): void => {
    const inRegion = root.contains(document.activeElement);
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key === 'F6' && !modified && !inRegion && hasContent()) {
      returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.focus();
      event.preventDefault();
    } else if (event.key === 'Escape' && inRegion && returnTo) {
      const target = returnTo;
      returnTo = null;
      if (target.isConnected) target.focus();
      else root.blur();
      event.preventDefault();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
