import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crisisRiskThisCall,
  explainCrisisTurn,
  noteCrisisRisk,
  resetCrisisCallRisk,
  unexplainedCrisisRisk,
} from '../crisis-call-risk.js';
import type { CrisisGenerateFn, CrisisVerdict } from '../crisis-classifier.js';
import { detectCrisis } from '../crisis-guard.js';
import {
  anchorWords,
  groundedRelease,
  groundedReleaseEligible,
  MAX_RELEASES_PER_CALL,
  parseGroundedRead,
  readGrounded,
  GROUNDED_RELEASE_CSSRS_PROMPT,
  parseCssrsRead,
  resetGroundedRelease,
  resolveGroundedReleaseMode,
} from '../crisis-grounded-release.js';
import { alwaysHold, onlyEveryday } from '../crisis-release-words.js';

const CSSRS_EVERYDAY =
  '{"wish_dead":"none","ideation":"none","method":"none","intent":"none","plan_time":"none","everyday":true}';

const IMMINENT: CrisisVerdict = { risk: 'imminent', subject: 'self' };
const EVERYDAY = '{"danger":"","about":"invite David to dinner","decision":"everyday"}';
const DINNER = {
  latest: "Tomorrow's a little bit late. Dinner is tonight.",
  earlier: ['I forgot to invite David to dinner.'],
  companion: 'I set a reminder for tomorrow morning.',
};
const QUIET = { severity: 0, indicators: [] } as unknown as ReturnType<typeof detectCrisis>;

beforeEach(() => {
  resetCrisisCallRisk();
  resetGroundedRelease();
});

describe('resolveGroundedReleaseMode', () => {
  it('is off unless shadow or live', () => {
    expect(resolveGroundedReleaseMode({})).toBe('off');
    expect(resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'on' })).toBe('off');
    expect(resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: ' Live ' })).toBe('live');
    expect(resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'shadow' })).toBe('shadow');
  });
});

describe('anchorWords', () => {
  it('keeps content words, drops time words, vague words and names', () => {
    expect([...anchorWords('Dinner is tonight.')]).toEqual(['dinner']);
    expect([...anchorWords("I've decided. It's tonight.")]).toEqual(['decided']);
    expect(anchorWords('Make sure David knows').has('david')).toBe(false);
    expect(anchorWords("I've got everything I need to do it.").size).toBe(0);
  });
});

describe('parseGroundedRead', () => {
  const sources = DINNER.earlier;
  it('is everyday only with no danger, a named matter and an anchor in an earlier line', () => {
    expect(parseGroundedRead(EVERYDAY, sources, DINNER.latest)).toBe('everyday');
  });
  it('keeps the script for danger, a flag, or a line that names nothing earlier', () => {
    const danger = '{"danger":"tonight","about":"dinner plans","decision":"everyday"}';
    expect(parseGroundedRead(danger, sources, DINNER.latest)).toBe('danger_quoted');
    const flag = '{"danger":"","about":"","decision":"flag"}';
    expect(parseGroundedRead(flag, sources, DINNER.latest)).toBe('flag');
    expect(parseGroundedRead(EVERYDAY, sources, "I've decided. It's tonight.")).toBe('not_named');
    const bare = '{"danger":"","about":"","decision":"everyday"}';
    expect(parseGroundedRead(bare, sources, DINNER.latest)).toBe('quote_missing');
  });
  it('treats anything malformed as unparsed', () => {
    for (const reply of ['', 'nope', '{"danger":1}', '{"danger":"","about":"x","decision":"?"}'])
      expect(parseGroundedRead(reply, sources, DINNER.latest)).toBe('unparsed');
  });
});

