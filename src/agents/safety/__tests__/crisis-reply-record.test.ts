/**
 * The per-call record of crisis replies (crisis-call-risk.ts noteCrisisReply)
 * is dropped when the call ends, through the session cleanup registry that the
 * entrypoint runs after the call is over, and holds at most
 * CRISIS_REPLY_CALLS_MAX calls. Synthetic lines.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startCrisisGate } from '../../personas/crisis-gate.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import {
  cleanupOrphanedSessions,
  runSessionCleanup,
} from '../../session/event-cleanup-registry.js';
import {
  CRISIS_REPLY_CALLS_MAX,
  crisisReplyOnTurn,
  crisisRiskThisCall,
  noteCrisisReply,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../../../services/safety/crisis-classifier.js';

const RISK = 'I want to die.';
const ENV = { CRISIS_GUARD_MODE: 'live' };

function chat(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'assistant', content: 'Hey, what is on your mind?' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}
/** A pattern-hit turn through the reply gate: its reply carries the crisis script. */
function gateTurn(session: string): void {
  const turn = startCrisisGate(chat(RISK), { services: { sessionId: session } }, { env: ENV });
  expect(turn?.decision.action).toBe('replace');
}

beforeEach(() => {
  resetCrisisCallRisk();
  resetCrisisClassifierCache();
});

describe('call end', () => {
  it('the reply gate: the call ends and its record is gone', async () => {
    gateTurn('end-gate');
    expect(crisisReplyOnTurn('end-gate', RISK)).toBe(true);
    expect(crisisRiskThisCall('end-gate')).toBe(true);
    await runSessionCleanup('end-gate');
    expect(crisisReplyOnTurn('end-gate', RISK)).toBe(false);
    // Noted risk gates live behaviour (no hang-up, goodbye hold): it keeps its 6 hours,
    // since the registry's orphan sweep can run this cleanup on a call still live.
    expect(crisisRiskThisCall('end-gate')).toBe(true);
  });

  it('the turn pipeline: the call ends and its record is gone', async () => {
    const t = startTurnCrisis(RISK, { recentTranscripts: [] }, { sessionId: 'end-pipe', env: ENV });
    expect((await t.resolve()).isCrisis).toBe(true);
    expect(crisisReplyOnTurn('end-pipe', RISK)).toBe(true);
    await runSessionCleanup('end-pipe');
    expect(crisisReplyOnTurn('end-pipe', RISK)).toBe(false);
    expect(crisisRiskThisCall('end-pipe')).toBe(true);
  });

  it("a live call's record is untouched by another call's cleanup", async () => {
    gateTurn('live-call');
    gateTurn('ended-call');
    await runSessionCleanup('ended-call');
    expect(crisisReplyOnTurn('ended-call', RISK)).toBe(false);
    expect(crisisReplyOnTurn('live-call', RISK)).toBe(true);
    expect(crisisRiskThisCall('live-call')).toBe(true);
  });
});

describe('the registry orphan sweep (2 h without access)', () => {
  const HOUR = 60 * 60 * 1000;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('noting a reply bumps lastAccessedAt: an active crisis call is not swept', async () => {
    gateTurn('active');
    vi.advanceTimersByTime(1.5 * HOUR);
    gateTurn('active'); // another crisis reply on the same call
    vi.advanceTimersByTime(1 * HOUR); // 2.5 h since registering, 1 h since the last reply
    await cleanupOrphanedSessions();
    expect(crisisReplyOnTurn('active', RISK)).toBe(true);
  });

  it('a call with no reply for over 2 h is swept: its record goes, its noted risk stays', async () => {
    gateTurn('idle');
    vi.advanceTimersByTime(2.5 * HOUR);
    await cleanupOrphanedSessions();
    expect(crisisReplyOnTurn('idle', RISK)).toBe(false);
    expect(crisisRiskThisCall('idle')).toBe(true);
  });
});

describe('cap', () => {
  it(`holds at most ${CRISIS_REPLY_CALLS_MAX} calls, evicting the least recently noted`, () => {
    expect(CRISIS_REPLY_CALLS_MAX).toBe(2000);
    const now = Date.now();
    for (let i = 0; i < CRISIS_REPLY_CALLS_MAX; i++) noteCrisisReply(`cap-${i}`, RISK, now + i);
    noteCrisisReply('cap-1', RISK, now + CRISIS_REPLY_CALLS_MAX); // noted again: newest now
    noteCrisisReply('cap-new', RISK, now + CRISIS_REPLY_CALLS_MAX + 1);
    const at = now + CRISIS_REPLY_CALLS_MAX + 2;
    expect(crisisReplyOnTurn('cap-0', RISK, at)).toBe(false);
    expect(crisisReplyOnTurn('cap-1', RISK, at)).toBe(true);
    expect(crisisReplyOnTurn('cap-2', RISK, at)).toBe(true);
    expect(crisisReplyOnTurn('cap-new', RISK, at)).toBe(true);
  });
});
