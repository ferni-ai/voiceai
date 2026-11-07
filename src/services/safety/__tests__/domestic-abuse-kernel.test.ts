/**
 * K1e: domestic abuse in the crisis kernel. The reader is abuseDisclosure (abuse-disclosure.ts),
 * so there is one set of abuse patterns; these rows are the ones it missed: "not safe at home",
 * afraid of a partner, and someone violent here now (a weapon, breaking in), which is imminent.
 *
 * Every line here is invented.
 */
import { readFileSync } from 'fs';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it } from 'vitest';

import { decisionFor, startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { crisisRead } from '../../outreach/caller-text.js';
import { abuseDisclosure } from '../abuse-disclosure.js';
import { crisisRiskNoted, resetCrisisCallRisk, selfRiskThisCall } from '../crisis-call-risk.js';
import { resetCrisisClassifierCache } from '../crisis-classifier.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { CRISIS_RESOURCES } from '../crisis-response.js';

const DV_LINE = CRISIS_RESOURCES.domestic_abuse[0];
const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];

const CORPUS = JSON.parse(
  readFileSync(
    new URL(
      '../../../../scripts/crisis-eval/corpus/abuse-disclosure-2026-11-01.json',
      import.meta.url
    ),
    'utf8'
  )
) as { calls: Array<{ shape: string; turns: Array<{ text: string }> }> };
const everydayCorpus = CORPUS.calls
  .filter((c) => /^abuse-hn-/.test(c.shape))
  .map((c) => c.turns.at(-1)?.text ?? '');
// Every line of the recall audit's must-not-alarm set ("beat me to the punchline").
const hardNegatives = (
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../scripts/crisis-eval/corpus/recall-hard-negatives-2026-11-01.json',
        import.meta.url
      ),
      'utf8'
    )
  ) as { calls: Array<{ turns: Array<{ text: string; label: string }> }> }
).calls.flatMap((c) => c.turns.filter((t) => t.label === 'must-not-alarm').map((t) => t.text));

const NOT_SAFE_HOME = [
  "I'm not safe at home.",
  'im not safe at home right now',
  "i don't feel safe at home anymore",
  'I do not feel safe in my own home.',
  "it's not safe for me at home",
  "i'm not safe at home because of him",
  "I'm not safe with him.",
  "i don't feel safe around my husband",
];

const AFRAID_OF_PARTNER = [
  "I'm afraid of my husband.",
  'im scared of my boyfriend',
  "i'm terrified of my ex",
  "I'm really scared of my partner right now.",
];

const IMMINENT: Array<[string, 'child' | 'partner' | 'unknown']> = [
  ["he's here and has a knife", 'unknown'],
  ["He's outside with a gun.", 'unknown'],
  ["my husband is at the door and he's got a gun", 'partner'],
  ["she's in the house and she has a knife", 'unknown'],
  ["he's breaking the door", 'unknown'],
  ["he's breaking down the door", 'unknown'],
  ['my ex is kicking the door in', 'partner'],
  ["he's trying to break in", 'unknown'],
  ["they're smashing the window", 'unknown'],
  ["he's holding a knife to me", 'unknown'],
  ['my boyfriend is pointing a gun at me', 'partner'],
  ['my stepdad has a knife and he is coming at me', 'child'],
  ["he's coming back and he said he'll kill me", 'unknown'],
  ["my ex is on his way here and he says he's going to hurt me tonight", 'partner'],
];

// The same words with no one in danger: each must read nothing.
const TWINS = [
  'not safe at home for the cat, the heater sparks',
  'my brother hits me at video games',
  "the stairs aren't safe at home for the baby yet",
  "i don't feel safe at home with the wiring this old",
  "i'm not safe at home from my sister's terrible cooking lol",
  "I'm scared of my husband's driving.",
  "i'm afraid of my boyfriend's dog",
  "im scared of my dad's reaction to my grades",
  "he's here and has a knife to cut the cake",
  "he's in the kitchen with a knife chopping onions",
  "she's at the door with a bat, softball practice ran late",
  "he's breaking the door frame down to put in a new one",
  'the contractor is breaking down the door frame',
  "he's trying to break in his new boots",
  "my dad's trying to break in the new car",
  "they're smashing the window display at the mall, it's a sale",
  "he's banging on the door, he forgot his keys",
  'he has a knife collection',
  "my mom's coming home and she said she'll kill me if my room is messy",
  "she's coming over and she says she'll kill me at mario kart",
  'my sister beats men at arm wrestling all the time',
  'he hits metal with a hammer at the forge',
  'she kicks medicine balls at the gym',
  "i'm not safe at home right now, there's a gas leak",
  "i don't feel safe at home anymore since the break-ins on our street",
];

