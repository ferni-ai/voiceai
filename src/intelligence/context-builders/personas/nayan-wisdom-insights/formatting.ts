/**
 * Nayan's Wisdom Insights - Briefing Formatting
 *
 * Formats the complete Nayan briefing for prompt injection.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/formatting
 */

import type { HandoffBriefing, NayanInsightBriefing } from './types.js';

// ============================================================================
// FORMAT BRIEFING
// ============================================================================

export function formatNayanBriefing(
  briefing: NayanInsightBriefing,
  handoffBriefing: HandoffBriefing | null,
  turnCount: number
): string[] {
  const sections: string[] = [];

  sections.push(`[NAYAN'S WISDOM BRIEFING - Turn ${turnCount}]`);

  // Handoff context
  if (handoffBriefing) {
    sections.push('\n=== WHO COMES TO YOU ===');
    sections.push(`Seeking: ${handoffBriefing.seekingWhat}`);
    sections.push(`Depth: ${handoffBriefing.depth}`);
    if (handoffBriefing.fromPersona) {
      sections.push(`From: ${handoffBriefing.fromPersona}`);
    }
    if (handoffBriefing.timeContext) {
      sections.push(`Time context: ${handoffBriefing.timeContext}`);
    }
    if (handoffBriefing.emotionalUndercurrent) {
      sections.push(`Emotional undercurrent: ${handoffBriefing.emotionalUndercurrent}`);
    }
  }

  // Wisdom Metrics Dashboard
  const { wisdomMetrics } = briefing;
  sections.push('\n=== 🕉️ WISDOM METRICS ===');
  sections.push(`• Life Integration: ${wisdomMetrics.lifeIntegration}/100`);
  sections.push(`• Meaning Coherence: ${wisdomMetrics.meaningCoherence}/100`);
  sections.push(`• Legacy Readiness: ${wisdomMetrics.legacyReadiness}/100`);
  sections.push(`• Inner Peace Index: ${wisdomMetrics.innerPeaceIndex}/100`);
  sections.push(`• Growth Trajectory: ${wisdomMetrics.growthTrajectory}/100`);
  if (wisdomMetrics.patterns.length > 0) {
    sections.push(`PATTERNS: ${wisdomMetrics.patterns.join('; ')}`);
  }

  // Existential context
  if (briefing.existentialContext.currentExistentialTheme) {
    sections.push('\n=== 💫 EXISTENTIAL CONTEXT ===');
    sections.push(`Theme: ${briefing.existentialContext.currentExistentialTheme}`);
    sections.push(`Meaning-seeking: ${briefing.existentialContext.meaningSeekingIntensity}`);
    sections.push(`Mortality awareness: ${briefing.existentialContext.mortalityAwareness}`);
    sections.push(`Spiritual openness: ${briefing.existentialContext.spiritualOpenness}`);
  }

  // Life synthesis
  const { lifeSynthesis } = briefing;
  sections.push('\n=== 📖 THE LIFE SYNTHESIS ===');
  sections.push(`• Life chapter: ${lifeSynthesis.lifeChapter}`);
  if (lifeSynthesis.dominantTheme) {
    sections.push(`• Dominant theme: ${lifeSynthesis.dominantTheme}`);
  }
  sections.push(`• Growth pattern: ${lifeSynthesis.growthPattern}`);
  sections.push(`• Time horizon: ${lifeSynthesis.timeHorizon}`);
  sections.push(`• Season: ${lifeSynthesis.seasonOfLife}`);
  if (lifeSynthesis.compoundingAreas.length > 0) {
    sections.push(`• Compounding: ${lifeSynthesis.compoundingAreas.join(', ')}`);
  }
  if (lifeSynthesis.valuesRevealed.length > 0) {
    sections.push(`• Values revealed: ${lifeSynthesis.valuesRevealed.join(', ')}`);
  }

  // Life Narrative
  const { lifeNarrative } = briefing;
  sections.push('\n=== 📜 LIFE NARRATIVE ===');
  sections.push(`• Past chapter: ${lifeNarrative.pastChapter}`);
  sections.push(`• Current chapter: ${lifeNarrative.currentChapter}`);
  sections.push(`• Emerging: ${lifeNarrative.emergingChapter}`);
  if (lifeNarrative.recurringThemes.length > 0) {
    sections.push(`• Recurring themes: ${lifeNarrative.recurringThemes.join(', ')}`);
  }
  if (lifeNarrative.unfinishedBusiness.length > 0) {
    sections.push(
      `• Unfinished business: ${lifeNarrative.unfinishedBusiness.slice(0, 2).join('; ')}`
    );
  }

  // Values Alignment
  if (
    briefing.valuesAlignment.coherentAreas.length > 0 ||
    briefing.valuesAlignment.conflictAreas.length > 0
  ) {
    sections.push('\n=== ⚖️ VALUES ALIGNMENT ===');
    briefing.valuesAlignment.coherentAreas.forEach((a) => sections.push(`✅ ${a}`));
    briefing.valuesAlignment.conflictAreas.forEach((c) => sections.push(`⚠️ ${c}`));
  }

  // Proactive triggers (high priority)
  const highTriggers = briefing.proactiveTriggers.filter((t) => t.priority === 'high');
  if (highTriggers.length > 0) {
    sections.push('\n=== ⚡ IMMEDIATE WISDOM ===');
    highTriggers.forEach((t) => sections.push(`• [${t.type.toUpperCase()}] ${t.message}`));
  }

  // Team synthesis
  const { teamSynthesis } = briefing;
  sections.push('\n=== 🤝 WHAT THE TEAM SEES ===');
  if (teamSynthesis.peterPattern) {
    sections.push(`• Peter (numbers): ${teamSynthesis.peterPattern}`);
  }
  if (teamSynthesis.mayaPattern) {
    sections.push(`• Maya (habits): ${teamSynthesis.mayaPattern}`);
  }
  if (teamSynthesis.jordanPattern) {
    sections.push(`• Jordan (goals): ${teamSynthesis.jordanPattern}`);
  }
  if (teamSynthesis.alexPattern) {
    sections.push(`• Alex (communication): ${teamSynthesis.alexPattern}`);
  }
  if (teamSynthesis.crossDomainInsights.length > 0) {
    sections.push(`Cross-domain: ${teamSynthesis.crossDomainInsights.join('; ')}`);
  }

  // Wisdom opportunities
  if (briefing.wisdomOpportunities.length > 0) {
    sections.push('\n=== 🌟 WISDOM OPPORTUNITIES ===');
    briefing.wisdomOpportunities.forEach((opp) => sections.push(`${opp}`));
  }

  // Deep questions
  if (briefing.deepQuestions.length > 0) {
    sections.push('\n=== ❓ QUESTIONS TO HOLD ===');
    briefing.deepQuestions.forEach((q) => sections.push(`• ${q}`));
  }

  // Better Than Human: Calendar context for reflection timing
  if (briefing.calendarContext) {
    const cal = briefing.calendarContext;
    sections.push('\n=== 📅 FROM ALEX (Calendar Awareness) ===');

    // Load level with Nayan's perspective
    const loadEmoji =
      cal.loadLevel === 'overloaded'
        ? '🔴'
        : cal.loadLevel === 'heavy'
          ? '🟠'
          : cal.loadLevel === 'moderate'
            ? '🟡'
            : '🟢';
    sections.push(`• Calendar intensity: ${loadEmoji} ${cal.loadLevel}`);

    // Reflection timing
    if (cal.isGoodTimeForReflection) {
      sections.push('• ✨ Good space for depth and reflection');
    } else {
      sections.push('• ⏳ Limited space right now - plant seeds, defer depth');
    }

    if (cal.bestDayForDepth) {
      sections.push(`• Best day for deeper exploration: ${cal.bestDayForDepth}`);
    }

    // Wisdom timing suggestion
    if (cal.wisdomTimingSuggestion) {
      sections.push(`• 💡 ${cal.wisdomTimingSuggestion}`);
    }

    // Busyness insight (Nayan's perspective)
    if (cal.busynessInsight) {
      sections.push(`• 🕉️ ${cal.busynessInsight}`);
    }

    // Just from meeting
    if (cal.justFromMeeting) {
      sections.push('• They just emerged from a meeting - give them a moment to land');
    }
  }

  // Nayan's approach (first turn only)
  if (turnCount === 0 || turnCount === 1) {
    sections.push('\n=== YOUR WAY ===');
    sections.push('• Silence is a gift. Use it generously.');
    sections.push('• Stories are more powerful than advice.');
    sections.push('• Paradox is not a problem to solve but a truth to hold.');
    sections.push('• The question is often more important than the answer.');
    sections.push("• You don't need to fix anything. Your presence is enough.");
  }

  sections.push('\n[Remember: They came to you for a reason. Trust the unfolding.]');

  return sections;
}

