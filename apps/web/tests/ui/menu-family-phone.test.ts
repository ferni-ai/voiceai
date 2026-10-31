/**
 * Family Phone Access makes no promise the product doesn't keep.
 *
 * - "Supervised: You get notified of calls" is gone: nothing ever sent that notification.
 * - No "{n} calls" / "Last call" line: nothing records calls (recordCall has no caller,
 *   #2774), so the numbers never change. A person with a stored count still shows none.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import enUS from '../../src/i18n/locales/en-US.json';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: mocks.toast }));

import { FamilyIdentities } from '../../src/ui/family-identities.ui.js';

// A legacy supervised doc with a stored call count: neither may show
const GRAN = {
  id: 'si_gran',
  displayName: 'Gran',
  relationship: 'grandmother',
  phoneNumber: '+155****01',
  voiceEnrolled: false,
  accessLevel: 'supervised',
  allowedPersonas: ['*'],
  status: 'active',
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
  lastCallAt: '2026-10-20T15:00:00Z',
  totalCalls: 7,
  totalMinutes: 42,
};

const FALSE_PROMISE = /supervis|notif|\b\d+ calls?\b|no calls yet|last:/i;

function panelText(): string {
  return document.body.textContent ?? '';
}

describe('Family Phone Access: no false promises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mocks.apiGet.mockImplementation(async (path: string) =>
      path === '/api/sponsored-identities'
        ? { ok: true, status: 200, data: { identities: [GRAN] } }
        : { ok: true, status: 200, data: {} }
    );
  });

  it('the list shows the person but no call count or last call', async () => {
    await FamilyIdentities.show();

    expect(panelText()).toContain('Gran');
    expect(panelText()).not.toMatch(FALSE_PROMISE);
    expect(document.querySelector('.family-item__stats')).toBeNull();
  });

  it('the add and edit forms offer no Supervised option', async () => {
    await FamilyIdentities.show();
    document.querySelector<HTMLElement>('[data-identity-id="si_gran"]')?.click();
    expect(document.querySelector('[data-action="save-edit"]')).not.toBeNull();
    expect(panelText()).not.toMatch(FALSE_PROMISE);

    document.querySelector<HTMLElement>('[data-action="cancel"]')?.click();
    document.querySelector<HTMLElement>('[data-action="add"]')?.click();
    expect(document.querySelector('[data-action="save-new"]')).not.toBeNull();
    expect(panelText()).not.toMatch(FALSE_PROMISE);
    expect(document.querySelector('option[value="supervised"]')).toBeNull();
  });

  it('no Family Phone Access copy promises a notification', () => {
    const copy = Object.entries(enUS.familyIdentities as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => `${k}: ${v as string}`);

    expect(copy.length).toBeGreaterThan(10);
    expect(copy.filter((line) => /supervis|notif/i.test(line))).toEqual([]);
  });
});
