/**
 * First-person detection of life story, values and beliefs, and the line
 * between a value (ungated) and a belief (consent-gated).
 */

import { describe, expect, it } from 'vitest';
import { detectInSummary, detectInUserText, toThirdPerson } from '../detect.js';
import { inputsFromFacts } from '../facts-mapping.js';
import { isSameStory, itemKeyFor } from '../rules.js';

const kinds = (text: string) => detectInUserText(text).stories.map((s) => s.kind);

describe('life story detection', () => {
  it('finds where they grew up, family of origin and school years', () => {
    const found = detectInUserText(
      "I grew up in Columbus, Ohio. I'm the youngest of four. I went to Ohio State in 2008."
    );
    expect(found.stories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'origin',
          place: 'Columbus, Ohio',
          title: 'Grew up in Columbus, Ohio',
        }),
        expect.objectContaining({ kind: 'family', title: 'The youngest of four' }),
        expect.objectContaining({ kind: 'school', title: 'Went to Ohio State', date: '2008' }),
      ])
    );
  });

  it('finds stories told, formative moments, turning points, chapters, themes', () => {
    expect(
      kinds('When I was nine, my brother Sam and I built a treehouse in the backyard.')
    ).toEqual(['story']);
    const story = detectInUserText('When I was 9, my brother Sam and I built a treehouse.')
      .stories[0];
    expect(story).toMatchObject({ period: 'age 9', people: ['Sam'] });
    expect(kinds("I'll never forget the day my grandmother taught me to bake bread.")).toEqual([
      'moment',
    ]);
    expect(kinds('Everything changed when I moved to Berlin for that job.')).toEqual([
      'turning_point',
    ]);
    expect(kinds('Those were my Berlin years, honestly the best of my life.')).toEqual(['chapter']);
    expect(kinds("I've always been the one who holds everything together.")).toEqual(['theme']);
    expect(kinds('I always sleep on big decisions.')).toEqual(['decision']);
  });

  it("ignores negations and other people's stories", () => {
    expect(kinds("I didn't grow up in Ohio, my wife did.")).toEqual([]);
    expect(kinds('My sister grew up in Denver.')).toEqual([]);
  });

  it('reads third-person summaries', () => {
    const found = detectInSummary(
      'They grew up in Lagos. They shared a story about building a treehouse with their brother.'
    );
    expect(found.map((s) => s.kind)).toEqual(['origin', 'story']);
  });

  it('turns first person into third person for the prompt', () => {
    expect(toThirdPerson('my brother and I built it for me')).toBe(
      'their brother and they built it for them'
    );
  });
});

describe('values vs beliefs', () => {
  it('"family matters most to me" is a value, never a belief', () => {
    const found = detectInUserText('Family matters most to me.');
    expect(found.values.map((v) => v.label)).toEqual(['family']);
    expect(found.beliefs).toEqual([]);
  });

  it('values in several phrasings', () => {
    expect(detectInUserText('What matters most to me is honesty.').values[0]?.label).toBe(
      'honesty'
    );
    expect(detectInUserText('I really value loyalty above everything.').values[0]?.label).toBe(
      'loyalty'
    );
    expect(detectInUserText('My kids come first.').values[0]?.label).toBe('kids');
    expect(detectInUserText('I believe in hard work.').values[0]?.label).toBe('hard work');
    expect(detectInUserText('Getting this job is important to me.').values).toEqual([]);
  });

  it.each([
    ['I go to mass on Sundays.', 'practice', 'Goes to mass on sundays'],
    ["I'm Buddhist.", 'faith', 'Buddhist'],
    ["I've been questioning my faith lately.", 'questioning', 'Has been questioning their faith'],
    ["I don't believe in God.", 'belief', "Doesn't believe in God"],
    ['I pray every morning.', 'practice', 'Prays every morning'],
  ])('"%s" is a belief (%s)', (text, kind, title) => {
    const found = detectInUserText(text);
    expect(found.beliefs[0]).toMatchObject({ kind, title });
    expect(found.values).toEqual([]);
  });

  it('a faith-shaped value goes to beliefs instead', () => {
    const found = detectInUserText('My faith matters most to me.');
    expect(found.values).toEqual([]);
    expect(found.beliefs[0]?.kind).toBe('faith');
  });
});

describe('extraction facts', () => {
  it('maps story, value and belief keys about the user; belief labels win', () => {
    const out = inputsFromFacts(
      [
        {
          id: 'f1',
          entityName: 'user',
          key: 'told_story',
          value: 'Built a treehouse with brother Sam',
          temporalContext: 'age 9',
        },
        { id: 'f2', entityName: 'user', key: 'core_value', value: 'honesty' },
        { id: 'f3', entityName: 'user', key: 'religion', factType: 'belief', value: 'Catholic' },
        { id: 'f4', entityName: 'user', key: 'core_value', value: 'my faith in God' },
        { id: 'f5', entityName: 'Sarah', key: 'told_story', value: 'Her trip to Rome' },
        { id: 'f6', entityName: 'user', key: 'grew_up_in', value: 'Ohio' },
      ],
      'c1'
    );
    expect(out.stories.map((s) => [s.kind, s.title, s.factId])).toEqual([
      ['story', 'Built a treehouse with brother Sam', 'f1'],
      ['origin', 'Grew up in Ohio', 'f6'],
    ]);
    expect(out.stories[0]).toMatchObject({ period: 'age 9', conversationId: 'c1' });
    expect(out.values.map((v) => v.label)).toEqual(['honesty']);
    expect(out.beliefs.map((b) => b.factId)).toEqual(['f3', 'f4']);
  });
});

describe('story identity', () => {
  it('a retold story is the same story', () => {
    expect(
      isSameStory('building a treehouse with my brother', 'the treehouse my brother and I built')
    ).toBe(true);
    expect(isSameStory('the treehouse with my brother', 'the time my brother broke his arm')).toBe(
      false
    );
  });

  it('origin is keyed by place', () => {
    expect(
      itemKeyFor({ area: 'story', kind: 'origin', title: 'Grew up in Ohio', place: 'Ohio' })
    ).toBe('origin:ohio');
  });
});
