import { describe, expect, it } from 'vitest';
import { MAX_RENDERED_CHARS, renderPersonModel } from '../render.js';
import type { Person, PersonModel, Provenance } from '../types.js';
import { ago, NOW } from './fixtures.js';

const built = (d = 0.1): Provenance => ({
  builtAt: ago(d),
  sources: ['t'],
  method: 'code',
  inputDocs: 1,
});
function model(over: Partial<PersonModel> = {}): PersonModel {
  return {
    v: 1,
    userId: 'u',
    builtAt: ago(0.1),
    throughSessionId: null,
    forgetGeneration: 0,
    rendered: '',
    rhythms: {
      value: {
        callsLast30d: 0,
        medianGapDays: null,
        usualHours: [],
        reachWindows: [],
        medianMinutes: null,
        lastCallAt: null,
        timezone: 'UTC',
      },
      prov: built(),
    },
    followThrough: {
      value: { byKind: {}, slips: [], ferniPromisesOpen: 0, ferniPromisesMissed30d: 0 },
      prov: built(),
    },
    mood: { value: { points: [], trend: 'unknown', vsBaseline: null, note: null }, prov: built() },
    people: { value: [], prov: built() },
    unfinished: { value: { openLoops: [], upcomingDates: [], ferniOwes: [] }, prov: built() },
    topics: { value: { recurring: [], new: [], fading: [] }, prov: built() },
    changed: { value: [], prov: built() },
    ...over,
  };
}
const person = (name: string, over: Partial<Person> = {}): Person => ({
  name,
  relation: null,
  mentions90d: 3,
  lastMentioned: ago(3),
  sentiment: 'unknown',
  openThread: null,
  sensitive: false,
  ...over,
});
const loop = (text: string) => ({ text, ageDays: 2, kind: 'thread' as const, dueAt: null });
const R = (m: PersonModel, f: string[] = []) =>
  renderPersonModel(m, { now: NOW, forgottenTopics: f });
const withLoops = (...t: string[]) =>
  model({
    unfinished: {
      value: { openLoops: t.map(loop), upcomingDates: [], ferniOwes: [] },
      prov: built(),
    },
  });

