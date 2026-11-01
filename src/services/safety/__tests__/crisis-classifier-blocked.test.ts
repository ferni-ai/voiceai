/**
 * CRISIS_CLASSIFIER_BLOCKED_SIGNAL (crisis-classifier-blocked.ts) through the real classifier run
 * and turn pipeline (startTurnCrisis): off, a blocked read is '' and the turn is unchanged; on, a
 * blocked read of a turn the patterns read as nothing gets a gentle safety check-in, or
 * child-safety care (and the call's memory held) for a caller who sounds under 18 or whose words
 * mention touching or abuse. A turn the patterns read, or a read that was not blocked, is
 * unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blockedResponse = { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } };
vi.mock('../../../config/gemini-config.js', () => ({
  getGeminiClient: async () => ({ models: { generateContent: async () => blockedResponse } }),
}));

import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { resetSexualTopicHold, sexualTopicConfirmed } from '../../../utils/sexual-topic-hold.js';
import { resetCrisisCallRisk } from '../crisis-call-risk.js';
import {
  BLOCKED_REPLY,
  BLOCKED_SAFETY_CHECK,
  blockedReadGuidance,
  blockedReply,
  blockReasonOf,
  CHILD_SAFETY_CARE,
  resetClassifierBlocked,
} from '../crisis-classifier-blocked.js';
import {
  createGeminiCrisisGenerate,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { CRISIS_EVERYDAY_RULES } from '../crisis-everyday.js';
import { buildCrisisGuidance } from '../crisis-guard.js';
import { resetCallRiskSnapshots } from '../crisis-lone-imminent.js';
import { EMERGENCY_NUMBER } from '../emergency-number.js';
import { CRISIS_RESOURCES } from '../crisis-response.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  SEXUAL_TOPIC_BOUNDARY: 'on',
};
const OFF = { ...BASE, CRISIS_CLASSIFIER_BLOCKED_SIGNAL: 'off' };
const ON = { ...BASE, CRISIS_CLASSIFIER_BLOCKED_SIGNAL: 'on' };

const blockedGenerate: CrisisGenerateFn = async () => BLOCKED_REPLY;
const noneGenerate: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';

let n = 0;
/** One turn through the pipeline: its summary and the call it ran on. */
async function turn(
  latest: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn = blockedGenerate,
  options: { earlier?: string[]; sessionId?: string | null } = {}
) {
  // Fresh reads each time: a cached verdict from an earlier turn would skip the model call.
  resetCrisisClassifierCache();
  resetCallRiskSnapshots();
  const sessionId =
    options.sessionId === null ? undefined : (options.sessionId ?? `blocked-${++n}`);
  const t = startTurnCrisis(
    latest,
    { recentTranscripts: [...(options.earlier ?? []), latest], turnCount: 1 },
    { sessionId, env, generate }
  );
  return { summary: await t.summary(), sessionId };
}

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetClassifierBlocked();
  resetSexualTopicHold();
});
afterEach(() => {
  delete process.env.CRISIS_CLASSIFIER_BLOCKED_SIGNAL;
});

describe('a blocked model response', () => {
  it('names the block from the prompt feedback or a blocking finish, and nothing else', () => {
    expect(blockReasonOf(blockedResponse)).toBe('PROHIBITED_CONTENT');
    expect(blockReasonOf({ candidates: [{ finishReason: 'SAFETY' }] })).toBe('SAFETY');
    expect(blockReasonOf({ candidates: [{ finishReason: 'STOP' }] })).toBeNull();
    expect(
      blockReasonOf({ promptFeedback: { blockReason: 'BLOCKED_REASON_UNSPECIFIED' } })
    ).toBeNull();
    expect(blockReasonOf({})).toBeNull();
  });

  it('is empty text with the flag off, as on main, and BLOCKED_REPLY with it on', async () => {
    expect(blockedReply(blockedResponse, OFF)).toBeNull();
    expect(blockedReply(blockedResponse, ON)).toBe(BLOCKED_REPLY);
    const signal = new AbortController().signal;
    expect(await createGeminiCrisisGenerate()('p', '{}', signal)).toBe('');
    process.env.CRISIS_CLASSIFIER_BLOCKED_SIGNAL = 'on';
    expect(await createGeminiCrisisGenerate()('p', '{}', signal)).toBe(BLOCKED_REPLY);
  });
});

