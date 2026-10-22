import { describe, expect, it } from 'vitest';

import {
  aaGap,
  armEnv,
  barVerdict,
  combineMetric,
  compareArms,
  comparePersonaTells,
  copiedNgrams,
  copyStats,
  endsOnQuestion,
  exclaims,
  humannessOf,
  hourIn,
  humannessRate,
  lengthMatched,
  maskNames,
  maxFloor,
  MIN_MATCHED,
  median,
  ngramSet,
  noiseFloor,
  notesIn,
  opensWithReaction,
  parseCompanion,
  parsePick,
  parseSets,
  parseUse,
  rate,
  samplingGap,
  scoredTurns,
  shuffled,
  tellsOf,
  therapistCheckIn,
  verdictFor,
  words,
  zoneAtLocalHour,
  type Cell,
  type Metrics,
  type MetricVerdict,
  type Pair,
  type Verdict,
} from '../bar-lib.js';

/** `n` pairs where the arm wins the first `wins`, at the given word counts. */
const pairs = (n: number, wins: number, armWords: number, baseWords: number): Pair[] =>
  Array.from({ length: n }, (_, i) => ({
    line: `l${i}`,
    persona: 'ferni',
    armWords,
    baseWords,
    armWins: i < wins,
  }));

const metrics = (d: number, i: number, c: number): Metrics => ({
  distinctness: rate(d, 100),
  insight: rate(i, 100),
  copy: { ...rate(c, 100), top: [] },
  medianWords: 10,
});

describe('arm flags', () => {
  it('lays the overrides over the prod file, as strings', () => {
    const env = armEnv(
      { PERSONA_VOICE: 'off', TURN_LENGTH: 'off', MAX: 3, ON: true },
      parseSets(['PERSONA_VOICE=on', 'TURN_LENGTH=learned'])
    );
    expect(env).toEqual({ PERSONA_VOICE: 'on', TURN_LENGTH: 'learned', MAX: '3', ON: 'true' });
  });

  it('keeps an "=" inside a value and adds flags the file does not have', () => {
    expect(parseSets(['NOTE=a=b', 'NEW_FLAG=on'])).toEqual({ NOTE: 'a=b', NEW_FLAG: 'on' });
    expect(armEnv({}, { NEW_FLAG: 'on' })).toEqual({ NEW_FLAG: 'on' });
  });

  it('rejects a malformed override or flags file instead of running the baseline', () => {
    expect(() => parseSets(['PERSONA_VOICE'])).toThrow(/KEY=value/);
    expect(() => parseSets(['persona_voice=on'])).toThrow(/UPPER_CASE/);
    expect(() => parseSets(['=on'])).toThrow();
    expect(() => armEnv([1, 2], {})).toThrow(/flat JSON object/);
    expect(() => armEnv({ A: { nested: 1 } }, {})).toThrow(/not a scalar/);
  });
});

describe('judge output', () => {
  it('reads a companion letter, fenced or bare, as an index', () => {
    expect(parseCompanion('{"companion":"C"}', 6)).toBe(2);
    expect(parseCompanion('```json\n{"companion": "f"}\n```', 6)).toBe(5);
  });

  it('refuses a letter past the choices, a non-letter, or no JSON', () => {
    expect(parseCompanion('{"companion":"G"}', 6)).toBeNull();
    expect(parseCompanion('{"companion":"AB"}', 6)).toBeNull();
    expect(parseCompanion('{"companion":3}', 6)).toBeNull();
    expect(parseCompanion('It was A.', 6)).toBeNull();
    expect(parseCompanion('{"companion":"A"', 6)).toBeNull();
  });

  it('reads a pick of 1 or 2, as a string or a number, and nothing else', () => {
    expect(parsePick('{"pick":"1"}')).toBe(1);
    expect(parsePick('{"pick":2}')).toBe(2);
    expect(parsePick('{"pick":"3"}')).toBeNull();
    expect(parsePick('{"pick":"both"}')).toBeNull();
    expect(parsePick('{}')).toBeNull();
  });

  it('reads the insight verdict', () => {
    expect(parseUse('{"use":"Natural"}')).toBe('natural');
    expect(parseUse('{"use":"forced"}')).toBe('forced');
    expect(parseUse('{"use":"none"}')).toBe('none');
    expect(parseUse('{"use":"yes"}')).toBeNull();
  });

  it('blanks every persona name as a whole word only', () => {
    expect(maskNames('Alex here. Ferni says hi to alexandra.', ['ferni', 'alex'])).toBe(
      '___ here. ___ says hi to alexandra.'
    );
  });
});

