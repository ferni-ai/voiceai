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
import { junkReason, keepRealEntities, type NamedEntity } from '../entity-hygiene.js';

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
