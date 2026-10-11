/**
 * The web's switch to the server seed ledger (plan: one seed ledger, part 4).
 *
 * GET /api/seeds says `serverLedger`. Off: the shop, the earn listeners and the balance
 * behave exactly as before, in localStorage. On: the shop buys through
 * POST /api/seeds/purchase and never touches the local balance, local earns stop, the
 * balance shown is the server's, and the browser's old seeds are sent once.
 *
 * Real cosmetics / seeds-economy / seed-ledger-client / personalize / seeds-display
 * modules; only the API, the auth state and the toasts are stubbed.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost }));
let signIn: (uid: string | null) => void = () => undefined;
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  onAuthStateChange: vi.fn((cb: (s: { uid: string | null }) => void) => {
    signIn = (uid) => cb({ uid });
    cb({ uid: null });
    return () => undefined;
  }),
}));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));
vi.mock('../../src/ui/moments/index.js', () => ({ moments: { whisper: vi.fn() } }));

const LOCAL = 'ferni_cosmetics';
const IMPORT_DONE = 'ferni_seeds_imported';
const localBalance = () => (JSON.parse(localStorage.getItem(LOCAL) ?? '{}') as { seedBalance?: number }).seedBalance;

function seedLocal(balance: number, owned: string[] = []): void {
  localStorage.setItem(
    LOCAL,
    JSON.stringify({
      ownedItems: ['skin-default', 'theme-default', 'voice-default', ...owned],
      equipped: { 'avatar-skin': 'skin-default', 'ui-theme': null, 'voice-pack': null, 'sound-pack': null, emote: null },
      seedBalance: balance,
    })
  );
}

const SUMMARY = { balance: 900, currentStreak: 3, dailyBonusAvailable: true, ownedCosmetics: ['skin-default'] };

/** Fresh modules, signed in, with the server's answer to GET /api/seeds. */
async function start(serverLedger: boolean) {
  vi.resetModules();
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { ...SUMMARY, serverLedger } });
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  const cosmetics = await import('../../src/services/cosmetics.service.js');
  const economy = await import('../../src/services/seeds-economy.service.js');
  const ledger = await import('../../src/services/seed-ledger-client.js');
  cosmetics.initCosmeticsService();
  cosmetics.setSubscriptionTier('partner');
  economy.initSeedsEconomy();
  signIn('u-1');
  await vi.waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/seeds'));
  await new Promise((r) => setTimeout(r, 0));
  return { cosmetics, economy, ledger };
}

async function buyInShop(itemId: string): Promise<void> {
  const personalize = await import('../../src/ui/personalize.ui.js');
  personalize.open();
  const buy = document.querySelector<HTMLButtonElement>(`[data-action="buy"][data-item-id="${itemId}"]`);
  expect(buy).not.toBeNull();
  buy!.click();
  await new Promise((r) => setTimeout(r, 0));
  personalize.close();
}

// Each test loads fresh modules; the listeners an earlier load added must not answer too
const added: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
for (const target of [window, document] as EventTarget[]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: unknown) => {
    added.push([target, type, fn]);
    add(type, fn, o as AddEventListenerOptions);
  }) as typeof target.addEventListener;
}
// seeds-display watches the body; stop it before the DOM is torn down under it
const observers: MutationObserver[] = [];
const RealObserver = globalThis.MutationObserver;
globalThis.MutationObserver = class extends RealObserver {
  constructor(cb: MutationCallback) {
    super(cb);
    observers.push(this);
  }
};
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500)); // the shop removes its modal on a timer
  observers.forEach((o) => o.disconnect());
});
afterEach(() => {
  added.splice(0).forEach(([target, type, fn]) => target.removeEventListener(type, fn));
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = '';
  apiPost.mockResolvedValue({ ok: true, status: 200, data: {} });
});

