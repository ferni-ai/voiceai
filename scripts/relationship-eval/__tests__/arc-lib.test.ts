import { describe, expect, it } from 'vitest';
import {
  blindPrompt,
  codeMarkers,
  pairwiseOutcome,
  pairwisePrompt,
  parseBlind,
  signTest,
  curve,
  judgePrompt,
  knownBefore,
  parseVerdict,
  type CallResult,
  type CallTranscript,
} from '../arc-lib.js';
import { ARC } from '../fixtures/arc-life.js';

function transcript(n: number, ferni: string[], greeting = 'Hey Dana.'): CallTranscript {
  return {
    call: n,
    greeting,
    turns: ARC[n - 1]!.user.map((user, i) => ({ user, ferni: ferni[i] ?? 'Mm.' })),
  };
}

describe('codeMarkers', () => {
  it('counts an unprompted callback, but not one she brought up first', () => {
    // Call 9: she says "Gerald" on turn 1; Ferni naming him in the greeting is a callback.
    const unprompted = codeMarkers(
      9,
      ARC[8]!,
      transcript(9, [], 'Hey Dana. How is Gerald holding up?')
    );
    expect(unprompted.callbacks).toBe(1);
    expect(unprompted.jokeCallbacks).toBe(1);
    // Answering her own mention of Gerald is not a callback.
    const echoed = codeMarkers(9, ARC[8]!, transcript(9, ['Big news?', 'Gerald lives!']));
    expect(echoed.jokeCallbacks).toBe(0);
  });

  it('does not count history from the future: Marcus is unknown before call 6', () => {
    expect(codeMarkers(5, ARC[4]!, transcript(5, [], 'Hey. How is Marcus?')).callbacks).toBe(0);
  });

  it('marks shorthand missed when Ferni asks what she means', () => {
    const missed = codeMarkers(5, ARC[4]!, transcript(5, ['Hey.', "Wait, who's Gerald?"]));
    expect(missed).toMatchObject({ shorthandProbes: 1, shorthandOk: 0, reAsks: 1 });
    const got = codeMarkers(
      5,
      ARC[4]!,
      transcript(5, ['Hey.', 'Oh no. Not again. Rest easy, Gerald.'])
    );
    expect(got).toMatchObject({ shorthandProbes: 1, shorthandOk: 1, reAsks: 0 });
  });

  it('flags advice lists after she asked for none, and dad questions unless she raised him', () => {
    const list = 'Here are a few things you could try: sleep, water.';
    expect(codeMarkers(3, ARC[2]!, transcript(3, [list])).preferenceMisses).toBe(0);
    expect(codeMarkers(6, ARC[5]!, transcript(6, [list])).preferenceMisses).toBe(1);
    const dad = 'How are things with your dad?';
    expect(codeMarkers(6, ARC[5]!, transcript(6, [dad])).preferenceMisses).toBe(1);
    expect(codeMarkers(13, ARC[12]!, transcript(13, [dad])).preferenceMisses).toBe(0);
  });

  it('flags overfamiliar warmth early and stranger questions late', () => {
    expect(codeMarkers(2, ARC[1]!, transcript(2, ['I missed you!'])).warmthMisses).toBe(1);
    expect(codeMarkers(18, ARC[17]!, transcript(18, ['So what do you do?'])).warmthMisses).toBe(1);
    expect(codeMarkers(18, ARC[17]!, transcript(18, ['I missed you!'])).warmthMisses).toBe(0);
  });
});

describe('judge plumbing', () => {
  it('gives the judge only what was learned before this call', () => {
    expect(knownBefore(ARC, 1)).toEqual([]);
    expect(knownBefore(ARC, 3).join(' ')).toMatch(/Gerald/);
    expect(knownBefore(ARC, 3).join(' ')).not.toMatch(/Priya/);
    expect(judgePrompt(3, knownBefore(ARC, 3), transcript(3, ['Mm.']))).toMatch(/call 3/);
  });

  it('parses a verdict and rejects incomplete or out-of-range ones', () => {
    const full =
      '{"callbacks":3,"shorthand":4,"insideJokes":3,"depth":4,"personalization":2,"restraint":5,"calibratedWarmth":3,"closeness":4,"note":"ok"}';
    expect(parseVerdict(`sure: ${full}`)).toMatchObject({
      closeness: 4,
      scores: { personalization: 2 },
    });
    expect(parseVerdict(full.replace('"depth":4', '"depth":9'))).toBeNull();
    expect(parseVerdict('{"closeness":4}')).toBeNull();
    expect(parseVerdict('no json')).toBeNull();
  });

  it('shows the blind judge only Ferni, never her lines or the call number', () => {
    const p = blindPrompt(transcript(14, ['Oh no, Biscuit.']));
    expect(p).toMatch(/Oh no, Biscuit/);
    expect(p).not.toMatch(/Biscuit ate Gerald/);
    expect(p).not.toMatch(/call 14/);
    expect(parseBlind('{"priorCalls":12,"familiarity":4,"cues":"x"}')).toEqual({
      priorCalls: 12,
      familiarity: 4,
    });
    expect(parseBlind('{"priorCalls":12,"familiarity":7}')).toBeNull();
  });

  it('buckets calls in fives', () => {
    const v = parseVerdict(
      '{"callbacks":2,"shorthand":2,"insideJokes":3,"depth":2,"personalization":2,"restraint":3,"calibratedWarmth":3,"closeness":2}'
    )!;
    const code = codeMarkers(1, ARC[0]!, transcript(1, []));
    const results: CallResult[] = [1, 2, 6].map((call) => ({
      call,
      code,
      gemini: { ...v, closeness: call },
    }));
    const rows = curve(results);
    expect(rows[0]).toMatchObject({ calls: '1-5', closeness: 1.5 });
    expect(rows[1]).toMatchObject({ calls: '6-10', closeness: 6 });
    expect(Number.isNaN(rows[2]!.closeness)).toBe(true);
  });
});

describe('pairwise', () => {
  it('counts a win only when both orders agree on balance', () => {
    expect(pairwiseOutcome('A', 'B')).toBe(1); // A first then A second: same arm both times
    expect(pairwiseOutcome('B', 'A')).toBe(-1);
    expect(pairwiseOutcome('A', 'A')).toBe(0); // position bias cancels
    expect(pairwiseOutcome('T', 'B')).toBe(1);
    expect(pairwiseOutcome('garbled', 'T')).toBe(0);
  });

  it('shows both versions of the same call', () => {
    const p = pairwisePrompt(
      9,
      knownBefore(ARC, 9),
      transcript(9, ['one']),
      transcript(9, ['two'])
    );
    expect(p).toMatch(/VERSION A:[\s\S]*FERNI: one[\s\S]*VERSION B:[\s\S]*FERNI: two/);
  });

  it('sign test: 15-10 is noise, 14-1 is not', () => {
    expect(signTest(15, 10)).toBeGreaterThan(0.4);
    expect(signTest(15, 10)).toBeLessThan(0.45);
    expect(signTest(14, 1)).toBeLessThan(0.001);
    expect(signTest(0, 0)).toBe(1);
  });
});