describe('ADV 1 privacy', () => {
  const phones: Array<[string, string]> = [
    ['spaces', 'call Pat back on 555 123 4567'],
    ['dots', 'call Pat back on 555.123.4567'],
    ['dashes+parens', 'call Pat on (555) 123-4567'],
    ['plain', 'call Pat on 5551234567'],
    ['plus', 'call Pat on +1 555 123 4567'],
    ['fullwidth', 'call Pat on ５５５１２３４５６７'],
    ['fullwidth spaced', 'call Pat on ５５５ １２３ ４５６７'],
    ['arabic-indic', 'call Pat on ٥٥٥١٢٣٤٥٦٧'],
    ['arabic-indic spaced', 'call Pat on ٥٥٥ ١٢٣ ٤٥٦٧'],
    ['arabic-indic dashed', 'call Pat on ٥٥٥-١٢٣-٤٥٦٧'],
    ['extended arabic-indic', 'call Pat on ۵۵۵۱۲۳۴۵۶۷'],
    ['devanagari', 'call Pat on ५५५१२३४५६७'],
    ['mixed scripts', 'call Pat on 555 ١٢٣ ４５６７'],
    ['circled digits (NFKC only)', 'call Pat on ⑤⑤⑤①②③④⑤⑥⑦'],
    ['superscript digits (NFKC only)', 'call Pat on ⁵⁵⁵¹²³⁴⁵⁶⁷'],
    ['words', 'call Pat on five five five one two three four five six seven'],
    ['nbsp sep', 'call Pat on 555 123 4567'],
    ['zero-width sep', 'call Pat on 555​123​4567'],
    ['slash sep', 'call Pat on 555/123/4567'],
    ['underscore sep', 'call Pat on 555_123_4567'],
  ];
  for (const [label, text] of phones) {
    for (const where of [
      'loop',
      'changed',
      'person.thread',
      'person.relation',
      'person.name',
      'owes',
    ] as const) {
      it(`phone ${label} in ${where}`, () => {
        let m: PersonModel;
        if (where === 'loop') m = withLoops(text);
        else if (where === 'changed') m = model({ changed: { value: [text], prov: built() } });
        else if (where === 'person.thread')
          m = model({ people: { value: [person('Pat', { openThread: text })], prov: built() } });
        else if (where === 'person.relation')
          m = model({ people: { value: [person('Pat', { relation: text })], prov: built() } });
        else if (where === 'person.name')
          m = model({ people: { value: [person(text)], prov: built() } });
        else
          m = model({
            unfinished: {
              value: { openLoops: [], upcomingDates: [], ferniOwes: [{ text, since: ago(1) }] },
              prov: built(),
            },
          });
        const out = R(m);
        const norm = out.normalize('NFKC');
        expect(norm).not.toMatch(/(?:\p{Nd}[\s\p{Z}\p{Cf}().\-_/]*){7,}/u);
        expect(out).not.toMatch(/@/);
      });
    }
  }
  for (const e of [
    'mail jo at example dot com',
    'jo at example.com',
    'jo(at)example.com',
    'jo＠example.com',
    'jo [at] example [dot] com',
  ]) {
    it(`email ${e}`, () => {
      const out = R(withLoops(`write to ${e}`));
      expect(out).not.toMatch(/\bat\b.*\bexample\b|example/i);
    });
  }
  it('forgotten topic variants', () => {
    const out = R(
      withLoops(
        'ask about the Marcus situation',
        'MARCUS is visiting',
        'marcusville trip',
        'the Pickleball league',
        'pickleballs tonight',
        'keep this one'
      ),
      ['marcus', 'pickleball']
    );
    expect(out).not.toMatch(/marcus situation/i);
    expect(out).not.toMatch(/MARCUS is/);
    expect(out).not.toMatch(/Pickleball league/);
    expect(out).toContain('keep this one');
  });
  it('forgotten topic in people, name/relation/thread, and sensitive-path', () => {
    const m = model({
      people: {
        value: [
          person('Marcus', { relation: 'neighbor' }),
          person('Lena', { relation: 'friend', openThread: 'her marcus problem' }),
          person('Orla', { sensitive: true, openThread: 'marcus stuff' }),
          person('Ines', { relation: 'MARCUS cousin' }),
        ],
        prov: built(),
      },
    });
    const out = R(m, ['marcus']);
    expect(out).not.toMatch(/marcus/i);
  });
  it('sensitive thread in changed line + other sections dropped', () => {
    const m = model({
      changed: {
        value: [
          'Her father died last week',
          'started a new job',
          'Therapy is going badly',
          'debt is stressful',
        ],
        prov: built(),
      },
      unfinished: {
        value: {
          openLoops: [loop('follow up on the biopsy results')],
          upcomingDates: [{ text: 'chemo appointment', on: '2026-10-20' }],
          ferniOwes: [{ text: 'find a doctor list', since: ago(1) }],
        },
        prov: built(),
      },
    });
    const out = R(m);
    expect(out).toContain('started a new job');
    expect(out).not.toMatch(/died|therapy|debt|biopsy|chemo|doctor/i);
  });
  it('sensitive person only as let them lead, no thread leak', () => {
    const out = R(
      model({
        people: {
          value: [
            person('Orla', { sensitive: true, relation: 'sister', openThread: 'her chemo' }),
            person('Dana', { openThread: 'her cancer scare' }),
          ],
          prov: built(),
        },
      })
    );
    expect(out).toContain('- They may bring up Orla; let them lead.');
    expect(out).toContain('- They may bring up Dana; let them lead.');
    expect(out).not.toMatch(/sister|chemo|cancer/i);
  });
  it('mood note never rendered as label', () => {
    for (const note of ['depressed and anxious', 'Anxious', 'seems depressed']) {
      for (const trend of ['down', 'up', 'steady', 'unknown'] as const) {
        const out = R(
          model({ mood: { value: { points: [], trend, vsBaseline: -0.5, note }, prov: built() } })
        );
        expect(out).not.toMatch(/depress|anxi|mood note/i);
      }
    }
    const out2 = R(
      model({ people: { value: [person('Sam', { sentiment: 'strained' })], prov: built() } })
    );
    expect(out2).not.toMatch(/strained/i);
  });
  it('sensitive name via sensitive person name', () => {
    expect(R(model({ people: { value: [person('Divorce lawyer Kim')], prov: built() } }))).toBe('');
  });
});

