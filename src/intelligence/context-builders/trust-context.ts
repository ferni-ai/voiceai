/**
 * Trust Context Builder
 *
 * Integrates the "better than human" trust systems into the
 * voice agent's context pipeline.
 *
 * This context builder surfaces:
 * - Unsaid signals (what they're not saying)
 * - Boundary warnings (topics to avoid)
 * - Growth reflections (noticing their evolution)
 * - Callback opportunities (inside jokes, shared history)
 * - Celebration opportunities (small wins)
 * - Proactive outreach suggestions
 * - Response tuning guidance (Phase 15)
 * - Relationship health context (Phase 12)
 * - Seasonal awareness (Phase 26)
 * - Learning style adaptation (Phase 27)
 * - Life events context (Phase 14)
 * - Voice prosody insights (Phase 24)
 * - Celebration momentum (Phase 16)
 *
 * @module TrustContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from './index.js';

import {
  // Core trust context
  buildTrustContext,
  type UnsaidSignal,
  type GrowthReflection,
  type CallbackOpportunity,
  type CelebrationOpportunity,
  // Phase 12: Relationship Health
  getHealthScore,
  getStageName,
  // Phase 14: Life Events
  getUpcomingEvents,
  getEventsNeedingReminders,
  // Phase 15: Response Tuning
  generateTuningGuidance,
  formatGuidanceForLLM,
  type TuningContext,
  // Phase 16: Celebration Momentum
  getMomentumSummary,
  generateCelebrations,
  // Phase 24: Voice Prosody
  getFamiliarityScore,
  generateVoiceContext,
  // Phase 26: Seasonal Awareness
  buildSeasonalContext,
  generateSeasonalContextForLLM,
  // Phase 27: Learning Style
  formatLearningGuidanceForLLM,
  getLearningProfile,
} from '../../services/trust-systems/index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TrustContextBuilder' });

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build trust-aware context for the current turn
 */
