import { describe, expect, it } from 'vitest';
import {
  coachMediaEnabled,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS,
  sessionIdentifiers,
  topicOnlyQuery,
} from '../topic-query.js';

describe('topicOnlyQuery', () => {
  it("removes the caller's name, possessive and any case, and keeps the topic lowercased", () => {
    const q = topicOnlyQuery("Seth's beginner shin splint stretches for SETH ford", ['Seth Ford']);
    expect(q).toBe('beginner shin splint stretches for');
  });

  it('removes family names and places the session does not know', () => {
    const ids = sessionIdentifiers({
      name: 'Seth',
      services: { userProfile: { familyMembers: [{ name: 'Mindy', relationship: 'spouse' }] } },
    });
    const q = topicOnlyQuery("stretches for Mindy's knee after her surgery at Mayo", ids);
    expect(q).not.toMatch(/mindy/i);
    expect(q).not.toMatch(/mayo/i);
    expect(q).toBe('stretches for knee after her surgery at');
  });

  it('keeps common tools people learn after a preposition', () => {
    expect(topicOnlyQuery('getting started in Python', [])).toBe('getting started in python');
    expect(topicOnlyQuery('budget sheet in Excel at Acme', [])).toBe('budget sheet in excel at');
  });

  it('keeps language words after a preposition', () => {
    expect(topicOnlyQuery('conversation practice in Spanish', [])).toBe(
      'conversation practice in spanish'
    );
  });

  it('removes a name only as a whole word', () => {
    expect(topicOnlyQuery('Mark: stock market basics', ['Mark'])).toBe('stock market basics');
    expect(topicOnlyQuery('algebra basics', ['Al'])).toBe('algebra basics');
  });

  it('removes quoted strings, emails, links and phone, account or card numbers', () => {
    const q = topicOnlyQuery(
      'budgeting app tips "Dana Whitfield" seth@example.com https://evil.example/x?u=1 call 415-555-0134 card 4111 1111 1111 1111',
      []
    );
    expect(q).toBe('budgeting app tips call card');
  });

  it(`keeps at most ${MAX_QUERY_WORDS} words`, () => {
    const q = topicOnlyQuery(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
      []
    );
    expect(q!.split(' ')).toHaveLength(MAX_QUERY_WORDS);
    expect(q).not.toContain('thirteen');
  });

  it('removes a phone number in other digits or with other dashes', () => {
    for (const phone of [
      '415–555–0134',
      '415—555—0134',
      '415_555_0134',
      '٤١٥٥٥٥٠١٣٤',
      '٤١٥-٥٥٥-٠١٣٤',
    ]) {
      expect(topicOnlyQuery(`budgeting tips call ${phone}`, [])).toBe('budgeting tips call');
    }
  });

  it('keeps short numbers that are part of a topic', () => {
    expect(topicOnlyQuery('couch to 5k week 3', [])).toBe('couch to 5k week 3');
  });

  it('returns null when nothing but identifiers is left', () => {
    expect(topicOnlyQuery('Seth 415 555 0134', ['Seth'])).toBeNull();
    expect(topicOnlyQuery('   ', [])).toBeNull();
  });

  it('caps the query length and drops markup', () => {
    const q = topicOnlyQuery(`<b>${'sleepinghabits '.repeat(12)}</b>`, []);
    expect(q!.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(q).not.toMatch(/[<>]/);
  });
});

describe('topicOnlyQuery leaks found in review', () => {
  it.each([
    ['tips for Brian', 'tips for'],
    ['stretches Sloan showed me', 'stretches showed me'],
    ['what Eric and Ethan recommend', 'what and recommend'],
    ['a coach in Greenwich', 'a coach in'],
    ['help with Jordan at work', 'help with at work'],
    ['talking to Megan about her diabetes diagnosis', 'talking to about her diabetes diagnosis'],
    ['helping Ryan with homework', 'helping with homework'],
    ['my friend named mike says try yoga', 'my friend says try yoga'],
    ['a dog called biscuit', 'a dog'],
    ['born 03/14/1980 sleep tips', 'born sleep tips'],
    ['since 3-14-1980 and 2024.05.01', 'since and'],
    ['on 3/4/80 back pain', 'on back pain'],
    ['member 4111/1111/22 perks', 'member perks'],
    ['what "dana whitfield" said about budgets', 'what said about budgets'],
  ])('%s → %s', (topic, expected) => {
    expect(topicOnlyQuery(topic, [])).toBe(expected);
  });

  // Round-2 review: each must come out without the name, place or identifier.
  it.each([
    ['my son jake failing math', /jake/],
    ['with sarah at work conflict', /sarah/],
    ['for dad bob retirement', /bob/],
    ['my wife maria cancer diagnosis', /maria/],
    ['dr. smith knee surgery', /smith/],
    ['lives at 123 main st apt 4b tampa', /123|main st|4b|tampa/],
    ['march 3rd 2026 sleep schedule', /march|3rd|2026/],
    ['since 12/25 no sleep', /12|25/],
    ['jake age 14 study habits', /jake/],
    ['ask @jakeford99 about lifting', /jakeford|99|@/],
    ['tips from evil.com/x', /evil|com/],
    ['email seth(at)ferni.ai about it', /seth|ferni|\(at\)/],
    ['notes for se\u200bth on sleep', /se.?th/],
  ])('%s', (topic, leak) => {
    const once = topicOnlyQuery(topic, ['Seth']);
    expect(once ?? '').not.toMatch(leak);
    expect(topicOnlyQuery(once ?? '', ['Seth'])).toBe(once);
  });

  it.each([
    'beginner shin splint stretches',
    'budgeting for retirement',
    'mindfulness for anxiety',
    'couch to 5k week 3',
    'foam rolling for runners',
    'spanish lessons for kids',
    'sleep hygiene for shift workers',
  ])('leaves a generic topic alone: %s', (topic) => {
    expect(topicOnlyQuery(topic, ['Seth'])).toBe(topic);
  });

  it.each([
    ['write jake.ford(at)gmail(dot)com about it', [], 'write about it'],
    // After a relation, every unknown word goes (it could be a name), not just one.
    ['my boss kowalczyk micromanages', [], 'my boss'],
    ['notes for kowal\u200bczyk on sleep', ['Kowalczyk'], 'notes for on sleep'],
    ['nunez cooking class', ['Núñez'], 'cooking class'],
  ])('%s → %s', (topic, ids, expected) => {
    expect(topicOnlyQuery(topic, ids as string[])).toBe(expected);
  });

  it('matches profile names with or without accents', () => {
    expect(topicOnlyQuery('stretches for jose', ['José'])).toBe('stretches for');
    expect(topicOnlyQuery('stretches for josé', ['Jose'])).toBe('stretches for');
  });

  // Follow-up review: names go, the topic stays, and a second pass changes nothing.
  it.each([
    ['my wife maria cancer diagnosis', 'my wife cancer diagnosis'],
    ['my mom alzheimers', 'my mom alzheimers'],
    ['my brother depression', 'my brother depression'],
    ['my son jake failing math', 'my son failing math'],
    ['dr. smith knee surgery', 'knee surgery'],
    ['for dad bob retirement', 'for dad retirement'],
    ['seth(at)ferni.ai budgeting', 'budgeting'],
  ])('%s → %s, twice', (topic, expected) => {
    const once = topicOnlyQuery(topic, ['Seth']);
    expect(once).toBe(expected);
    expect(topicOnlyQuery(once ?? '', ['Seth'])).toBe(once);
  });

  // Uncommon names after a relation or title are unknown to the parser, like many
  // topic words: they go, and only topic words (TOPIC_WORDS or known non-names) stay.
  it.each([
    ['my son zephyr has adhd', 'zephyr', 'my son has adhd'],
    ['my daughter priya anxiety', 'priya', 'my daughter anxiety'],
    ['my wife aaliyah postpartum depression', 'aaliyah', 'my wife postpartum depression'],
    ['my sister xiomara dyslexia', 'xiomara', 'my sister dyslexia'],
    ['dr. okonkwo knee surgery', 'okonkwo', 'knee surgery'],
    ['my friend siobhan grief', 'siobhan', 'my friend grief'],
    ['my husband tomasz burnout', 'tomasz', 'my husband burnout'],
    ['my mom nguyen alzheimers', 'nguyen', 'my mom alzheimers'],
    ['my grandpa okafor parkinsons', 'okafor', 'my grandpa parkinsons'],
    ['mrs. adeyemi math tutoring', 'adeyemi', 'math tutoring'],
    ['my coworker zephyr okonkwo insomnia', 'okonkwo', 'my coworker insomnia'],
    ['my partner priya struggling with sleep', 'priya', 'my partner struggling with sleep'],
  ])('%s: never sends %s', (topic, name, expected) => {
    const once = topicOnlyQuery(topic, []);
    expect(once ?? '').not.toContain(name);
    expect(once).toBe(expected);
    expect(topicOnlyQuery(once ?? '', [])).toBe(once);
  });

  // compromise reads "bob golf" as one person; the name goes (it is a name on its
  // own), the topic after it stays.
  it.each([
    ['helping bob golf', 'helping golf'],
    ['with jake mortgage', 'with mortgage'],
  ])('%s → %s', (topic, expected) => {
    expect(topicOnlyQuery(topic, [])).toBe(expected);
  });

  // Known limit: compromise doesn't tag an uncommon lowercase name with no
  // relation word before it, so these go out as they are (as on main before #1411).
  it.todo('drops zephyr from "helping zephyr with homework"');
  it.todo('drops priya from "talking with priya about grief"');
  it.todo('drops xiomara from "notes on xiomara\'s anxiety"');
  it.todo('drops okonkwo from "okonkwo knee pain"');

  it('keeps ordinary words after a relation: "my mom and dad divorce", "my son is failing math"', () => {
    expect(topicOnlyQuery('my mom and dad divorce', [])).toBe('my mom and dad divorce');
    expect(topicOnlyQuery('my son is failing math', [])).toBe('my son is failing math');
  });

  it('is idempotent: scrubbing its own output changes nothing', () => {
    const ids = ['Seth Ford', 'Mindy', 'José'];
    for (const topic of [
      "stretches for Mindy's knee after her surgery at Mayo",
      'talking to Megan about her diabetes diagnosis',
      'my friend named mike says try yoga in Spanish',
      '<b>"Seth"</b> | mindy’s [knee] 03/14/1980 seth@x.io https://x.io',
      'ADHD focus tips in Excel for josé at Acme',
    ]) {
      const once = topicOnlyQuery(topic, ids);
      expect(topicOnlyQuery(once ?? '', ids)).toBe(once);
      expect(once ?? '').not.toMatch(/seth|mindy|mayo|megan|mike|acme|jos/);
    }
  });

  it('strips names first, so the 12-word cap keeps topic words', () => {
    const q = topicOnlyQuery(
      'mindy one two three four five six seven eight nine ten eleven twelve',
      ['Mindy']
    );
    expect(q).toBe('one two three four five six seven eight nine ten eleven twelve');
  });

  it('strips names again at the end, when another step uncovered one', () => {
    // "seth12345": the name only stands alone once the digit run is gone.
    expect(topicOnlyQuery('notes for seth12345 on sleep', ['Seth'])).toBe('notes for on sleep');
  });

  it('matches a known name however it is composed (NFD vs NFC)', () => {
    const nfd = 'Jose\u0301';
    expect(topicOnlyQuery('stretches for josé', [nfd])).toBe('stretches for');
    expect(topicOnlyQuery('stretches for jose\u0301', ['José'])).toBe('stretches for');
  });

  it('keeps languages, a few tools and acronyms people learn', () => {
    expect(topicOnlyQuery('ADHD focus tips in Spanish with Excel', [])).toBe(
      'adhd focus tips in spanish with excel'
    );
  });
});

describe('sessionIdentifiers', () => {
  it('collects the caller, profile, family and city names', () => {
    expect(
      sessionIdentifiers({
        name: 'Seth Ford',
        services: {
          userProfile: {
            preferredName: 'Sethy',
            familyMembers: [{ name: 'Mindy' }, { relationship: 'son' }],
            location: { city: 'St. Petersburg' },
          },
        },
      })
    ).toEqual(['Seth Ford', 'Sethy', 'St. Petersburg', 'Mindy']);
  });
});

describe('coachMediaEnabled', () => {
  it('is on only for COACH_MEDIA=on', () => {
    expect(coachMediaEnabled({})).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: 'true' })).toBe(false);
    expect(coachMediaEnabled({ COACH_MEDIA: ' ON ' })).toBe(true);
  });
});