describe('server ledger off: everything stays local', () => {
  it('the shop buys from the local balance and never calls the server', async () => {
    seedLocal(500);
    const { cosmetics, ledger } = await start(false);

    await buyInShop('theme-forest');

    expect(ledger.isServerLedgerOn()).toBe(false);
    expect(localBalance()).toBe(300);
    expect(cosmetics.ownsCosmetic('theme-forest')).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("a conversation's end still earns the daily seeds locally", async () => {
    seedLocal(40);
    await start(false);

    window.dispatchEvent(new Event('ferni:conversation-end'));

    expect(localBalance()).toBe(45);
    expect(apiPost).not.toHaveBeenCalledWith('/api/seeds/import-local', expect.anything());
  });
});

describe('server ledger on', () => {
  it('the shop buys on the server and leaves the local balance alone', async () => {
    seedLocal(500);
    localStorage.setItem(IMPORT_DONE, 'earlier');
    const { cosmetics } = await start(true);
    apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { owned: true, charged: true, itemId: 'theme-forest', balance: 700 },
    });

    expect(cosmetics.getSeedBalance()).toBe(900); // the server's, not the local 500
    await buyInShop('theme-forest');

    expect(apiPost).toHaveBeenCalledWith('/api/seeds/purchase', { itemId: 'theme-forest' });
    expect(localBalance()).toBe(500);
    expect(cosmetics.getSeedBalance()).toBe(700);
    expect(cosmetics.ownsCosmetic('theme-forest')).toBe(true);
    expect(toast.success).toHaveBeenCalled();
  });

  it("a plan the server refuses (403) isn't owned, and says so", async () => {
    localStorage.setItem(IMPORT_DONE, 'earlier');
    const { cosmetics } = await start(true);
    apiPost.mockResolvedValueOnce({ ok: false, status: 403, error: 'Requires the partner plan' });

    await buyInShop('theme-cozy'); // a partner item: this browser thinks partner, the server doesn't

    expect(apiPost).toHaveBeenCalledWith('/api/seeds/purchase', { itemId: 'theme-cozy' });
    expect(cosmetics.ownsCosmetic('theme-cozy')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('This one comes with a paid plan.');
  });

  it("earns don't award locally: a conversation's end changes no balance", async () => {
    seedLocal(40);
    localStorage.setItem(IMPORT_DONE, 'earlier');
    const { cosmetics } = await start(true);
    const earned = vi.fn();
    document.addEventListener('ferni:seeds-earned', earned);

    window.dispatchEvent(new Event('ferni:conversation-end'));
    document.dispatchEvent(new CustomEvent('ferni:referral-completed', { detail: { code: 'x' } }));
    cosmetics.addSeeds(100);

    expect(localBalance()).toBe(40);
    expect(cosmetics.getSeedBalance()).toBe(900);
    expect(earned).not.toHaveBeenCalled();
  });

  it("sends the browser's seeds and items once, and never again", async () => {
    seedLocal(640, ['theme-forest']);
    await start(true);

    const imports = () => apiPost.mock.calls.filter(([path]) => path === '/api/seeds/import-local');
    await vi.waitFor(() => expect(imports()).toHaveLength(1));
    expect(imports()[0]![1]).toEqual({
      balance: 640,
      owned: ['skin-default', 'theme-default', 'voice-default', 'theme-forest'],
    });
    await vi.waitFor(() => expect(localStorage.getItem(IMPORT_DONE)).not.toBeNull());

    // A reload (fresh modules, same browser) doesn't send it again
    await start(true);
    expect(imports()).toHaveLength(1);
  });

  it('an import the server can\'t take yet (503) is sent again next time', async () => {
    seedLocal(80);
    apiPost.mockResolvedValue({ ok: false, status: 503, error: 'not available' });
    await start(true);
    await vi.waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/seeds/import-local', expect.anything()));
    expect(localStorage.getItem(IMPORT_DONE)).toBeNull();
  });

  it("the daily bonus button claims on the server and shows the server's balance", async () => {
    localStorage.setItem(IMPORT_DONE, 'earlier');
    await start(true);
    const display = await import('../../src/ui/seeds-display.ui.js');
    document.body.innerHTML = display.renderSeedsSettingsCard();
    display.initSeedsDisplay();
    apiPost.mockResolvedValueOnce({ ok: true, status: 200, data: { claimed: true, amount: 5, newBalance: 905 } });
    apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...SUMMARY, balance: 905, dailyBonusAvailable: false, serverLedger: true },
    });

    document.querySelector<HTMLElement>('[data-daily-bonus]')!.click();

    await vi.waitFor(() => expect(document.querySelector('[data-daily-bonus]')).toBeNull());
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0]![0]).toMatch(/^\/api\/seeds\/claim-daily\?tz=/);
    expect(document.querySelector('[data-seeds-amount]')?.textContent).toBe('905');
  });
});
