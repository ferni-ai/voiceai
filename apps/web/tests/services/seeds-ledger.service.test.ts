/**
 * One seeds balance. Once GET /api/seeds says the server keeps seeds (serverLedger), the
 * main screen, the shop and the roadmap all show the server's number, purchases and the
 * daily bonus go to the server, and the browser's old balance is offered to the server
 * exactly once. While it says no, everything stays on the browser ledger as before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (state: { isAuthenticated: boolean; uid: string | null }) => void;

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  authCallbacks: [] as AuthCallback[],
}));

vi.mock('../../src/utils/api.js', () => ({ apiGet: mocks.apiGet, apiPost: mocks.apiPost }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  onAuthStateChange: (cb: AuthCallback) => mocks.authCallbacks.push(cb),
}));

/** The browser ledger as cosmetics.service saved it before the switch */
const LOCAL = {
  ownedItems: ['skin-default', 'theme-default', 'voice-default', 'skin-ocean'],
  equipped: {
    'avatar-skin': 'skin-default',
    'ui-theme': 'theme-default',
    'voice-pack': 'voice-default',
    'sound-pack': null,
    emote: null,
  },
  seedBalance: 400,
};

const ITEM = { id: 'theme-forest', price: 200 }; // a friend-plan item

function server(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    data: {
      balance: 300,
      ownedCosmetics: ['skin-sunset'],
      currentStreak: 6,
      dailyBonusAvailable: true,
      serverLedger: true,
      ...over,
    },
  };
}

async function load() {
  const ledger = await import('../../src/services/seeds-ledger.service.js');
  const cosmetics = await import('../../src/services/cosmetics.service.js');
  const economy = await import('../../src/services/seeds-economy.service.js');
  const { roadmapService } = await import('../../src/services/roadmap.service.js');
  cosmetics.initCosmeticsService();
  economy.initSeedsEconomy();
  ledger.watchServerSeeds();
  return { ledger, cosmetics, economy, roadmapService };
}

async function signIn(uid: string): Promise<void> {
  for (const cb of mocks.authCallbacks) cb({ isAuthenticated: true, uid });
  await vi.waitFor(() => expect(mocks.apiGet).toHaveBeenCalled());
  // let the refresh (and any import) finish
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

const importCalls = () =>
  mocks.apiPost.mock.calls.filter(([path]) => path === '/api/seeds/import-local');

// Each test loads fresh modules; their document/window listeners must not outlive it
const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
for (const target of [document, window] as EventTarget[]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    fn: EventListenerOrEventListenerObject,
    o?: unknown
  ) => {
    listeners.push([target, type, fn]);
    add(type, fn, o as AddEventListenerOptions);
  }) as EventTarget['addEventListener'];
}
afterEach(() => {
  for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.authCallbacks.length = 0;
  localStorage.clear();
  localStorage.setItem('ferni_cosmetics', JSON.stringify(LOCAL));
  localStorage.setItem('ferni_seed_balance', '10'); // the roadmap's old cache
});

describe('server ledger off', () => {
  it('keeps the browser ledger exactly as before and sends no import', async () => {
    mocks.apiGet.mockResolvedValue(server({ serverLedger: false }));
    const { ledger, cosmetics, economy } = await load();
    await signIn('alice');

    expect(ledger.serverSeeds()).toBeNull();
    expect(cosmetics.getSeedBalance()).toBe(400);
    expect(cosmetics.ownsCosmetic('skin-ocean')).toBe(true);
    expect(importCalls()).toHaveLength(0);

    // local earns still land locally
    document.dispatchEvent(
      new CustomEvent('ferni:contribution-success', { detail: { amountCents: 500 } })
    );
    expect(economy.getBalance()).toBe(410);

    // and a purchase is the local one: no server call, local balance charged
    cosmetics.setSubscriptionTier('friend');
    expect(await cosmetics.buyCosmetic(ITEM.id)).toBe(true);
    expect(mocks.apiPost.mock.calls.some(([p]) => p === '/api/seeds/purchase')).toBe(false);
    expect(cosmetics.getSeedBalance()).toBe(410 - ITEM.price);
  });

  it('a signed-out browser never asks to import', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { ledger } = await load();
    for (const cb of mocks.authCallbacks) cb({ isAuthenticated: false, uid: null });
    await Promise.resolve();
    expect(mocks.apiGet).not.toHaveBeenCalled();
    expect(ledger.serverSeeds()).toBeNull();
  });
});

