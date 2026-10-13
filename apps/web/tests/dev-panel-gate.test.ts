import { afterEach, describe, expect, it, vi } from 'vitest';
import { devPanelMayEnable } from '../src/ui/dev-panel-gate';

describe('devPanelMayEnable', () => {
  it('skips the panel for an ordinary production visitor', () => {
    expect(devPanelMayEnable({ DEV: false }, '')).toBe(false);
    expect(devPanelMayEnable({ DEV: false }, '?persona=ferni')).toBe(false);
  });

  it('ignores a bare ?dev on a production build', () => {
    expect(devPanelMayEnable({ DEV: false }, '?dev')).toBe(false);
    expect(devPanelMayEnable({ DEV: false }, '?dev=1')).toBe(false);
    expect(devPanelMayEnable({ DEV: false }, '?device=phone')).toBe(false);
  });

  it('accepts ?dev on a production build only with the build key', () => {
    const env = { DEV: false, VITE_DEV_PANEL_KEY: 'build-key' };
    expect(devPanelMayEnable(env, '?dev=build-key')).toBe(true);
    expect(devPanelMayEnable(env, '?dev=guess')).toBe(false);
    expect(devPanelMayEnable(env, '?dev')).toBe(false);
  });

  it('loads it in dev and admin builds', () => {
    expect(devPanelMayEnable({ DEV: true }, '')).toBe(true);
    expect(devPanelMayEnable({ DEV: false, VITE_DEV_PANEL_AUTO: 'true' }, '')).toBe(true);
  });
});

describe('debug panels on a production build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  async function keydownListenersAfterInit(): Promise<number> {
    vi.stubEnv('DEV', false);
    window.history.replaceState(null, '', '/?dev');
    localStorage.setItem('ferni_dev_mode', 'true');
    const spy = vi.spyOn(document, 'addEventListener');
    const { initInsightsDebugPanel } = await import('../src/ui/insights-debug-panel.ui');
    const { initTriggerDebugPanel } = await import('../src/ui/trigger-debug-panel.ui');
    initInsightsDebugPanel();
    initTriggerDebugPanel();
    return spy.mock.calls.filter(([type]) => type === 'keydown').length;
  }

  it('do not register their shortcuts for ?dev or the old localStorage flag', async () => {
    expect(await keydownListenersAfterInit()).toBe(0);
  });

  it('the dev panel itself stays off for a bare ?dev', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    window.history.replaceState(null, '', '/?dev');
    const { initDevPanel, isDevMode } = await import('../src/ui/dev-panel.ui');
    initDevPanel();
    expect(isDevMode()).toBe(false);
    expect(document.querySelector('.dev-indicator')).toBeNull();
  });
});
