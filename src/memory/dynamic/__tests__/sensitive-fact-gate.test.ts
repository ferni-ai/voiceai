/**
 * Extraction drops health / money / belief facts while that category is off.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const enabled = vi.hoisted(() => ({ health: false, finances: false, beliefs: false }));
vi.mock('../../../services/memory-consent/index.js', async () => {
  const classifier = await vi.importActual<
    typeof import('../../../services/memory-consent/classifier.js')
  >('../../../services/memory-consent/classifier.js');
  return {
    ...classifier,
    isCategoryEnabled: vi.fn(async (_uid: string, c: keyof typeof enabled) => enabled[c]),
  };
});

const { filterSensitive } = await import('../sensitive-fact-gate.js');

const facts = [
  { entityName: 'user', key: 'diagnosis', value: 'asthma', factType: 'attribute' },
  { entityName: 'user', key: 'sleep_quality', value: 'poor', factType: 'health' },
  { entityName: 'user', key: 'debt', value: 'credit card debt', factType: 'state' },
  { entityName: 'user', key: 'attends', value: 'church on Sundays', factType: 'event' },
  { entityName: 'Sarah', key: 'relationship', value: 'sister', factType: 'relationship' },
  { entityName: 'user', key: 'likes', value: 'hiking', factType: 'preference' },
];
const entities = [
  { name: 'Sarah', type: 'person', attributes: {} },
  { name: 'diabetes', type: 'concept', attributes: {} },
  { name: 'Portland', type: 'place', attributes: {} },
];

beforeEach(() => {
  enabled.health = false;
  enabled.finances = false;
  enabled.beliefs = false;
});

describe('filterSensitive', () => {
  it('keeps only non-sensitive items when nothing is consented', async () => {
    const r = await filterSensitive('u1', facts, entities);
    expect(r.facts.map((f) => f.key)).toEqual(['relationship', 'likes']);
    expect(r.entities.map((e) => e.name)).toEqual(['Sarah', 'Portland']);
    expect(r.dropped).toBe(5);
  });

  it('lets a consented category through, per category', async () => {
    enabled.health = true;
    const r = await filterSensitive('u1', facts, entities);
    expect(r.facts.map((f) => f.key)).toEqual([
      'diagnosis',
      'sleep_quality',
      'relationship',
      'likes',
    ]);
    expect(r.entities.map((e) => e.name)).toContain('diabetes');
  });

  it('never keeps a secret: redacts values and drops secret-only facts', async () => {
    enabled.finances = true;
    const r = await filterSensitive(
      'u1',
      [
        {
          entityName: 'user',
          key: 'card_number',
          value: '4111 1111 1111 1111',
          factType: 'finance',
        },
        { entityName: 'user', key: 'bank_pin', value: '4821', factType: 'finance' },
        {
          entityName: 'user',
          key: 'debt',
          value: 'card 4111111111111111 has a big balance',
          factType: 'finance',
        },
        { entityName: 'user', key: 'note', value: 'my pin is 4821', factType: 'attribute' },
        { entityName: 'Mom', key: 'phone', value: '555 123 4567', factType: 'attribute' },
      ],
      []
    );
    expect(r.facts.map((f) => f.key)).toEqual(['debt', 'phone']);
    expect(JSON.stringify(r.facts)).not.toMatch(/4111|4821/);
    expect(r.facts[1]!.value).toBe('555 123 4567');
  });
});
