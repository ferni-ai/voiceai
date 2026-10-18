/**
 * The turn-path capture stores a commitment as before with the flag off, and
 * stores nothing with COMMITMENT_SINGLE_WRITER on (the after-call judge is
 * then the only writer). Detection is real; the store and memory are fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../commitment-keeper.js', async (orig) => ({
  ...(await orig<typeof import('../commitment-keeper.js')>()),
  saveCommitment: vi.fn(async (c: Record<string, unknown>) => {
    saved.push(c);
    return { commitment: { ...c, id: 'c1' } };
  }),
}));
vi.mock('../../../memory/cross-persona/index.js', () => ({ storeMemory: vi.fn(async () => null) }));

const { detectCommitmentE2E } = await import('../commitment-keeper-e2e.js');

const turn = {
  userId: 'u1',
  sessionId: 's1',
  transcript: "I'm going to call my sister tonight about the wedding",
  personaId: 'ferni' as const,
};

afterEach(() => {
  saved.length = 0;
  delete process.env.COMMITMENT_SINGLE_WRITER;
});

describe('turn-path commitment capture', () => {
  it('flag off: stores the commitment the turn names', async () => {
    const result = await detectCommitmentE2E(turn);
    expect(result.detected).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('flag on for this caller: stores nothing', async () => {
    // As applyCallerFlags leaves process.env for the call.
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    const result = await detectCommitmentE2E(turn);
    expect(result.detected).toBe(false);
    expect(saved).toEqual([]);
  });
});
