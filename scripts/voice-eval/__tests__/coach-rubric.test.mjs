import { describe, expect, it } from 'vitest';
import {
  applicabilityOf,
  coachTurns,
  deterministicItems,
  genericPraiseCount,
  poolItems,
  questionsIn,
  stockPhraseCounts,
  taggedItems,
  talkTime,
  timingOf,
  weightedScore,
} from '../coach-rubric.mjs';
import { cacheKey, parseTags } from '../coach-tagger.mjs';

// Ferni greets, hears a growing caption, hands off to Alex (whose opener lands
// 100 ms before handoff_complete, and whose announcement lands after it).
const run = {
  meta: { persona: '' },
  userSpeech: [
    [1000, 3000],
    [9000, 11000],
  ],
  results: [
    { userEndedAt: 3000, replyDelayMs: 600 },
    { userEndedAt: 11000, replyDelayMs: 4000 }, // spans the handoff: not a reply gap
  ],
  tracks: [
    {
      name: 'agent:roomio_audio',
      voice: [
        [200, 900],
        [3600, 8000],
        [9500, 12500],
        [15000, 16000],
      ],
    },
    { name: 'agent:background_reactions', voice: [[1500, 1700]] },
  ],
  data: [
    { t: 100, payload: { type: 'state_reset', activePersona: 'ferni' } },
    { t: 11500, payload: { type: 'handoff_started', target: 'alex-chen', previousAgent: 'ferni' } },
    { t: 14100, payload: { type: 'handoff_complete', from: 'ferni', target: 'alex-chen' } },
  ],
  events: [
    { t: 200, who: 'agent', text: 'Hey Sam.' },
    { t: 1200, who: 'user', text: 'I need' },
    { t: 1800, who: 'user', text: 'I need to write' },
    { t: 2600, who: 'user', text: 'I need to write an apology.' },
    { t: 3600, who: 'agent', text: 'Oh, that is a hard one.' },
    { t: 4200, who: 'agent', text: 'What happened? And how did she take it?' },
    { t: 9200, who: 'user', text: 'Can Alex help?' },
    { t: 14000, who: 'agent', text: 'Hi Sam, Alex here.' },
    { t: 14600, who: 'agent', text: "I'll bring in Alex. You'll like him." },
  ],
};

describe('coachTurns', () => {
  const turns = coachTurns(run);

  it('keeps the longest form of a growing caller caption', () => {
    expect(turns.filter((t) => t.who === 'user').map((t) => t.text)).toEqual([
      'I need to write an apology.',
      'Can Alex help?',
    ]);
  });

  it('joins consecutive agent captions of one persona into one turn', () => {
    expect(turns[2]).toMatchObject({
      who: 'agent',
      persona: 'ferni',
      text: 'Oh, that is a hard one. What happened? And how did she take it?',
    });
  });

  it('gives the early opener to the new persona and the late announcement to the old one', () => {
    const agent = turns.filter((t) => t.who === 'agent').map((t) => [t.persona, t.text]);
    expect(agent).toEqual([
      ['ferni', 'Hey Sam.'],
      ['ferni', 'Oh, that is a hard one. What happened? And how did she take it?'],
      ['alex-chen', 'Hi Sam, Alex here.'],
      ['ferni', "I'll bring in Alex. You'll like him."],
    ]);
  });

  it('marks only the line before the caller speaks as the greeting', () => {
    expect(turns.filter((t) => t.greeting).map((t) => t.n)).toEqual([1]);
  });
});

describe('questionsIn', () => {
  it('counts each question and an ", or …?" tail', () => {
    expect(questionsIn('What happened? And how did she take it?')).toEqual({
      questions: 2,
      orTails: 0,
    });
    expect(questionsIn('Do you want to start tonight, or wait?')).toEqual({
      questions: 2,
      orTails: 1,
    });
    expect(questionsIn('Coffee or tea?')).toEqual({ questions: 1, orTails: 0 });
    expect(questionsIn('That makes sense.')).toEqual({ questions: 0, orTails: 0 });
  });
});

describe('lexicons', () => {
  it('counts generic praise as whole phrases', () => {
    expect(genericPraiseCount("Great job! You're amazing. Amazing.")).toBe(3);
    expect(genericPraiseCount('The view was amazing and the coffee too.')).toBe(0);
  });

  it('counts stock empathy phrases across turns', () => {
    expect(
      stockPhraseCounts(['I hear you. That sounds really hard.', 'I hear you, truly.'])
    ).toEqual({
      'i hear you': 2,
      'that sounds really hard': 1,
    });
    expect(stockPhraseCounts(['I hear your dog barking.'])).toEqual({});
  });
});

describe('audio-based items', () => {
  it('splits talk time by persona from the reply track only', () => {
    expect(talkTime(run)).toEqual({
      ferni: { userMs: 4000, agentMs: 700 + 4400 + 3000 },
      'alex-chen': { userMs: 0, agentMs: 1000 },
    });
  });

  it('drops reply gaps that span a handoff and counts a long reply over the caller as a barge-in', () => {
    const t = timingOf(run);
    expect(t.ferni.gaps).toEqual([600]);
    expect(t.ferni).toMatchObject({ userTurns: 2, bargeIns: 1 });
  });
});

