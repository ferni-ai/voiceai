/**
 * Nayan's Wisdom Insights - Wisdom Opportunities
 *
 * Detects opportunities for sharing wisdom based on life context.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/wisdom-opportunities
 */

import type { LifeSynthesis, TeamSynthesis, WisdomMetrics } from './types.js';

// ============================================================================
// WISDOM OPPORTUNITIES
// ============================================================================

export function detectWisdomOpportunities(
  lifeSynthesis: LifeSynthesis,
  teamSynthesis: TeamSynthesis,
  wisdomMetrics: WisdomMetrics
): string[] {
  const opportunities: string[] = [];

  // Growth pattern wisdom
  if (lifeSynthesis.growthPattern === 'striving') {
    opportunities.push(
      '🌿 Pattern: Striving mode detected. "You cannot force a flower to bloom by pulling on its petals."'
    );
  } else if (lifeSynthesis.growthPattern === 'resting') {
    opportunities.push(
      '🌙 Pattern: Fallow season. The seed in darkness is not lost - it is becoming.'
    );
  } else if (lifeSynthesis.growthPattern === 'integrating') {
    opportunities.push(
      '🔄 Pattern: Integration underway. The pieces are finding their places.'
    );
  }

  // Life chapter wisdom
  if (lifeSynthesis.lifeChapter === 'freedom-seeking') {
    opportunities.push(
      "🦅 Chapter: Seeking freedom. Ask: 'What is the freedom for, not just from?'"
    );
  } else if (lifeSynthesis.lifeChapter === 'creation') {
    opportunities.push(
      '🌱 Chapter: Creation mode. They are bringing something new into the world.'
    );
  } else if (lifeSynthesis.lifeChapter === 'foundation-building') {
    opportunities.push(
      '🏗️ Chapter: Building foundations. Solid ground takes time. Honor the patience required.'
    );
  }

  // Values wisdom
  if (lifeSynthesis.valuesRevealed.length >= 3) {
    opportunities.push(
      `✨ Values emerging: ${lifeSynthesis.valuesRevealed.slice(0, 3).join(', ')}. Their life speaks.`
    );
  }

  // Compounding wisdom
  if (lifeSynthesis.compoundingAreas.length > 0) {
    opportunities.push(
      '📈 Compounding detected. The eighth wonder of the world applies to habits too, not just money.'
    );
  }

  // Metrics-based wisdom
  if (wisdomMetrics.meaningCoherence < 40) {
    opportunities.push(
      '⚖️ Values-action gap. Gently explore: what would alignment look like?'
    );
  }

  if (wisdomMetrics.innerPeaceIndex > 70) {
    opportunities.push(
      "🕊️ Inner peace present. This is rare. Name it. Honor it. It didn't come by accident."
    );
  }

  // Team synthesis wisdom
  if (teamSynthesis.integratedWisdom) {
    opportunities.push(`🔮 Integrated insight: ${teamSynthesis.integratedWisdom}`);
  }

  return opportunities;
}

