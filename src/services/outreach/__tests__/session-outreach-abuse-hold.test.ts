/**
 * K1e: a call where the caller told of someone hurting them sets off no outreach at its end. The
 * person hurting them may read the caller's texts or pick up the phone, so nothing is queued:
 * no commitment check-in, no emotional-support or concern follow-up, no milestone, no
 * re-engagement, no trust-based outreach, and nothing kept as a struggle for later outreach.
 * A call with only suicidal risk is not held: its follow-ups go out as on main.
 *
 * Every line here is invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const publish = vi.hoisted(() => ({
  commitment: vi.fn(async () => ({ success: true })),
  emotional: vi.fn(async () => ({ success: true })),
  milestone: vi.fn(async () => ({ success: true })),
  outreach: vi.fn(async () => ({ success: true })),
  trust: vi.fn(async () => ({ triggersCreated: 0, triggerTypes: [] })),
  concern: vi.fn(async () => false),
  context: vi.fn(),
}));

vi.mock('../../../config/feature-flags.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isOutreachTriggerCreationEnabled: () => true,
}));
vi.mock('../trigger-publisher.js', () => ({
  publishCommitmentTrigger: publish.commitment,
  publishEmotionalSupportTrigger: publish.emotional,
  publishMilestoneTrigger: publish.milestone,
  publishOutreachTrigger: publish.outreach,
}));
vi.mock('../trust-outreach-bridge.js', () => ({
  evaluateTrustBasedOutreach: publish.trust,
  handleConcernDetection: publish.concern,
}));
vi.mock('../index.js', () => ({
  recordTimingInteraction: vi.fn(),
  updateEmotionalState: vi.fn(),
  updateUserContext: publish.context,
}));
vi.mock('../../predictive-insights/data-collector.js', () => ({
  onSessionEnd: vi.fn(async () => undefined),
}));

import { analyzeSessionForOutreach, type ConversationTurn } from '../session-integration.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { notePatternRisk, resetCrisisCallRisk } from '../../safety/crisis-call-risk.js';
import { resetAbuseOutreachHold, trackAbuseRead } from '../../safety/abuse-outreach-hold.js';
import { createLogger } from '../../../utils/safe-logger.js';

const SESSION = 'session-k1e-abuse-hold';

// The hold's own logger (safe-logger is mocked for every test file).
const holdLog = vi.mocked(createLogger).mock.results[
  vi.mocked(createLogger).mock.calls.findIndex(([o]) => o?.module === 'AbuseOutreachHold')
]?.value as { info: ReturnType<typeof vi.fn> };

const call = (...said: string[]) => ({
  userId: 'member-k1e-abuse-hold',
  sessionId: SESSION,
  personaId: 'ferni',
  // A short call, so re-engagement would be queued too were the call not held.
  durationMinutes: 1,
  turns: said.flatMap((content): ConversationTurn[] => [
    { role: 'user', content },
    { role: 'assistant', content: "I'm here with you." },
  ]),
});

// A commitment and a sad, overwhelmed line: on an everyday call these queue outreach.
const COMMITMENT = "I'll call the landlord tomorrow about the lease.";
const HEAVY = "i'm so sad and overwhelmed, i'm struggling with everything";
const NOTHING = { commitmentsFound: 0, triggersCreated: 0, contextUpdated: false };

const queued = () =>
  [
    publish.commitment,
    publish.emotional,
    publish.milestone,
    publish.outreach,
    publish.trust,
    publish.concern,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

/** A turn read that settles when the test says. */
function turnRead() {
  let settle: (indicators: string[]) => void = () => undefined;
  let fail: () => void = () => undefined;
  const read = new Promise<{ crisis: { indicators: string[] } }>((resolve, reject) => {
    settle = (indicators) => resolve({ crisis: { indicators } });
    fail = () => reject(new Error('classifier failed'));
  });
  return { read, settle, fail };
}

