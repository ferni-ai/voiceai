/**
 * No seeds after a call while seeds are cut (Seth, 2026-10-17: "cut seeds").
 *
 * Before: app.ts still started the browser seeds ledger. With the server
 * ledger off, the first call each day paid "+5 seeds" (seeds-economy
 * recordConversation) and the toast showed "+5 First conversation of the day"
 * for a currency nobody can see or spend. Now the seeds modules start only
 * with VITE_SEEDS=true (app/seeds-boot.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
  apiPost: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
}));

const earned: Event[] = [];
const record = (e: Event) => earned.push(e);

/** Boot the seeds modules the way app.ts does, then end a call. */
async function bootAndEndCall(): Promise<string[]> {
  const started: string[] = [];
  const { initSeeds } = await import('../../src/app/seeds-boot.js');
  initSeeds((name, init) => {
    started.push(name);
    init();
  });
  window.dispatchEvent(new CustomEvent('ferni:conversation-end'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  return started;
}

const seedsNotice = () => document.querySelector('.moment-notice--seeds, .moment-notice');

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear(); // no daily claim yet: this is the first call of the day
  document.body.innerHTML = '';
  earned.length = 0;
  document.addEventListener('ferni:seeds-earned', record);
  await (await import('../../src/i18n/index.js')).initI18n();
});

afterEach(() => {
  document.removeEventListener('ferni:seeds-earned', record);
  vi.unstubAllEnvs();
});

describe('a call ends while seeds are cut (the default)', () => {
  it('starts no seeds module, earns nothing and shows no seeds notice', async () => {
    const started = await bootAndEndCall();

    expect(started).toEqual([]);
    expect(earned).toHaveLength(0);
    expect(seedsNotice()).toBeNull();
    expect(document.body.textContent).not.toMatch(/seed|First conversation/i);
  });
});

describe('with VITE_SEEDS=true', () => {
  it('starts the seeds modules, and the first call of the day earns seeds', async () => {
    vi.stubEnv('VITE_SEEDS', 'true');
    const started = await bootAndEndCall();

    expect(started).toEqual(['SeedsEconomy', 'SeedsLedger', 'SeedsDisplay', 'SeedsToast']);
    expect(earned).toHaveLength(1);
    expect((earned[0] as CustomEvent<{ amount: number }>).detail.amount).toBe(5);
    await vi.waitFor(() =>
      expect(document.body.textContent).toMatch(/\+5 First conversation of the day/)
    );
  });
});
