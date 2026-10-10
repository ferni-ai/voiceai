/**
 * A language change that doesn't reload (voice-requested, to keep the call up)
 * leaves components rendered with t() in the old language. It must finish with
 * a reload, held until the call ends when one is up.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/i18n/index.js';
import { bindLocaleRefresh, POST_CALL_RELOAD_DELAY_MS } from '../src/app/locale-refresh.js';
import { appState } from '../src/state/app.state.js';

const reload = vi.fn();
let unbind: () => void;

beforeEach(async () => {
  vi.useFakeTimers();
  await setLocale('en-US', { reload: false });
  reload.mockClear();
  appState.set('connection', 'disconnected');
  unbind = bindLocaleRefresh(reload);
});

afterEach(() => {
  unbind();
  vi.useRealTimers();
});

describe('bindLocaleRefresh', () => {
  it('reloads right away when no call is up', async () => {
    await setLocale('de', { reload: false });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the locale is unchanged', async () => {
    await setLocale('en-US', { reload: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it('waits for the call to end, then reloads once', async () => {
    appState.set('connection', 'connected');

    await setLocale('fr', { reload: false });
    await setLocale('es', { reload: false });
    vi.advanceTimersByTime(60_000);
    expect(reload).not.toHaveBeenCalled();

    appState.set('connection', 'disconnected');
    vi.advanceTimersByTime(POST_CALL_RELOAD_DELAY_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unbound', async () => {
    unbind();
    await setLocale('de', { reload: false });
    expect(reload).not.toHaveBeenCalled();
  });
});
