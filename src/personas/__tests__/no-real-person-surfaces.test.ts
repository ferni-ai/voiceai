/**
 * The surfaces people see a persona through (web persona cards, design-system
 * persona tokens, the team page, the legends landing page, and what teammates
 * say about each other) carry fictional characters, never the real people the
 * personas were first modelled on (Seth, 2026-10-11).
 *
 * Persona ids still carry the old names (`john-bogle`, `peter-lynch`,
 * `joel-dickson`) until the id migration, so ids and id-shaped tokens are
 * stripped before matching; everything a person can read is checked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REAL_PEOPLE =
  /Bogle|Lynch|Dickson|\bJoel\b|Vanguard|Fidelity|Magellan|Stanford|Carolyn|Brae Burn|caddy|Boston College|Sadhguru|Jaggi|\bIsha\b|Adiyogi|Chamundi|Mysore|Vijji|motorcycle|Save Soil|Rally for Rivers|Inner Engineering/i;

/** Ids and id-shaped keys that still carry the old names (id migration pending). */
const IDS = /\b(?:john-bogle|peter-lynch|joel-dickson|jack-bogle|jack_bogle|peter_lynch)\b/g;

const root = process.cwd();
const read = (path: string): string => readFileSync(join(root, path), 'utf-8');
const readable = (text: string): string => text.replace(IDS, '');

/** Every string value in a JSON tree, keys excluded. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const SHOWN_FIELDS = ['name', 'description', 'subtitle', 'entrancePhrase', 'quotes', 'traits', 'domains'] as const;

describe('web persona cards', () => {
  const config = JSON.parse(read('apps/web/src/config/personas.generated.json')) as {
    personas: Record<string, Record<string, unknown>>;
    legends: Record<string, Record<string, unknown>>;
  };
  const cards = { ...config.personas, ...config.legends };

  it.each(Object.keys(cards))('%s shows no real person', (id) => {
    const shown = SHOWN_FIELDS.flatMap((field) => strings(cards[id]?.[field]));
    expect(shown.length).toBeGreaterThan(3);
    for (const text of shown) expect(readable(text), `${id}: ${text}`).not.toMatch(REAL_PEOPLE);
  });

  it('names the legends by their fictional characters', () => {
    expect(config.legends['john-bogle']?.name).toBe('Henry Caldwell');
    expect(config.legends['peter-lynch']?.name).toBe('Tom Brannigan');
    expect(config.legends['joel-dickson']?.name).toBe('Nate Holloway');
  });
});

describe('design-system persona tokens', () => {
  it('name and describe no real person', () => {
    const tokens = strings(JSON.parse(read('design-system/tokens/personas.json')));
    const colors = strings(JSON.parse(read('design-system/tokens/colors.json')));
    expect(tokens.length).toBeGreaterThan(50);
    for (const text of [...tokens, ...colors]) expect(readable(text), text).not.toMatch(REAL_PEOPLE);
  });
});

describe('what teammates say about each other', () => {
  const FILES = [
    'src/personas/bundles/ferni/content/behaviors/team-stories.json',
    'src/personas/bundles/maya-santos/content/behaviors/team-stories.json',
    'src/personas/bundles/jordan-taylor/content/behaviors/team-stories.json',
    'src/personas/bundles/alex-chen/content/behaviors/team-stories.json',
    'src/personas/bundles/ferni/content/identity/sensory-world.json',
    'src/personas/bundles/alex-chen/content/identity/sensory-world.json',
  ];

  it.each(FILES)('%s carries the fictional lives', (path) => {
    const text = readable(read(path));
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toMatch(REAL_PEOPLE);
  });

  it('still tells the stories, in their fictional form', () => {
    expect(read(FILES[0])).toContain('married to Diane');
    expect(read(FILES[0])).toContain('walks for miles before breakfast');
  });
});

describe('public pages', () => {
  it.each([
    'apps/website/ferni-website/src/team.njk',
    'apps/website/design-system-portal/src/pages/universe.njk',
    'scripts/deploy-financial-legends.ts',
    'apps/marketplace-agents/SHOWCASE.md',
    'apps/marketplace-agents/AGENT-RECOMMENDATIONS.md',
  ])('%s shows no real person', (path) => {
    const text = readable(read(path));
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toMatch(REAL_PEOPLE);
  });

  it('tells Peter and Nayan as their fictional selves on the team page', () => {
    const team = read('apps/website/ferni-website/src/team.njk');
    expect(team).toContain('Pawtucket, Rhode Island');
    expect(team).toContain('Vadodara, Gujarat');
  });
});