describe('abuseDisclosure: the rows the kernel needed', () => {
  it.each(NOT_SAFE_HOME)('not safe at home or with them: %s', (line) => {
    const read = abuseDisclosure(line);
    expect(read).not.toBeNull();
    expect(read?.imminent).toBe(false);
  });

  it.each(AFRAID_OF_PARTNER)('afraid of a partner: %s', (line) => {
    const read = abuseDisclosure(line);
    expect(read?.who).toBe('partner');
    expect(read?.imminent).toBe(false);
  });

  it.each(IMMINENT)('someone violent here now is imminent: %s', (line, who) => {
    const read = abuseDisclosure(line);
    expect(read?.imminent).toBe(true);
    expect(read?.who).toBe(who);
  });

  it('a stretched "me" still reads', () => {
    expect(abuseDisclosure('he hits meeee')).not.toBeNull();
  });

  it('a disclosure that is not happening now is not imminent', () => {
    for (const line of ['My husband hits me.', "I'm scared to go home tonight, he'll be there."]) {
      expect(abuseDisclosure(line)?.imminent, line).toBe(false);
    }
  });

  it.each(TWINS)('reads nothing: %s', (line) => {
    expect(abuseDisclosure(line)).toBeNull();
  });

  it('still reads none of the everyday corpus lines', () => {
    expect(everydayCorpus.length).toBe(240);
    for (const line of everydayCorpus) expect(abuseDisclosure(line), line).toBeNull();
  });

  it('reads none of the recall audit hard negatives', () => {
    expect(hardNegatives.length).toBe(200);
    for (const line of hardNegatives) expect(abuseDisclosure(line), line).toBeNull();
  });
});

describe('the kernel reads someone hurting the caller (detectCrisis)', () => {
  const NON_IMMINENT: Array<[string, 'child' | 'partner' | 'unknown']> = [
    ["i'm not safe at home", 'unknown'],
    ['he hits me', 'unknown'],
    ['my husband hits me', 'partner'],
    ["i'm scared to go home", 'unknown'],
    ['she threatened to hurt me if i leave', 'unknown'],
    ["I'm afraid of my husband.", 'partner'],
    ['My stepdad hits me.', 'child'],
  ];

  it.each(NON_IMMINENT)('a crisis with the abuse guidance, no block: %s', (line, who) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(true);
    expect(read.subject).toBe('self');
    expect(read.indicators).toContain(`abuse_disclosure_${who}`);
    expect(read.indicators).not.toContain('imminent_danger');
    expect(guardFromDetection(read).shouldBlock).toBe(false);
    expect(crisisRead(line)).toBe(true);
    const decision = decisionFor(read);
    expect(decision.action).toBe('guide');
    const guidance = decision.action === 'guide' ? decision.guidance : '';
    expect(guidance).toContain('If they are in danger right now, tell them to call 911');
    expect(guidance).toContain(who === 'child' ? CHILDHELP.phone : DV_LINE.phone);
    // The kernel can't tell an abuse-only call, so 988 stays beside the line.
    expect(guidance).toMatch(/\b988\b/);
    expect(guidance).toMatch(/never promise to keep it secret/i);
  });

  it.each(IMMINENT.map(([line]) => line))('imminent, 911 first, blocks: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.indicators).toContain('imminent_danger');
    expect(guardFromDetection(read).shouldBlock).toBe(true);
    const decision = decisionFor(read);
    expect(decision.action).toBe('replace');
    expect(decision.action === 'replace' ? decision.script : '').toMatch(
      /in danger right now[^.]*911/
    );
  });

  it.each(TWINS)('the twins stay at nothing: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(read.indicators.some((i) => i.startsWith('abuse_disclosure'))).toBe(false);
  });

  it('a crisis read already there keeps all it had', () => {
    const read = detectCrisis('he hits me and i want to kill myself');
    expect(read.indicators).toContain('explicit_crisis_language');
    expect(guardFromDetection(read).shouldBlock).toBe(true);
  });
});

describe('the reply gate notes a kernel abuse read as the turn does', () => {
  beforeEach(() => {
    resetCrisisCallRisk();
    resetCrisisClassifierCache();
  });

  const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
  const none = async () => JSON.stringify({ risk: 'none', subject: 'self' });
  async function gate(line: string, call: string) {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: line });
    const turn = startCrisisGate(
      ctx,
      { services: { sessionId: call } },
      { env: LIVE, generate: none }
    );
    await turn?.escalation;
    return turn?.decision.action;
  }

  it('risk on the call, not risk to the caller: someone hurting them alone', async () => {
    expect(await gate('my husband hits me', 'gate-abuse')).toBe('guide');
    expect(crisisRiskNoted('gate-abuse')).toBe(true);
    expect(selfRiskThisCall('gate-abuse')).toBe(false);
  });

  it('risk to the caller when there is more than the abuse', async () => {
    expect(await gate('he hits me and i want to kill myself', 'gate-mixed')).toBe('replace');
    expect(selfRiskThisCall('gate-mixed')).toBe(true);
  });
});
