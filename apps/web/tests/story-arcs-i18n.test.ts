import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getArcDescriptionKey, getArcNameKey, STORY_ARCS } from '../src/narrative/story-arcs';

const EN_US = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'i18n', 'locales', 'en-US.json'), 'utf8'));
const lookup = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], EN_US);

describe('story arc translation keys', () => {
  it('derives keys from the arc id', () => {
    expect(getArcNameKey(STORY_ARCS.first_launch)).toBe('storyArcs.firstLaunch.name');
    expect(getArcDescriptionKey(STORY_ARCS.evening_wind_down)).toBe('storyArcs.eveningWindDown.description');
  });

  it('every arc has an en-US name and description', () => {
    const missing = Object.values(STORY_ARCS).flatMap((arc) =>
      [getArcNameKey(arc), getArcDescriptionKey(arc)].filter((key) => typeof lookup(key) !== 'string')
    );
    expect(missing).toEqual([]);
  });
});
