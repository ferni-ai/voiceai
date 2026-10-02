/**
 * Nayan's Wisdom Insights - Life Narrative Builder
 *
 * Builds the narrative arc of a user's life journey.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/life-narrative
 */

import type { LifeNarrative, LifeSynthesis, ValuesAlignment } from './types.js';

/** What the user has actually told us about their story (services/life-story). */
export interface StoryHints {
  readonly chapters: readonly string[];
  readonly turningPoints: readonly string[];
  readonly themes: readonly string[];
  readonly values: readonly string[];
}

/** Read the life story store; empty hints when unavailable (never throws). */
export async function loadStoryHints(userId: string): Promise<StoryHints> {
  const empty: StoryHints = { chapters: [], turningPoints: [], themes: [], values: [] };
  try {
    const { getStoryView } = await import('../../../../services/life-story/index.js');
    const view = await getStoryView(userId);
    const titles = (kinds: readonly string[]) =>
      view.items.filter((i) => kinds.includes(i.kind)).map((i) => i.title);
    return {
      chapters: titles(['chapter']),
      turningPoints: titles(['turning_point', 'moment']),
      themes: titles(['theme']),
      values: view.values.map((v) => v.label),
    };
  } catch {
    return empty;
  }
}

// ============================================================================
// LIFE NARRATIVE BUILDING
// ============================================================================

export function buildLifeNarrative(
  lifeSynthesis: LifeSynthesis,
  valuesAlignment: ValuesAlignment,
  story?: StoryHints
): LifeNarrative {
  const narrative: LifeNarrative = {
    pastChapter: 'Unknown past',
    currentChapter: lifeSynthesis.lifeChapter,
    emergingChapter: 'Unknown future',
    recurringThemes: [],
    transformationMoments: [],
    unfinishedBusiness: [],
  };

  // Infer past from current
  const chapterProgression: Record<string, { past: string; future: string }> = {
    'freedom-seeking': { past: 'building', future: 'liberation' },
    nesting: { past: 'exploration', future: 'settled roots' },
    'partnership-building': { past: 'independence', future: 'shared life' },
    'foundation-building': { past: 'instability', future: 'solid ground' },
    creation: { past: 'planning', future: 'legacy' },
    expansion: { past: 'limitation', future: 'new horizons' },
    'active-growth': { past: 'stagnation', future: 'becoming' },
  };

  const progression = chapterProgression[lifeSynthesis.lifeChapter];
  if (progression) {
    narrative.pastChapter = progression.past;
    narrative.emergingChapter = progression.future;
  }

  // Recurring themes from values
  if (lifeSynthesis.valuesRevealed.length > 0) {
    narrative.recurringThemes = lifeSynthesis.valuesRevealed.slice(0, 3);
  }

  // Growth pattern as theme
  if (lifeSynthesis.growthPattern === 'striving') {
    narrative.recurringThemes.push('The drive to become more');
  } else if (lifeSynthesis.growthPattern === 'integrating') {
    narrative.recurringThemes.push('Bringing the pieces together');
  } else if (lifeSynthesis.growthPattern === 'resting') {
    narrative.recurringThemes.push('The wisdom of pause');
  }

  // Transformation moments (inferred)
  if (lifeSynthesis.compoundingAreas.length > 0) {
    narrative.transformationMoments.push('Habits becoming identity');
  }
  if (lifeSynthesis.timeHorizon === 'long') {
    narrative.transformationMoments.push('Thinking beyond the immediate');
  }

  // Unfinished business from conflicts
  for (const gap of valuesAlignment.alignmentGaps) {
    narrative.unfinishedBusiness.push(gap);
  }
  for (const conflict of valuesAlignment.conflictAreas) {
    narrative.unfinishedBusiness.push(conflict);
  }

  // What they actually told us beats inference: their chapters, turning points, themes, values.
  if (story) {
    if (story.chapters[0]) narrative.pastChapter = story.chapters[0];
    narrative.recurringThemes = [
      ...new Set([...story.themes, ...story.values, ...narrative.recurringThemes]),
    ].slice(0, 5);
    narrative.transformationMoments = [
      ...new Set([...story.turningPoints.slice(0, 3), ...narrative.transformationMoments]),
    ];
  }

  return narrative;
}