async function buildTrustAwareContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, analysis, userProfile } = input;
  const userId = services?.userId;

  // Skip if no user identification
  if (!userId) {
    return [];
  }

  const injections: ContextInjection[] = [];

  // Build trust context
  const trustContext = buildTrustContext(userId, userText, {
    currentTopic: analysis?.topics?.primary || undefined,
    detectedEmotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    previousMessages: userData?.recentTopics,
  });

  // ============================================================================
  // CORE TRUST SYSTEMS (Original)
  // ============================================================================

  // 1. Unsaid Signals - What they're NOT saying
  if (trustContext.unsaidSignals.length > 0) {
    const unsaidInjection = formatUnsaidSignals(trustContext.unsaidSignals);
    if (unsaidInjection) {
      injections.push(unsaidInjection);
    }
  }

  // 2. Boundary Awareness - Topics to avoid
  if (trustContext.topicsToAvoid.length > 0) {
    injections.push(
      createHintInjection(
        'boundary_awareness',
        formatBoundaryWarnings(trustContext.topicsToAvoid),
        { category: 'trust' }
      )
    );
  }

  // 3. Growth Reflection - Noticing their evolution
  if (trustContext.growthReflection) {
    const growthInjection = formatGrowthReflection(trustContext.growthReflection);
    if (growthInjection) {
      injections.push(growthInjection);
    }
  }

  // 4. Callback Opportunity - Inside jokes and shared history
  if (trustContext.callbackOpportunity) {
    const callbackInjection = formatCallbackOpportunity(trustContext.callbackOpportunity);
    if (callbackInjection) {
      injections.push(callbackInjection);
    }
  }

  // 5. Celebration Opportunity - Small wins
  if (trustContext.celebrationOpportunity) {
    const celebrationInjection = formatCelebrationOpportunity(trustContext.celebrationOpportunity);
    if (celebrationInjection) {
      injections.push(celebrationInjection);
    }
  }

  // ============================================================================
  // PHASE 15: RESPONSE TUNING
  // ============================================================================

  const responseTuningContext = buildResponseTuningContext(userId, analysis, userData);
  if (responseTuningContext) {
    const tuningGuidance = generateTuningGuidance(responseTuningContext);
    const tuningText = formatGuidanceForLLM(tuningGuidance);
    if (tuningText) {
      injections.push(createHintInjection('response_tuning', tuningText, { category: 'trust' }));
    }
  }

  // ============================================================================
  // PHASE 12: RELATIONSHIP HEALTH
  // ============================================================================

  const healthScore = getHealthScore(userId);
  if (healthScore) {
    const healthContext = formatRelationshipHealth(healthScore);
    if (healthContext) {
      injections.push(
        createHintInjection('relationship_health', healthContext, { category: 'trust' })
      );
    }
  }

  // ============================================================================
  // PHASE 14: LIFE EVENTS
  // ============================================================================

  const upcomingEvents = getUpcomingEvents(userId);
  const eventsContext = formatLifeEventsContext(upcomingEvents);
  if (eventsContext) {
    injections.push(createHintInjection('life_events', eventsContext, { category: 'trust' }));
  }

  // Check for events needing reminders
  const eventsNeedingReminders = getEventsNeedingReminders(userId);
  if (eventsNeedingReminders.length > 0) {
    const reminderContext = formatEventsNeedingReminders(eventsNeedingReminders);
    if (reminderContext) {
      injections.push(
        createHintInjection('event_reminders', reminderContext, { category: 'trust' })
      );
    }
  }

  // ============================================================================
  // PHASE 16: CELEBRATION MOMENTUM
  // ============================================================================

  const momentumSummary = getMomentumSummary(userId);
  if (momentumSummary) {
    injections.push(
      createHintInjection('celebration_momentum', `[🔥 MOMENTUM]\n${momentumSummary}`, {
        category: 'trust',
      })
    );
  }

  // Check for celebrations to deliver
  const celebrations = generateCelebrations(userId);
  if (celebrations.length > 0) {
    const celebrationText = celebrations
      .slice(0, 2)
      .map((c) => `• ${c.message}`)
      .join('\n');
    injections.push(
      createHintInjection(
        'momentum_celebration',
        `[🎉 MOMENTUM CELEBRATION]\n${celebrationText}\n\nShare naturally when appropriate.`,
        { category: 'trust' }
      )
    );
  }

  // ============================================================================
  // PHASE 24: VOICE PROSODY
  // ============================================================================

  const voiceContext = generateVoiceContext(userId);
  if (voiceContext) {
    injections.push(createHintInjection('voice_prosody', voiceContext, { category: 'trust' }));
  }

  // Add familiarity score context
  const familiarityResult = getFamiliarityScore(userId);
  if (familiarityResult.score > 0) {
    const familiarityContext = formatFamiliarityContext(familiarityResult.score);
    if (familiarityContext) {
      injections.push(
        createHintInjection('voice_familiarity', familiarityContext, { category: 'trust' })
      );
    }
  }

  // ============================================================================
  // PHASE 26: SEASONAL AWARENESS
  // ============================================================================

  const seasonalContext = generateSeasonalContextForLLM(userId);
  if (seasonalContext) {
    injections.push(
      createHintInjection('seasonal_awareness', seasonalContext, { category: 'trust' })
    );
  }

  // ============================================================================
  // PHASE 27: LEARNING STYLE
  // ============================================================================

  const learningContext = formatLearningGuidanceForLLM(userId);
  if (learningContext) {
    injections.push(createHintInjection('learning_style', learningContext, { category: 'trust' }));
  }

  // Log for debugging
  if (injections.length > 0) {
    log.debug(
      {
        userId,
        injectionCount: injections.length,
        hasUnsaid: trustContext.unsaidSignals.length > 0,
        hasBoundaries: trustContext.topicsToAvoid.length > 0,
        hasGrowth: !!trustContext.growthReflection,
        hasCallback: !!trustContext.callbackOpportunity,
        hasCelebration: !!trustContext.celebrationOpportunity,
        hasResponseTuning: !!responseTuningContext,
        hasHealthScore: !!healthScore,
        hasLifeEvents: !!eventsContext,
        hasMomentum: !!momentumSummary,
        hasVoice: !!voiceContext,
        hasSeasonal: !!seasonalContext,
        hasLearning: !!learningContext,
      },
      '🤝 Trust context built'
    );
  }

  return injections;
}

// ============================================================================
// NEW CONTEXT BUILDERS
// ============================================================================

/**
 * Build response tuning context
 */
