/**
 * Nayan's Wisdom Insights - Values Alignment Analysis
 *
 * Analyzes alignment between stated values and demonstrated values.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/values-alignment
 */

import type { LifeSynthesis, ValuesAlignment } from './types.js';

// ============================================================================
// VALUES ALIGNMENT ANALYSIS
// ============================================================================

export function analyzeValuesAlignment(
  lifeSynthesis: LifeSynthesis,
  _userId: string
): ValuesAlignment {
  const alignment: ValuesAlignment = {
    statedValues: [],
    demonstratedValues: lifeSynthesis.valuesRevealed,
    alignmentGaps: [],
    coherentAreas: [],
    conflictAreas: [],
  };

  // Analyze demonstrated values
  for (const value of lifeSynthesis.valuesRevealed) {
    // Check for coherence indicators
    if (
      value.includes('discipline') &&
      (lifeSynthesis.compoundingAreas.length > 0 || lifeSynthesis.growthPattern === 'integrating')
    ) {
      alignment.coherentAreas.push('Financial discipline reflected in consistent habits');
    }

    if (
      value.includes('peace') &&
      ['integrating', 'resting'].includes(lifeSynthesis.growthPattern)
    ) {
      alignment.coherentAreas.push('Inner peace values align with sustainable growth pattern');
    }

    if (
      value.includes('growth') &&
      (lifeSynthesis.compoundingAreas.length > 0 || lifeSynthesis.lifeChapter === 'expansion')
    ) {
      alignment.coherentAreas.push('Growth values demonstrated through active learning');
    }
  }

  // Check for conflicts
  if (
    lifeSynthesis.valuesRevealed.includes('Inner peace and presence') &&
    lifeSynthesis.growthPattern === 'striving'
  ) {
    alignment.conflictAreas.push('Values peace but pattern suggests striving - inner tension');
  }

  if (
    lifeSynthesis.valuesRevealed.includes('Financial discipline - saving for tomorrow') &&
    lifeSynthesis.valuesRevealed.includes('Present-moment living - perhaps at a cost')
  ) {
    alignment.conflictAreas.push('Tension between saving and spending - values in dialogue');
  }

  // Growth pattern specific conflicts
  if (
    lifeSynthesis.growthPattern === 'striving' &&
    lifeSynthesis.compoundingAreas.length === 0
  ) {
    alignment.conflictAreas.push('Much effort without compounding - the direction matters');
  }

  // Gaps (what they say vs. what they do)
  if (
    lifeSynthesis.valuesRevealed.length === 0 &&
    lifeSynthesis.lifeChapter !== 'unknown'
  ) {
    alignment.alignmentGaps.push('Life chapter active but values not yet clear through action');
  }

  return alignment;
}