const outcomes = () =>
  holdLog.info.mock.calls.map(([fields]) => (fields as { outcome: string }).outcome);

describe('session-end outreach after a call where abuse was told', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCrisisCallRisk();
    resetAbuseOutreachHold();
  });

  it('an everyday call with the same commitment queues outreach (the control)', async () => {
    const result = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(publish.commitment).toHaveBeenCalled();
    expect(publish.outreach).toHaveBeenCalled();
    expect(publish.context).toHaveBeenCalled();
    expect(result.triggersCreated).toBeGreaterThan(0);
  });

  it.each([
    'my husband hits me',
    "i'm not safe at home",
    'she threatened to hurt me if i leave',
    "he's breaking the door",
  ])('no outreach job is queued: %s', async (line) => {
    const result = await analyzeSessionForOutreach(call(COMMITMENT, line, HEAVY));
    expect(queued()).toBe(0);
    expect(publish.context).not.toHaveBeenCalled();
    expect(result).toEqual(NOTHING);
  });

  it('a suicidal-only call queues its follow-ups as on main', async () => {
    const said = 'I want to end my life.';
    notePatternRisk(SESSION, detectCrisis(said));
    const result = await analyzeSessionForOutreach(call(COMMITMENT, said, HEAVY));
    expect(publish.commitment).toHaveBeenCalled();
    expect(publish.context).toHaveBeenCalled();
    expect(result.triggersCreated).toBeGreaterThan(0);
  });

  it('a turn-1 disclosure the passed turns no longer hold still holds the call', async () => {
    // The kernel's read of turn 1, noted as the turn pipeline notes it (turn-crisis.ts).
    notePatternRisk(SESSION, detectCrisis('my husband hits me'));
    const result = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(queued()).toBe(0);
    expect(result).toEqual(NOTHING);
  });

  it('the hold is per call: a disclosure on another call does not hold this one', async () => {
    notePatternRisk('session-k1e-other-caller', detectCrisis('my husband hits me'));
    await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(publish.commitment).toHaveBeenCalled();
  });

  it('a turn read in flight at the end that tells of abuse holds the call', async () => {
    const turn = turnRead();
    void trackAbuseRead(SESSION, turn.read, 5_000);
    const pending = analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    turn.settle(['abuse_disclosure', 'abuse_disclosure_partner']);
    expect(await pending).toEqual(NOTHING);
    expect(queued()).toBe(0);
    expect(outcomes()).toContain('deferred_held');
  });

  it('a benign turn read in flight at the end is waited for, then the call queues once', async () => {
    const turn = turnRead();
    void trackAbuseRead(SESSION, turn.read, 5_000);
    const pending = analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    await Promise.resolve();
    expect(queued()).toBe(0); // nothing goes out while the read is out
    turn.settle([]);
    const result = await pending;
    expect(publish.commitment).toHaveBeenCalledTimes(1);
    expect(result.triggersCreated).toBeGreaterThan(0);
    expect(outcomes()).toContain('deferred_sent');
  });

  it('a turn read that never settles holds the call once its wait is up', async () => {
    const never = new Promise<never>(() => {
      // never settles
    });
    void trackAbuseRead(SESSION, never, 30);
    const result = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(result).toEqual(NOTHING);
    expect(queued()).toBe(0);
    expect(outcomes()).toContain('timeout');
  });

  it('a turn read that fails holds the call, and the failure is logged as counts', async () => {
    const turn = turnRead();
    const read = trackAbuseRead(SESSION, turn.read, 5_000);
    turn.fail();
    await read.catch(() => undefined);
    const result = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(result).toEqual(NOTHING);
    expect(holdLog.info).toHaveBeenCalledWith(
      { outcome: 'rejected', reads: 1 },
      expect.any(String)
    );
  });

  it('the twin still queues: "my brother hits me at video games"', async () => {
    await analyzeSessionForOutreach(call(COMMITMENT, 'my brother hits me at video games'));
    expect(publish.commitment).toHaveBeenCalled();
  });
});
