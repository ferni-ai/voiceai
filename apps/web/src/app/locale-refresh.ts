/**
 * Locale refresh
 *
 * setLocale() with `reload: false` (a voice-requested language change, made
 * so the call stays up) only dispatches `ferni:locale-changed`. index.html text
 * follows through bindStaticDom, but the 70+ components that rendered with
 * t() keep the old language until they render again, and none of them
 * subscribe. There is no central re-render, so the change finishes the same
 * way a settings change does: a reload, with the locale already persisted.
 *
 * Reloading mid-call would drop the call the no-reload path exists to keep,
 * so while one is up the reload waits until it ends.
 */

import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LocaleRefresh');

/** Let the end-of-call cleanup finish before the page goes away. */
export const POST_CALL_RELOAD_DELAY_MS = 2000;

export function bindLocaleRefresh(reload: () => void = () => window.location.reload()): () => void {
  let unsubscribe: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const onLocaleChanged = (): void => {
    if (unsubscribe || timer) return; // already waiting to reload
    if (appState.get('connection') === 'disconnected') {
      log.info('Locale changed, reloading to re-render the interface');
      reload();
      return;
    }
    log.info('Locale changed during a call, reloading when it ends');
    unsubscribe = appState.subscribe('connection', (state) => {
      if (state !== 'disconnected') return;
      unsubscribe?.();
      unsubscribe = null;
      timer = setTimeout(reload, POST_CALL_RELOAD_DELAY_MS);
    });
  };

  window.addEventListener('ferni:locale-changed', onLocaleChanged);
  return () => {
    window.removeEventListener('ferni:locale-changed', onLocaleChanged);
    cancelPending();
  };
}
