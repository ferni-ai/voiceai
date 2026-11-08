import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPersonModel } from '../build.js';
import { MAX_RENDERED_CHARS, renderPersonModel } from '../render.js';
import type { Person, PersonModel, Provenance } from '../types.js';
import { CALLER_PROVENANCE } from '../../../memory/recall/session-recall.js';
import { ago, factDoc, inputs, NOW, recalled, summary } from './fixtures.js';

const HEADINGS = [
  'Open now:',
  'What changed since last time:',
  'People in their life:',
  'What you promised them:',
  'Tone:',
];
const RULE =
  "Use this awareness naturally. Don't announce what you know - just BE a friend who remembers.\n" +
  "Reference past context when relevant, but don't force it. Let the conversation flow.";

const built = (daysAgo = 0.1): Provenance => ({
  builtAt: ago(daysAgo),
  sources: ['test'],
  method: 'code',
  inputDocs: 1,
});
const dirty = (): Provenance => ({ builtAt: null, sources: [], method: 'llm', inputDocs: 0 });

/** Every section fresh and empty; tests fill in what they exercise. */
function model(over: Partial<PersonModel> = {}): PersonModel {
  return {
    v: 1,
    userId: 'test-user',
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

/** A model with something in every section. */
function full(): PersonModel {
  return model({
    unfinished: {
      value: {
        openLoops: [loop('ask how the recital went')],
        upcomingDates: [{ text: "Sam's birthday dinner", on: '2026-10-20' }],
        ferniOwes: [{ text: 'send the book list', since: ago(2) }],
      },
      prov: built(),
    },
    changed: { value: ['moved to a new apartment'], prov: built() },
    people: {
      value: [person('Sam', { relation: 'brother', openThread: 'planning the move' })],
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
}

const render = (m: PersonModel, forgottenTopics: string[] = []) =>
  renderPersonModel(m, { now: NOW, forgottenTopics });

describe('renderPersonModel: shape', () => {
  it('renders the sections in order, framed as private notes, ending with the existing rule', () => {
    const out = render(full());
    const at = HEADINGS.map((h) => out.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(out.startsWith('Private notes about this caller')).toBe(true);
    expect(out.endsWith(RULE)).toBe(true);
    expect(out).toContain('- ask how the recital went');
    expect(out).toContain("- Coming up in 2 days: Sam's birthday dinner");
    expect(out).toContain('- moved to a new apartment');
    expect(out).toContain(
      '- Sam (brother). Last mentioned 3 days ago. Open thread: planning the move.'
    );
    expect(out).toContain('- You said you would: send the book list (2 days ago)');
    expect(out).toContain('- They usually call in the evening.');
    expect(out).toContain('lower than their usual lately');
    expect(out).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('uses the rule the memory injection already uses, not a fork of it', () => {
    // agent-setup's "Who You're Talking To" block, moved to caller-card/who-block.ts
    const block = readFileSync(
      new URL('../../../agents/multi-agent/caller-card/who-block.ts', import.meta.url),
      'utf8'
    );
    expect(block).toContain(RULE);
  });

  it('renders an empty model as the empty string, with no orphan rule line', () => {
    expect(render(model())).toBe('');
    expect(
      render(model({ people: { value: [person('Sam', { name: '  ' })], prov: built() } }))
    ).toBe('');
  });

  it('shows at most 8 people', () => {
    const people = Array.from({ length: 12 }, (_, i) =>
      person(`Person${String.fromCharCode(65 + i)}`)
    );
    const out = render(model({ people: { value: people, prov: built() } }));
    expect(out.split('\n').filter((l) => l.startsWith('- Person'))).toHaveLength(8);
  });

  it('says mood only as a direction for tone, never as a label', () => {
    const out = render(full());
    expect(out).not.toMatch(/depress|anxi|diagnos|disorder|sad\b/i);
  });
});

describe('renderPersonModel: freshness', () => {
  it('skips a dirty section', () => {
    const m = full();
    m.changed = { value: ['stale text that must not appear'], prov: dirty() };
    const out = render(m);
    expect(out).not.toContain('What changed since last time:');
    expect(out).not.toContain('must not appear');
    expect(out).toContain('Open now:');
  });

  it('skips a stale section: old and not rebuilt', () => {
    const m = full();
    m.unfinished = {
      value: {
        openLoops: [loop('old thread from before')],
        upcomingDates: [],
        ferniOwes: [{ text: 'old promise', since: ago(30) }],
      },
      prov: built(10),
    };
    const out = render(m);
    expect(out).not.toContain('old thread');
    expect(out).not.toContain('old promise');
    expect(out).not.toContain('Open now:');
    expect(out).not.toContain('What you promised them:');
    expect(out).toContain('People in their life:');
  });

  it('skips a section built before their latest call', () => {
    const m = full();
    m.rhythms.value.lastCallAt = ago(0.5);
    m.people = { value: [person('Sam')], prov: built(2) };
    const out = render(m);
    expect(out).not.toContain('People in their life:');
    expect(out).toContain('Open now:');
  });

  it('keeps a section built two days ago when they have not called since', () => {
    const m = full();
    m.people = { value: [person('Sam')], prov: built(2) };
    expect(render(m)).toContain('People in their life:');
  });
});

describe('renderPersonModel: sensitive', () => {
  it('renders a sensitive person only as "let them lead", without relation or thread', () => {
    const m = model({
      people: {
        value: [
          person('Riley', {
            sensitive: true,
            relation: 'sister',
            openThread: 'planning her service',
          }),
        ],
        prov: built(),
      },
    });
    const out = render(m);
    expect(out).toContain('- They may bring up Riley; let them lead.');
    expect(out).not.toContain('sister');
    expect(out).not.toContain('service');
    expect(out).not.toContain('Last mentioned');
  });

  it('treats a thread with sensitive wording as sensitive even when the flag is off', () => {
    const m = model({
      people: { value: [person('Jo', { openThread: 'waiting on biopsy results' })], prov: built() },
    });
    const out = render(m);
    expect(out).toContain('- They may bring up Jo; let them lead.');
    expect(out).not.toContain('biopsy');
  });

  it('renders nothing for a person whose name is itself sensitive wording', () => {
    const m = model({
      people: { value: [person('Funeral Home', { sensitive: true })], prov: built() },
    });
    expect(render(m)).toBe('');
  });

  it('drops open items, promises and changes with sensitive wording entirely', () => {
    const m = model({
      unfinished: {
        value: {
          openLoops: [loop('ask about the divorce papers'), loop('ask about the garden')],
          upcomingDates: [{ text: 'chemo appointment', on: '2026-10-20' }],
          ferniOwes: [{ text: 'look up debt options', since: ago(1) }],
        },
        prov: built(),
      },
      changed: {
        value: ['lost a loved one this week, the funeral was Friday', 'adopted a cat'],
        prov: built(),
      },
    });
    const out = render(m);
    expect(out).toContain('- ask about the garden');
    expect(out).toContain('- adopted a cat');
    expect(out).not.toMatch(/divorce|chemo|debt|funeral/i);
    expect(out).not.toContain('What you promised them:');
  });
});

describe('renderPersonModel: forgotten topics', () => {
  it('drops a forgotten topic from people, open items, promises and changes', () => {
    const m = model({
      unfinished: {
        value: {
          openLoops: [loop('sign up for the pottery class'), loop('ask about the garden')],
          upcomingDates: [{ text: 'pottery class starts', on: '2026-10-21' }],
          ferniOwes: [{ text: 'find a pottery class nearby', since: ago(1) }],
        },
        prov: built(),
      },
      changed: { value: ['started a pottery class', 'adopted a cat'], prov: built() },
      people: {
        value: [
          person('Sam', { openThread: 'the pottery class' }),
          person('Kit', { relation: 'neighbor' }),
        ],
        prov: built(),
      },
    });
    const out = render(m, ['pottery class']);
    expect(out).not.toMatch(/pottery/i);
    expect(out).toContain('- ask about the garden');
    expect(out).toContain('- adopted a cat');
    // Sam stays, minus the forgotten thread.
    expect(out).toContain('- Sam. Last mentioned 3 days ago.');
    expect(out).toContain('- Kit (neighbor).');
    expect(out).not.toContain('What you promised them:');
  });

  it('drops a person the caller asked to forget, even when only a sensitive note remains', () => {
    const m = model({
      people: { value: [person('Pat', { sensitive: true }), person('Kit')], prov: built() },
    });
    const out = render(m, ['Pat']);
    expect(out).not.toContain('Pat');
    expect(out).toContain('- Kit.');
  });
});

describe('renderPersonModel: contact guard', () => {
  it('strips any line with a run of 7+ digits or an @, and keeps shorter numbers', () => {
    const m = model({
      unfinished: {
        value: {
          openLoops: [
            loop('call Kim on 4155550134'),
            loop('ring Kim on 415 555 0134'),
            loop('write to kim@example.com'),
            loop('the order 123456 arrives'),
          ],
          upcomingDates: [],
          ferniOwes: [{ text: 'text 555-0134 back', since: ago(1) }],
        },
        prov: built(),
      },
      changed: { value: ['new number 4155550134', 'adopted a cat'], prov: built() },
      people: {
        value: [person('Sam', { openThread: 'reach him at sam@example.com' })],
        prov: built(),
      },
    });
    const out = render(m);
    expect(out).toContain('the order 123456 arrives');
    expect(out).toContain('adopted a cat');
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/(?:\d[\s().-]*){7,}/);
    expect(out).not.toContain('What you promised them:');
    expect(out).not.toContain('Sam');
  });

  it('never prints a raw ISO date', () => {
    expect(render(full())).not.toMatch(/\d{4}-\d\d-\d\d/);
  });
});

describe('renderPersonModel: the 3,000-character cap', () => {
  /** Every item ends in END, so a cut mid-line shows as a line without it. */
  const sized = (pad: number): PersonModel => {
    const words = (tag: string) => `${tag} ${'word '.repeat(pad)}END`;
    return model({
      unfinished: {
        value: {
          openLoops: [1, 2, 3].map((n) => loop(words(`open${String.fromCharCode(96 + n)}`))),
          upcomingDates: [],
          ferniOwes: [{ text: words('promise'), since: ago(1) }],
        },
        prov: built(),
      },
      changed: {
        value: [1, 2, 3].map((n) => words(`change${String.fromCharCode(96 + n)}`)),
        prov: built(),
      },
      people: {
        value: ['Sam', 'Riley', 'Jo'].map((n) => person(n, { openThread: words('thread') })),
        prov: built(),
      },
      rhythms: {
        value: {
          ...model().rhythms.value,
          usualHours: [{ dow: 'any', startHour: 18, endHour: 20, share: 0.5 }],
        },
        prov: built(),
      },
    });
  };

  it('drops whole sections from the bottom of the sheet first, never cutting a line', () => {
    const seen = new Set<number>();
    let last = Infinity;
    for (let pad = 0; pad <= 70; pad += 2) {
      const out = render(sized(pad));
      expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
      const present = HEADINGS.filter((h) => out.includes(h));
      // The sections that survive are always the top of the list, in order.
      expect(present).toEqual(HEADINGS.slice(0, present.length));
      expect(present.length).toBeLessThanOrEqual(last);
      last = present.length;
      seen.add(present.length);
      for (const line of out.split('\n').filter((l) => l.startsWith('- '))) {
        expect(/END( \(.*\)|\.)?$/.test(line) || line.includes('usually call')).toBe(true);
      }
      if (present.length > 0) expect(out.endsWith(RULE)).toBe(true);
    }
    // The sweep passes through full, partial and heavily cut sheets.
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(seen.has(5)).toBe(true);
  });

  it('drops only Tone when the sheet is a character or so too long', () => {
    // One-character steps: the first overflow must cost the last section and nothing else.
    for (let n = 0; n <= 1500; n++) {
      const m = sized(0);
      m.changed = { value: [`${'w'.repeat(1500)}${'w'.repeat(n)}`], prov: built() };
      const out = render(m);
      if (!out.includes('Tone:')) {
        expect(n).toBeGreaterThan(0);
        for (const h of HEADINGS.slice(0, 4)) expect(out).toContain(h);
        expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
        return;
      }
    }
    throw new Error('the cap never engaged');
  });

  it('trims whole lines of a single section that is alone too long, and ends with nothing if none fit', () => {
    const lines = Array.from(
      { length: 40 },
      (_, i) => `item${String.fromCharCode(97 + (i % 26))}${i} ${'word '.repeat(20)}END`
    );
    const out = render(model({ changed: { value: lines, prov: built() } }));
    expect(out.length).toBeLessThanOrEqual(MAX_RENDERED_CHARS);
    expect(out).toContain('What changed since last time:');
    for (const l of out.split('\n').filter((x) => x.startsWith('- ')))
      expect(l.endsWith('END')).toBe(true);
    const huge = 'word '.repeat(700);
    expect(render(model({ changed: { value: [huge], prov: built() } }))).toBe('');
  });
});

describe('renderPersonModel: privacy fixture (design 6.4)', () => {
  it('through the build: a forgotten topic, a disputed item, a grief thread and a health fact', async () => {
    const forgotten = ['pottery class'];
    const m = buildPersonModel(
      inputs({
        facts: await recalled(
          [
            factDoc('Riley', 'sister of speaker', "The speaker's sister is named Riley", 4),
            factDoc('Riley', 'loss', 'Riley is grieving after the funeral', 2),
            factDoc('Jo', 'friend of speaker', "The speaker's friend is named Jo", 3),
            factDoc('Jo', 'health', 'biopsy results pending', 1),
            factDoc('Sam', 'friend of speaker', "The speaker's friend is named Sam", 1),
          ],
          forgotten
        ),
        summaries: [
          summary(1, {
            callerProvenance: CALLER_PROVENANCE,
            followUpItems: [
              'ask about the garden',
              'sign up for pottery class',
              'the lease was voided',
            ],
            disputedItems: ['the lease was voided'],
          }),
        ],
        forgotten,
      }),
      NOW
    );
    const out = render(m, forgotten);
    expect(out).toContain('- ask about the garden');
    expect(out).toContain('- They may bring up Riley; let them lead.');
    expect(out).toContain('- They may bring up Jo; let them lead.');
    expect(out).toContain('- Sam (friend).');
    for (const leak of [/pottery/i, /lease/i, /funeral/i, /grie/i, /biopsy/i, /health/i, /loss/i]) {
      expect(out).not.toMatch(leak);
    }
  });

  it('on a model that skipped the build filters: nothing surfaces except as "let them lead"', () => {
    const m = model({
      unfinished: {
        value: {
          openLoops: [loop('sign up for pottery class'), loop('ask about the garden')],
          upcomingDates: [],
          ferniOwes: [{ text: 'bring up the grief group', since: ago(1) }],
        },
        prov: built(),
      },
      changed: { value: ['Jo got a cancer diagnosis', 'started a pottery class'], prov: built() },
      people: {
        value: [
          person('Riley', { sensitive: true, openThread: 'grief after the funeral' }),
          person('Jo', { openThread: 'biopsy results' }),
        ],
        prov: built(),
      },
    });
    const out = render(m, ['pottery class']);
    expect(out).toContain('- ask about the garden');
    expect(out).toContain('- They may bring up Riley; let them lead.');
    expect(out).toContain('- They may bring up Jo; let them lead.');
    for (const leak of [/pottery/i, /funeral/i, /grie/i, /biopsy/i, /cancer/i, /diagnos/i]) {
      expect(out).not.toMatch(leak);
    }
  });
});