describe('rates and order', () => {
  it('gives the Wilson interval, not the normal one', () => {
    const r = rate(0, 10);
    expect(r.p).toBe(0);
    expect(r.lo).toBe(0);
    // Wilson at 0/10 is [0, 0.278]; the normal approximation collapses to [0, 0].
    expect(r.hi).toBeCloseTo(0.2775, 3);
    const half = rate(50, 100);
    expect(half.lo).toBeCloseTo(0.4038, 3);
    expect(half.hi).toBeCloseTo(0.5962, 3);
    expect(rate(0, 0)).toEqual({ k: 0, n: 0, p: 0, lo: 0, hi: 0 });
  });

  it('shuffles the same way for the same seed and keeps every item', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const one = shuffled(xs, 'line:ferni:0');
    expect(shuffled(xs, 'line:ferni:0')).toEqual(one);
    expect([...one].sort()).toEqual(xs);
    expect(xs).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffled(xs, `s${i}`).join('')));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('puts a two-way order first about half the time over many seeds', () => {
    const firsts = Array.from({ length: 1000 }, (_, i) => shuffled([true, false], `k${i}`)[0]);
    const share = firsts.filter(Boolean).length / firsts.length;
    expect(share).toBeGreaterThan(0.44);
    expect(share).toBeLessThan(0.56);
  });

  it('takes the middle, or the mean of the two middles', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('copy check', () => {
  const instructions = ngramSet(
    "Keep it short. Don't say I hear you; say what a friend would say. Pick up the small thing they almost didn't say."
  );

  it('splits words with apostrophes kept and curly quotes folded', () => {
    expect(words("Don’t   STOP, it's fine!")).toEqual(["don't", 'stop', "it's", 'fine']);
  });

  it('finds a 4-word run the reply took from its instructions', () => {
    const copied = copiedNgrams('oh man. what a friend would say is go to bed.', [instructions]);
    expect(copied).toEqual(expect.arrayContaining(['what a friend would', 'a friend would say']));
  });

  it('ignores runs shorter than four words, punctuation and markup between words', () => {
    expect(copiedNgrams('keep it short, friend.', [instructions])).toEqual([]);
    // "the small thing they" is in the instructions; markup and case do not hide it.
    expect(copiedNgrams('<break time="50ms"/>The SMALL thing, they said?', [instructions])).toEqual(
      ['the small thing they']
    );
    // A [laughter] tag between the words is not a word, so it does not hide a copy.
    expect(copiedNgrams('pick up [laughter] the small', [instructions])).toEqual([
      'pick up the small',
    ]);
  });

  it('checks every instruction text it is given', () => {
    const reminder = ngramSet('(One or two short sentences. No question this turn.)');
    expect(copiedNgrams('no question this turn, ok', [instructions, reminder])).toEqual([
      'no question this turn',
    ]);
    expect(copiedNgrams('no question this turn, ok', [instructions])).toEqual([]);
  });

  it('counts replies, not occurrences, and ranks the most-copied runs', () => {
    const stats = copyStats([
      ['a friend would say', 'what a friend would'],
      ['a friend would say', 'a friend would say'],
      [],
      [],
    ]);
    expect(stats.k).toBe(2);
    expect(stats.n).toBe(4);
    expect(stats.p).toBe(0.5);
    expect(stats.top).toEqual([
      { ngram: 'a friend would say', replies: 2 },
      { ngram: 'what a friend would', replies: 1 },
    ]);
  });
});

describe('A/A floor and comparison', () => {
  it('measures the A/A gap as the absolute gap, and pairwise as the distance from 50%', () => {
    const gap = aaGap(metrics(24, 40, 10), metrics(30, 35, 12), rate(45, 100));
    expect(gap.distinctness).toBeCloseTo(0.06, 10);
    expect(gap.insight).toBeCloseTo(0.05, 10);
    expect(gap.copy).toBeCloseTo(0.02, 10);
    expect(gap.humanness).toBeCloseTo(0.05, 10);
  });

  it('gives the 95% half-width of a difference of two independent rates', () => {
    // 1.96 * sqrt(.24*.76/100 + .30*.70/100) = 0.1227
    expect(samplingGap(rate(24, 100), rate(30, 100))).toBeCloseTo(0.1227, 3);
    expect(samplingGap(rate(0, 0), rate(0, 0))).toBe(0);
  });

  it('never lets a lucky-close A/A pair set a floor below what sampling allows', () => {
    // The two runs landed 6 points apart, but n=100 allows 12.3: the floor is 12.3.
    const close = noiseFloor(metrics(24, 40, 10), metrics(30, 35, 12), rate(45, 100));
    expect(close.distinctness).toBeCloseTo(0.1227, 3);
    // A pairwise rate against 0.5 at n=100: 1.96 * sqrt(.25/100) = 0.098.
    expect(close.humanness).toBeCloseTo(0.098, 3);
    // The pairwise variance is taken at 0.5 (no difference), not at the observed win rate:
    // 1/4 wins gives 1.96 * sqrt(.25/4) = 0.49, where the observed rate would give 0.424.
    expect(noiseFloor(metrics(0, 0, 0), metrics(0, 0, 0), rate(1, 4)).humanness).toBeCloseTo(
      0.49,
      3
    );
  });

  it('keeps the observed A/A gap when it is wider than sampling allows', () => {
    const wide = noiseFloor(metrics(20, 40, 10), metrics(50, 40, 10), rate(20, 100));
    expect(wide.distinctness).toBeCloseTo(0.3, 10);
    expect(wide.humanness).toBeCloseTo(0.3, 10);
  });

  it('calls a gap inside the floor noise, and reads copy as lower-is-better', () => {
    expect(verdictFor(0.05, 0.06)).toBe('noise');
    expect(verdictFor(0.06, 0.06)).toBe('noise');
    expect(verdictFor(0.1, 0.06)).toBe('better');
    expect(verdictFor(-0.1, 0.06)).toBe('worse');
    expect(verdictFor(-0.1, 0.06, true)).toBe('better');
    expect(verdictFor(0.1, 0.06, true)).toBe('worse');
    expect(verdictFor(0.5, null)).toBe('no A/A');
  });

  it('compares each metric against the baseline and its floor', () => {
    const floor = { distinctness: 0.05, insight: 0.05, copy: 0.05, humanness: 0.05 };
    // 100 length-matched pairs, 70 won.
    const rows = compareArms(
      metrics(24, 40, 30),
      metrics(40, 42, 10),
      humannessOf(pairs(100, 70, 10, 12)),
      floor
    );
    expect(rows.map((r) => [r.metric, r.verdict])).toEqual([
      ['distinctness', 'better'],
      ['humanness', 'better'],
      ['insight', 'noise'],
      ['copy', 'better'],
    ]);
    const human = rows.find((r) => r.metric === 'humanness');
    expect(human?.baseline).toBe(0.5);
    expect(human?.delta).toBeCloseTo(0.2, 10);
    expect(
      compareArms(metrics(24, 40, 30), metrics(40, 42, 10), null, null).map((r) => r.verdict)
    ).toEqual(['no A/A', 'no A/A', 'no A/A']);
  });
});

describe('humanness length control', () => {
  it('matches two lengths only when the longer is at most 1.5x the shorter', () => {
    expect(lengthMatched(10, 15)).toBe(true);
    expect(lengthMatched(15, 10)).toBe(true);
    expect(lengthMatched(10, 16)).toBe(false);
    expect(lengthMatched(8, 34)).toBe(false);
    expect(lengthMatched(7, 7)).toBe(true);
    expect(lengthMatched(0, 0)).toBe(false);
    expect(lengthMatched(0, 3)).toBe(false);
    expect(lengthMatched(10, 20, 2)).toBe(true);
  });

  it('reports all pairs and the length-matched pairs separately', () => {
    // 40 short-vs-long pairs the arm loses, 20 matched pairs it wins 15 of.
    const h = humannessOf([...pairs(40, 0, 8, 34), ...pairs(20, 15, 10, 12)]);
    expect(h.overall.k).toBe(15);
    expect(h.overall.n).toBe(60);
    expect(h.matched.k).toBe(15);
    expect(h.matched.n).toBe(20);
    expect(h.matched.p).toBe(0.75);
    expect(h.matched.lo).toBeGreaterThan(0.5);
  });

  it('rests the win rate on matched pairs only once there are 30', () => {
    const few = humannessOf([...pairs(100, 10, 8, 34), ...pairs(MIN_MATCHED - 1, 20, 10, 10)]);
    expect(humannessRate(few)).toBe(few.overall);
    const enough = humannessOf([...pairs(100, 10, 8, 34), ...pairs(MIN_MATCHED, 20, 10, 10)]);
    expect(humannessRate(enough)).toBe(enough.matched);
  });

  it('judges on matched pairs, so losing on length alone is not "worse"', () => {
    const floor = { distinctness: 0.05, insight: 0.05, copy: 0.05, humanness: 0.05 };
    // Loses 100 of 100 mismatched pairs, splits 40 matched pairs 20/20.
    const h = humannessOf([...pairs(100, 0, 8, 34), ...pairs(40, 20, 10, 11)]);
    const row = compareArms(metrics(20, 40, 10), metrics(20, 40, 10), h, floor).find(
      (r) => r.metric === 'humanness'
    );
    expect(h.overall.p).toBeCloseTo(20 / 140, 10);
    expect(row?.arm).toBe(0.5);
    expect(row?.verdict).toBe('noise');
  });

  it('floors the matched verdict at the sampling gap of the matched n', () => {
    // 22 of 40 matched = +5 points: beats a 2-point A/A floor, not the 15.5 that n=40 allows.
    const h = humannessOf(pairs(40, 22, 10, 10));
    const floor = { distinctness: 0.02, insight: 0.02, copy: 0.02, humanness: 0.02 };
    const row = compareArms(metrics(20, 40, 10), metrics(20, 40, 10), h, floor).find(
      (r) => r.metric === 'humanness'
    );
    expect(row?.floor).toBeCloseTo(1.96 * Math.sqrt(0.25 / 40), 10);
    expect(row?.verdict).toBe('noise');
  });

  it('withholds the verdict under 30 matched pairs, however lopsided the rest', () => {
    const h = humannessOf([...pairs(150, 0, 8, 34), ...pairs(MIN_MATCHED - 1, 29, 10, 10)]);
    const floor = { distinctness: 0.05, insight: 0.05, copy: 0.05, humanness: 0.05 };
    const row = compareArms(metrics(20, 40, 10), metrics(20, 40, 10), h, floor).find(
      (r) => r.metric === 'humanness'
    );
    expect(row?.verdict).toBe('insufficient matched pairs');
    expect(row?.floor).toBeNull();
  });
});

describe('copy check, canon left out', () => {
  const sheet = ngramSet(
    'You have two cats, Compound and Interest. Work it out aloud, the way people do (hm, let me think).'
  );
  const canon = ngramSet('Maya and Daniel have two cats, Compound and Interest.');

  it("does not count n-grams from the speaker's own canon, and still counts the rest", () => {
    const reply = 'Daniel and I have our two cats, Compound and Interest. Hm, let me think.';
    expect(copiedNgrams(reply, [sheet])).toEqual(
      expect.arrayContaining([
        'two cats compound and',
        'cats compound and interest',
        'hm let me think',
      ])
    );
    expect(copiedNgrams(reply, [sheet], 4, canon)).toEqual(['hm let me think']);
  });

  it('leaves the check unchanged with no canon given', () => {
    const reply = 'two cats compound and interest';
    expect(copiedNgrams(reply, [sheet], 4, undefined)).toEqual(copiedNgrams(reply, [sheet]));
    expect(copiedNgrams(reply, [sheet], 4, new Set())).toHaveLength(2);
  });
});

describe('multi-turn', () => {
  const convs = [
    { id: 'job', kind: 'good news', turns: ['a', 'b', 'c', 'd'], context: [{ key: 'job' }] },
    { id: 'tea', kind: 'small talk', turns: ['x', 'y', 'z'] },
    { id: 'late', kind: 'local time', turns: ['p', 'q'], localHour: 23 },
    { id: 'plan', kind: 'callback', turns: ['m', 'n', 'o'], callback: true },
  ];

  it('scores the last two caller turns of each call, with what was said before them', () => {
    const turns = scoredTurns(convs);
    expect(turns.map((t) => t.key)).toEqual([
      'job#2',
      'job#3',
      'tea#1',
      'tea#2',
      'late#0',
      'late#1',
      'plan#1',
      'plan#2',
    ]);
    expect(turns[1]).toMatchObject({ text: 'd', earlier: ['a', 'b', 'c'], conversation: 'job' });
    expect(turns[4].earlier).toEqual([]);
  });

  it('judges insight only where the call has facts, a callback or a local time', () => {
    const insight = Object.fromEntries(scoredTurns(convs).map((t) => [t.conversation, t.insight]));
    expect(insight).toEqual({ job: true, tea: false, late: true, plan: true });
    expect(scoredTurns([{ ...convs[1], context: [] }])[0].insight).toBe(false);
  });

  it("reads the director's notes and the thought a reminder carried", () => {
    const reminder =
      'Keep it short. [Director: They sound wiped out / Too many questions lately] ' +
      '[On your mind, if it fits: the move and the mom are one worry. Not if venting. What they just said comes first.] Answer.';
    expect(notesIn(reminder)).toEqual({
      director: ['They sound wiped out', 'Too many questions lately'],
      thought:
        'the move and the mom are one worry. Not if venting. What they just said comes first.',
    });
    expect(notesIn('Keep it short.')).toEqual({ director: [], thought: '' });
  });

  it('places a call in a zone where it is the asked-for hour, whatever the clock says', () => {
    for (const iso of ['2026-10-18T03:10:00Z', '2026-10-18T15:40:00Z', '2026-01-05T21:00:00Z']) {
      const now = new Date(iso);
      for (const hour of [7, 23]) expect(hourIn(zoneAtLocalHour(hour, now), now)).toBe(hour);
    }
  });

  it('falls back to the nearest hour, across midnight', () => {
    const now = new Date('2026-10-18T12:00:00Z');
    // New York is at 8 am, Tokyo at 9 pm: 23 is two hours from Tokyo, nine from New York.
    expect(zoneAtLocalHour(23, now, ['America/New_York', 'Asia/Tokyo'])).toBe('Asia/Tokyo');
    expect(zoneAtLocalHour(1, now, ['America/New_York', 'Asia/Tokyo'])).toBe('Asia/Tokyo');
  });
});

describe('model tells', () => {
  it('reads a reply as ending on a question only when the last thing said is one', () => {
    expect(endsOnQuestion('Big week. How did the interview go?')).toBe(true);
    expect(endsOnQuestion('you okay?" <break time="300ms"/>')).toBe(true);
    expect(endsOnQuestion('Wait, what? No way. That is huge.')).toBe(false);
    expect(endsOnQuestion('That is huge.')).toBe(false);
    expect(endsOnQuestion('')).toBe(false);
  });

  it('flags a stock reaction word only as the first spoken word', () => {
    for (const r of [
      'Oh, wow.',
      'Ugh. Mondays.',
      'Yeah so',
      'Hmmm... okay',
      'Wow!',
      'Ahh',
      'Well, look',
    ])
      expect(opensWithReaction(r)).toBe(true);
    expect(opensWithReaction('<speed ratio="0.9"/>[laughter] Oh no')).toBe(true);
    // A reaction word later in the reply, or a word that only starts like one, is not an opener.
    expect(opensWithReaction('Congrats. Oh, and the cats?')).toBe(false);
    expect(opensWithReaction('Ahead of you on that.')).toBe(false);
    expect(opensWithReaction('Wellington was rainy.')).toBe(false);
    expect(opensWithReaction('Okay.')).toBe(false);
  });

  it('catches therapist check-ins, not plain sympathy', () => {
    expect(therapistCheckIn('How are you holding up?')).toBe(true);
    expect(therapistCheckIn("How're you feeling about it")).toBe(true);
    expect(therapistCheckIn('How does that make you feel?')).toBe(true);
    expect(therapistCheckIn('That sounds really exhausting.')).toBe(true);
    expect(therapistCheckIn('That must be so hard.')).toBe(true);
    expect(therapistCheckIn('Hard week. Want to get a beer?')).toBe(false);
    expect(therapistCheckIn('That sounds like a plan.')).toBe(false);
  });

  it('counts exclamation marks in speech, not in markup', () => {
    expect(exclaims('No way!')).toBe(true);
    expect(exclaims('<!-- x --> fine.')).toBe(false);
  });

  it('gives each tell as a share of non-empty replies', () => {
    const t = tellsOf([
      'Oh, how are you holding up?',
      'Nice!',
      'Mm. Tell me.',
      'Long day. What happened?',
      '',
    ]);
    expect(t.question.k).toBe(2);
    expect(t.question.n).toBe(4);
    expect(t.opener.k).toBe(1);
    expect(t.checkin.k).toBe(1);
    expect(t.exclaim.k).toBe(1);
    expect(t.asks.k).toBe(2);
  });

  it('floors and judges the tells like the other metrics, fewer being better', () => {
    const tells = (q: number, n = 100) =>
      tellsOf([
        ...Array.from({ length: q }, () => 'What happened?'),
        ...Array.from({ length: n - q }, () => 'Fine.'),
      ]);
    const a = { ...metrics(20, 40, 10), tells: tells(90) };
    const b = { ...metrics(20, 40, 10), tells: tells(86) };
    const floor = noiseFloor(a, b, rate(50, 100));
    // 4 points apart; n=100 at 90%/86% allows 1.96 * sqrt(.09/100 + .1204/100) = 0.0898.
    expect(floor.tells?.question).toBeCloseTo(0.0898, 3);
    // Neither run saw an opener: the floor is what one event in 100 allows, not 0.
    expect(floor.tells?.opener).toBeCloseTo(1.96 * Math.sqrt((2 * 0.01 * 0.99) / 100), 10);
    const one = tellsOf(['Oh hi.', ...Array.from({ length: 99 }, () => 'Fine.')]);
    expect(
      compareArms(a, { ...metrics(20, 40, 10), tells: one }, null, floor).find(
        (r) => r.metric === 'tells: opener'
      )?.verdict
    ).toBe('noise');
    const rows = compareArms(a, { ...metrics(20, 40, 10), tells: tells(30) }, null, floor);
    const q = rows.find((r) => r.metric === 'tells: question');
    expect(q?.delta).toBeCloseTo(-0.6, 10);
    expect(q?.verdict).toBe('better');
    const worse = compareArms(
      { ...metrics(20, 40, 10), tells: tells(30) },
      { ...metrics(20, 40, 10), tells: tells(90) },
      null,
      floor
    ).find((r) => r.metric === 'tells: question');
    expect(worse?.verdict).toBe('worse');
    // No tells on either side (a result saved before the metric): no tell rows at all.
    expect(compareArms(metrics(20, 40, 10), metrics(20, 40, 10), null, floor)).toHaveLength(3);
  });

  it('reports per-persona tells as a direction against the persona floor, not a verdict', () => {
    const asks = (k: number, n = 30) =>
      tellsOf([
        ...Array.from({ length: k }, () => 'And then?'),
        ...Array.from({ length: n - k }, () => 'Mm.'),
      ]);
    const rows = comparePersonaTells(
      { 'nayan-patel': asks(28), 'maya-santos': asks(10) },
      { 'nayan-patel': asks(3), 'maya-santos': asks(12) }
    );
    const nayan = rows.find((r) => r.persona === 'nayan-patel' && r.tell === 'question');
    expect(nayan?.move).toBe('down');
    expect(nayan?.floor).toBeGreaterThan(0.1);
    const maya = rows.find((r) => r.persona === 'maya-santos' && r.tell === 'question');
    expect(maya?.move).toBe('noise');
    // A persona's own A/A gap widens its floor.
    const wide = comparePersonaTells(
      { 'maya-santos': asks(10) },
      { 'maya-santos': asks(25) },
      { 'maya-santos': asks(29) }
    ).find((r) => r.tell === 'question');
    expect(wide?.floor).toBeCloseTo(19 / 30, 10);
    expect(wide?.move).toBe('noise');
  });
});

describe('replicated runs, two judges', () => {
  /** Cells for one metric: verdicts[run][judge], judges named g (Gemini) and o (gpt-oss). */
  const cells = (verdicts: Verdict[][]): Cell[] =>
    verdicts.flatMap((byJudge, r) =>
      byJudge.map((verdict, j) => ({
        run: r + 1,
        judge: ['g', 'o'][j],
        verdict,
        delta: verdict === 'better' ? 0.1 : verdict === 'worse' ? -0.1 : 0,
        floor: 0.05,
      }))
    );
  const mv = (
    metric: MetricVerdict['metric'],
    verdict: MetricVerdict['verdict']
  ): MetricVerdict => ({
    metric,
    verdict,
    note: '',
    cells: [],
  });

  it('takes the widest floor per metric over every A/A and the run-to-run spread', () => {
    const f = (d: number, h: number) => ({
      distinctness: d,
      insight: 0.1,
      copy: 0.02,
      humanness: h,
    });
    const tells = (q: number) => ({ question: q, opener: 0.05, checkin: 0.02, exclaim: 0.02 });
    expect(maxFloor([f(0.09, 0.0975), f(0.091, 0.0985), f(0.12, 0.05)])).toEqual({
      distinctness: 0.12,
      insight: 0.1,
      copy: 0.02,
      humanness: 0.0985,
    });
    expect(
      maxFloor([
        { ...f(0.1, 0.1), tells: tells(0.087) },
        { ...f(0.1, 0.1), tells: tells(0.094) },
      ]).tells?.question
    ).toBe(0.094);
    // A floor without tells (an old result) leaves the tells floor out rather than inventing one.
    expect(maxFloor([{ ...f(0.1, 0.1), tells: tells(0.1) }, f(0.1, 0.1)]).tells).toBeUndefined();
  });

  it('calls a metric better only when both judges agree in every run', () => {
    const m = combineMetric(
      'humanness',
      cells([
        ['better', 'better'],
        ['better', 'better'],
      ])
    );
    expect(m.verdict).toBe('better');
    expect(m.note).toBe(
      'run 1: better (g +10.0/5.0 better, o +10.0/5.0 better); run 2: better (g +10.0/5.0 better, o +10.0/5.0 better)'
    );
  });

  it('reads judges that disagree as noise, and says so', () => {
    // M2c arm E, run 1: Gemini +9.80 over a 9.75 floor, gpt-oss -1.96.
    const m = combineMetric(
      'humanness',
      cells([
        ['better', 'noise'],
        ['better', 'better'],
      ])
    );
    expect(m.verdict).toBe('noise');
    expect(m.note.split('; ')[0]).toBe(
      'run 1: judges disagree (g +10.0/5.0 better, o +0.0/5.0 noise)'
    );
    expect(combineMetric('insight', cells([['better', 'worse']])).verdict).toBe('noise');
  });

  it('never passes a metric on one run when the other is noise', () => {
    // M2c E insight: +13.5 over its floor in run 1, +1.8 in the replicate.
    const m = combineMetric(
      'insight',
      cells([
        ['better', 'better'],
        ['noise', 'noise'],
      ])
    );
    expect(m.verdict).toBe('noise');
    expect(m.note.split('; ')[1]).toBe('run 2: noise (g +0.0/5.0 noise, o +0.0/5.0 noise)');
  });

  it('calls a metric worse when the judges agree it is worse in any one run', () => {
    expect(
      combineMetric(
        'insight',
        cells([
          ['noise', 'noise'],
          ['worse', 'worse'],
        ])
      ).verdict
    ).toBe('worse');
    expect(
      combineMetric(
        'insight',
        cells([
          ['noise', 'noise'],
          ['worse', 'noise'],
        ])
      ).verdict
    ).toBe('noise');
  });

  it('treats a missing floor or too few matched pairs as noise, not a gain', () => {
    expect(combineMetric('humanness', cells([['no A/A', 'no A/A']])).verdict).toBe('noise');
    expect(
      combineMetric('humanness', cells([['insufficient matched pairs', 'better']])).verdict
    ).toBe('noise');
  });

  it('passes only with a gain, insight not worse and no tell worse', () => {
    const ok = [mv('humanness', 'better'), mv('insight', 'noise'), mv('tells: question', 'noise')];
    expect(barVerdict(ok, 2, 2)).toEqual({
      pass: true,
      line: 'PASS: humanness better in all 2 runs with all 2 judges agreeing; insight and tells not worse',
    });
    expect(barVerdict([mv('humanness', 'noise'), mv('insight', 'better')], 2, 2)).toEqual({
      pass: false,
      line: 'NO PASS: neither distinctness nor humanness is better in every run with the judges agreeing',
    });
    expect(barVerdict([...ok.slice(0, 2), mv('tells: opener', 'worse')], 2, 2).line).toBe(
      'NO PASS: tells: opener worse'
    );
    expect(barVerdict([ok[0], mv('insight', 'worse')], 2, 2).line).toBe('NO PASS: insight worse');
    expect(barVerdict([ok[0]], 2, 2).line).toBe('NO PASS: no insight verdict');
  });

  it('never passes on one run or one judge, however good it looks', () => {
    const ok = [mv('distinctness', 'better'), mv('insight', 'better')];
    expect(barVerdict(ok, 1, 2)).toEqual({
      pass: false,
      line: 'NO PASS: 1 run (a pass needs --runs 2 or more)',
    });
    expect(barVerdict(ok, 2, 1).line).toBe(
      'NO PASS: 1 judge (a pass needs a second judge from another family)'
    );
  });

  it('reproduces the M2d verdict: E does not pass once both judges and both runs count', () => {
    const metrics = [
      combineMetric(
        'distinctness',
        cells([
          ['noise', 'noise'],
          ['noise', 'noise'],
        ])
      ),
      combineMetric(
        'humanness',
        cells([
          ['better', 'noise'],
          ['noise', 'noise'],
        ])
      ),
      combineMetric(
        'insight',
        cells([
          ['better', 'noise'],
          ['noise', 'noise'],
        ])
      ),
      combineMetric('tells: question', cells([['noise'], ['noise']])),
    ];
    expect(barVerdict(metrics, 2, 2).pass).toBe(false);
  });
});