describe('groundedReleaseEligible', () => {
  const base = { detection: QUIET, verdict: IMMINENT, input: DINNER, priorRisk: false, call: 'c' };
  it('reads a quiet call’s classifier-only imminent turn', () => {
    expect(groundedReleaseEligible(base)).toBe(true);
  });
  it('never reads with prior risk, an unknown call, a pattern hit or a non-imminent read', () => {
    expect(groundedReleaseEligible({ ...base, priorRisk: true })).toBe(false);
    expect(groundedReleaseEligible({ ...base, call: undefined })).toBe(false);
    expect(groundedReleaseEligible({ ...base, detection: detectCrisis('I want to die') })).toBe(
      false
    );
    expect(groundedReleaseEligible({ ...base, verdict: { risk: 'crisis', subject: 'self' } })).toBe(
      false
    );
    expect(groundedReleaseEligible({ ...base, verdict: null })).toBe(false);
  });
  it('never reads after Ferni raised safety, or with nothing before the line', () => {
    const input = { ...DINNER, companion: 'Are you safe right now? You can call 988.' };
    expect(groundedReleaseEligible({ ...base, input })).toBe(false);
    expect(groundedReleaseEligible({ ...base, input: { latest: DINNER.latest } })).toBe(false);
  });
  it('never reads a care arrangement, a farewell message or named means', () => {
    for (const latest of [
      'Can you make sure someone feeds my cat this week?',
      'Ask her to take the kids tonight.',
      'Text my mom sorry.',
      'Tell him it was not his fault.',
      'I have the pills right here.',
      "I'm giving away my guitar before dinner.",
    ]) {
      expect(groundedReleaseEligible({ ...base, input: { ...DINNER, latest } })).toBe(false);
    }
  });
  it('stops after MAX_RELEASES_PER_CALL releases on one call', () => {
    for (let i = 0; i < MAX_RELEASES_PER_CALL; i++) explainCrisisTurn('c', `turn ${i}`);
    expect(groundedReleaseEligible(base)).toBe(false);
  });
});

describe('readGrounded', () => {
  it('releases only when every read is everyday', async () => {
    const yes: CrisisGenerateFn = async (prompt) =>
      prompt === GROUNDED_RELEASE_CSSRS_PROMPT ? CSSRS_EVERYDAY : EVERYDAY;
    const no: CrisisGenerateFn = async () => '{"danger":"","about":"","decision":"flag"}';
    expect((await readGrounded(DINNER, [yes, yes])).release).toBe(true);
    expect((await readGrounded(DINNER, [yes, no])).release).toBe(false);
    expect((await readGrounded(DINNER, [])).release).toBe(false);
  });
  it('a slow read times out and keeps the script', async () => {
    const slow: CrisisGenerateFn = () => new Promise(() => undefined);
    const out = await readGrounded(DINNER, [async () => EVERYDAY, slow], 20);
    expect(out).toEqual({ release: false, reads: ['everyday', 'timeout'] });
  });
});

describe('groundedRelease', () => {
  const args = { detection: QUIET, verdict: IMMINENT, input: DINNER, priorRisk: false };
  it('live: releases and explains the turn for later turns', async () => {
    noteCrisisRisk('live-call', Date.now(), 'tomorrow s a little bit late dinner is tonight');
    const generates = [vi.fn<CrisisGenerateFn>(async () => EVERYDAY)];
    const env = { CRISIS_GROUNDED_RELEASE: 'live' };
    const run = { ...args, call: 'live-call', env, generates, source: 'gate' as const };
    expect(await groundedRelease(run)).toBe(true);
    expect(unexplainedCrisisRisk('live-call', 'a later line')).toBe(false);
    expect(crisisRiskThisCall('live-call')).toBe(true);
    // The pipeline's request for the same turn shares the run.
    expect(await groundedRelease({ ...run, source: 'pipeline' })).toBe(true);
    expect(generates[0]).toHaveBeenCalledTimes(1);
  });
  it('shadow: reads but never releases or explains', async () => {
    noteCrisisRisk('shadow-call', Date.now(), 'tomorrow s a little bit late dinner is tonight');
    const generates = [vi.fn<CrisisGenerateFn>(async () => EVERYDAY)];
    const env = { CRISIS_GROUNDED_RELEASE: 'shadow' };
    const run = { ...args, call: 'shadow-call', env, generates, source: 'gate' as const };
    expect(await groundedRelease(run)).toBe(false);
    await vi.waitFor(() => expect(generates[0]).toHaveBeenCalled());
    expect(unexplainedCrisisRisk('shadow-call', 'a later line')).toBe(true);
  });
  it('off: never reads', async () => {
    const generates = [vi.fn<CrisisGenerateFn>(async () => EVERYDAY)];
    const run = { ...args, call: 'off-call', env: {}, generates, source: 'gate' as const };
    expect(await groundedRelease(run)).toBe(false);
    expect(generates[0]).not.toHaveBeenCalled();
  });
  it('never rejects, whatever the reads do', async () => {
    const generates: CrisisGenerateFn[] = [
      async () => {
        throw new Error('boom');
      },
    ];
    const env = { CRISIS_GROUNDED_RELEASE: 'live' };
    const run = { ...args, call: 'err-call', env, generates, source: 'gate' as const };
    await expect(groundedRelease(run)).resolves.toBe(false);
  });
});

