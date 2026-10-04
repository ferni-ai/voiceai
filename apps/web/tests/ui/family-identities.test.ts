/**
 * The family panel must only call routes that exist (no /api/family/*, which
 * isn't mounted, and no global pending list) and must say so when a call fails
 * instead of showing an empty family.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('../../src/i18n/index.js', () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }));

import { FamilyIdentities } from '../../src/ui/family-identities.ui.js';

const MOM = {
  id: 'si_1',
  displayName: 'Mom',
  relationship: 'mother',
  phoneNumber: '+155****67',
  voiceEnrolled: false,
  accessLevel: 'full',
  allowedPersonas: [],
  status: 'active',
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
  totalCalls: 0,
  totalMinutes: 0,
};

describe('FamilyIdentities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('loads the family from the sponsored-identities route only', async () => {
    mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { identities: [MOM] } });

    await FamilyIdentities.show();

    const paths = mocks.apiGet.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(['/api/sponsored-identities']);
    expect(document.body.textContent).toContain('Mom');
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('says it could not load instead of showing an empty family', async () => {
    mocks.apiGet.mockResolvedValue({ ok: false, status: 401, error: 'HTTP 401' });

    await FamilyIdentities.show();

    expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't load your family. Try again?");
  });

  it('keeps the person and reports it when removal fails', async () => {
    mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { identities: [MOM] } });
    mocks.apiDelete.mockResolvedValue({ ok: false, status: 500 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await FamilyIdentities.show();
    document.querySelector<HTMLElement>('[data-identity-id="si_1"]')?.click();
    document.querySelector<HTMLElement>('[data-action="delete"]')?.click();
    await vi.waitFor(() => expect(mocks.apiDelete).toHaveBeenCalled());
    await vi.waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Couldn't remove them. Try again?"));

    expect(mocks.toast.success).not.toHaveBeenCalledWith('Removed');
  });
});
