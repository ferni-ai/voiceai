/**
 * K1e: a call where the caller told of someone hurting them sets off no outreach at its end. The
 * person hurting them may read the caller's texts or pick up the phone, so nothing is queued:
 * no commitment check-in, no emotional-support or concern follow-up, no milestone, no
 * re-engagement, no trust-based outreach, and nothing kept as a struggle for later outreach.
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
import {
  notePatternRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../safety/crisis-call-risk.js';

const call = (...said: string[]) => ({
  userId: 'member-k1e-abuse-hold',
  sessionId: 'session-k1e-abuse-hold',
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

const queued = () =>
  [
    publish.commitment,
    publish.emotional,
    publish.milestone,
    publish.outreach,
    publish.trust,
    publish.concern,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

describe('session-end outreach after a call where abuse was told', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCrisisCallRisk();
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
    expect(result).toEqual({ commitmentsFound: 0, triggersCreated: 0, contextUpdated: false });
  });

  it('a turn-1 disclosure the passed turns no longer hold still holds the call', async () => {
    // The kernel's read of turn 1, noted as the turn pipeline notes it (turn-crisis.ts).
    notePatternRisk('session-k1e-abuse-hold', detectCrisis('my husband hits me'));
    const result = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(queued()).toBe(0);
    expect(publish.context).not.toHaveBeenCalled();
    expect(result).toEqual({ commitmentsFound: 0, triggersCreated: 0, contextUpdated: false });
  });

  it('a crisis read still in flight when the call ends holds it, and the call queues once it reads none', async () => {
    let settle: (read: { risk: string }) => void = () => undefined;
    const read = new Promise<{ risk: string }>((resolve) => {
      settle = resolve;
    });
    // The last turn's classifier read has not settled when the call ends.
    void trackCrisisRead('session-k1e-abuse-hold', 'i just want it all to stop', read);
    const held = await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(queued()).toBe(0);
    expect(publish.context).not.toHaveBeenCalled();
    expect(held).toEqual({ commitmentsFound: 0, triggersCreated: 0, contextUpdated: false });

    settle({ risk: 'none' });
    await read;
    await analyzeSessionForOutreach(call(COMMITMENT, HEAVY));
    expect(publish.commitment).toHaveBeenCalled();
  });

  it('the twin still queues: "my brother hits me at video games"', async () => {
    await analyzeSessionForOutreach(call(COMMITMENT, 'my brother hits me at video games'));
    expect(publish.commitment).toHaveBeenCalled();
  });
});