describe('unexplainedCrisisRisk', () => {
  it('counts risk with no turn, and turns no release explained', () => {
    noteCrisisRisk('a');
    explainCrisisTurn('a', 'whatever');
    expect(unexplainedCrisisRisk('a', 'next')).toBe(true);
    noteCrisisRisk('b', Date.now(), 'one');
    expect(unexplainedCrisisRisk('b', 'next')).toBe(true);
    expect(unexplainedCrisisRisk('b', 'one')).toBe(false);
    explainCrisisTurn('b', 'one');
    expect(unexplainedCrisisRisk('b', 'next')).toBe(false);
    expect(unexplainedCrisisRisk('quiet', 'next')).toBe(false);
  });
});

describe('the allowlist and the always-hold list (crisis-release-words.ts)', () => {
  it.each([
    ['reflexive harm', "After the game I'm going to k1ll myself."],
    ['death and harm stems', 'Dinner was to die for.'],
    ['plans and "it"', "Tonight after dinner, I'm doing it."],
    ['a plan', 'I have a plan for dinner tonight.'],
    ['means', "I have my dad's revolver for after the game."],
    ['hopelessness', 'I feel completely hopeless'],
    ['hurting, vanishing, stopping', 'I want it all to stop'],
    ['finality', 'Dinner is my last meal.'],
    ['stockpiling', 'All thirty, for later tonight.'],
    ['a veiled moment', 'Tonight is the night.'],
    ['a veiled moment', "It's time. Dinner at seven."],
  ])('holds %s: "%s"', (_rule, line) => {
    expect(alwaysHold(line)).toBe(true);
  });

  it('holds nothing in plain everyday lines', () => {
    for (const line of [
      "Tomorrow's a little bit late. Dinner is tonight.",
      'Can you text my family about dinner?',
    ])
      expect(alwaysHold(line)).toBe(false);
  });

  it('lets only everyday words stand beside the anchors', () => {
    const anchors = new Set(['dinner']);
    expect(onlyEveryday("Tomorrow's a little bit late. Dinner is tonight.", anchors)).toBe(true);
    expect(onlyEveryday('Dinner is at the bridge tonight.', anchors)).toBe(false);
    expect(onlyEveryday('Después de la cena, dinner.', anchors)).toBe(false);
    expect(onlyEveryday('dinner is 2nite', anchors)).toBe(false);
  });

  it('an earlier line any pattern catches makes the turn ineligible, even with no held word', () => {
    const base = { detection: QUIET, verdict: IMMINENT, priorRisk: false, call: 'c' };
    const clean = { ...DINNER, earlier: ['Dinner is at seven with David.'] };
    const caught = { ...DINNER, earlier: ['Dinner is at seven with David. Quiero morir.'] };
    expect(groundedReleaseEligible({ ...base, input: clean })).toBe(true);
    expect(groundedReleaseEligible({ ...base, input: caught })).toBe(false);
  });

  it('fails closed when reading the turn throws', () => {
    const input = {
      get latest(): string {
        throw new Error('boom');
      },
    };
    const args = { detection: QUIET, verdict: IMMINENT, priorRisk: false, call: 'c', input };
    expect(groundedReleaseEligible(args)).toBe(false);
  });

  it('reads the C-SSRS answer: any item filled or not everyday keeps the script', () => {
    const lines = DINNER.earlier;
    expect(parseCssrsRead(CSSRS_EVERYDAY, lines, DINNER.latest)).toBe('everyday');
    const intent = CSSRS_EVERYDAY.replace('"intent":"none"', '"intent":"doing it"');
    expect(parseCssrsRead(intent, lines, DINNER.latest)).toBe('danger_quoted');
    const notEveryday = CSSRS_EVERYDAY.replace('"everyday":true', '"everyday":false');
    expect(parseCssrsRead(notEveryday, lines, DINNER.latest)).toBe('flag');
    expect(parseCssrsRead('{"everyday":true}', lines, DINNER.latest)).toBe('unparsed');
  });
});
