/**
 * A shared browser: Sam Rivera (person A) signs out, someone else (person B)
 * signs in on the same browser. Nothing A's own flows saved may be left for B,
 * and B's first marketplace sync must not upload A's agents into B's account.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let signedInUid: string | null = 'uid-sam-rivera-a';
const AGENT_A = {
  id: 'fictional-agent-a',
  installed_at: '2026-11-08T10:00:00.000Z',
  version: '1.0.0',
  manifest: { id: 'fictional-agent-a' },
};
let onServer: unknown[] = [];
const apiPut = vi.fn(async () => ({ ok: true, status: 200, data: {} }));
vi.mock('../src/utils/api.js', () => ({
  getUserId: () => signedInUid,
  apiGet: vi.fn(async () => ({ ok: true, status: 200, data: { items: onServer, deleted: [] } })),
  apiPut,
  apiDelete: vi.fn(async () => ({ ok: true, status: 200 })),
}));
vi.mock('../src/services/push-preference.js', () => ({
  signOutReleasingPush: vi.fn(async () => undefined),
}));

// Sign-out seals storage until a reload; the "reload" below undoes it, as a real one does.
const realSetItem = Object.getOwnPropertyDescriptor(localStorage, 'setItem') as PropertyDescriptor;
const reloadThePage = () => {
  Object.defineProperty(localStorage, 'setItem', realSetItem);
  vi.resetModules();
};
afterEach(reloadThePage);
const savedKeys = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index));

beforeEach(() => {
  apiPut.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  signedInUid = 'uid-sam-rivera-a';
  onServer = [];
});

describe("sign-out on a shared browser leaves nothing of the person's", () => {
  it('clears the marketplace installs and the milestone marker that their own flows saved', async () => {
    onServer = [AGENT_A]; // A installed an agent on another device
    const { syncInstalledAgents } = await import('../src/services/marketplace.service.js');
    await syncInstalledAgents();
    const { initFerniMilestones } = await import('../src/ui/ferni-milestones.ui.js');
    initFerniMilestones();
    expect(savedKeys(localStorage).length).toBeGreaterThan(0); // the flows did save

    const { signOutOfThisBrowser } = await import('../src/ui/sign-out.js');
    expect(await signOutOfThisBrowser(vi.fn())).toBe(true);

    expect(savedKeys(localStorage)).toEqual([]);
  });

  it("the next person's first sync uploads none of the previous person's agents", async () => {
    onServer = [AGENT_A];
    const marketplace = await import('../src/services/marketplace.service.js');
    await marketplace.syncInstalledAgents();
    const { signOutOfThisBrowser } = await import('../src/ui/sign-out.js');
    await signOutOfThisBrowser(vi.fn());
    reloadThePage();

    signedInUid = 'uid-sam-rivera-b';
    onServer = [];
    apiPut.mockClear();
    const { syncInstalledAgents, getInstalledAgents } = await import(
      '../src/services/marketplace.service.js'
    );
    await syncInstalledAgents();

    expect(getInstalledAgents().map((agent) => agent.id)).not.toContain(AGENT_A.id);
    expect(apiPut.mock.calls.map(([url]) => String(url)).filter((url) => url.includes(AGENT_A.id))).toEqual([]);
  });

  it('moves a value saved under a former key name once, so a person keeps it', async () => {
    localStorage.setItem('voiceai-marketplace-installed', JSON.stringify({ [AGENT_A.id]: AGENT_A }));
    const { getInstalledAgents } = await import('../src/services/marketplace.service.js');
    expect(getInstalledAgents().map((agent) => agent.id)).toEqual([AGENT_A.id]);
    expect(localStorage.getItem('voiceai-marketplace-installed')).toBeNull();
    expect(localStorage.getItem('ferni_marketplace_installed')).not.toBeNull();
  });

  it('clears a former key name even on a browser that never moved it', async () => {
    localStorage.setItem('voiceai-marketplace-installed', '{}');
    localStorage.setItem('milestoneOutreachMigratedAt', '2026-11-01T09:00:00.000Z');
    sessionStorage.setItem('ferni_upgrade_tier', 'plus');
    const { signOutOfThisBrowser } = await import('../src/ui/sign-out.js');
    await signOutOfThisBrowser(vi.fn());
    expect([savedKeys(localStorage), savedKeys(sessionStorage)]).toEqual([[], []]);
  });
});
