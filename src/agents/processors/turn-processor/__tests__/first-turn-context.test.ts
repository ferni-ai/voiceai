/**
 * #3114: the first-turn blocks (2d team huddle, 2e outreach bridge, 2f cross-channel
 * and the first-turn debug line) never ran on live calls, because the hook builds
 * after turnCount has stepped. FIRST_TURN_BY_CALLER_TURN=on decides the first turn
 * by the caller-turn counter. The real buildContextInjections runs; the three
 * builders' modules and 2g's are mocked to record each read. Live shape: turnCount
 * already bumped, callerTurn named by the hook. Fictional caller and session ids.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ huddle: 0, bridge: 0, crossChannel: 0, pending: 0 }));

vi.mock('../../../../services/cross-persona/team-huddle.js', () => ({
  generateTeamHuddle: vi.fn(async () => {
    reads.huddle++;
    return { observations: [{ note: 'quieter than usual' }] };
  }),
  formatTeamHuddleForLLM: () => '[TEAM HUDDLE - What Your Team Has Noticed] quieter than usual',
}));
vi.mock('../../../../services/outreach/conversation-context-bridge.js', () => ({
  buildOutreachBridgeInjection: vi.fn(async () => {
    reads.bridge++;
    return {
      content: '[OUTREACH BRIDGE] Ferni texted yesterday about the garden plot.',
      priority: 95,
    };
  }),
}));
vi.mock('../../../../services/session/session-summary.js', () => ({
  getActiveUserContext: vi.fn(async () => {
    reads.crossChannel++;
    return { userId: 'uid-fictional-wren' };
  }),
  formatContextForVoiceCall: () =>
    '[CROSS-CHANNEL] Earlier today in the app: browsing the reading list, asked about a book.',
}));
vi.mock('../../../../intelligence/context-builders/external/pending-call-results.js', () => ({
  buildAllPendingResultsContext: vi.fn(async () => {
    reads.pending++;
    return null;
  }),
}));

const { buildContextInjections } = await import('../context-injections.js');
const { diag } = await import('../../../../services/diagnostic-logger.js');

const FIRST_TURN_CATEGORIES = ['team_huddle', 'outreach_bridge', 'cross_channel'];

const turn = (userData: Record<string, unknown>, userText = 'hey, how are you doing today') =>
  [
    {
      services: { sessionId: 'session-fictional-wren', userId: 'uid-fictional-wren' },
      userData,
      persona: { id: 'ferni', name: 'Ferni' },
      userText,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
    { analysis: { intent: 'chat', emotion: 'neutral', topics: [] }, currentTopic: undefined },
    { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    { length: { guidance: 'Keep it short.' } },
    { needsReinforcement: false },
    null,
    undefined,
    {},
  ] as never as Parameters<typeof buildContextInjections>;

const build = async (userData: Record<string, unknown>, userText?: string) =>
  (await buildContextInjections(...turn(userData, userText))).injections.map((i) => i.category);

const builtReads = () => [reads.huddle, reads.bridge, reads.crossChannel];
let debug: ReturnType<typeof vi.spyOn>;
const firstTurnLogs = () =>
  debug.mock.calls.filter((c: unknown[]) => c[0] === 'First-turn parallel context complete').length;

beforeEach(() => {
  Object.assign(reads, { huddle: 0, bridge: 0, crossChannel: 0, pending: 0 });
  debug = vi.spyOn(diag, 'debug');
});
afterEach(() => {
  vi.unstubAllEnvs();
  debug.mockRestore();
});

describe('FIRST_TURN_BY_CALLER_TURN=on', () => {
  beforeEach(() => vi.stubEnv('FIRST_TURN_BY_CALLER_TURN', 'on'));

  it('the first caller turn, turnCount already bumped, gets all three blocks and the debug line', async () => {
    const categories = await build({ turnCount: 2, callerTurn: 1 });
    expect(builtReads()).toEqual([1, 1, 1]);
    expect(categories).toEqual(expect.arrayContaining(FIRST_TURN_CATEGORIES));
    expect(firstTurnLogs()).toBe(1);
  }, 20_000);

  it.each([2, 3, 5])(
    'caller turn %i gets none of them',
    async (callerTurn) => {
      const categories = await build({ turnCount: callerTurn * 2, callerTurn });
      expect(builtReads()).toEqual([0, 0, 0]);
      expect(categories.filter((c) => FIRST_TURN_CATEGORIES.includes(c))).toEqual([]);
      expect(firstTurnLogs()).toBe(0);
    },
    20_000
  );

  it('a call of five turns builds each block once, on turn 1', async () => {
    for (let callerTurn = 1; callerTurn <= 5; callerTurn++) {
      // eslint-disable-next-line no-await-in-loop -- a call's turns come one after another
      await build({ turnCount: callerTurn * 2, callerTurn });
    }
    expect(builtReads()).toEqual([1, 1, 1]);
  }, 40_000);

  it('a first turn whose build was skipped is not made up later', async () => {
    for (let callerTurn = 2; callerTurn <= 5; callerTurn++) {
      // eslint-disable-next-line no-await-in-loop -- a call's turns come one after another
      await build({ turnCount: callerTurn * 2, callerTurn });
    }
    expect(builtReads()).toEqual([0, 0, 0]);
  }, 40_000);

  it('a first caller turn with safety guidance gets none of them', async () => {
    const categories = await build(
      { turnCount: 2, callerTurn: 1 },
      'i want to kill myself tonight'
    );
    expect(categories).toContain('safety'); // the turn really is crisis-guided
    expect(builtReads()).toEqual([0, 0, 0]);
    expect(categories.filter((c) => FIRST_TURN_CATEGORIES.includes(c))).toEqual([]);
  }, 20_000);

  it('where no hook names the caller turn, turnCount 0 is the first turn, as call-report.ts reads it', async () => {
    await build({ turnCount: 0 });
    expect(builtReads()).toEqual([1, 1, 1]);
    await build({ turnCount: 2 });
    expect(builtReads()).toEqual([1, 1, 1]);
  }, 20_000);

  it('leaves While You Were Away (2g, #3080) on turnCount 0 as before', async () => {
    await build({ turnCount: 2, callerTurn: 1 });
    expect(reads.pending).toBe(0);
  }, 20_000);
});

describe('FIRST_TURN_BY_CALLER_TURN off (default): as main', () => {
  it('the live first caller turn, turnCount bumped, gets none of them', async () => {
    const categories = await build({ turnCount: 2, callerTurn: 1 });
    expect(builtReads()).toEqual([0, 0, 0]);
    expect(categories.filter((c) => FIRST_TURN_CATEGORIES.includes(c))).toEqual([]);
    expect(firstTurnLogs()).toBe(0);
  }, 20_000);

  it('turnCount 0 gets all four, 2g included, whatever callerTurn says', async () => {
    const categories = await build({ turnCount: 0, callerTurn: 3 });
    expect(builtReads()).toEqual([1, 1, 1]);
    expect(reads.pending).toBe(1);
    expect(categories).toEqual(expect.arrayContaining(FIRST_TURN_CATEGORIES));
    expect(firstTurnLogs()).toBe(1);
  }, 20_000);

  it('turnCount 0 with safety guidance builds them, as main did', async () => {
    const categories = await build({ turnCount: 0 }, 'i want to kill myself tonight');
    expect(categories).toContain('safety');
    expect(builtReads()).toEqual([1, 1, 1]);
  }, 20_000);
});

describe('beside safety guidance (main turn-0 parity), the filter puts safety first', () => {
  it('safety and crisis_response lead and survive a full outreach bridge', async () => {
    const { filterInjections } = await import('../../../../intelligence/utils/injection-filter.js');
    const kept = filterInjections(
      [
        { category: 'outreach_bridge', content: 'o'.repeat(1400), priority: 95 },
        { category: 'team_huddle', content: 'h'.repeat(300), priority: 78 },
        { category: 'cross_channel', content: 'c'.repeat(300), priority: 75 },
        { category: 'crisis_response', content: '[CRISIS SUPPORT] validate first', priority: 98 },
        { category: 'safety', content: '[SAFETY] crisis signal', priority: 99 },
      ],
      { mode: 'crisis' }
    ).map((i) => i.category);
    expect(kept.slice(0, 2)).toEqual(['safety', 'crisis_response']);
    expect(kept).not.toContain('team_huddle'); // over the 1500-char budget once the bridge is in
  });
});
