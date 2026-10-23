// The self-test must run the canaries through the real loading path (loadSweep + gateSweep from a
// temp dir), not only in memory: if loading drops a call, every gate is dead (review #2450, case 6).
import { describe, expect, it, vi } from 'vitest';

vi.mock('../predicates/call.mjs', async (orig) => ({ ...(await orig()), loadSweep: () => [] }));
const { deadGates } = await import('../predicates/canaries.mjs');
const { PREDICATES } = await import('../predicates/index.mjs');

describe('deadGates through loadSweep', () => {
  it('reports every gate dead when loading returns no calls', () => {
    expect(deadGates()).toHaveLength(PREDICATES.filter((p) => p.gating).length);
  });
});
