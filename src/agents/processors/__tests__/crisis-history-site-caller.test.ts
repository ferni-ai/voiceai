/**
 * PRIVACY (#2678): both turn builders called
 * `buildCrisisHistoryInjection(services.userId || 'unknown')`, so a turn with no
 * id read bogle_users/unknown/crisis_signals, the bucket every id-less caller
 * wrote to, and injected another caller's crisis as this caller's. Each site now
 * hands over the caller's own id, unset when there is none, and the builder
 * refuses a missing or placeholder id. One pin per site: the real
 * buildContextInjections runs, and the crisis-history read is recorded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const crisisReads = vi.hoisted(() => [] as Array<string | undefined>);

vi.mock('../injection-builders/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  buildCrisisHistoryInjection: vi.fn(async (userId: string | undefined) => {
    crisisReads.push(userId);
    return null;
  }),
}));

const turnProcessor = await import('../turn-processor/context-injections.js');
const legacyBuilder = await import('../context-injection-builder.js');

const args = (services: Record<string, unknown>) =>
  [
    {
      services,
      userData: { turnCount: 3 },
      persona: { id: 'ferni', name: 'Ferni' },
      userText: 'hey, how are you doing today',
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
    { analysis: { intent: 'chat', emotion: 'neutral', topics: [] }, currentTopic: undefined },
    { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    { length: { guidance: 'Keep it short.' } },
    { needsReinforcement: false },
    null,
    undefined,
    {},
  ] as never as Parameters<typeof turnProcessor.buildContextInjections>;

beforeEach(() => {
  crisisReads.length = 0;
});

describe.each([
  ['turn-processor/context-injections.ts', turnProcessor.buildContextInjections],
  ['context-injection-builder.ts', legacyBuilder.buildContextInjections],
])('%s: the crisis-history read names the caller, never a shared bucket', (_site, build) => {
  it('a turn with no id hands over no id (not unknown)', async () => {
    await build(...args({ sessionId: 'session-no-id' }));
    expect(crisisReads).toEqual([undefined]);
  }, 20_000);

  it("a member's turn reads the member's own history", async () => {
    await build(...args({ sessionId: 'session-member', userId: 'uid-member' }));
    expect(crisisReads).toEqual(['uid-member']);
  }, 20_000);
});
