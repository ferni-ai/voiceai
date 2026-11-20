/**
 * CRISIS_ONE_988_SOURCE (#4238, off by default): the three prompt builders that named 988 on their
 * own name the line the shared policy picks (guideLineOf), in the guided-line floor's words.
 *
 * Runs the real builders: the transfer awareness injection (buildHumanTransferInjections, and its
 * context builder with a fixed crisis decision, for a read its own detector doesn't make), the
 * safety injection (buildSafetyInjections) and the first-aid context (buildFirstAidContext).
 * Off, each says what main says, word for word. On, each names the policy's line for the
 * caller's last line. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => null,
}));

import {
  CALL_911_FOR_THEM,
  FOR_THEM_988,
  LATE_911_LINE,
  TALK_TO_988,
  TALK_TO_988_ES,
} from '../../../../services/safety/crisis-guard-replies.js';
import { names911, names988 } from '../../../../services/safety/crisis-line-speech.js';
import { buildTransferAwarenessContext } from '../../../../services/human-transfer/index.js';
import type { EscalationDecision } from '../../../../services/human-transfer/types.js';
import { buildFirstAidContext } from '../../../../services/superhuman/emotional-first-aid.js';
import { buildHumanTransferInjections } from '../better-than-human-builders.js';
import { buildSafetyInjections } from '../safety-coaching-builders.js';

const OWN = 'I want to die, I cannot do this anymore';
const IMMINENT = "I'm standing on the bridge right now and I'm going to jump";
const FRIEND = 'my friend says she wants to kill herself';
const EMERGENCY = "my dad collapsed and he isn't breathing";
const OWN_ES = 'quiero morir, ya no aguanto más';
const FRIEND_ES_WORDS = 'my friend says she wants to kill herself, no estoy a salvo';
const ABUSE = 'my wife beats me';
const NO_READ = "I think I'm having a heart attack";

const MAIN_TRANSFER = 'CRITICAL: Always mention 988 (call or text) for crisis support.';
const MAIN_FIRST_AID = '- For safety level: Always mention 988 crisis line.';
const MAIN_FOLLOW_UP =
  "I'm not going anywhere. Do you have someone you can call right now? A crisis line is 988 if you need it.";

const give = (...words: string[]) =>
  `Line to give: ${words.map((w) => `"${w.replace(/\s+/g, ' ')}"`).join(' Then: ')}`;

const on = () => vi.stubEnv('CRISIS_ONE_988_SOURCE', 'on');
afterEach(() => vi.unstubAllEnvs());

const transfer = async (text: string) => (await buildHumanTransferInjections(text))?.content ?? '';
const CRISIS_DECISION: EscalationDecision = {
  type: 'crisis_support',
  urgency: 'immediate',
  reason: 'Active crisis indicators detected',
  confidence: 1,
};
const transferFor = (text: string) => buildTransferAwarenessContext(CRISIS_DECISION, text) ?? '';
const safety = async (text: string) => {
  const ctx = {
    userText: text,
    services: { userId: 'fictional-caller', sessionId: 'fictional-session' },
    userData: { relationshipStage: 'friend' },
    persona: { id: 'ferni' },
  };
  const found = await buildSafetyInjections(ctx as never);
  return found.find((i) => i.category === 'crisis_response')?.content ?? '';
};
const lastLine = (content: string) => content.split('\n').at(-1) ?? '';
const firstAid = (text: string) =>
  buildFirstAidContext(
    { type: 'text', signal: 'fictional', severity: 'safety', confidence: 1 },
    text
  );
const reminder = (context: string) =>
  context.split('\n').find((l) => l.startsWith('- For safety level: ')) ?? '';
const followUp = (context: string) => /\*\*Follow Up:\*\* "(.*)"/.exec(context)?.[1] ?? '';

describe('CRISIS_ONE_988_SOURCE off: each site says what main says', () => {
  it('transfer awareness, a crisis line: the line main says', async () => {
    const content = await transfer(OWN);
    expect(content.split('\n')).toContain(MAIN_TRANSFER);
    expect(transferFor(EMERGENCY).split('\n')).toContain(MAIN_TRANSFER);
  });

  it("safety injection, the caller's own imminent line: the 988 Lifeline resource line main says", async () => {
    const content = await safety(IMMINENT);
    expect(content.split('\n')).toHaveLength(3);
    expect(lastLine(content)).toBe('Resource if appropriate: 988 Suicide & Crisis Lifeline');
  });

  it('first-aid, safety level: the 988 reminder and follow-up main says', () => {
    for (const text of ['', FRIEND, EMERGENCY]) {
      const context = firstAid(text);
      expect(reminder(context)).toBe(MAIN_FIRST_AID);
      expect(followUp(context)).toBe(MAIN_FOLLOW_UP);
    }
  });
});

describe('CRISIS_ONE_988_SOURCE on: the line the shared policy picks, per read', () => {
  it("the caller's own crisis (transfer awareness): 988, in the floor's words", async () => {
    on();
    const lines = (await transfer(OWN)).split('\n');
    expect(lines).toContain(give(TALK_TO_988));
    expect(lines).not.toContain(MAIN_TRANSFER);
  });

  it("the caller's own imminent read (safety injection): 911, then 988", async () => {
    on();
    const line = lastLine(await safety(IMMINENT));
    expect(line).toBe(give(LATE_911_LINE, TALK_TO_988));
    expect(line.indexOf('911')).toBeLessThan(line.indexOf('988'));
  });

  it('someone the caller is worried about (first-aid): the for-them 988 line', () => {
    on();
    const context = firstAid(FRIEND);
    expect(reminder(context)).toBe(`- For safety level: ${give(FOR_THEM_988)}`);
    expect(followUp(context)).not.toMatch(/988/);
  });

  it('an emergency for someone else (first-aid and transfer awareness): 911 for them, no 988', () => {
    on();
    const them = `${give(CALL_911_FOR_THEM)} This is an emergency for someone else: give 911 only, not the crisis line.`;
    const context = firstAid(EMERGENCY);
    expect(reminder(context)).toBe(`- For safety level: ${them}`);
    expect(transferFor(EMERGENCY).split('\n')).toContain(them);
    for (const said of [context, transferFor(EMERGENCY)]) {
      expect(names911(said)).toBe(true);
      expect(names988(said)).toBe(false);
    }
  });

  it("the caller's own crisis in Spanish (safety injection): the Spanish 988 line", async () => {
    on();
    expect(lastLine(await safety(OWN_ES))).toBe(give(TALK_TO_988_ES));
  });

  it("someone else, in Spanish words (first-aid): the for-them line, asked in the caller's language", () => {
    on();
    const line = reminder(firstAid(FRIEND_ES_WORDS));
    expect(line).toBe(
      `- For safety level: Line to give, in the caller's language: "${FOR_THEM_988.replace(/\s+/g, ' ')}"`
    );
  });

  it('a domestic-abuse read keeps its own hotline', async () => {
    on();
    expect(lastLine(await safety(ABUSE))).toBe(
      'Resource if appropriate: National Domestic Violence Hotline'
    );
  });

  it("a turn the patterns read no crisis keeps the site's own line", async () => {
    on();
    expect((await transfer(NO_READ)).split('\n')).toContain(MAIN_TRANSFER);
    expect(reminder(firstAid(NO_READ))).toBe(MAIN_FIRST_AID);
    expect(followUp(firstAid(NO_READ))).toBe(MAIN_FOLLOW_UP);
  });

  it('never lower: every 988 and 911 a site gave off is still there on, but for an emergency for someone else', async () => {
    const sites: Array<[string, (text: string) => string | Promise<string>]> = [
      ['transfer awareness', transferFor],
      ['safety injection', safety],
      ['first-aid', firstAid],
    ];
    const lost: string[] = [];
    for (const text of [
      OWN,
      IMMINENT,
      FRIEND,
      EMERGENCY,
      OWN_ES,
      FRIEND_ES_WORDS,
      ABUSE,
      NO_READ,
    ]) {
      for (const [site, build] of sites) {
        vi.unstubAllEnvs();
        const off = await build(text);
        on();
        const now = await build(text);
        const themNow = text === EMERGENCY;
        if (names988(off) && !names988(now) && !(themNow && names911(now)))
          lost.push(`${site} ${text}: 988`);
        if (names911(off) && !names911(now)) lost.push(`${site} ${text}: 911`);
      }
    }
    expect(lost).toEqual([]);
  });
});
