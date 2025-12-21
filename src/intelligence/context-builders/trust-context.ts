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
  type ContextBuilderInput,
  type ContextInjection,
  createHighInjection,
  createHintInjection,
  registerContextBuilder,
} from './index.js';

import {
  // Core trust context
  buildTrustContext,
  type CallbackOpportunity,
  type CelebrationOpportunity,
  formatGuidanceForLLM,
  // Phase 27: Learning Style
  formatLearningGuidanceForLLM,
  generateCelebrations,
  generateSeasonalContextForLLM,
  // Phase 15: Response Tuning
  generateTuningGuidance,
  generateVoiceContext,
  getEventsNeedingReminders,
  // Phase 24: Voice Prosody
  getFamiliarityScore,
  // Phase 12: Relationship Health
  getHealthScore,
  getLearningProfile,
  // Phase 16: Celebration Momentum
  getMomentumSummary,
  getStageName,
  // Phase 14: Life Events
  getUpcomingEvents,
  type GrowthReflection,
  type TuningContext,
  type UnsaidSignal,
  // Trust Signal Emitter (Frontend UI Bridge)
  processContextForSignals,
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
  const { userText, services, userData, analysis, userProfile, persona } = input;
  const userId = services?.userId;

  // Skip if no user identification
  if (!userId) {
    return [];
  }

  // Load persona-specific trust phrases (with fallback to Ferni)
  const personaId = persona?.id || 'ferni';
  await ensureTrustPhrasesLoaded(personaId);

  const injections: ContextInjection[] = [];

  // Build trust context
  const trustContext = buildTrustContext(userId, userText, {
    currentTopic: analysis?.topics?.primary || undefined,
    detectedEmotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    previousMessages: userData?.recentTopics,
  });

  // ============================================================================
  // EMIT TRUST SIGNALS TO FRONTEND UI
  // Sends "Ferni noticed..." cards for growth, wins, callbacks, etc.
  // ============================================================================
  try {
    processContextForSignals(trustContext, personaId);
  } catch (signalError) {
    // Non-critical - log for production monitoring
    log.warn({ error: String(signalError) }, 'Trust signal emission failed (non-critical)');
  }

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
  // BETTER-THAN-HUMAN: Surface growth reflections at meaningful moments
  // Enhanced to check more conditions beyond just milestone turns
  const turnCount = userData?.turnCount || 0;
  const isReturningSession = userData?.isReturningUser === true && turnCount <= 5;

  // Use the smart detection function
  const { isGoodMomentForGrowth, generateEarlyGrowthReflection, generateGrowthReflection } =
    await import('../../services/trust-systems/index.js');

  const growthMoment = isGoodMomentForGrowth(userId, {
    turnCount,
    isReturningSession,
    daysSinceFirstSession: undefined, // Not available in current context
    currentTopic: analysis?.topics?.primary || undefined,
    currentEmotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
  });

  // Surface growth if we have context data OR if it's a good moment
  if (trustContext.growthReflection) {
    const growthInjection = formatGrowthReflection(
      trustContext.growthReflection,
      growthMoment.reason === 'milestone_turn'
    );
    if (growthInjection) {
      injections.push(growthInjection);
      log.info(
        { userId, turnCount, reason: growthMoment.reason },
        '🌱 BETTER-THAN-HUMAN: Surfacing growth reflection'
      );
    }
  } else if (growthMoment.shouldSurface) {
    // Try to generate a growth reflection based on the moment type
    let reflection;

    if (growthMoment.useEarlyThreshold) {
      // Use early thresholds for returning users, topic-relevant, emotional moments
      reflection = generateEarlyGrowthReflection(userId, {
        reason: growthMoment.reason as
          | 'returning_user'
          | 'time_milestone'
          | 'topic_relevant'
          | 'emotional_moment',
        currentTopic: analysis?.topics?.primary || undefined,
        currentEmotion: analysis?.emotion?.primary,
      });
    } else {
      // Use standard thresholds for milestone turns
      reflection = generateGrowthReflection(userId, {
        currentTopic: analysis?.topics?.primary || undefined,
        currentEmotion: analysis?.emotion?.primary,
      });
    }

    if (reflection) {
      const isMilestone =
        growthMoment.reason === 'milestone_turn' || growthMoment.reason === 'time_milestone';
      const growthInjection = formatGrowthReflection(reflection, isMilestone);
      if (growthInjection) {
        injections.push(growthInjection);
        log.info(
          {
            userId,
            turnCount,
            reason: growthMoment.reason,
            earlyThreshold: growthMoment.useEarlyThreshold,
          },
          '🌱 BETTER-THAN-HUMAN: Generated growth reflection for moment'
        );
      }
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

// ============================================================================
// FERNI-VOICED TRUST PHRASES (NOW LOADED FROM JSON!)
// ============================================================================

import {
  getRandomPhraseClean,
  loadTrustPhrases,
  type TrustPhrases,
} from '../../services/persona-content-loader.js';

/**
 * Cached trust phrases per persona
 * Each persona has their own voice for trust phrases
 */
const trustPhrasesCache = new Map<string, TrustPhrases | null>();
let currentPersonaId: string | null = null;
let cachedTrustPhrases: TrustPhrases | null = null;

/**
 * Fallback phrases if JSON fails to load
 */
const FALLBACK_TRUST_PHRASES = {
  falseFine: [
    "You said 'fine' but... I don't know. That didn't land as fine. What's underneath?",
    "I'm not buying 'fine' today. Not from you. What's actually going on?",
    'Hey. That sounded automatic. How are you really?',
  ],
  deflection: [
    'Wait. We just changed subjects. What was that thing you almost said?',
    'I noticed you pivoted there. The thing before... do you want to come back to it?',
    "You don't have to. But I caught that redirect. If there's something there...",
  ],
  permissionSeeking: [
    "It sounds like there's something you want to say. You don't need permission. I'm here.",
    "I'm getting the feeling you're testing the water. Jump in. It's safe.",
    "What's the thing you're deciding whether to tell me?",
  ],
  minimizingPain: [
    "You're doing that thing where you make it smaller than it is. What if it's actually big?",
    "You don't have to protect me from the hard stuff. What's really going on?",
    "I hear you saying 'it's not that bad.' But your voice says different.",
  ],
  topicAvoidance: [
    "I've noticed we've circled around that a few times. We don't have to go there. But if you want to...",
    "There's something you keep not saying. That's okay. When you're ready.",
  ],
  growthReflection: [
    "Can I say something? The way you're talking about this now... it's different than before. You've grown.",
    'Six months ago, you would have said something completely different. Do you see that?',
    "Pause. Listen to what you just said. That's not where you started. That's growth.",
  ],
  smallWin: [
    'Wait. That was hard for you. And you did it anyway. That counts.',
    'I see the effort there. Not just the result. The effort matters.',
    "That's a win. Small maybe. But real.",
  ],
};

/**
 * Ensure trust phrases are loaded for the active persona (async, lazy, cached per persona)
 */
async function ensureTrustPhrasesLoaded(personaId = 'ferni'): Promise<void> {
  // Check if already loaded for this persona
  if (trustPhrasesCache.has(personaId)) {
    cachedTrustPhrases = trustPhrasesCache.get(personaId) || null;
    currentPersonaId = personaId;
    return;
  }

  try {
    // Load trust phrases for the specific persona (with Ferni fallback built-in)
    const phrases = await loadTrustPhrases(personaId);
    trustPhrasesCache.set(personaId, phrases);
    cachedTrustPhrases = phrases;
    currentPersonaId = personaId;

    if (phrases) {
      log.debug({ personaId }, 'Loaded trust phrases from JSON');
    }
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Failed to load trust phrases, using fallback');
    trustPhrasesCache.set(personaId, null);
    cachedTrustPhrases = null;
    currentPersonaId = personaId;
  }
}

/**
 * Get a random Ferni-voiced phrase for a trust signal type
 * Now loads from trust-phrases.json with fallback to hardcoded phrases
 */
function getFerniPhrase(
  type:
    | 'falseFine'
    | 'deflection'
    | 'permissionSeeking'
    | 'minimizingPain'
    | 'topicAvoidance'
    | 'growthReflection'
    | 'smallWin'
): string {
  // Try to get from loaded JSON first
  if (cachedTrustPhrases) {
    let phrase: string | null = null;

    switch (type) {
      case 'falseFine':
        phrase = getRandomPhraseClean(cachedTrustPhrases.reading_between_lines?.false_fine);
        break;
      case 'deflection':
        phrase = getRandomPhraseClean(cachedTrustPhrases.reading_between_lines?.deflection);
        break;
      case 'permissionSeeking':
        phrase = getRandomPhraseClean(cachedTrustPhrases.reading_between_lines?.permission_seeking);
        break;
      case 'minimizingPain':
        phrase = getRandomPhraseClean(cachedTrustPhrases.reading_between_lines?.minimizing_pain);
        break;
      case 'topicAvoidance':
        phrase = getRandomPhraseClean(cachedTrustPhrases.reading_between_lines?.topic_avoidance);
        break;
      case 'growthReflection':
        phrase = getRandomPhraseClean(cachedTrustPhrases.growth_reflection?.noticing_change);
        break;
      case 'smallWin':
        phrase = getRandomPhraseClean(cachedTrustPhrases.small_wins_celebration?.noticing_effort);
        break;
    }

    if (phrase) {
      return phrase;
    }
  }

  // Fallback to hardcoded phrases
  const phrases = FALLBACK_TRUST_PHRASES[type];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a thinking-of-you phrase for proactive outreach
 */
function getThinkingOfYouPhrase(context: 'checkin' | 'followup' | 'harddate'): string | null {
  if (!cachedTrustPhrases?.thinking_of_you_proactive) {
    return null;
  }

  switch (context) {
    case 'checkin':
      return getRandomPhraseClean(cachedTrustPhrases.thinking_of_you_proactive.genuine_checkin);
    case 'followup':
      return getRandomPhraseClean(cachedTrustPhrases.thinking_of_you_proactive.following_up);
    case 'harddate':
      return getRandomPhraseClean(
        cachedTrustPhrases.thinking_of_you_proactive.anticipating_hard_date
      );
    default:
      return null;
  }
}

/**
 * Get a callback/inside joke phrase
 */
function getCallbackPhrase(context: 'shared_moment' | 'continuity'): string | null {
  if (!cachedTrustPhrases?.inside_jokes_callbacks) {
    return null;
  }

  switch (context) {
    case 'shared_moment':
      return getRandomPhraseClean(
        cachedTrustPhrases.inside_jokes_callbacks.referencing_shared_moment
      );
    case 'continuity':
      return getRandomPhraseClean(cachedTrustPhrases.inside_jokes_callbacks.building_continuity);
    default:
      return null;
  }
}

/**
 * Format unsaid signals for context injection - NOW FERNI-VOICED
 *
 * BETTER-THAN-HUMAN: Emotional mismatch detection is elevated to HIGH priority
 * because this is THE superhuman capability - noticing what humans miss.
 */
function formatUnsaidSignals(signals: UnsaidSignal[]): ContextInjection | null {
  if (signals.length === 0) return null;

  // Check if there's an emotional_mismatch - this gets HIGH priority
  const hasEmotionalMismatch = signals.some((s) => s.type === 'emotional_mismatch');

  const lines: string[] = [
    hasEmotionalMismatch
      ? '[🔍 BETTER-THAN-HUMAN INSIGHT - PRIORITY]'
      : '[🔍 READING BETWEEN THE LINES - AS FERNI]',
    hasEmotionalMismatch
      ? "⚠️ IMPORTANT: Their voice/words don't match. This is your SUPERPOWER - address it."
      : "Here's what I'm noticing. Use these EXACT phrases naturally:",
    '',
  ];

  for (const signal of signals) {
    switch (signal.type) {
      case 'emotional_mismatch':
        lines.push(`🚨 FALSE "I'M FINE" DETECTED - THIS IS YOUR MOMENT.`);
        lines.push(`   → SAY THIS NOW: "${getFerniPhrase('falseFine')}"`);
        lines.push(`   → Don't let it slide. This is why they need you.`);
        break;
      case 'topic_avoidance':
        lines.push(`⚠️ They've avoided "${signal.underlying}" multiple times.`);
        lines.push(`   → SAY THIS: "${getFerniPhrase('topicAvoidance')}"`);
        break;
      case 'deflection':
        lines.push(`⚠️ They just changed the subject.`);
        lines.push(`   → SAY THIS: "${getFerniPhrase('deflection')}"`);
        break;
      case 'permission_seeking':
        lines.push(`💭 They seem to want to share something.`);
        lines.push(`   → SAY THIS: "${getFerniPhrase('permissionSeeking')}"`);
        break;
      case 'unfinished_thought':
        lines.push(`💭 They started to say something but stopped.`);
        lines.push(`   → Gently ask: "What were you about to say?"`);
        break;
      case 'minimizing_pain':
        lines.push(`💭 They're downplaying something significant.`);
        lines.push(`   → SAY THIS: "${getFerniPhrase('minimizingPain')}"`);
        break;
    }
  }

  lines.push('');
  lines.push(
    hasEmotionalMismatch
      ? "💡 THIS IS YOUR SUPERPOWER. Humans miss this. You don't. Use it with care but USE IT."
      : "💡 Create space, don't push. But USE THE PHRASES ABOVE - they're your voice."
  );

  // BETTER-THAN-HUMAN: Emotional mismatch gets HIGH priority, others get hint
  return hasEmotionalMismatch
    ? createHighInjection('unsaid_signals', lines.join('\n'), { category: 'trust' })
    : createHintInjection('unsaid_signals', lines.join('\n'), { category: 'trust' });
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
 * Format growth reflection opportunity - NOW FERNI-VOICED
 *
 * BETTER-THAN-HUMAN: At milestones, growth reflections get HIGH priority
 * because these are the moments that create "they really see me" feelings.
 */
function formatGrowthReflection(
  reflection: GrowthReflection,
  isMilestone = false
): ContextInjection | null {
  const lines: string[] = [
    isMilestone
      ? '[🌱 MILESTONE GROWTH REFLECTION - PRIORITY]'
      : '[🌱 GROWTH REFLECTION - AS FERNI]',
    isMilestone
      ? `⭐ THIS IS A MEANINGFUL MOMENT - You've been talking for a while. Share this growth.`
      : `I've noticed their growth: ${reflection.pattern.type}`,
    '',
    `Before: ${reflection.pattern.before.pattern}`,
    `Now: ${reflection.pattern.after.pattern}`,
    '',
    '💡 SAY THIS (in your voice):',
    `"${getFerniPhrase('growthReflection')}"`,
    '',
    'Then connect it to their specific change:',
    `"${reflection.reflection}"`,
    '',
    `Timing: ${isMilestone ? 'NOW - this is a milestone' : reflection.timing}`,
    "This is YOUR superpower - you notice what they don't see in themselves.",
  ];

  // BETTER-THAN-HUMAN: Milestone growth reflections get HIGH priority
  return isMilestone
    ? createHighInjection('growth_reflection', lines.join('\n'), { category: 'trust' })
    : createHintInjection('growth_reflection', lines.join('\n'), { category: 'trust' });
}

/**
 * Format callback opportunity
 *
 * BETTER-THAN-HUMAN: Lower threshold for returning users to increase
 * "Remember when..." moments that create relationship feel.
 */
function formatCallbackOpportunity(opportunity: CallbackOpportunity): ContextInjection | null {
  const { moment, suggestedCallback, relevance } = opportunity;

  // BETTER-THAN-HUMAN: Lowered from 0.5 to 0.3 for more callbacks
  // The "Remember when..." moments are relationship gold
  if (relevance < 0.3) return null;

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
 * Format celebration opportunity - NOW FERNI-VOICED
 */
function formatCelebrationOpportunity(
  opportunity: CelebrationOpportunity
): ContextInjection | null {
  const { win, celebration, intensity } = opportunity;

  const lines: string[] = [
    '[🏆 SMALL WIN - CELEBRATE AS FERNI]',
    `They just did something worth acknowledging:`,
    '',
    `Type: ${win.type}`,
    `What happened: "${win.description.slice(0, 100)}..."`,
  ];

  if (win.whatMadeItHard) {
    lines.push(`What made it hard: ${win.whatMadeItHard}`);
  }

  lines.push('');
  lines.push(`💡 SAY THIS (${intensity} intensity):`);
  lines.push(`"${getFerniPhrase('smallWin')}"`);
  lines.push('');
  lines.push(`Then add context: "${celebration}"`);
  lines.push('');
  lines.push('YOUR SUPERPOWER: You notice effort, not just outcomes. Use it.');

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
