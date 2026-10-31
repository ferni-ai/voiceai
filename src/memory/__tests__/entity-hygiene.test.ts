/**
 * ENTITY_HYGIENE: junk names (numbers, placeholders, Ferni and the team, requests to
 * Ferni) are never stored as entities; real people, places and topics are.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({ reply: '[]' }));
vi.mock('../../config/generative-model.js', () => ({
  getGenerativeModel: async () => ({
    generateContent: async () => ({ response: { text: () => model.reply } }),
  }),
}));

import { extractEntities } from '../knowledge-graph/extractors/llm-entity-extractor.js';
import {
  isPersonaSubject,
  junkReason,
  keepRealEntities,
  type NamedEntity,
} from '../entity-hygiene.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const ON = { ENTITY_HYGIENE: 'on' };

describe('junkReason', () => {
  const junk: Array<[NamedEntity, string]> = [
    [{ name: '9', type: 'person' }, 'number'],
    [{ name: '10:30', type: 'event' }, 'number'],
    [{ name: 'Unknown Person', type: 'person' }, 'placeholder'],
    [{ name: 'unspecified item', type: 'concept' }, 'placeholder'],
    [{ name: 'someone at work', type: 'person' }, 'placeholder'],
    [{ name: 'the item', type: 'concept' }, 'placeholder'],
    [{ name: 'She', type: 'person' }, 'placeholder'],
    [{ name: 'My', type: 'person' }, 'placeholder'],
    [{ name: 'giving the item to Ferni', type: 'topic' }, 'persona'],
    [{ name: 'Hey Maya', type: 'person' }, 'persona'],
    [{ name: 'Ferni', type: 'person', relationship: 'friend' }, 'persona'],
    [{ name: 'Fernie', type: 'person' }, 'persona'],
    [{ name: 'Furny', type: 'person' }, 'persona'],
    [{ name: 'Maya', type: 'person' }, 'persona'],
    [{ name: 'Peter John', type: 'person' }, 'persona'],
    [{ name: 'Jordon', type: 'person' }, 'persona'],
    [{ name: 'Alex', type: 'person', relationship: 'assistant' }, 'persona'],
    [{ name: 'Talk to Maya', type: 'topic' }, 'request'],
    [{ name: 'Play music', type: 'topic' }, 'request'],
    [{ name: 'call my dad and check in', type: 'topic' }, 'request'],
    [{ name: 'set a timer', type: 'concept' }, 'request'],
    [{ name: 'remind me to stretch', type: 'commitment' }, 'request'],
  ];
  it.each(junk)('rejects %o as %s', (entity, reason) => {
    expect(junkReason(entity)).toBe(reason);
  });

  const real: NamedEntity[] = [
    { name: 'Sarah', type: 'person', relationship: 'sister' },
    { name: 'my brother', type: 'person', relationship: 'brother' },
    { name: 'Jordan', type: 'person', relationship: 'friend' },
    { name: 'Michael Jordan', type: 'person' },
    { name: 'Maya Angelou', type: 'person' },
    { name: 'Mayan ruins', type: 'place' },
    { name: 'Jordan River', type: 'place' },
    { name: 'Denver', type: 'place' },
    { name: 'retirement savings', type: 'goal' },
    { name: "Mike's wedding", type: 'event' },
    { name: '9/11 memorial', type: 'place' },
    { name: 'school play', type: 'event' },
    { name: 'calling more often', type: 'commitment' },
    { name: 'Alexandra', type: 'person' },
    { name: 'Google', type: 'organization' },
  ];
  it.each(real)('keeps %o', (entity) => {
    expect(junkReason(entity)).toBeNull();
  });
});

describe('keepRealEntities', () => {
  const entities: NamedEntity[] = [
    { name: '9', type: 'person' },
    { name: 'Sarah', type: 'person', relationship: 'sister' },
    { name: 'Play music', type: 'topic' },
  ];

  it('drops the junk when on, with the reason', () => {
    const { kept, dropped } = keepRealEntities(entities, ON);
    expect(kept.map((e) => e.name)).toEqual(['Sarah']);
    expect(dropped).toEqual([
      { name: '9', reason: 'number' },
      { name: 'Play music', reason: 'request' },
    ]);
  });

  it('keeps everything when off', () => {
    expect(keepRealEntities(entities, {}).kept).toEqual(entities);
  });
});

describe('extractEntities (the extractor whose entities the entity store creates)', () => {
  const reply = JSON.stringify([
    { name: '9', type: 'person', confidence: 0.6 },
    { name: 'Unknown Person', type: 'person', confidence: 0.5 },
    { name: 'Talk to Maya', type: 'commitment', confidence: 0.7 },
    { name: 'Sarah', type: 'person', relationship: 'sister', confidence: 0.9 },
    { name: 'Denver', type: 'place', confidence: 0.8 },
  ]);
  const context = { userId: 'u1', sessionId: 's1', turnNumber: 1 };

  it('flag on: only the real people and places come out', async () => {
    vi.stubEnv('ENTITY_HYGIENE', 'on');
    model.reply = reply;
    const { entities } = await extractEntities('my sister Sarah moved to Denver', context);
    expect(entities.map((e) => e.name)).toEqual(['Sarah', 'Denver']);
  });

  it('flag off: unchanged, the junk comes out too', async () => {
    vi.stubEnv('ENTITY_HYGIENE', 'off');
    model.reply = reply;
    const { entities } = await extractEntities('my sister Sarah moved to Denver', context);
    expect(entities).toHaveLength(5);
  });

  it('flag on: the rule-based fallback is cleaned too', async () => {
    vi.stubEnv('ENTITY_HYGIENE', 'on');
    model.reply = 'not json';
    const { entities } = await extractEntities('Hi Maya, my mom said Ferni was great', context);
    expect(entities.map((e) => e.name)).toEqual(['mother']);
  });
});

/** Prod 2026-10-20: STT heard "Hey Ferni" as "Hey Fred."; "Fred" and "Everyone" were stored. */
describe('a name the caller only greets, and "everyone"', () => {
  const said = 'Hey Fred.\nEveryone very good.';
  const fred: NamedEntity = { name: 'Fred', type: 'person', relationship: 'friend' };

  it('drops the greeted name and "Everyone" from the call', () => {
    expect(junkReason(fred, ON, said)).toBe('greeted');
    const everyone = { name: 'Everyone', type: 'person', relationship: 'social circle' };
    expect(junkReason(everyone, ON, said)).toBe('placeholder');
    expect(junkReason({ name: 'everybody at work', type: 'person' }, ON)).toBe('placeholder');
  });

  it.each(['Hi, Fred, how are you?', 'Hello Fred', 'Okay. Hey Fred!'])(
    'drops a person only greeted in %j',
    (text) => {
      expect(junkReason(fred, ON, text)).toBe('greeted');
    }
  );

  it.each([
    'my friend Fred says hi',
    'Hey Fred came over yesterday.',
    'Hey Fred. My friend Fred is visiting.',
    'I saw Fred.',
    'Hey Fred Rogers was on TV',
    '',
  ])('keeps a person the caller talks about in %j', (text) => {
    expect(junkReason(fred, ON, text)).toBeNull();
  });

  it('keeps a place or topic that follows a greeting', () => {
    expect(junkReason({ name: 'Denver', type: 'place' }, ON, 'Hey Denver.')).toBeNull();
  });

  it('the extractor stores neither from the call, and a real Fred still', async () => {
    model.reply = JSON.stringify([
      { name: 'Fred', type: 'person', relationship: 'friend', confidence: 0.8 },
      { name: 'Everyone', type: 'person', relationship: 'social circle', confidence: 0.6 },
    ]);
    const context = { userId: 'u1', sessionId: 's1', turnNumber: 2 };
    vi.stubEnv('ENTITY_HYGIENE', 'on');
    expect((await extractEntities(said, context)).entities).toEqual([]);
    const real = await extractEntities('my friend Fred says hi to everyone', context);
    expect(real.entities.map((e) => e.name)).toEqual(['Fred']);
    vi.stubEnv('ENTITY_HYGIENE', 'off');
    expect((await extractEntities(said, context)).entities).toHaveLength(2);
  });
});

