import { describe, expect, it, vi } from 'vitest';
import { warmFirestoreClients } from '../child-firestore-warm.js';

const after = (ms: number, value: boolean) =>
  new Promise<boolean>((resolve) => setTimeout(() => resolve(value), ms));

describe('warmFirestoreClients (job child, before ready)', () => {
  it('reads on both clients, in parallel', async () => {
    const log = vi.fn();
    const started = Date.now();
    const out = await warmFirestoreClients(log, {
      shared: () => after(150, true),
      strict: () => after(150, true),
    });
    expect(out).toEqual({ shared: 'ok', strict: 'ok' });
    expect(Date.now() - started).toBeLessThan(280); // not 300+: they overlap
    expect(log).toHaveBeenCalledWith(
      'Firestore clients warmed',
      expect.objectContaining({ shared: 'ok', strict: 'ok' })
    );
  });

  it('a slow client never holds ready past the budget', async () => {
    const started = Date.now();
    const out = await warmFirestoreClients(
      vi.fn(),
      { shared: () => after(5_000, true), strict: () => after(5, true) },
      50
    );
    expect(out).toEqual({ shared: 'timeout', strict: 'ok' });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('a failed or unavailable client is reported, never thrown', async () => {
    const out = await warmFirestoreClients(vi.fn(), {
      shared: () => Promise.reject(new Error('UNAVAILABLE')),
      strict: async () => false,
    });
    expect(out).toEqual({ shared: 'failed', strict: 'unavailable' });
  });
});