function buildResponseTuningContext(
  userId: string,
  analysis: ContextBuilderInput['analysis'],
  userData: ContextBuilderInput['userData']
): TuningContext | null {
  const healthScore = getHealthScore(userId);

  // Determine relationship stage from health score
  let relationshipStage: TuningContext['relationshipStage'] = 'building';
  if (healthScore) {
    relationshipStage = healthScore.stage as TuningContext['relationshipStage'];
  }

  // Detect vulnerable share from emotion signals
  const isVulnerableShare = Boolean(
    analysis?.emotion?.needsSupport ||
    analysis?.emotion?.isProcessing ||
    (analysis?.emotion?.intensity && analysis.emotion.intensity > 0.7)
  );

  // Detect crisis from emotion signals
  const isCrisis = Boolean(
    analysis?.emotion?.needsSupport &&
    analysis?.emotion?.intensity &&
    analysis.emotion.intensity > 0.9
  );

  // Detect advice-seeking from intent
  const isAskingForAdvice = Boolean(
    analysis?.intent?.primary === 'advice' || analysis?.intent?.requiresAction
  );

  // Use userData to enhance context with user preferences and history
  const recentTopics = userData?.recentTopics || [];
  const hasRecentVulnerableShare = recentTopics.some(
    (topic) => topic.includes('personal') || topic.includes('emotional')
  );

  // Get learning profile to adapt response style
  const learningProfile = getLearningProfile(userId);

  return {
    userId,
    relationshipStage,
    currentEmotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    topic: analysis?.topics?.primary || undefined,
    isVulnerableShare: isVulnerableShare || hasRecentVulnerableShare,
    isAskingForAdvice,
    isCrisis,
    trustScore: healthScore?.overallScore,
    // Extended context from learning profile
    preferredLearningStyle: learningProfile?.processing?.style,
    recentTopicCount: recentTopics.length,
  };
}

/**
 * Format relationship health for context
 */