describe('a turn whose read was blocked, patterns read nothing', () => {
  const CHILD = "I'm 13 and my stepdad touches me at night.";

  it('is unchanged with the flag off', async () => {
    const { summary } = await turn(CHILD, OFF);
    expect(summary.isCrisis).toBe(false);
    expect(summary.softCheck).toBeUndefined();
  });

  it('gets child-safety care, and holds the call, when the words mention touching', async () => {
    const { summary, sessionId } = await turn(CHILD, ON);
    expect(summary.softCheck).toBe(true);
    expect(summary.softGuidance).toBe(CHILD_SAFETY_CARE);
    expect(summary.softGuidance).toContain('1-800-422-4453');
    expect(summary.softGuidance).toContain('not their fault');
    expect(sexualTopicConfirmed(sessionId, ON)).toBe(true);
  });

  it('gets child-safety care for touching or abuse words with no age said', async () => {
    const { summary } = await turn('My stepdad touches me at night.', ON);
    expect(summary.softGuidance).toBe(CHILD_SAFETY_CARE);
  });

  it('gets child-safety care when the caller says they are under 18, whatever the words', async () => {
    const { summary } = await turn("I don't want to say what happened.", ON, blockedGenerate, {
      earlier: ["I'm 12."],
    });
    expect(summary.softGuidance).toBe(CHILD_SAFETY_CARE);
  });

  it('gets the gentle safety check-in otherwise, and the call is not held', async () => {
    const { summary, sessionId } = await turn('Something awful happened at the party.', ON);
    expect(summary.softCheck).toBe(true);
    expect(summary.softGuidance).toBe(BLOCKED_SAFETY_CHECK);
    expect(sexualTopicConfirmed(sessionId, ON)).toBe(false);
  });
});

describe('what the flag never changes', () => {
  it('a read that was not blocked', async () => {
    const off = (await turn("I'm 13 and my stepdad touches me at night.", OFF, noneGenerate))
      .summary;
    const on = (await turn("I'm 13 and my stepdad touches me at night.", ON, noneGenerate)).summary;
    expect(on).toEqual(off);
    expect(on.softCheck).toBeUndefined();
  });

  it('a turn the patterns already read: the crisis handling stands as off', async () => {
    // A pattern crisis (not a block): the classifier reads it, and that read is blocked.
    const line = "I won't be alive tomorrow.";
    const off = (await turn(line, OFF)).summary;
    const on = (await turn(line, ON)).summary;
    expect(off.isCrisis).toBe(true);
    expect(on).toEqual(off);
  });

  it('a call whose read was never blocked', () => {
    expect(
      blockedReadGuidance('blocked-never', { latest: 'My stepdad touches me.' }, ON)
    ).toBeNull();
  });

  it('a turn with no call id', async () => {
    const off = (await turn('Something awful happened.', OFF, blockedGenerate, { sessionId: null }))
      .summary;
    const on = (await turn('Something awful happened.', ON, blockedGenerate, { sessionId: null }))
      .summary;
    expect(on).toEqual(off);
  });
});

describe('the guidance texts', () => {
  it('the check-in offers 988 for words about hurting themselves', () => {
    expect(BLOCKED_SAFETY_CHECK).toContain('offer the 988 Suicide & Crisis Lifeline');
  });

  it('child-safety care gives Childhelp and 911, and never promises secrecy or telling', () => {
    expect(CHILD_SAFETY_CARE).toContain(CRISIS_RESOURCES.child_abuse[0].phone);
    expect(CHILD_SAFETY_CARE).toContain(`they can call ${EMERGENCY_NUMBER}`);
    expect(EMERGENCY_NUMBER).toBe('911');
    expect(CHILD_SAFETY_CARE).toContain('Never promise to keep it secret or between you');
    expect(CHILD_SAFETY_CARE).toContain('never say or imply that you will tell anyone');
  });
});

describe('a blocked ruled read beside a plain read of risk', () => {
  // The everyday rules' read is refused; the plain read (no rules) reads crisis. Fictional line
  // the patterns read as nothing, with risk words, so the plain read runs.
  const split: CrisisGenerateFn = async (prompt) =>
    prompt.includes(CRISIS_EVERYDAY_RULES) ? BLOCKED_REPLY : '{"risk":"crisis","subject":"self"}';

  it('is the crisis read with its 988 guidance, never the blocked check-in', async () => {
    const { summary } = await turn("I'll die.", ON, split);
    expect(summary.isCrisis).toBe(true);
    expect(summary.softCheck).toBeUndefined();
    expect(buildCrisisGuidance(summary)).toMatch(/\b988\b/);
  });
});

describe('the kill switch', () => {
  it('a block noted with the flag on gives no guidance once the flag is off', async () => {
    const latest = 'Something awful happened.';
    const { sessionId } = await turn(latest, ON);
    expect(blockedReadGuidance(sessionId, { latest }, ON)).toBe(BLOCKED_SAFETY_CHECK);
    expect(blockedReadGuidance(sessionId, { latest }, OFF)).toBeNull();
  });
});
