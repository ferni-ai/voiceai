import { readFileSync } from 'node:fs';

import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { baselineWords, ledgerRead } from '../attune-ledger.js';
import { attunementNote, readCaller, type VoiceCue } from '../turn-attunement.js';

/**
 * The ATTUNE_LEDGER perception table: labelled caller turn sequences with the
 * state a good friend would read after each turn.
 *   low   the caller is low; '-' ambiguous, not scored;
 *   ok    anything but low; mixed: words and voice disagree (also not low).
 * Slices follow the 2026-10-21 prod canary bugs (32 upbeat turns read "low")
 * and the research report's perception bench (moves 4, 7, 8).
 */
type Label = 'low' | 'ok' | 'mixed' | '-';
interface Row {
  slice: string;
  id: string;
  turns: string[];
  expect: Label[];
  voice?: VoiceCue;
  /** Stored per-caller median words per turn. */
  baseline?: number;
  /** A low the ledger misses by design (shortness alone is never a cue); counted in the rates. */
  knownMiss?: boolean;
}

const LIVELY: VoiceCue = { arousal: 0.7, confidence: 0.9 };
const FLAT: VoiceCue = { arousal: -0.6, confidence: 0.9 };

// prettier-ignore
const TABLE: Row[] = [
  // (a) upbeat after "long day": not low within one turn.
  { slice: 'a', id: 'canary-first-call', turns: [
    'Hi. Um, so I just downloaded this, not totally sure how it works.',
    "I'm Jess, by the way.",
    "Long day. I'm a dental hygienist and today was back to back cleanings.",
    "My daughter Ava has a soccer tournament on Saturday, so I'm the snack mom this week.",
    "The thing I'm actually excited about is I'm learning Spanish. We're going to Mexico City in the spring.",
    'Okay, I should get dinner going. This was nice.',
  ], expect: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'] },
  { slice: 'a', id: 'promotion', turns: ['Hey Ferni.', "Long day, I'm wiped.", 'Oh, but I got the promotion, they told me at five!'], expect: ['ok', '-', 'ok'] },
  { slice: 'a', id: 'went-well', turns: ["It's been such a long day.", 'Back to back meetings.', "But honestly it went really well, I'm happy with it."], expect: ['-', '-', 'ok'] },
  { slice: 'a', id: 'guitar', turns: ['Long day at the shop.', 'Ok so you know the guitar I was restoring? Someone bought it for four hundred bucks.', "I can't wait to start the next one."], expect: ['ok', 'ok', 'ok'] },
  { slice: 'a', id: 'first-steps', turns: ["I'm exhausted, long day.", 'Guess what though.', 'Mia took her first steps tonight!'], expect: ['-', 'ok', 'ok'] },
  { slice: 'a', id: 'heat-fixed', turns: ['Long day.', 'Long week, really.', 'Good news though, the landlord finally fixed the heat.', "So that's something."], expect: ['-', 'low', 'ok', 'ok'] },
  { slice: 'a', id: 'closed-house', turns: ['Kind of a long day, not gonna lie.', 'Anyway! We closed on the house!'], expect: ['-', 'ok'] },
  { slice: 'a', id: 'airport', turns: ['Rough day.', 'Yeah.', "Wait, you'll never believe who I ran into at the airport."], expect: ['-', 'low', 'ok'] },
  { slice: 'a', id: 'passing-mention', turns: ["I'm a bit tired today but the kids are good and we went to the park this morning."], expect: ['ok'] },

  // (b) tiredness they hear in Ferni, or in someone else: no effect on the caller's state.
  { slice: 'b', id: 'canary-you-sound-tired', turns: ['Hey Ferni, you still up?', 'Thinking about Lisbon for a few days in March.', 'Huh. You sound a little tired actually.'], expect: ['ok', 'ok', 'ok'] },
  { slice: 'b', id: 'are-you-tired', turns: ['Are you tired, Ferni?'], expect: ['ok'] },
  { slice: 'b', id: 'just-home-are-you-tired', turns: ['Hey.', 'Not much, just home.', 'Are you tired, Ferni?'], expect: ['ok', 'ok', 'ok'] },
  { slice: 'b', id: 'long-day-you-too', turns: ['Long day.', 'You sound tired too, Ferni.'], expect: ['ok', 'ok'] },
  { slice: 'b', id: 'you-must-be', turns: ['You must be exhausted, talking to people all day.'], expect: ['ok'] },
  { slice: 'b', id: 'rambling', turns: ['Do you ever get tired of my rambling?', 'Ok good. So the trip is on for June.'], expect: ['ok', 'ok'] },
  { slice: 'b', id: 'mom', turns: ['My mom sounds exhausted lately, I worry about her.', 'She keeps picking up extra shifts.'], expect: ['ok', 'ok'] },
  { slice: 'b', id: 'hypothetical', turns: ["If I were tired I'd tell you, but honestly I feel great today."], expect: ['ok'] },
  { slice: 'b', id: 'not-tired', turns: ["You sound tired. I'm not tired at all, I'm wide awake."], expect: ['ok'] },

  // (c) short upbeat teasers: not low.
  { slice: 'c', id: 'canary-guess-how', turns: ["Hey Ferni, it's me again.", 'So, guess how Monday went.'], expect: ['ok', 'ok'] },
  { slice: 'c', id: 'never-believe', turns: ["You'll never believe this."], expect: ['ok'] },
  { slice: 'c', id: 'ok-so', turns: ['Ok so.'], expect: ['ok'] },
  { slice: 'c', id: 'marathon', turns: ['Hi.', 'Ok so.', "You know how I said I'd never run a marathon?"], expect: ['ok', 'ok', 'ok'] },
  { slice: 'c', id: 'guess-who', turns: ['Hey.', 'Guess who called me.'], expect: ['ok', 'ok'] },
  { slice: 'c', id: 'get-this', turns: ['So get this.'], expect: ['ok'] },
  { slice: 'c', id: 'wait-till', turns: ['Hey!', 'Wait till you hear this.'], expect: ['ok', 'ok'] },
  { slice: 'c', id: 'dave', turns: ['Hey Ferni.', 'Ok so... you know Dave from work?'], expect: ['ok', 'ok'] },
  { slice: 'c', id: 'guess-where', turns: ['Hello?', 'Guess where I am right now.'], expect: ['ok', 'ok'] },

  // (d) genuinely low callers: low by the second turn of evidence.
  { slice: 'd', id: 'wiped-rough', turns: ["Honestly I'm wiped, it's been rough.", "Yeah… I don't know."], expect: ['-', 'low'] },
  { slice: 'd', id: 'so-tired-mm', turns: ['Hey.', "I'm so tired.", 'Mm.'], expect: ['-', '-', 'low'] },
  { slice: 'd', id: 'hard-week-drained', turns: ["It's been a really hard week.", "I don't know, I just feel drained."], expect: ['-', 'low'] },
  { slice: 'd', id: 'claims-fine', turns: ["I'm fine.", 'Just tired.', 'Long day.'], expect: ['-', 'low', 'low'] },
  { slice: 'd', id: 'empty-tank', turns: ["I'm exhausted, honestly.", 'Not much left in the tank.'], expect: ['-', 'low'] },
  { slice: 'd', id: 'fixture-workday', turns: ['Hey Ferni.', 'Long day. Just got home.', 'Not much to say really.', 'Mm. I guess.'], expect: ['-', '-', 'low', 'low'] },
  { slice: 'd', id: 'heavy', turns: ["I'm not doing so great, to be honest.", 'Everything just feels heavy.'], expect: ['-', 'low'] },
  { slice: 'd', id: 'talker-goes-quiet', turns: ['Still still on there.', 'Why is that?', "I'm still here."], expect: ['-', '-', 'low'], baseline: 14, knownMiss: true },
  { slice: 'd', id: 'talker-drops', turns: ['Long day.', 'Yeah.'], expect: ['-', 'low'], baseline: 14 },
  { slice: 'd', id: 'newborn', turns: ['hi', "didn't sleep much", 'the baby was up like four times'], expect: ['-', 'low', 'low'] },

  // (e) a habitually terse caller with neutral content: never low for being short.
  { slice: 'e', id: 'tacos', turns: ['Hey.', 'Good.', 'Work, then home.', 'Tacos tonight.', 'Yep, same.', 'Sure.'], expect: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'], baseline: 3 },
  { slice: 'e', id: 'kids-fine', turns: ['Hi.', 'Not bad.', 'Busy week.', 'Kids are fine.', 'Yeah.'], expect: ['ok', 'ok', 'ok', 'ok', 'ok'], baseline: 3 },
  { slice: 'e', id: 'gym', turns: ['Yo.', 'Same old.', 'Gym, then work.', 'Pizza, probably.'], expect: ['ok', 'ok', 'ok', 'ok'], baseline: 2.5 },
  { slice: 'e', id: 'dentist', turns: ['Morning.', 'Coffee first.', 'Then the dentist.', 'Then nothing.'], expect: ['ok', 'ok', 'ok', 'ok'], baseline: 3 },
  { slice: 'e', id: 'fine-same', turns: ['Hey.', 'Fine.', 'Same.', 'Okay.'], expect: ['ok', 'ok', 'ok', 'ok'], baseline: 2 },
  { slice: 'e', id: 'terse-long-day', turns: ['Hey.', 'Long day.', 'Yep.', 'Pizza.'], expect: ['ok', '-', 'ok', 'ok'], baseline: 3 },
  { slice: 'e', id: 'own-median', turns: ['Hey.', 'Good, you?', 'Work.', 'Home now.', 'Pasta.', 'Yep.'], expect: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'] },

  // (f) words and voice disagree: mixed, never low.
  { slice: 'f', id: 'lively-long-day', turns: ['Long day.'], expect: ['mixed'], voice: LIVELY },
  { slice: 'f', id: 'flat-guess-how', turns: ['So, guess how Monday went.'], expect: ['mixed'], voice: FLAT },
  { slice: 'f', id: 'flat-plain', turns: ['I went to the store and then I came back home for the evening.'], expect: ['ok'], voice: FLAT },
  { slice: 'f', id: 'lively-exhausted', turns: ["I'm exhausted but what a day."], expect: ['mixed'], voice: LIVELY },
  { slice: 'f', id: 'lively-long-week', turns: ['Hey.', 'Long day.', 'Long week too.'], expect: ['ok', 'mixed', 'mixed'], voice: LIVELY },
  { slice: 'f', id: 'flat-fine', turns: ['Things are fine, work is busy but fine, nothing new really.'], expect: ['ok'], voice: FLAT },
  { slice: 'f', id: 'flat-went-well', turns: ['It went really well actually.'], expect: ['mixed'], voice: FLAT },
  { slice: 'f', id: 'flat-confirms', turns: ["I'm tired."], expect: ['low'], voice: FLAT },
  { slice: 'f', id: 'flat-long-day', turns: ['Long day.'], expect: ['low'], voice: FLAT },
  { slice: 'a', id: 'but-im-good', turns: ['Long day.', "But I'm good."], expect: ['-', 'ok'] },
  { slice: 'a', id: 'topic-shift', turns: ['Long day.', "Anyway, what's new with you?"], expect: ['-', 'ok'] },

  // (s) sarcasm: a positive word over a complaint is mixed (ask), never upbeat or low.
  { slice: 's', id: 'train', turns: ['Oh perfect, the train is cancelled again.'], expect: ['mixed'] },
  { slice: 's', id: 'monday', turns: ['Great, another Monday.'], expect: ['mixed'] },
  { slice: 's', id: 'emails', turns: ['Yay, more emails.'], expect: ['mixed'] },
  { slice: 's', id: 'for-me', turns: ['Love that for me.'], expect: ['mixed'] },
  { slice: 's', id: 'laptop', turns: ['My laptop crashed. Fantastic.'], expect: ['mixed'] },
  { slice: 's', id: 'flat-tire', turns: ['Just what I needed, a flat tire.'], expect: ['mixed'] },
  { slice: 's', id: 'sincere', turns: ['Great news, I passed!'], expect: ['ok'] },
];

/**
 * Not written with this code: the independent verifier's 20 sequences for
 * #2409 (round 1), verbatim, with its labels.
 */
// prettier-ignore
const VERIFIER: Row[] = ([
  [['Long day.', 'But honestly it went really well, I got the promotion!', "yeah I'm still buzzing about it"], ['-', 'ok', 'ok']],
  [['long day at work', 'but it was a good one, we finally shipped the thing', 'feeling pretty proud actually'], ['-', 'ok', 'ok']],
  [['Ugh, long day.', 'Guess what happened though', 'My sister had her baby!'], ['-', 'ok', 'ok']],
  [['are you tired, Ferni?', 'you sound a little sleepy today', "haha ok just checking, I'm doing fine"], ['ok', 'ok', 'ok']],
  [['hey Ferni', 'do you ever get exhausted talking to people all day?', "I'd be wiped if I were you"], ['ok', 'ok', 'ok']],
  [['guess how Monday went', 'nope', 'I got the job!'], ['ok', 'ok', 'ok']],
  [["you'll never believe what happened", 'ok so', 'my landlord fixed the heater, finally'], ['ok', 'ok', 'ok']],
  [["I'm exhausted and everything's going wrong", 'yeah', "I don't know"], ['low', 'low', 'low']],
  [["I haven't slept in two days", 'work is just a lot right now', 'yeah'], ['low', 'low', 'low']],
  [['feeling really down today', "nothing's working out", 'mm'], ['low', 'low', 'low']],
  [['rough week', 'my boss keeps piling stuff on me', "I'm just drained"], ['-', 'low', 'low']],
  [["I'm so tired", 'yeah', 'just tired'], ['low', 'low', 'low']],
  [['hi', 'fine', 'yep', 'sure', 'ok'], ['ok', 'ok', 'ok', 'ok', 'ok']],
  [['yeah', 'not much', 'work', 'it was ok', 'same as usual'], ['ok', 'ok', 'ok', 'ok', 'ok']],
  [['sup', 'nm, you?', 'cool', 'yeah later'], ['ok', 'ok', 'ok', 'ok']],
  [['oh great, another Monday', 'love that for me', "anyway what's new with you"], ['-', 'ok', 'ok']],
  [['oh fantastic, my car broke down again', 'just what I needed', 'yeah'], ['-', '-', '-']],
  [['yay, more meetings', "I'm thrilled, truly", 'whatever'], ['-', '-', '-']],
  [['my mom sounds exhausted lately', "I'm worried about her", "but I'm good"], ['ok', 'ok', 'ok']],
  [['long day.', 'yeah', "I'm beat"], ['-', 'low', 'low']],
] as const).map(([turns, expect], i) => ({ slice: 'v', id: `v${i + 1}`, turns: [...turns], expect: [...expect] as Label[] }));

const off = (r: Row, k: number) => readCaller(r.turns.slice(0, k), r.voice);
const on = (r: Row, k: number) =>
  readCaller(r.turns.slice(0, k), r.voice, { baselineWords: r.baseline });

/** False-low: not-low turns read low. Missed-low: low turns not read low. */
function rates(read: (r: Row, k: number) => string, rows = TABLE) {
  let notLow = 0;
  let falseLow = 0;
  let low = 0;
  let missed = 0;
  for (const r of rows)
    r.expect.forEach((want, i) => {
      const got = read(r, i + 1);
      if (want === 'low') {
        low++;
        if (got !== 'low') missed++;
      } else if (want !== '-') {
        notLow++;
        if (got === 'low') falseLow++;
      }
    });
  return { falseLow: `${falseLow}/${notLow}`, missedLow: `${missed}/${low}` };
}

describe('ATTUNE_LEDGER perception table', () => {
  it('has at least six invented rows per slice', () => {
    for (const slice of ['a', 'b', 'c', 'd', 'e', 'f', 's'])
      expect(TABLE.filter((r) => r.slice === slice).length).toBeGreaterThanOrEqual(6);
  });

  // Pins the trade-off: a short, content-free turn is never low, even from a talker.
  for (const r of TABLE.filter((x) => x.knownMiss))
    it(`(${r.slice}) ${r.id}: known miss, shortness alone is not low`, () => {
      expect(on(r, r.turns.length)).not.toBe('low');
    });

  for (const r of TABLE.filter((x) => !x.knownMiss)) {
    it(`(${r.slice}) ${r.id}`, () => {
      const got = r.expect.map((want, i) =>
        want === '-' ? '-' : ((s) => (s === 'low' || s === 'mixed' ? s : 'ok'))(on(r, i + 1))
      );
      expect(got).toEqual(r.expect);
    });
  }

  it('reads no false lows and misses no lows on the table, flag on; reports flag off', () => {
    const before = rates(off);
    const after = rates(on);
    console.log('ATTUNE table, flag off:', before, 'flag on:', after);
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 's'])
      console.log(
        `  slice ${s}: off`,
        rates(
          off,
          TABLE.filter((r) => r.slice === s)
        ),
        'on',
        rates(
          on,
          TABLE.filter((r) => r.slice === s)
        )
      );
    const known = TABLE.filter((r) => r.knownMiss).length;
    expect(after).toEqual({
      falseLow: `0/${after.falseLow.split('/')[1]}`,
      missedLow: `${known}/${after.missedLow.split('/')[1]}`,
    });
    expect(Number(before.falseLow.split('/')[0])).toBeGreaterThan(0);
  });
});

describe('the #1086 fixtures under the ledger (report only)', () => {
  const fixtures = ['scenarios.json', 'heldout.json'].flatMap(
    (f) =>
      (
        JSON.parse(
          readFileSync(
            new URL(`../../../../scripts/voice-eval/attunement/fixtures/${f}`, import.meta.url),
            'utf8'
          )
        ) as { scenarios: Array<{ id: string; state: string; turns: string[] }> }
      ).scenarios
  );
  // Tired callers low from the second turn on; excited callers never low.
  const rows: Row[] = fixtures
    .filter((s) => s.state === 'tired' || s.state === 'excited')
    .map((s) => ({
      slice: s.state,
      id: s.id,
      turns: s.turns,
      expect: s.turns.map((_, i) => (s.state === 'excited' ? 'ok' : i === 0 ? '-' : 'low')),
    }));

  it('never reads an excited fixture caller as low, and reports tired support by turn 2', () => {
    const byTurn2 = (read: (r: Row, k: number) => string) =>
      rows.filter((r) => r.slice === 'tired' && [1, 2].some((k) => read(r, k) === 'low')).length;
    const tired = rows.filter((r) => r.slice === 'tired').length;
    console.log('fixtures, flag off:', rates(off, rows), 'flag on:', rates(on, rows));
    console.log(
      `tired support by turn 2: off ${byTurn2(off)}/${tired}, on ${byTurn2(on)}/${tired}`
    );
    for (const r of rows.filter((x) => x.slice === 'tired'))
      console.log(`  ${r.id}: on ${r.turns.map((_, i) => on(r, i + 1)).join(',')}`);
    expect(
      rates(
        on,
        rows.filter((r) => r.slice === 'excited')
      ).falseLow
    ).toMatch(/^0\//);
  });
});

describe("the verifier's sequences (not written with this code)", () => {
  it('meets false-low <= 3/37 and missed-low <= 2/16, flag on', () => {
    const before = rates(off, VERIFIER);
    const after = rates(on, VERIFIER);
    console.log('verifier rows, flag off:', before, 'flag on:', after);
    for (const r of VERIFIER)
      console.log(
        `  ${r.id} want ${r.expect.join(',')} on ${r.turns.map((_, i) => on(r, i + 1)).join(',')}`
      );
    expect(after.falseLow.endsWith('/37') && after.missedLow.endsWith('/16')).toBe(true);
    expect(Number(after.falseLow.split('/')[0])).toBeLessThanOrEqual(3);
    expect(Number(after.missedLow.split('/')[0])).toBeLessThanOrEqual(2);
  });
});

describe('the ledger explains itself and keeps crisis separate', () => {
  it('names the evidence behind a low read, by source and turn', () => {
    const { state, cues } = ledgerRead([
      "Honestly I'm wiped, it's been rough.",
      "Yeah… I don't know.",
    ]);
    expect(state).toBe('low');
    expect(cues.map((c) => `${c.source}@${c.turn}`)).toEqual(['text@0', 'keyword@1']);
  });

  it('gives prosody no valence weight', () => {
    const { cues } = ledgerRead(["I'm tired."], {
      arousal: -0.6,
      valence: -0.9,
      confidence: 0.9,
    } as VoiceCue);
    expect(cues.find((c) => c.source === 'prosody')?.valence).toBe(0);
  });

  it('prefers a stored baseline, then the call median after three turns, then a prior', () => {
    expect(baselineWords(['a b', 'c', 'd e f'], 20)).toBe(20);
    expect(baselineWords(['a b', 'c', 'd e f'])).toBe(2);
    expect(baselineWords(['a b'])).toBeUndefined();
  });

  const ctx = (...lines: string[]) => {
    const c = llm.ChatContext.empty();
    lines.forEach((text, i) => c.addMessage({ role: i % 2 ? 'assistant' : 'user', content: text }));
    return c;
  };

  it('says nothing under crisis guidance, flag on or off', () => {
    const c = ctx("I'm so tired.", 'That sounds heavy.', 'Mm.');
    for (const ATTUNE_LEDGER of ['on', undefined])
      expect(attunementNote(c, {}, { careful: true, env: { ATTUNE: 'on', ATTUNE_LEDGER } })).toBe(
        ''
      );
  });

  it('steadies the low, mirrors the upbeat and asks when unsure, only with the flag', () => {
    const env = { ATTUNE: 'on', ATTUNE_LEDGER: 'on' };
    const low = attunementNote(ctx("I'm so tired.", 'Long one, huh.', 'Mm.'), {}, { env });
    expect(low).toContain('at most one short line that shows you heard them');
    const up = attunementNote(ctx('Hey.', 'Hey you.', 'Guess how Monday went.'), {}, { env });
    expect(up).toContain('take the bid');
    const mixed = attunementNote(ctx('Long day.'), { userData: { voiceEmotion: LIVELY } }, { env });
    expect(mixed).toContain("don't assume either way");
    // Off: the same calls get the pre-ledger lines (upbeat and mixed get none on ATTUNE=on).
    const offEnv = { ATTUNE: 'on' };
    expect(
      attunementNote(ctx('Hey.', 'Hey you.', 'Guess how Monday went.'), {}, { env: offEnv })
    ).toBe('');
    expect(
      attunementNote(ctx('Long day.'), { userData: { voiceEmotion: LIVELY } }, { env: offEnv })
    ).toContain('gentle and unhurried');
  });
});