describe('deterministicItems', () => {
  const turns = coachTurns(run).filter((t) => t.persona === 'ferni');
  const items = Object.fromEntries(
    deterministicItems('ferni', turns, {
      talk: talkTime(run).ferni,
      timing: timingOf(run).ferni,
    }).map((i) => [i.item, i])
  );

  it('fails one-question-per-turn on a stacked question', () => {
    expect(items[3]).toMatchObject({ value: 0.5, status: 'FAIL', stackedTurns: 1 });
  });

  it('uses audio time for talk share when the recording has it', () => {
    expect(items[6]).toMatchObject({ value: 0.33, basis: 'audio time', status: 'FAIL' });
  });

  it('fails timing on a barge-in even with a fast median', () => {
    expect(items[13].value).toMatchObject({ p50: 600, bargeInRate: 0.5 });
    expect(items[13].status).toBe('FAIL');
  });

  it('falls back to a word-share proxy without audio', () => {
    const it6 = deterministicItems('ferni', turns, {}).find((i) => i.item === 6);
    expect(it6.basis).toBe('word-share proxy');
  });
});

describe('taggedItems', () => {
  const turns = [
    { n: 1, who: 'agent', persona: 'ferni', text: 'Hey.', t: 0, greeting: true },
    { n: 2, who: 'user', persona: 'ferni', text: 'I want to run in the mornings.', t: 1000 },
    { n: 3, who: 'agent', persona: 'ferni', text: '...', t: 2000 },
    { n: 4, who: 'user', persona: 'ferni', text: "But I'm just not a morning person.", t: 3000 },
    { n: 5, who: 'agent', persona: 'ferni', text: '...', t: 4000 },
    { n: 6, who: 'user', persona: 'ferni', text: "I'll put my shoes by the bed tonight.", t: 5000 },
  ];
  const reply = {
    turns: [
      { n: 1, codes: [] },
      { n: 2, talk: 'change', statesGoal: true },
      { n: 3, codes: ['CR', 'Q'], evocative: true },
      { n: 4, talk: 'sustain' },
      { n: 5, codes: ['SR', 'Persuade', 'Bogus'] },
      { n: 6, talk: 'change', ownNextStep: true },
    ],
    goalDiscussed: true,
  };
  const { tags, call, unknownCodes } = parseTags(reply, turns);
  const byItem = Object.fromEntries(
    taggedItems('ferni', turns, tags, call, { durationMs: 5000, praise: 0 }).map((i) => [i.item, i])
  );

  it('computes R:Q and %CR from the codes', () => {
    expect(unknownCodes).toBe(1);
    expect(byItem[1]).toMatchObject({ value: 2, status: 'PASS', reflections: 2, questions: 1 });
    expect(byItem[2]).toMatchObject({ value: 0.5, status: 'PASS' });
  });

  it('flags unpermitted advice', () => {
    expect(byItem[4]).toMatchObject({ value: 1, status: 'FAIL' });
  });

  it('reads change talk, agreement and the caller-authored next step', () => {
    expect(byItem[8].value).toMatchObject({ changeShare: 0.67, evocative: true });
    expect(byItem[8].status).toBe('PASS');
    expect(byItem[7].status).toBe('PASS');
    expect(byItem[11].status).toBe('PASS');
  });

  it('leaves summary+check unscored on calls under five minutes', () => {
    expect(byItem[9].status).toBe('N/A');
  });

  it('reports every LLM item as unscored when the call was not tagged', () => {
    expect(taggedItems('ferni', turns, {}, {}).every((i) => i.status === 'N/A')).toBe(true);
  });
});

describe('persona applicability and pooling', () => {
  it('relaxes 1, 2 and 6 and weights 13 and 14 for Alex only', () => {
    expect([1, 2, 6, 13, 3].map((n) => applicabilityOf('alex-chen', n))).toEqual([
      'relaxed',
      'relaxed',
      'relaxed',
      'weighted',
      'full',
    ]);
    expect(applicabilityOf('maya-santos', 1)).toBe('full');
  });

  it('weights 13 and 14 double in the score where they are weighted', () => {
    const items = [
      { item: 13, status: 'FAIL' },
      { item: 3, status: 'PASS' },
      { item: 1, status: 'RELAXED' },
    ];
    expect(weightedScore(items, 'alex-chen')).toBe(0.33);
    expect(weightedScore(items, 'ferni')).toBe(0.5);
  });

  it('passes a pooled item only when every scored call passes', () => {
    const pooled = poolItems([
      { items: [{ item: 3, name: 'q', threshold: 't', status: 'PASS', value: 1 }] },
      { items: [{ item: 3, name: 'q', threshold: 't', status: 'FAIL', value: 0.5 }] },
      { items: [{ item: 3, name: 'q', threshold: 't', status: 'N/A', value: null }] },
    ]);
    expect(pooled[0]).toMatchObject({ status: 'FAIL', calls: '1/2' });
  });
});

describe('tagger cache key', () => {
  it('changes with the transcript and the model, not with timing', () => {
    const a = [{ n: 1, who: 'user', persona: 'ferni', text: 'hi', t: 1 }];
    expect(cacheKey(a, 'm')).toBe(cacheKey([{ ...a[0], t: 999 }], 'm'));
    expect(cacheKey(a, 'm')).not.toBe(cacheKey([{ ...a[0], text: 'hey' }], 'm'));
    expect(cacheKey(a, 'm')).not.toBe(cacheKey(a, 'other'));
  });
});
