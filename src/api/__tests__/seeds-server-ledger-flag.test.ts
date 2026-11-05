/**
 * SEEDS_SERVER_LEDGER is on by default since 2026-10-31 (Seth): unset means the web uses
 * the server ledger, and `off` is the kill switch that puts every browser back on its own
 * ledger, as before. GET /api/seeds reports this as `serverLedger`; the import refuses (404)
 * while it is off (seeds-import.emulator.test.ts covers both through real HTTP).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/billing/stripe-subscription.js', () => ({ getSubscriptionInfo: vi.fn() }));
vi.mock('../../services/identity/firebase-auth.js', () => ({ getFirebaseUser: vi.fn() }));

const { serverLedgerEnabled, importLocalSeeds } = await import('../seeds-import.js');

describe('SEEDS_SERVER_LEDGER', () => {
  it('is on when unset (the default)', () => {
    expect(serverLedgerEnabled({})).toBe(true);
    expect(serverLedgerEnabled({ SEEDS_SERVER_LEDGER: '' })).toBe(true);
  });

  it('is on when set on', () => {
    expect(serverLedgerEnabled({ SEEDS_SERVER_LEDGER: 'on' })).toBe(true);
  });

  it.each(['off', 'OFF', 'false', '0'])('is off when set %s (the kill switch)', (value) => {
    expect(serverLedgerEnabled({ SEEDS_SERVER_LEDGER: value })).toBe(false);
  });

  it('off: the import refuses before reading anything', async () => {
    vi.stubEnv('SEEDS_SERVER_LEDGER', 'off');
    const db = { runTransaction: vi.fn() };
    const result = await importLocalSeeds(db as never, 'u-1', { balance: 500, owned: [] });
    expect(result).toEqual({ status: 404, error: 'Seed import is not enabled' });
    expect(db.runTransaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('unset: the import runs (and with no cutoff configured answers 503, recording nothing)', async () => {
    vi.stubEnv('SEEDS_SERVER_LEDGER', '');
    vi.stubEnv('SEEDS_IMPORT_BEFORE', '');
    const db = { runTransaction: vi.fn() };
    const result = await importLocalSeeds(db as never, 'u-1', { balance: 500, owned: [] });
    expect(result).toMatchObject({ status: 503 });
    expect(db.runTransaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
