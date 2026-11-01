/**
 * ABUSE_DISCLOSURE_PATTERNS (abuse-disclosure.ts) through the real turn pipeline
 * (startTurnCrisis): off, a turn is exactly as on main; on, a caller saying someone hurts them
 * is a crisis-level safety turn answered with are-you-safe, 911 if in danger, and the line that
 * fits (Childhelp for family, the DV hotline for a partner), 988 only with self-harm words.
 * Everyday uses of the same words never match, and a turn already read as a crisis keeps it all.
 */
import { readFileSync } from 'fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { abuseDisclosure, abuseGuidance } from '../abuse-disclosure.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../crisis-call-risk.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';
import { resetCallRiskSnapshots } from '../crisis-lone-imminent.js';

const BASE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const OFF = { ...BASE, ABUSE_DISCLOSURE_PATTERNS: 'off' };
const ON = { ...BASE, ABUSE_DISCLOSURE_PATTERNS: 'on' };
const none: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';

let n = 0;
async function summary(line: string, env: Record<string, string>, generate = none) {
  resetCrisisClassifierCache();
  resetCallRiskSnapshots();
  const t = startTurnCrisis(
    line,
    { recentTranscripts: [line], turnCount: 1 },
    { sessionId: `abuse-${++n}`, env, generate }
  );
  return t.summary();
}

beforeEach(() => {
  resetCrisisCallRisk();
});

const DISCLOSURES: Array<[string, 'child' | 'partner' | 'unknown']> = [
  ["My stepdad hits me when he's drunk.", 'child'],
  ['My dad hits me.', 'child'],
  ['My mom beats me with a belt.', 'child'],
  ["My stepmom locks me in my room and doesn't feed me.", 'child'],
  ['My dad threw me down the stairs.', 'child'],
  ["My mom's boyfriend hurts me when she's at work.", 'child'],
  ['I have bruises where my dad grabbed me.', 'child'],
  ['My uncle hits me and says no one will believe me.', 'child'],
  ["My brother beats me up and my parents don't care.", 'child'],
  ['My boyfriend hits me.', 'partner'],
  ['My husband choked me last night.', 'partner'],
  ['My girlfriend threw me against the wall.', 'partner'],
  ["My partner says he'll kill me if I leave.", 'partner'],
  ['He hurts me.', 'unknown'],
  ["I'm scared to go home tonight, he'll be there.", 'unknown'],
];

// Fictional everyday lines with the same words (more in the sim's recall-hard-negatives set).
const EVERYDAY = [
  'My dad hits golf balls every Sunday morning.',
  'My brother beat me at chess again.',
  'The teacher threw me a curveball question in class.',
  'My boyfriend hits me up every night to chat.',
  'My uncle hits me with a dad joke every time he visits.',
  'My brother hits me with pillows when we are goofing around.',
  'My sister hit me with a snowball.',
  'My mom locks me out of the wifi after ten.',
  "My stepmom doesn't feed me breakfast, I just don't eat it.",
  'He hurts my feelings when he forgets my birthday.',
  'My husband choked on his coffee laughing.',
  'My girlfriend threw me a surprise party.',
  'My brother threw me in the pool at the party.',
  'I have bruises from soccer practice.',
  'I have bruises where the dog jumped on me.',
  "I'm scared to go home and see how messy my room is.",
  'That song just hits me every time.',
  'My dad grabbed me a coffee on the way.',
];

describe('abuseDisclosure', () => {
  it('reads every disclosure, and who it names', () => {
    for (const [line, who] of DISCLOSURES) expect(abuseDisclosure(line)?.who, line).toBe(who);
  });

  it('never reads the everyday uses of the same words', () => {
    for (const line of EVERYDAY) expect(abuseDisclosure(line), line).toBeNull();
  });

  it('notes self-harm words beside the disclosure', () => {
    expect(abuseDisclosure('My dad hits me and I want to die.')?.selfHarm).toBe(true);
    expect(abuseDisclosure('My dad hits me.')?.selfHarm).toBe(false);
  });
});

