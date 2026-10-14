import { describe, expect, it } from 'vitest';
import { rememberedPeople, saysName, toneOf, type NameLiftEffect } from '../person-valence.js';
import type { RecallFact, RecallSnapshot } from '../session-recall.js';

const f = (
  entity: string,
  key: string,
  value: string,
  extra: Partial<RecallFact> = {}
): RecallFact => ({
  entity,
  key,
  value,
  confidence: 0.9,
  ...extra,
});
const snap = (facts: RecallFact[], followUps: string[] = []): RecallSnapshot => ({
  facts,
  followUps,
});
const effectFor = (s: RecallSnapshot, name: string): NameLiftEffect | undefined =>
  rememberedPeople(s).find((p) => p.names.includes(name))?.effect;

describe('rememberedPeople: valence from what is stored', () => {
  it('good news brightens', () => {
    expect(effectFor(snap([f('Mom', 'surgery', 'went well, she is home')]), 'Mom')).toBe(
      'brighten'
    );
    expect(effectFor(snap([f('Joan', 'sister of speaker', 'got engaged in June')]), 'Joan')).toBe(
      'brighten'
    );
  });

  it('something pending or uncertain is attentive, never brighten', () => {
    expect(effectFor(snap([f('Mom', 'surgery', 'scheduled for next week')]), 'Mom')).toBe(
      'attentive'
    );
    expect(effectFor(snap([f('Dad', 'health', 'waiting on biopsy results')]), 'Dad')).toBe(
      'attentive'
    );
    // Hopeful but not happened yet: still pending, no sparkle.
    expect(
      effectFor(
        snap([f('Joan', 'sister of speaker', 'wedding planned for next month, she is excited')]),
        'Joan'
      )
    ).toBe('attentive');
    expect(effectFor(snap([f('Leo', 'nephew of speaker', 'hoping to get the job')]), 'Leo')).toBe(
      'attentive'
    );
    // Negated good news is not good news.
    expect(effectFor(snap([f('Dad', 'health', 'not doing well since the fall')]), 'Dad')).toBe(
      'attentive'
    );
    expect(effectFor(snap([f('Dad', 'health', "isn't recovering well")]), 'Dad')).toBe('attentive');
    // The extractor's temporal context counts too.
    expect(
      effectFor(snap([f('Mom', 'event', 'knee surgery', { temporalContext: 'upcoming' })]), 'Mom')
    ).toBe('attentive');
  });

  const grief: Array<[string, string]> = [
    ['status', 'passed away in March'],
    ['event', 'funeral was last Saturday'],
    ['relationship', "we're not speaking since the wedding"],
    ['relationship', "don't talk anymore"],
    ['marriage', 'going through a divorce'],
    ['history', 'had a falling out over money'],
    ['status', 'died last year'],
    ['relationship', 'estranged for years'],
    ['note', 'the speaker is still grieving him'],
    ['status', 'lost him to cancer'],
    ['status', 'is no longer with us'],
    ['status', 'passed in the spring'],
    ['status', 'passed  away'],
    ['relationship', 'they fell  out last year'],
    ['status', 'took his own life'],
    ['relationship', "hasn't spoken to her in years"],
    ['health', 'has dementia and does not recognize the speaker'],
  ];
  it.each(grief)('grief or conflict (%s = %s) is comfort, never brighten', (key, value) => {
    const effect = effectFor(snap([f('Dad', key, value)]), 'Dad');
    expect(effect).toBe('comfort');
    expect(effect).not.toBe('brighten');
  });

  it('grief beats good news, even when the good news is newer', () => {
    const s = snap([
      f('Dad', 'status', 'passed away', { extractedAt: '2026-01-01T00:00:00Z' }),
      f('Dad', 'legacy', 'his garden won an award', { extractedAt: '2026-10-01T00:00:00Z' }),
    ]);
    expect(effectFor(s, 'Dad')).toBe('comfort');
  });

  it('grief beats newer good news for every phrasing', () => {
    for (const [key, value] of grief) {
      const s = snap([
        f('Dad', key, value, { extractedAt: '2025-01-01T00:00:00Z' }),
        f('Dad', 'job', 'got promoted', { extractedAt: '2026-09-01T00:00:00Z' }),
      ]);
      expect([value, effectFor(s, 'Dad')]).toEqual([value, 'comfort']);
    }
    const lost = snap([
      f('Anna', 'relationship', 'sister of speaker'),
      f('Anna', 'job', 'got promoted'),
      f('User', 'loss', 'lost Anna to cancer'),
    ]);
    expect(effectFor(lost, 'Anna')).toBe('comfort');
  });

  it('grief stored under the caller still covers the person it names', () => {
    const s = snap([
      f('Dad', 'relation', 'father of speaker'),
      f('Dad', 'hobby', 'his team won the league'),
      f('User', 'loss', 'Dad passed away last spring'),
    ]);
    expect(effectFor(s, 'Dad')).toBe('comfort');
  });

  it('an open thread about a death is comfort; other threads are not news', () => {
    expect(
      effectFor(
        snap([f('Joan', 'sister of speaker', 'got engaged')], ["Ask about Joan's funeral plans"]),
        'Joan'
      )
    ).toBe('comfort');
    expect(
      effectFor(
        snap([f('Joan', 'sister of speaker', 'got engaged')], ["Ask how Joan's surgery went"]),
        'Joan'
      )
    ).toBe('brighten');
  });

  it('good and pending mixed: the clear newest wins, otherwise attentive', () => {
    const older = { extractedAt: '2026-09-01T00:00:00Z' };
    const newer = { extractedAt: '2026-10-01T00:00:00Z' };
    expect(
      effectFor(
        snap([
          f('Mom', 'surgery', 'scheduled next week', older),
          f('Mom', 'surgery', 'went well', newer),
        ]),
        'Mom'
      )
    ).toBe('brighten');
    expect(
      effectFor(
        snap([
          f('Mom', 'surgery', 'went well', older),
          f('Mom', 'scan', 'waiting on results', newer),
        ]),
        'Mom'
      )
    ).toBe('attentive');
    expect(
      effectFor(
        snap([f('Mom', 'surgery', 'went well'), f('Mom', 'scan', 'waiting on results')]),
        'Mom'
      )
    ).toBe('attentive');
  });

  it('unknown people and people with nothing felt about them get nothing', () => {
    const s = snap([f('Joan', 'sister of speaker', 'lives in Tucson')]);
    expect(effectFor(s, 'Joan')).toBeUndefined();
    expect(rememberedPeople(snap([]))).toEqual([]);
  });

  it('pets and places are not people', () => {
    const s = snap([f('Biscuit', 'vet visit', 'went well'), f('Austin', 'move', 'went well')]);
    expect(rememberedPeople(s)).toEqual([]);
  });

  it('a known alias joins the names', () => {
    const s = snap([
      f('Samuel', 'relation', 'best friend'),
      f('Samuel', 'nickname', 'Sam'),
      f('Samuel', 'job', 'got promoted'),
    ]);
    expect(rememberedPeople(s)).toEqual([{ names: ['Samuel', 'Sam'], effect: 'brighten' }]);
  });
});

describe('saysName: whole words only', () => {
  it('never matches inside another word or name', () => {
    expect(saysName('Samuel called me', 'Sam')).toBe(false);
    expect(saysName('Sam called me', 'Samuel')).toBe(false);
    expect(saysName('my sister-in-law came', 'sister')).toBe(false);
    expect(saysName('Joanna is here', 'Joan')).toBe(false);
  });

  it('matches the whole name, possessives and roles in any case', () => {
    expect(saysName("Sam's back", 'Sam')).toBe(true);
    expect(saysName('so my mom called', 'Mom')).toBe(true);
    expect(saysName('Mary Beth called', 'Mary Beth')).toBe(true);
  });

  it('proper names match only capitalised, so "will" is not Will', () => {
    expect(saysName('I will call later', 'Will')).toBe(false);
    expect(saysName('Will called later', 'Will')).toBe(true);
  });
});

describe('toneOf', () => {
  it('does not read "passed" in "passed away" as passing an exam', () => {
    expect(toneOf('passed away')).toBe('comfort');
    expect(toneOf('passed the bar exam')).toBe('good');
  });

  it("does not read won't as won", () => {
    expect(toneOf("won't see a doctor")).not.toBe('good');
  });
});