function formatRelationshipHealth(
  health: NonNullable<ReturnType<typeof getHealthScore>>
): string | null {
  if (health.overallScore < 30) {
    return null; // Don't inject if relationship is too new
  }

  const lines: string[] = [
    '[💚 RELATIONSHIP CONTEXT]',
    `Stage: ${getStageName(health.stage)}`,
    `Health: ${health.overallScore}/100 (${health.overallTrend})`,
  ];

  // Add alerts if any
  const activeAlerts = health.alerts.filter((a) => !a.acknowledged);
  if (activeAlerts.length > 0) {
    lines.push('');
    lines.push('⚠️ Watch for:');
    for (const alert of activeAlerts.slice(0, 2)) {
      lines.push(`• ${alert.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format life events for context
 */
function formatLifeEventsContext(events: ReturnType<typeof getUpcomingEvents>): string | null {
  const { today, thisWeek } = events;

  if (today.length === 0 && thisWeek.length === 0) {
    return null;
  }

  const lines: string[] = ['[📅 LIFE EVENTS]'];

  if (today.length > 0) {
    lines.push('TODAY:');
    for (const event of today) {
      lines.push(`• ${event.description} (${event.type})`);
      if (event.sentiment) {
        lines.push(`  Feeling: ${event.sentiment}`);
      }
    }
  }

  if (thisWeek.length > 0) {
    lines.push('THIS WEEK:');
    for (const event of thisWeek.slice(0, 3)) {
      const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      lines.push(`• ${event.description} (in ${daysUntil} days)`);
    }
  }

  lines.push('');
  lines.push('💡 Ask about these naturally when relevant.');

  return lines.join('\n');
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

/**
 * Format unsaid signals for context injection
 */
function formatUnsaidSignals(signals: UnsaidSignal[]): ContextInjection | null {
  if (signals.length === 0) return null;

  const lines: string[] = [
    '[🔍 READING BETWEEN THE LINES]',
    "Here's what I'm noticing that they might not be saying directly:",
    '',
  ];

  for (const signal of signals) {
    switch (signal.type) {
      case 'emotional_mismatch':
        lines.push(`⚠️ They said they're fine, but the context suggests otherwise.`);
        break;
      case 'topic_avoidance':
        lines.push(`⚠️ They've avoided "${signal.underlying}" multiple times.`);
        break;
      case 'deflection':
        lines.push(`⚠️ They just changed the subject.`);
        break;
      case 'permission_seeking':
        lines.push(`💭 They seem to want to share something but need encouragement.`);
        break;
      case 'unfinished_thought':
        lines.push(`💭 They started to say something but stopped.`);
        break;
      case 'minimizing_pain':
        lines.push(`💭 They're downplaying something that seems significant.`);
        break;
    }

    if (signal.phrase) {
      lines.push(`   → Consider: "${signal.phrase}"`);
    }
  }

  lines.push('');
  lines.push("💡 Create space, don't push. Let them come to you.");

  return createHintInjection('unsaid_signals', lines.join('\n'), { category: 'trust' });
}

/**
 * Format boundary warnings
 */
function formatBoundaryWarnings(topics: string[]): string {
  const lines: string[] = [
    '[🚫 BOUNDARY AWARENESS]',
    'These topics are off-limits unless they bring them up:',
    '',
  ];

  for (const topic of topics) {
    lines.push(`• ${topic}`);
  }

  lines.push('');
  lines.push('DO NOT proactively mention these topics.');

  return lines.join('\n');
}

/**
 * Format growth reflection opportunity
 */
function formatGrowthReflection(reflection: GrowthReflection): ContextInjection | null {
  const lines: string[] = [
    '[🌱 GROWTH REFLECTION OPPORTUNITY]',
    `I've noticed growth: ${reflection.pattern.type}`,
    '',
    `Before: ${reflection.pattern.before.pattern}`,
    `Now: ${reflection.pattern.after.pattern}`,
    '',
    '💡 Reflect this back naturally:',
    `"${reflection.reflection}"`,
    '',
    `Timing: ${reflection.timing}`,
    'Note: Only share if it flows naturally with the conversation.',
  ];

  return createHintInjection('growth_reflection', lines.join('\n'), { category: 'trust' });
}

/**
 * Format callback opportunity
 */
function formatCallbackOpportunity(opportunity: CallbackOpportunity): ContextInjection | null {
  const { moment, suggestedCallback, relevance } = opportunity;

  // Only include high-relevance callbacks
  if (relevance < 0.5) return null;

  const lines: string[] = [
    '[😄 CALLBACK OPPORTUNITY]',
    `Something they shared before is relevant now:`,
    '',
    `Type: ${moment.type}`,
    `What they said: "${moment.content.slice(0, 100)}..."`,
    '',
    '💡 Natural callback:',
    `"${suggestedCallback}"`,
    '',
    "Note: Only use if it flows naturally. Don't force it.",
  ];

  return createHintInjection('callback_opportunity', lines.join('\n'), { category: 'trust' });
}

/**
 * Format celebration opportunity
 */
function formatCelebrationOpportunity(
  opportunity: CelebrationOpportunity
): ContextInjection | null {
  const { win, celebration, intensity } = opportunity;

  const lines: string[] = [
    '[🏆 SMALL WIN DETECTED]',
    `They just did something worth acknowledging:`,
    '',
    `Type: ${win.type}`,
    `What happened: "${win.description.slice(0, 100)}..."`,
  ];

  if (win.whatMadeItHard) {
    lines.push(`What made it hard: ${win.whatMadeItHard}`);
  }

  lines.push('');
  lines.push(`💡 Celebration (${intensity} intensity):`);
  lines.push(`"${celebration}"`);
  lines.push('');
  lines.push("Note: Match their energy. Don't over-celebrate if they're understated.");

  return createHintInjection('celebration_opportunity', lines.join('\n'), { category: 'trust' });
}

/**
 * Format events needing reminders
 */
function formatEventsNeedingReminders(
  events: ReturnType<typeof getEventsNeedingReminders>
): string | null {
  if (events.length === 0) return null;

  const lines: string[] = ['[⏰ EVENTS NEEDING FOLLOW-UP]'];

  for (const event of events.slice(0, 3)) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(event.date).getTime()) / (24 * 60 * 60 * 1000)
    );
    lines.push(`• ${event.description} (${daysAgo} days ago)`);
    if (event.importance === 'high') {
      lines.push(`  ⚠️ High importance - check in on this`);
    }
  }

  lines.push('');
  lines.push('💡 Ask how these events went when natural.');

  return lines.join('\n');
}


/**
 * Format familiarity context
 */
function formatFamiliarityContext(score: number): string | null {
  if (score < 0.3) return null; // Not familiar enough to mention

  const lines: string[] = ['[🤝 VOICE FAMILIARITY]'];

  if (score > 0.8) {
    lines.push("You know this person's voice well.");
    lines.push('You can pick up on subtle changes in how they sound.');
  } else if (score > 0.5) {
    lines.push("You're getting to know their voice patterns.");
    lines.push('Notice their baseline energy and pace.');
  } else {
    lines.push('Still learning their voice patterns.');
  }

  lines.push('');
  lines.push(`Familiarity: ${Math.round(score * 100)}%`);

  return lines.join('\n');
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'trust-context',
  priority: 90, // High priority - trust is fundamental
  description: '"Better than human" trust awareness: unsaid signals, boundaries, growth, callbacks',
  build: buildTrustAwareContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildTrustAwareContext };

export default {
  buildTrustAwareContext,
};