/** ENTITY_ROLE_LABELS: Ferni stored under the extractor's role words (prod 2026-10-19). */
describe('ENTITY_ROLE_LABELS', () => {
  const ROLES_ON = { ...ON, ENTITY_ROLE_LABELS: 'on' };
  const roles: NamedEntity[] = [
    { name: "User's interlocutor", type: 'person', relationship: 'collaborator' },
    { name: 'Assistant', type: 'person', relationship: 'AI assistant / conversational partner' },
    {
      name: "The user's conversational partner",
      type: 'person',
      relationship: 'conversational partner',
    },
    { name: 'the AI', type: 'person' },
    { name: 'AI assistant', type: 'concept' },
  ];

  it.each(roles)('on: rejects %o as persona', (entity) => {
    expect(junkReason(entity, ROLES_ON)).toBe('persona');
  });

  it.each(roles)('off: %o is kept, as before', (entity) => {
    expect(junkReason(entity, ON)).toBeNull();
  });

  const real: NamedEntity[] = [
    { name: 'Karen', type: 'person', relationship: 'assistant' },
    { name: 'my assistant Karen', type: 'person', relationship: 'assistant' },
    { name: 'Google Assistant', type: 'organization' },
    { name: 'Ainsley', type: 'person' },
    { name: 'business partner', type: 'concept' },
  ];
  it.each(real)('on: keeps %o', (entity) => {
    expect(junkReason(entity, ROLES_ON)).toBeNull();
  });

  it('the extractor drops the role labels only with both flags on', async () => {
    const reply = JSON.stringify([
      {
        name: "User's interlocutor",
        type: 'person',
        relationship: 'collaborator',
        confidence: 0.7,
      },
      { name: 'Assistant', type: 'person', confidence: 0.7 },
      { name: 'Sarah', type: 'person', relationship: 'sister', confidence: 0.9 },
    ]);
    const context = { userId: 'u1', sessionId: 's1', turnNumber: 1 };
    model.reply = reply;
    vi.stubEnv('ENTITY_HYGIENE', 'on');
    const hygieneOnly = await extractEntities('my sister Sarah says hi', context);
    expect(hygieneOnly.entities.map((e) => e.name)).toEqual([
      "User's interlocutor",
      'Assistant',
      'Sarah',
    ]);
    vi.stubEnv('ENTITY_ROLE_LABELS', 'on');
    const both = await extractEntities('my sister Sarah says hi', context);
    expect(both.entities.map((e) => e.name)).toEqual(['Sarah']);
  });
});

describe('isPersonaSubject', () => {
  it('is Ferni or a teammate name only when no relationship is stored for it', () => {
    expect(isPersonaSubject('Ferni')).toBe(true);
    expect(isPersonaSubject('Maya')).toBe(true);
    expect(isPersonaSubject('Peter John', null)).toBe(true);
    expect(isPersonaSubject('Maya', '  ')).toBe(true);
    // Any stored relationship is a real person in their life, a human coach included.
    expect(isPersonaSubject('Maya', 'friend')).toBe(false);
    expect(isPersonaSubject('Jordan', 'coach')).toBe(false);
    expect(isPersonaSubject('Alex', 'companion')).toBe(false);
    expect(isPersonaSubject('Maya Angelou')).toBe(false);
    expect(isPersonaSubject('Rowan')).toBe(false);
    expect(isPersonaSubject('  ')).toBe(false);
  });
});