describe('server ledger on', () => {
  beforeEach(() => {
    mocks.apiPost.mockImplementation(async (path: string) =>
      path === '/api/seeds/import-local'
        ? { ok: true, status: 200, data: { imported: 400, alreadyImported: false } }
        : { ok: false, status: 404 }
    );
  });

  it('main screen, shop and roadmap all show the server balance', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics, economy, roadmapService } = await load();
    expect(roadmapService.getSeedBalance()).toBe(10); // the stale roadmap cache, before
    expect(cosmetics.getSeedBalance()).toBe(400); // the browser ledger, before

    await signIn('alice');

    expect(cosmetics.getSeedBalance()).toBe(300);
    expect(economy.getBalance()).toBe(300);
    expect(roadmapService.getSeedBalance()).toBe(300);
    expect(economy.getCurrentStreak()).toBe(6);
    expect(economy.isDailyBonusAvailable()).toBe(true);
    // ownership is the server's (plus the defaults), not the browser's
    expect(cosmetics.ownsCosmetic('skin-sunset')).toBe(true);
    expect(cosmetics.ownsCosmetic('skin-default')).toBe(true);
    expect(cosmetics.ownsCosmetic('skin-ocean')).toBe(false);
  });

  it('a roadmap vote moves the balance every screen shows', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics, roadmapService } = await load();
    await signIn('alice');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ success: true, newBalance: 295 }) }))
    );

    await roadmapService.vote('video-settings', 5);

    expect(roadmapService.getSeedBalance()).toBe(295);
    expect(cosmetics.getSeedBalance()).toBe(295);
    vi.unstubAllGlobals();
  });

  it('buys through /api/seeds/purchase and shows the server balance after', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics, roadmapService } = await load();
    await signIn('alice');
    cosmetics.setSubscriptionTier('friend');
    mocks.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { owned: true, charged: true, itemId: ITEM.id, balance: 300 - ITEM.price },
    });

    expect(await cosmetics.buyCosmetic(ITEM.id)).toBe(true);

    expect(mocks.apiPost).toHaveBeenLastCalledWith('/api/seeds/purchase', { itemId: ITEM.id });
    expect(cosmetics.ownsCosmetic(ITEM.id)).toBe(true);
    expect(cosmetics.getSeedBalance()).toBe(300 - ITEM.price);
    expect(roadmapService.getSeedBalance()).toBe(300 - ITEM.price);
    // the browser ledger is untouched (a retried import can only send what it really had)
    expect(JSON.parse(localStorage.getItem('ferni_cosmetics')!).seedBalance).toBe(400);
  });

  it('a refused purchase changes nothing', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics } = await load();
    await signIn('alice');
    cosmetics.setSubscriptionTier('friend');
    mocks.apiPost.mockResolvedValueOnce({ ok: false, status: 400, error: 'Insufficient seeds' });

    expect(await cosmetics.buyCosmetic(ITEM.id)).toBe(false);
    expect(cosmetics.ownsCosmetic(ITEM.id)).toBe(false);
    expect(cosmetics.getSeedBalance()).toBe(300);
  });

  it('claims the daily bonus on the server, on the local date', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { ledger, economy, cosmetics } = await load();
    await signIn('alice');
    mocks.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { claimed: true, amount: 5, newBalance: 305 },
    });

    const result = await ledger.claimDailyOnServer();

    expect(result).toEqual({ claimed: true, amount: 5 });
    expect(mocks.apiPost.mock.calls.at(-1)?.[0]).toMatch(/^\/api\/seeds\/claim-daily\?tz=/);
    expect(cosmetics.getSeedBalance()).toBe(305);
    expect(economy.isDailyBonusAvailable()).toBe(false);
  });

  it('local earns stop: the server pays them', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics } = await load();
    await signIn('alice');

    document.dispatchEvent(
      new CustomEvent('ferni:contribution-success', { detail: { amountCents: 500 } })
    );
    cosmetics.addSeeds(100);

    expect(cosmetics.getSeedBalance()).toBe(300);
    expect(JSON.parse(localStorage.getItem('ferni_cosmetics')!).seedBalance).toBe(400);
  });

  it('a gift re-reads the balance from the server', async () => {
    mocks.apiGet.mockResolvedValue(server());
    const { cosmetics } = await load();
    await signIn('alice');
    mocks.apiGet.mockResolvedValue(server({ balance: 250 }));

    document.dispatchEvent(new CustomEvent('ferni:seeds-spent', { detail: { amount: 50 } }));
    await vi.waitFor(() => expect(cosmetics.getSeedBalance()).toBe(250));
  });
});

