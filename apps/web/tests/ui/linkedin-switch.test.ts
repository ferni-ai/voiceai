/**
 * No LinkedIn entry point renders while LinkedIn is switched off
 * (src/config/linkedin.ts). LinkedIn needs server credentials that don't exist
 * yet, so offering it would only ever fail.
 *
 * The REAL panels render: the integrations settings panel, the Connected Life
 * panel, the settings menu (with LinkedIn pinned from an earlier visit), and the
 * real integrations callbacks. Mocked: the network (apiGet/apiPost) and the
 * device id. Each case re-imports with the switch as it is in the source (off)
 * or forced on, to show that turning it on restores today's entry points.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1' }));

const mockApiGet = vi.fn(async (_path: string) => ({ ok: false, status: 404 }));
vi.mock('../../src/utils/api.js', () => ({
  apiGet: mockApiGet,
  apiPost: vi.fn(async () => ({ ok: false, status: 404 })),
  apiDelete: vi.fn(async () => ({ ok: false, status: 404 })),
}));

/** Force the web switch on for the "today's behaviour" cases. */
function switchOn(): void {
  vi.doMock('../../src/config/linkedin.js', () => ({ LINKEDIN_ENABLED: true }));
}

/** Every LinkedIn entry point a user could see or click. */
function linkedInEntryPoints(): string[] {
  const selectors = [
    '[data-action="connect-linkedin"]',
    '[data-action="disconnect-linkedin"]',
    '[data-action="linkedin-settings"]',
    '[data-integration="linkedin"]',
  ];
  return selectors.filter((s) => document.querySelector(s) !== null);
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  localStorage.clear();
});
afterEach(() => {
  vi.doUnmock('../../src/config/linkedin.js');
  vi.restoreAllMocks();
});

describe('LinkedIn switched off (as shipped)', () => {
  it('the switch is off in the source', async () => {
    const { LINKEDIN_ENABLED } = await import('../../src/config/linkedin.js');
    expect(LINKEDIN_ENABLED).toBe(false);
  });

  it('integrations settings shows no LinkedIn section', async () => {
    const { getIntegrationsSettingsUI } = await import('../../src/ui/integrations-settings.ui.js');
    await getIntegrationsSettingsUI().show();
    expect(document.querySelector('.integrations-settings')).not.toBeNull();
    expect(linkedInEntryPoints()).toEqual([]);
    expect(document.querySelector('.integrations-settings')?.textContent).not.toMatch(/LinkedIn/);
  });

  it('Connected Life shows no LinkedIn tile', async () => {
    const { showConnectedLife } = await import('../../src/ui/connected-life.ui.js');
    await showConnectedLife();
    (document.querySelector('[data-tab="calendar"]') as HTMLElement | null)?.click();
    expect(document.querySelector('[data-integration="google-calendar"]')).not.toBeNull();
    expect(linkedInEntryPoints()).toEqual([]);
  });

  it('the settings menu drops a LinkedIn item pinned on an earlier visit', async () => {
    localStorage.setItem('ferni_menu_pinned', JSON.stringify(['linkedin-settings', 'wellbeing']));
    const { relationshipStageService } =
      await import('../../src/services/relationship-stage.service.js');
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    const { getSettingsMenuUI, initSettingsMenuUI } =
      await import('../../src/ui/settings-menu.ui.js');
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
    expect(
      document.querySelector('.settings-menu__item--pinned[data-action="wellbeing"]')
    ).not.toBeNull();
    expect(linkedInEntryPoints()).toEqual([]);
  });

  it('the integrations callbacks offer no LinkedIn connect or disconnect', async () => {
    const { createIntegrationsCallbacks } = await import('../../src/app/integrations-callbacks.js');
    const callbacks = createIntegrationsCallbacks();
    expect(callbacks.onConnectLinkedIn).toBeUndefined();
    expect(callbacks.onDisconnectLinkedIn).toBeUndefined();
    expect(callbacks.onConnectCalendar).toBeTypeOf('function');
  });
});

describe('LinkedIn switched on: entry points come back unchanged', () => {
  beforeEach(switchOn);

  it('integrations settings shows the Connect LinkedIn button', async () => {
    const { getIntegrationsSettingsUI } = await import('../../src/ui/integrations-settings.ui.js');
    await getIntegrationsSettingsUI().show();
    expect(linkedInEntryPoints()).toEqual(['[data-action="connect-linkedin"]']);
  });

  it('Connected Life shows the LinkedIn tile', async () => {
    const { showConnectedLife } = await import('../../src/ui/connected-life.ui.js');
    await showConnectedLife();
    (document.querySelector('[data-tab="calendar"]') as HTMLElement | null)?.click();
    expect(linkedInEntryPoints()).toEqual(['[data-integration="linkedin"]']);
  });

  it('the settings menu shows the pinned LinkedIn item', async () => {
    localStorage.setItem('ferni_menu_pinned', JSON.stringify(['linkedin-settings']));
    const { relationshipStageService } =
      await import('../../src/services/relationship-stage.service.js');
    vi.spyOn(relationshipStageService, 'getStage').mockReturnValue('established');
    vi.spyOn(relationshipStageService, 'isFeatureUnlocked').mockReturnValue(true);
    const { getSettingsMenuUI, initSettingsMenuUI } =
      await import('../../src/ui/settings-menu.ui.js');
    initSettingsMenuUI({});
    getSettingsMenuUI().show();
    expect(linkedInEntryPoints()).toEqual(['[data-action="linkedin-settings"]']);
  });

  it('the integrations callbacks connect and disconnect LinkedIn', async () => {
    const { createIntegrationsCallbacks } = await import('../../src/app/integrations-callbacks.js');
    const callbacks = createIntegrationsCallbacks();
    expect(callbacks.onConnectLinkedIn).toBeTypeOf('function');
    expect(callbacks.onDisconnectLinkedIn).toBeTypeOf('function');
  });
});