describe('a disclosure through the turn pipeline', () => {
  it('is exactly as on main with the flag off', async () => {
    const s = await summary("My stepdad hits me when he's drunk.", OFF);
    expect(s.isCrisis).toBe(false);
    expect(s.indicators).not.toContain('abuse_disclosure');
  });

  it('is a crisis-level safety turn with the flag on, never the scripted takeover', async () => {
    const s = await summary("My stepdad hits me when he's drunk.", ON);
    expect(s.isCrisis).toBe(true);
    expect(s.shouldOverrideLLM).toBe(false);
    expect(s.indicators).toEqual(
      expect.arrayContaining(['abuse_disclosure', 'abuse_disclosure_child'])
    );
  });

  it('asks whether they are safe, and offers the line that fits: Childhelp for family', async () => {
    const g = abuseGuidance(await summary('My dad threw me down the stairs.', ON)) ?? '';
    expect(g).toContain('Ask whether they are safe right now');
    expect(g).toContain('call 911');
    expect(g).toContain('1-800-422-4453');
    expect(g).not.toContain('1-800-799-7233');
    expect(g).not.toMatch(/\b988\b/);
  });

  it('the DV hotline for a partner', async () => {
    const g = abuseGuidance(await summary('My girlfriend threw me against the wall.', ON)) ?? '';
    expect(g).toContain('1-800-799-7233');
    expect(g).not.toContain('1-800-422-4453');
    expect(g).not.toMatch(/\b988\b/);
  });

  it('988 too when they also say something about hurting themselves', async () => {
    const g = abuseGuidance(await summary('My dad hits me and I just want to kill myself.', ON));
    expect(g).toMatch(/\b988\b/);
  });

  it('988 too when they said something about hurting themselves earlier in the call', async () => {
    resetCrisisClassifierCache();
    resetCallRiskSnapshots();
    const line = 'My dad hits me.';
    const earlier = ['Sometimes I want to die.', line];
    const t = startTurnCrisis(
      line,
      { recentTranscripts: earlier, turnCount: 2 },
      { sessionId: `abuse-${++n}`, env: ON, generate: none }
    );
    expect(abuseGuidance(await t.summary())).toMatch(/\b988\b/);
  });

  it('988 too when risk was noted earlier on the call', async () => {
    resetCrisisClassifierCache();
    resetCallRiskSnapshots();
    const call = `abuse-${++n}`;
    noteCrisisRisk(call);
    const t = startTurnCrisis(
      'My dad hits me.',
      { recentTranscripts: ['My dad hits me.'], turnCount: 2 },
      { sessionId: call, env: ON, generate: none }
    );
    expect(abuseGuidance(await t.summary())).toMatch(/\b988\b/);
  });

  it('a turn already read as a crisis keeps everything it had', async () => {
    const line = 'My dad hits me and I just want to kill myself.';
    const off = await summary(line, OFF);
    const on = await summary(line, ON);
    expect(off.isCrisis).toBe(true);
    expect(on.isCrisis).toBe(true);
    expect(on.shouldOverrideLLM).toBe(off.shouldOverrideLLM);
    expect(on.severity).toBeGreaterThanOrEqual(off.severity);
    expect(on.indicators).toEqual(expect.arrayContaining(off.indicators));
  });

  it('an everyday line is not a crisis with the flag on', async () => {
    for (const line of EVERYDAY.slice(0, 6))
      expect((await summary(line, ON)).isCrisis, line).toBe(false);
  });

  it('only a disclosure gets the abuse guidance', () => {
    expect(abuseGuidance({ indicators: ['explicit_ideation'] })).toBeNull();
  });

  it('is the guidance the voice turn injects for a crisis turn (turn-handler.ts)', () => {
    const handler = readFileSync(
      new URL('../../../agents/voice-agent/turn-handler.ts', import.meta.url),
      'utf8'
    );
    const injection = /category: 'crisis_response',[^}]*?content: ([^,\n]+),/.exec(handler)?.[1];
    expect(injection).toBe('abuseGuidance(result.crisis) ?? buildCrisisGuidance(result.crisis)');
  });
});