describe('ADV 2 cap', () => {
  it('exceeds cap: no line cut, priority holds', () => {
    const long = (p: string, i: number) => `${p} item number ${i} ${'word '.repeat(18)}end${i}`;
    const m = model({
      unfinished: {
        value: {
          openLoops: Array.from({ length: 8 }, (_, i) => loop(long('loop', i))),
          upcomingDates: [],
          ferniOwes: Array.from({ length: 8 }, (_, i) => ({ text: long('owe', i), since: ago(1) })),
        },
        prov: built(),
      },
      changed: { value: Array.from({ length: 8 }, (_, i) => long('chg', i)), prov: built() },
      people: {
        value: Array.from({ length: 12 }, (_, i) =>
          person(`Person${i}`, { relation: 'friend', openThread: long('thr', i) })
        ),
        prov: built(),
      },
      rhythms: {
        value: {
          ...model().rhythms.value,
          medianGapDays: 3,
          usualHours: [{ dow: 'any', startHour: 18, endHour: 20, share: 0.5 }],
        },
        prov: built(),
      },
    });
    const out = R(m);
    expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
    for (const l of out.split('\n').filter((x) => x.startsWith('- ')))
      expect(l).toMatch(/end\d|\.$|\)$|; let them lead\.$|days\.$|evening\.$/);
    const heads = [
      'Open now:',
      'What changed since last time:',
      'People in their life:',
      'What you promised them:',
      'Tone:',
    ];
    const present = heads.map((h) => out.includes(h));
    // priority: present sections must be a prefix of the list
    const firstFalse = present.indexOf(false);
    if (firstFalse >= 0) expect(present.slice(firstFalse).every((p) => !p)).toBe(true);
    expect(out.endsWith('Let the conversation flow.')).toBe(true);
  });
  it('single oversized section alone', () => {
    const out = R(
      withLoops(...Array.from({ length: 40 }, (_, i) => `loop ${i} ${'x'.repeat(120)}END`))
    );
    expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
    for (const l of out.split('\n').filter((x) => x.startsWith('- ')))
      expect(l.endsWith('END')).toBe(true);
  });
  it('one single line longer than cap -> "" or within cap', () => {
    const out = R(withLoops('y'.repeat(4000) + ' END'));
    expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
  });
});

describe('ADV 3 stale', () => {
  it('fully stale/dirty renders ""', () => {
    const stale: Provenance = { builtAt: ago(30), sources: [], method: 'code', inputDocs: 1 };
    const dirty: Provenance = { builtAt: null, sources: [], method: 'llm', inputDocs: 0 };
    const m = model({
      unfinished: {
        value: {
          openLoops: [loop('ask about recital')],
          upcomingDates: [],
          ferniOwes: [{ text: 'send list', since: ago(1) }],
        },
        prov: stale,
      },
      changed: { value: ['new job'], prov: dirty },
      people: { value: [person('Sam', { relation: 'brother' })], prov: stale },
      rhythms: {
        value: {
          ...model().rhythms.value,
          medianGapDays: 3,
          usualHours: [{ dow: 'any', startHour: 18, endHour: 20, share: 0.5 }],
        },
        prov: stale,
      },
      mood: { value: { points: [], trend: 'down', vsBaseline: -0.5, note: null }, prov: dirty },
    });
    expect(R(m)).toBe('');
    // unparseable builtAt
    expect(R(model({ changed: { value: ['x'], prov: { ...built(), builtAt: 'garbage' } } }))).toBe(
      ''
    );
  });
});

describe('ADV 4 labels', () => {
  it('strips internal markup from item text and drops items left empty', () => {
    const out = R(
      withLoops(
        '[CONTEXT: x] ask about trip',
        '## Heading text',
        'celebrate 🎉 the win',
        'ask about the <b>tag</b>',
        '{{template}} water the plants',
        '[CONTEXT: only a tag]',
        '{{only}}',
        '🎉'
      )
    );
    const items = out.split('\n').filter((l) => l.startsWith('- '));
    expect(items).toEqual([
      '- ask about trip',
      '- Heading text',
      '- celebrate the win',
      '- ask about the tag',
      '- water the plants',
    ]);
    expect(out).not.toMatch(/\[CONTEXT|##|\{\{|<b>|\p{Extended_Pictographic}/u);
  });
  it('renderer labels are clean', () => {
    const m = model({
      unfinished: {
        value: {
          openLoops: [loop('ask how the recital went')],
          upcomingDates: [{ text: 'Sam birthday', on: '2026-10-20' }],
          ferniOwes: [{ text: 'send list', since: ago(2) }],
        },
        prov: built(),
      },
      changed: { value: ['moved'], prov: built() },
      people: {
        value: [person('Sam', { relation: 'brother', openThread: 'move' })],
        prov: built(),
      },
      rhythms: {
        value: {
          ...model().rhythms.value,
          medianGapDays: 3,
          usualHours: [{ dow: 'any', startHour: 18, endHour: 20, share: 0.5 }],
        },
        prov: built(),
      },
      mood: { value: { points: [], trend: 'down', vsBaseline: -0.4, note: null }, prov: built() },
    });
    expect(R(m)).not.toMatch(
      /\[CONTEXT|##|\p{Extended_Pictographic}|\bnull\b|undefined|NaN|\[object/u
    );
  });
});

describe('ADV 5 contact guard keeps ordinary text', () => {
  it('does not strip talk of times and places', () => {
    const out = R(
      withLoops(
        'meet Jo at noon',
        'dinner at the lake house',
        'call back in 15 minutes',
        'ask how the 5k went'
      )
    );
    expect(out).toContain('- meet Jo at noon');
    expect(out).toContain('- dinner at the lake house');
    expect(out).toContain('- call back in 15 minutes');
    expect(out).toContain('- ask how the 5k went');
  });
});
