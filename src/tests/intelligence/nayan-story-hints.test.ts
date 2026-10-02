/**
 * Nayan's life narrative uses what the user actually told us (life story
 * store) over inference.
 */

import { describe, expect, it } from 'vitest';
import { buildLifeNarrative } from '../../intelligence/context-builders/personas/nayan-wisdom-insights/life-narrative.js';
import type {
  LifeSynthesis,
  ValuesAlignment,
} from '../../intelligence/context-builders/personas/nayan-wisdom-insights/types.js';

const synthesis = {
  lifeChapter: 'nesting',
  dominantTheme: null,
  growthPattern: 'striving',
  compoundingAreas: [],
  valuesRevealed: ['security'],
  timeHorizon: 'unknown',
  seasonOfLife: 'unknown',
} as unknown as LifeSynthesis;
const alignment = { alignmentGaps: [], conflictAreas: [] } as unknown as ValuesAlignment;

describe('Nayan life narrative with story hints', () => {
  it('keeps inference when there is no story', () => {
    expect(buildLifeNarrative(synthesis, alignment).pastChapter).toBe('exploration');
  });

  it('uses their chapters, themes, values and turning points', () => {
    const n = buildLifeNarrative(synthesis, alignment, {
      chapters: ['My Berlin years'],
      turningPoints: ['Moving to Berlin for that job'],
      themes: ['Always the one who holds it together'],
      values: ['family'],
    });
    expect(n.pastChapter).toBe('My Berlin years');
    expect(n.recurringThemes.slice(0, 2)).toEqual([
      'Always the one who holds it together',
      'family',
    ]);
    expect(n.transformationMoments[0]).toBe('Moving to Berlin for that job');
  });
});