describe('the one-time import', () => {
  it('sends the browser balance and items once, then reads the result', async () => {
    mocks.apiGet
      .mockResolvedValueOnce(server({ balance: 25 }))
      .mockResolvedValue(server({ balance: 425 }));
    mocks.apiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { imported: 400, alreadyImported: false },
    });
    const { ledger, cosmetics } = await load();
    await signIn('alice');

    expect(importCalls()).toEqual([
      ['/api/seeds/import-local', { balance: 400, owned: LOCAL.ownedItems }],
    ]);
    expect(localStorage.getItem(ledger.LOCAL_IMPORTED_KEY)).toBe('alice');
    expect(cosmetics.getSeedBalance()).toBe(425);

    // later refreshes, and another account on this browser, never send it again
    await ledger.refreshServerSeeds();
    for (const cb of mocks.authCallbacks) cb({ isAuthenticated: true, uid: 'bob' });
    await ledger.refreshServerSeeds();
    expect(importCalls()).toHaveLength(1);
  });

  it('is retried when the server could not take it (503), and recorded once it does', async () => {
    mocks.apiGet.mockResolvedValue(server());
    mocks.apiPost.mockResolvedValueOnce({ ok: false, status: 503, error: 'not available' });
    const { ledger, cosmetics } = await load();
    await signIn('alice');
    expect(importCalls()).toHaveLength(1);
    expect(localStorage.getItem(ledger.LOCAL_IMPORTED_KEY)).toBeNull();
    // Not imported yet: the browser's balance and items stay in use, nothing goes out of sight
    expect(ledger.serverSeeds()).toBeNull();
    expect(cosmetics.getSeedBalance()).toBe(400);
    expect(cosmetics.ownsCosmetic('skin-ocean')).toBe(true);

    mocks.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { imported: 0, alreadyImported: true },
    });
    await ledger.refreshServerSeeds();
    expect(importCalls()).toHaveLength(2);
    expect(localStorage.getItem(ledger.LOCAL_IMPORTED_KEY)).toBe('alice');
    expect(ledger.serverSeeds()?.balance).toBe(300);

    await ledger.refreshServerSeeds();
    expect(importCalls()).toHaveLength(2);
  });

  it('a browser that never kept a ledger has nothing to import', async () => {
    localStorage.removeItem('ferni_cosmetics');
    mocks.apiGet.mockResolvedValue(server());
    const { ledger } = await load();
    await signIn('alice');
    expect(importCalls()).toHaveLength(0);
    expect(ledger.serverSeeds()?.balance).toBe(300); // straight onto the server ledger
  });

  it('a network failure keeps the browser ledger and offers the import again', async () => {
    mocks.apiGet.mockResolvedValue(server());
    mocks.apiPost.mockResolvedValueOnce({ ok: false, status: 0, error: 'offline' });
    const { ledger, cosmetics } = await load();
    await signIn('alice');
    expect(ledger.serverSeeds()).toBeNull();
    expect(cosmetics.getSeedBalance()).toBe(400);

    mocks.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { imported: 400, alreadyImported: false },
    });
    await ledger.refreshServerSeeds();
    expect(importCalls()).toHaveLength(2);
    expect(ledger.serverSeeds()).not.toBeNull();
  });
});
