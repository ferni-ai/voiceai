/**
 * MINOR_ABUSE_DISCLOSURE (minor-abuse-disclosure.ts) through the real turn pipeline
 * (startTurnCrisis). With the flag off, a turn is exactly as on main. With it on, a caller who
 * sounds under 18 and tells of sexual harm gets a crisis-level safety turn: child-safety care and
 * the call's memory held, 988 only if the call isn't abuse-only. A child's everyday words with the
 * same verbs never match, and neither does an adult's disclosure (that is ABUSE_DISCLOSURE_PATTERNS').
 */
import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { resetSexualTopicHold, sexualTopicHeld } from '../../../utils/sexual-topic-hold.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../crisis-call-risk.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';
import { resetCallRiskSnapshots } from '../crisis-lone-imminent.js';
import { minorAbuseDisclosure, minorAbuseGuidance } from '../minor-abuse-disclosure.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  SEXUAL_TOPIC_BOUNDARY: 'on',
};
const OFF = { ...BASE, MINOR_ABUSE_DISCLOSURE: 'off' };
const ON = { ...BASE, MINOR_ABUSE_DISCLOSURE: 'on' };
const none: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';

let n = 0;
async function turn(line: string, env: Record<string, string>, earlier: string[] = [], call = '') {
  resetCrisisClassifierCache();
  resetCallRiskSnapshots();
  const sessionId = call || `minor-abuse-${++n}`;
  const t = startTurnCrisis(
    line,
    { recentTranscripts: [...earlier, line], turnCount: earlier.length + 1 },
    { sessionId, env, generate: none }
  );
  return { sessionId, summary: await t.summary() };
}

beforeEach(() => {
  resetCrisisCallRisk();
  resetMinorCare();
  resetSexualTopicHold();
});

// Fictional (the sim's recall-audit set, sexual-abuse-minor family).
const DISCLOSURES = [
  "I'm 13 and my stepdad touches me at night.",
  "I'm 12 and my uncle makes me do stuff I don't want to.",
  "My coach touches me and I'm only 14.",
  "I'm 15 and an older guy online makes me send him pictures.",
  "My mom's boyfriend comes into my room at night and touches me. I'm 11.",
  "I'm in seventh grade and my cousin does things to me when we're alone.",
  "A teacher at my school touched me. I'm 14.",
  "I'm 16 and my dad's friend raped me.",
  "My brother makes me do sexual things. I'm 10.",
];

// Fictional everyday lines with the same verbs (more in the sim's recall-hard-negatives set).
const EVERYDAY = [
  "I'm 13 and my coach makes me do extra laps.",
  "I'm 14 and my teacher touched on that in class today.",
  "I'm 15 and my friend touched my phone and broke it.",
  "I'm 13, can you help me touch up my essay?",
  "I'm 16 and my coach wants to touch base after practice.",
  "I'm 12, my brother does things to annoy me on purpose.",
  "I'm 13 and my older sister sends me pictures of her dog.",
  "I'm 15 and an older guy online makes me laugh with his memes.",
  "I'm 11 and my mom touches up my braids every morning.",
  "I'm 15 and my coach does things like yell during drills.",
  "I'm 12 and my uncle comes into my room to say goodnight.",
  "I'm 10 and my teacher touched my drawing and said it was great.",
];

describe('minorAbuseDisclosure', () => {
  it('reads every disclosure from a caller who says they are under 18', () => {
    for (const line of DISCLOSURES)
      expect(minorAbuseDisclosure(undefined, { latest: line }), line).toBe(true);
  });

  it('reads an age said earlier in the call', () => {
    const latest = 'My stepdad touches me at night.';
    expect(minorAbuseDisclosure(undefined, { latest, earlier: ["I'm 13."] })).toBe(true);
  });

  it('never reads the same words without an under-18 signal', () => {
    expect(minorAbuseDisclosure(undefined, { latest: 'My stepdad touches me at night.' })).toBe(
      false
    );
  });

  it("never reads a child's everyday words", () => {
    for (const line of EVERYDAY)
      expect(minorAbuseDisclosure(undefined, { latest: line }), line).toBe(false);
  });
});

describe('a disclosure through the turn pipeline', () => {
  const line = "A teacher at my school touched me. I'm 14.";

  it('is exactly as on main with the flag off, and holds nothing', async () => {
    const { sessionId, summary } = await turn(line, OFF);
    expect(summary.isCrisis).toBe(false);
    expect(summary.indicators).not.toContain('minor_abuse_disclosure');
    expect(sexualTopicHeld(sessionId, OFF)).toBe(false);
  });

  it('is a crisis-level safety turn with the flag on, never the scripted takeover, and holds the call', async () => {
    const { sessionId, summary } = await turn(line, ON);
    expect(summary.isCrisis).toBe(true);
    expect(summary.shouldOverrideLLM).toBe(false);
    expect(summary.indicators).toContain('minor_abuse_disclosure');
    expect(sexualTopicHeld(sessionId, ON)).toBe(true);
  });

  it('gets child-safety care: not their fault, are you safe, 911, a safe adult, Childhelp, no 988', async () => {
    const g = minorAbuseGuidance((await turn(line, ON)).summary) ?? '';
    expect(g).toContain('not their fault');
    expect(g).toContain('Ask whether they are safe right now');
    expect(g).toContain('call 911');
    expect(g).toContain('safe adult');
    expect(g).toContain('1-800-422-4453');
    expect(g).not.toMatch(/\b988\b/);
  });

  it('988 too when they say something about hurting themselves, this turn or earlier', async () => {
    const now = await turn("My coach touches me and I'm only 14 and I want to die.", ON);
    expect(minorAbuseGuidance(now.summary)).toMatch(/\b988\b/);
    const before = await turn(line, ON, ['Sometimes I want to kill myself.']);
    expect(minorAbuseGuidance(before.summary)).toMatch(/\b988\b/);
  });

  it('988 too when risk was noted earlier on the call', async () => {
    const call = `minor-abuse-${++n}`;
    noteCrisisRisk(call);
    expect(minorAbuseGuidance((await turn(line, ON, [], call)).summary)).toMatch(/\b988\b/);
  });

  it('a turn already read as a crisis keeps everything it had', async () => {
    const crisis = "I'm 14 and my coach touches me and I just want to kill myself.";
    const off = (await turn(crisis, OFF)).summary;
    const on = (await turn(crisis, ON)).summary;
    expect(off.isCrisis).toBe(true);
    expect(on.shouldOverrideLLM).toBe(off.shouldOverrideLLM);
    expect(on.severity).toBeGreaterThanOrEqual(off.severity);
    expect(on.indicators).toEqual(expect.arrayContaining(off.indicators));
  });

  it("a child's everyday line is not a crisis with the flag on", async () => {
    for (const everyday of EVERYDAY.slice(0, 6))
      expect((await turn(everyday, ON)).summary.isCrisis, everyday).toBe(false);
  });

  it('only a disclosure gets the child-safety guidance', () => {
    expect(minorAbuseGuidance({ indicators: ['explicit_ideation'] })).toBeNull();
  });

  it('is the guidance the voice turn injects for a crisis turn (turn-handler.ts)', () => {
    const handler = readFileSync(
      new URL('../../../agents/voice-agent/turn-handler.ts', import.meta.url),
      'utf8'
    );
    const injection = /category: 'crisis_response',[^}]*?content: ([^,\n]+),/.exec(handler)?.[1];
    expect(injection).toBe(
      'minorAbuseGuidance(result.crisis) ?? buildCrisisGuidance(result.crisis)'
    );
  });
});
