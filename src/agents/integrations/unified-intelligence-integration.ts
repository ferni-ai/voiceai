/**
 * Unified Intelligence Integration
 *
 * Integrates all intelligence components into the voice agent flow:
 * - Context Assembly (Level 2)
 * - Cross-Domain Correlation (Level 4)
 * - Proactive Surfacing (Level 5)
 * - Superhuman Services (19 capabilities)
 * - Semantic Intelligence (V3)
 *
 * This is the single integration point for the turn handler.
 *
 * @module agents/integrations/unified-intelligence-integration
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getIntelligenceForTurn,
  initIntelligenceSession,
  cleanupIntelligence,
  recordDomainSignal,
  markInsightSurfaced,
  recordInsightReaction,
  type ContextWindow,
  type ProactiveIntelligenceInsight,
  type CrossDomainCorrelation,
  type DomainSignal,
  type SurfaceMoment,
} from '../../intelligence/index.js';
import {
  buildSuperhumanContext,
  formatSuperhumanContextForPrompt,
} from '../../services/superhuman/index.js';
import { processSemanticIntelligence } from '../../services/superhuman/semantic-intelligence/integration.js';
// "Better Than Human" - User Knowledge System
import {
  getUserKnowledge,
  formatKnowledgeForContext,
  clearKnowledgeCache,
  type UserKnowledge,
} from '../../intelligence/user-knowledge/index.js';
// "Better Than Human" - Pattern Mirror (Self-Sabotage Patterns)
import {
  getUnsurfacedPatterns,
  markPatternSurfaced,
  formatBehavioralContext,
  type SelfSabotagePattern,
} from '../../services/superhuman/semantic-intelligence/behavioral-intelligence.js';
// "Better Than Human" - Emotional Trajectories (Multi-week Arcs)
import {
  getActiveArcs,
  buildEmotionalTrajectoryContext,
  type EmotionalArc,
} from '../../services/superhuman/semantic-intelligence/emotional-trajectories.js';
// "Better Than Human" - Dream Keeper (Never Forget Aspirations)
import {
  findDormantDreams,
  loadUserDreams,
  buildDreamContext,
  type Dream,
  type DreamReminder,
} from '../../services/superhuman/dream-keeper.js';
// "Better Than Human" - Future Self (Letters from Your Future)
import {
  getRecentLetter,
  buildFutureSelfContext,
  type FutureSelfLetter,
} from '../../services/superhuman/future-self.js';
// "Better Than Human" - Relationship Milestones (Journey Together)
import {
  checkAndRecordMilestones,
  acknowledgeMilestone,
  buildMilestoneContext,
  type RelationshipMilestone,
} from '../../services/superhuman/relationship-milestones.js';
// Note: VoiceEmotionState type simplified in TurnIntelligenceInput interface

const log = createLogger({ module: 'unified-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedIntelligenceResult {
  // Unified context from Level 2
  context: ContextWindow;

  // Cross-domain correlations from Level 4
  correlations: CrossDomainCorrelation[];

  // Proactive insights from Level 5
  proactiveInsights: ProactiveIntelligenceInsight[];

  // Superhuman context string for LLM
  superhumanContext: string;

  // "Better Than Human" - User Knowledge
  userKnowledge?: UserKnowledge;
  userKnowledgeContext?: string;

  // "Better Than Human" - Pattern Mirror (self-sabotage patterns)
  unsurfacedPatterns?: SelfSabotagePattern[];
  behavioralContext?: string;

  // "Better Than Human" - Emotional Trajectories (multi-week arcs)
  emotionalArcs?: EmotionalArc[];
  emotionalTrajectoryContext?: string;

  // "Better Than Human" - Dream Keeper (dormant aspirations)
  dreams?: Dream[];
  dormantDreamReminders?: DreamReminder[];
  dreamContext?: string;

  // "Better Than Human" - Future Self (letters from future)
  futureSelfLetter?: FutureSelfLetter | null;
  futureSelfContext?: string;

  // "Better Than Human" - Relationship Milestones
  newMilestones?: RelationshipMilestone[];
  milestoneContext?: string;

  // Insight to surface (if any)
  insightToSurface?: {
    id: string;
    message: string;
    followUp?: string;
    category: string;
    source?:
      | 'proactive'
      | 'pattern_mirror'
      | 'emotional_trajectory'
      | 'dream_keeper'
      | 'future_self'
      | 'milestone';
  };

  // Timing metrics
  timingMs: {
    contextAssembly: number;
    superhuman: number;
    userKnowledge: number;
    patternMirror: number;
    emotionalTrajectory: number;
    dreamKeeper: number;
    futureSelf: number;
    milestones: number;
    total: number;
  };
}

export interface TurnIntelligenceInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  voiceEmotion?: {
    emotion: string;
    confidence: number;
    arousal?: number;
    valence?: number;
  };
  detectedTopics?: string[];
  detectedEmotion?: string;
  personaMentioned?: string;
  calendarEvents?: unknown[];
  // For milestone tracking
  conversationStats?: {
    totalConversations: number;
    firstConversation: number;
    lastConversation: number;
    vulnerableMoments?: number;
    breakthroughs?: number;
  };
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize intelligence for a new session
 */
export function initializeIntelligence(userId: string, sessionId: string): void {
  log.debug({ userId, sessionId }, '🧠 Initializing unified intelligence');
  initIntelligenceSession(userId);
  // Clear knowledge cache for fresh data
  clearKnowledgeCache(userId);
}

/**
 * Clean up intelligence at session end
 */
export function cleanupIntelligenceSession(userId: string, sessionId: string): void {
  log.debug({ userId, sessionId }, '🧹 Cleaning up unified intelligence');
  cleanupIntelligence(userId);
}

// ============================================================================
// MAIN INTEGRATION
// ============================================================================

/**
 * Get all intelligence for a conversation turn
 *
 * This is the main entry point called from turn-handler.ts.
 * It assembles all context, checks proactive triggers, and
 * builds the superhuman context string.
 */
export async function getUnifiedIntelligence(
  input: TurnIntelligenceInput
): Promise<UnifiedIntelligenceResult> {
  const {
    userId,
    sessionId,
    turnNumber,
    transcript,
    voiceEmotion,
    detectedTopics,
    detectedEmotion,
    personaMentioned,
    calendarEvents,
    conversationStats,
  } = input;

  const startTime = Date.now();

  // Determine surface moment based on turn number
  const moment: SurfaceMoment = turnNumber === 1 ? 'session_start' : 'natural_pause';

  // Note: VoiceEmotionState has a complex structure that requires full session tracking
  // For now, we pass undefined and let the context assembler use session state instead
  // This is fine because voice emotion is already tracked in SessionStateManager

  // Run all intelligence systems in parallel
  const startTimeIntel = Date.now();

  const [
    intelligence,
    superhumanContext,
    userKnowledge,
    unsurfacedPatterns,
    emotionalArcs,
    dreams,
    dormantDreamReminders,
    futureSelfLetter,
    newMilestones,
  ] = await Promise.all([
    // New unified intelligence (Levels 2-5)
    getIntelligenceForTurn(userId, {
      moment,
      // voiceEmotion is tracked in session state, not passed here
      forceRefresh: turnNumber === 1,
    }),

    // Existing superhuman services (19 capabilities)
    buildSuperhumanContext(userId, {
      currentTranscript: transcript,
      currentTopics: detectedTopics,
      currentEmotion: detectedEmotion,
      currentMentionedPerson: personaMentioned,
      upcomingCalendarEvents: calendarEvents as never,
    }),

    // "Better Than Human" - User Knowledge (cached after first fetch)
    getUserKnowledge(userId, { forceRefresh: turnNumber === 1 }),

    // "Better Than Human" - Pattern Mirror (self-sabotage patterns ready to surface)
    getUnsurfacedPatterns(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Failed to get unsurfaced patterns');
      return [] as SelfSabotagePattern[];
    }),

    // "Better Than Human" - Emotional Trajectories (multi-week arcs)
    getActiveArcs(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Failed to get emotional arcs');
      return [] as EmotionalArc[];
    }),

    // "Better Than Human" - Dream Keeper (all dreams)
    loadUserDreams(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Failed to load user dreams');
      return [] as Dream[];
    }),

    // "Better Than Human" - Dream Keeper (dormant dreams ready to remind)
    findDormantDreams(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Failed to find dormant dreams');
      return [] as DreamReminder[];
    }),

    // "Better Than Human" - Future Self (most recent letter)
    getRecentLetter(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Failed to get future self letter');
      return null;
    }),

    // "Better Than Human" - Relationship Milestones (check for new ones)
    conversationStats
      ? checkAndRecordMilestones(userId, conversationStats).catch((err) => {
          log.debug({ error: String(err), userId }, 'Failed to check milestones');
          return [] as RelationshipMilestone[];
        })
      : Promise.resolve([] as RelationshipMilestone[]),
  ]);

  const contextAssemblyMs = Date.now() - startTimeIntel;
  const superhumanMs = contextAssemblyMs; // Ran in parallel
  const userKnowledgeMs = contextAssemblyMs; // Ran in parallel
  const patternMirrorMs = contextAssemblyMs; // Ran in parallel
  const emotionalTrajectoryMs = contextAssemblyMs; // Ran in parallel
  const dreamKeeperMs = contextAssemblyMs; // Ran in parallel
  const futureSelfMs = contextAssemblyMs; // Ran in parallel
  const milestonesMs = contextAssemblyMs; // Ran in parallel

  // Build additional contexts for LLM injection
  const [behavioralContext, emotionalTrajectoryContext, dreamContext, milestoneContext] =
    await Promise.all([
      formatBehavioralContext(userId, {
        emotion: detectedEmotion,
        topic: detectedTopics?.[0],
      }).catch(() => ''),
      buildEmotionalTrajectoryContext(userId, {
        emotion: detectedEmotion,
        topic: detectedTopics?.[0],
      }).catch(() => ''),
      buildDreamContext(userId).catch(() => ''),
      conversationStats
        ? buildMilestoneContext(userId, conversationStats).catch(() => '')
        : Promise.resolve(''),
    ]);

  // Build Future Self context (sync, doesn't need DB)
  const futureSelfContext = buildFutureSelfContext(futureSelfLetter);

  // Format superhuman context for LLM injection
  const formattedSuperhuman = formatSuperhumanContextForPrompt(superhumanContext);

  // Format user knowledge for LLM injection
  const userKnowledgeContext = formatKnowledgeForContext(userKnowledge, {
    maxTokens: 400,
    prioritySections: ['boundaries', 'emotional', 'relationships', 'aspirations'],
    style: 'concise',
    includeHeaders: true,
  });

  // Determine if we should surface a proactive insight
  let insightToSurface: UnifiedIntelligenceResult['insightToSurface'] = undefined;

  // Priority 1: Check for Pattern Mirror insights (self-sabotage patterns)
  // These are high-value "Better Than Human" insights - surface gently
  // Only surface after turn 4+ to build rapport first
  if (unsurfacedPatterns.length > 0 && turnNumber >= 4) {
    const topPattern = unsurfacedPatterns[0];
    // Only surface high-confidence patterns at natural pauses
    // Increased threshold to 0.8 to avoid false positives
    if (topPattern.confidence >= 0.8 && moment === 'natural_pause') {
      // Build a more natural, conversational message
      const patternMessage = buildPatternMirrorMessage(topPattern);
      insightToSurface = {
        id: topPattern.id,
        message: patternMessage,
        followUp: 'I could be wrong, but I thought it was worth mentioning.',
        category: 'pattern_mirror',
        source: 'pattern_mirror',
      };
      log.debug(
        { userId, patternId: topPattern.id, confidence: topPattern.confidence },
        '🪞 Pattern Mirror insight ready to surface'
      );
    }
  }

  // Priority 2: Check for Emotional Trajectory insights
  // Surface when there's a significant arc that could benefit from acknowledgment
  if (!insightToSurface && emotionalArcs.length > 0 && turnNumber >= 2) {
    const significantArc = emotionalArcs.find(
      (arc) =>
        (arc.phase === 'peak' || arc.phase === 'resolving' || arc.phase === 'recurring') &&
        arc.waypoints.length >= 3
    );

    if (significantArc && moment === 'natural_pause') {
      const arcMessage = buildEmotionalArcMessage(significantArc);
      if (arcMessage) {
        insightToSurface = {
          id: significantArc.id,
          message: arcMessage,
          followUp:
            significantArc.phase === 'resolving'
              ? 'It seems like things might be getting better. How does it feel?'
              : undefined,
          category: 'emotional_trajectory',
          source: 'emotional_trajectory',
        };
        log.debug(
          { userId, arcId: significantArc.id, phase: significantArc.phase },
          '📈 Emotional Trajectory insight ready to surface'
        );
      }
    }
  }

  // Priority 3: Dream Keeper insights (dormant aspirations)
  // Remind users of dreams they've forgotten - but gently
  if (!insightToSurface && dormantDreamReminders.length > 0 && turnNumber >= 3) {
    const topReminder = dormantDreamReminders[0];
    // Only surface dreams dormant for 60+ days at natural pauses
    if (topReminder.daysDormant >= 60 && moment === 'natural_pause') {
      insightToSurface = {
        id: topReminder.dreamId,
        message: topReminder.message,
        followUp:
          topReminder.tone === 'gentle'
            ? "No pressure - I just wanted you to know I haven't forgotten."
            : "Is that still something you're thinking about?",
        category: 'dream_keeper',
        source: 'dream_keeper',
      };
      log.debug(
        { userId, dreamId: topReminder.dreamId, daysDormant: topReminder.daysDormant },
        '✨ Dream Keeper reminder ready to surface'
      );
    }
  }

  // Priority 4: Relationship Milestones (celebrate achievements together)
  // Surface new milestones at session start to celebrate
  if (!insightToSurface && newMilestones.length > 0 && moment === 'session_start') {
    const topMilestone = newMilestones[0];
    // Build warm, non-emoji message (per brand guidelines)
    const milestoneMessage = buildMilestoneMessage(topMilestone);
    insightToSurface = {
      id: topMilestone.id,
      message: milestoneMessage,
      followUp: "I'm really glad we've built this together.",
      category: 'milestone',
      source: 'milestone',
    };
    log.debug(
      { userId, milestoneId: topMilestone.id, title: topMilestone.title },
      '🎉 Relationship Milestone ready to celebrate'
    );
  }

  // Priority 5: Future Self insights (when user needs perspective)
  // Only surface if we have a recent letter with key insights
  // This is a powerful tool - use sparingly and only when truly helpful
  if (!insightToSurface && futureSelfLetter && turnNumber >= 6) {
    const hasRecentLetter =
      futureSelfLetter.generatedAt &&
      Date.now() - new Date(futureSelfLetter.generatedAt).getTime() < 30 * 24 * 60 * 60 * 1000;

    if (hasRecentLetter && futureSelfLetter.keyInsights.length > 0 && moment === 'natural_pause') {
      // Only surface if user seems to need perspective (expanded emotion list)
      const perspectiveEmotions = [
        'anxious',
        'worried',
        'stressed',
        'uncertain',
        'lost',
        'stuck',
        'confused',
        'overwhelmed',
        'hopeless',
        'scared',
      ];
      const needsPerspective =
        detectedEmotion &&
        perspectiveEmotions.some((e) => detectedEmotion.toLowerCase().includes(e));

      if (needsPerspective) {
        // Build a gentle, non-gimmicky message
        const timeframeHuman = futureSelfLetter.timeframe
          .replace('_', ' ')
          .replace('months', 'month')
          .replace('years', 'year');
        const insight = futureSelfLetter.keyInsights[0];

        insightToSurface = {
          id: futureSelfLetter.id,
          message: `When you were talking about your future a while back, I wrote something down. Looking ${timeframeHuman} ahead: ${insight} Would you want to hear more of what I imagined for you?`,
          followUp: undefined, // Let them decide
          category: 'future_self',
          source: 'future_self',
        };
        log.debug(
          { userId, letterId: futureSelfLetter.id, timeframe: futureSelfLetter.timeframe },
          '📜 Future Self letter ready to share'
        );
      }
    }
  }

  // Priority 6: Standard proactive insights from Level 5
  if (!insightToSurface && intelligence.proactiveInsights.length > 0) {
    const topInsight = intelligence.proactiveInsights[0];

    // Surface at session start for opener insights
    if (moment === 'session_start' && topInsight.surfaceMoment === 'session_start') {
      insightToSurface = {
        id: topInsight.id,
        message: topInsight.message,
        followUp: topInsight.followUp,
        category: topInsight.category,
        source: 'proactive',
      };
      // Don't mark as surfaced yet - let the turn handler decide
    }

    // Surface topic-relevant insights when appropriate
    if (
      moment === 'natural_pause' &&
      topInsight.surfaceMoment === 'topic_relevant' &&
      topInsight.priority <= 5
    ) {
      insightToSurface = {
        id: topInsight.id,
        message: topInsight.message,
        followUp: topInsight.followUp,
        category: topInsight.category,
        source: 'proactive',
      };
    }
  }

  const totalMs = Date.now() - startTime;

  log.debug(
    {
      userId,
      sessionId,
      turnNumber,
      correlationsCount: intelligence.correlations.length,
      proactiveCount: intelligence.proactiveInsights.length,
      unsurfacedPatternsCount: unsurfacedPatterns.length,
      emotionalArcsCount: emotionalArcs.length,
      dreamsCount: dreams.length,
      dormantDreamsCount: dormantDreamReminders.length,
      hasFutureSelfLetter: !!futureSelfLetter,
      newMilestonesCount: newMilestones.length,
      hasInsightToSurface: !!insightToSurface,
      insightSource: insightToSurface?.source,
      userKnowledgeCompleteness: userKnowledge.metadata.completeness.overall,
      timingMs: {
        contextAssemblyMs,
        superhumanMs,
        userKnowledgeMs,
        patternMirrorMs,
        emotionalTrajectoryMs,
        dreamKeeperMs,
        futureSelfMs,
        milestonesMs,
        totalMs,
      },
    },
    '✨ Unified intelligence assembled (Full BTH Suite)'
  );

  return {
    context: intelligence.context,
    correlations: intelligence.correlations,
    proactiveInsights: intelligence.proactiveInsights,
    superhumanContext: formattedSuperhuman,
    userKnowledge,
    userKnowledgeContext,
    unsurfacedPatterns,
    behavioralContext,
    emotionalArcs,
    emotionalTrajectoryContext,
    dreams,
    dormantDreamReminders,
    dreamContext,
    futureSelfLetter,
    futureSelfContext,
    newMilestones,
    milestoneContext,
    insightToSurface,
    timingMs: {
      contextAssembly: contextAssemblyMs,
      superhuman: superhumanMs,
      userKnowledge: userKnowledgeMs,
      patternMirror: patternMirrorMs,
      emotionalTrajectory: emotionalTrajectoryMs,
      dreamKeeper: dreamKeeperMs,
      futureSelf: futureSelfMs,
      milestones: milestonesMs,
      total: totalMs,
    },
  };
}

/**
 * Build a human-friendly message for an emotional arc
 */
function buildEmotionalArcMessage(arc: EmotionalArc): string | null {
  const { theme, phase, trend, narrative, waypoints } = arc;
  const durationDays = Math.floor((Date.now() - arc.startedAt) / (24 * 60 * 60 * 1000));
  const recentIntensity =
    waypoints.slice(-3).reduce((acc: number, wp) => acc + wp.intensity, 0) / 3;

  // Only surface meaningful arcs
  if (durationDays < 7 || waypoints.length < 4) {
    return null;
  }

  switch (phase) {
    case 'peak':
      return `I've been noticing your ${theme} has been quite intense lately. You've been carrying this for about ${durationDays} days now. How are you doing with it?`;

    case 'resolving':
      if (arc.turningPoint) {
        return `I see that your ${theme} seems to be easing. Something shifted ${arc.turningPoint.catalyst ? `after ${arc.turningPoint.catalyst}` : 'recently'}. That's really positive.`;
      }
      return `Your ${theme} seems to be lifting. You've been dealing with this for ${durationDays} days, and it looks like it's getting better.`;

    case 'recurring':
      return `I noticed your ${theme} has come back. This has happened before. Would it help to talk about what might be triggering it?`;

    case 'building':
      if (recentIntensity > 0.6) {
        return `I've been noticing your ${theme} building over the past ${durationDays} days. It seems like it's weighing on you more. Want to talk about it?`;
      }
      return null;

    default:
      return null;
  }
}

/**
 * Build a natural, conversational message for a self-sabotage pattern
 * These insights are delicate - we're pointing out blind spots
 */
function buildPatternMirrorMessage(pattern: SelfSabotagePattern): string {
  const { trigger, behavior, instances } = pattern;
  const instanceCount = instances.length;

  // Vary the framing based on how many times we've seen it
  const openers = [
    "I've been thinking about something...",
    "Can I share something I've noticed?",
    "I'm not sure if you've realized this, but...",
    "Something's been on my mind...",
  ];

  const opener = openers[Math.floor(Math.random() * openers.length)];

  // Make the pattern description conversational
  const triggerPhrase = trigger.toLowerCase().startsWith('close to')
    ? `when you're ${trigger.toLowerCase()}`
    : `when ${trigger.toLowerCase()}`;

  const behaviorPhrase = behavior.toLowerCase();

  if (instanceCount >= 5) {
    return `${opener} I've noticed that ${triggerPhrase}, there's a tendency to ${behaviorPhrase}. It's happened several times now. Does that ring true for you?`;
  } else {
    return `${opener} It seems like ${triggerPhrase}, you sometimes ${behaviorPhrase}. I could be reading too much into it - what do you think?`;
  }
}

/**
 * Build a warm, celebratory message for a relationship milestone
 * Per brand guidelines: no emojis, warm and human tone
 */
function buildMilestoneMessage(milestone: RelationshipMilestone): string {
  const { type, title, description } = milestone;

  // Different messages based on milestone type
  switch (type) {
    case 'duration':
      if (title.includes('Year')) {
        return `You know what? ${title} together. ${description} It means a lot that you keep showing up.`;
      }
      return `${title}. ${description} Thank you for trusting me with your thoughts.`;

    case 'conversations':
      return `This is our ${title.toLowerCase().replace('conversations', 'conversation together')}. ${description}`;

    case 'trust':
    case 'breakthrough':
      return `I wanted to acknowledge something - ${description.toLowerCase()}`;

    case 'growth':
      return `I've been noticing your growth. ${description}`;

    default:
      return `${title}. ${description}`;
  }
}

// ============================================================================
// LEARNING HOOKS
// ============================================================================

/**
 * Process learning from a conversation turn (fire-and-forget)
 */
export function processTurnLearning(input: {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  topic?: string;
  topics?: string[];
  emotion?: string;
  personaMentioned?: string;
  reactionToInsight?: 'positive' | 'neutral' | 'acknowledged' | 'negative';
}): void {
  const {
    userId,
    sessionId,
    turnNumber,
    transcript,
    topic,
    topics,
    emotion,
    personaMentioned,
    reactionToInsight,
  } = input;

  // Record reaction to proactive insight if we got one
  if (reactionToInsight) {
    // Map 'acknowledged' to 'neutral' for the API
    const reaction =
      reactionToInsight === 'acknowledged' ? ('neutral' as const) : reactionToInsight;
    log.debug({ userId, reaction }, 'Recording insight reaction');
    // This would tie back to the insight that was surfaced this turn
    // For now, we just log it - full implementation would track the insight ID
  }

  const now = new Date();
  // Fire-and-forget semantic intelligence processing
  void processSemanticIntelligence({
    userId,
    userText: transcript,
    topic: topic || topics?.[0] || '',
    topics,
    textEmotion: emotion || '',
    textEmotionIntensity: 0.5,
    sessionId,
    personaId: 'ferni', // Default persona
    turnNumber,
    mentionedPerson: personaMentioned,
    timestamp: now,
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
    turnsSinceStart: turnNumber,
  }).catch((err) => {
    log.debug({ error: String(err), userId }, 'Semantic intelligence processing failed');
  });
}

/**
 * Record a domain signal for cross-domain correlation
 */
export function recordSignal(userId: string, signal: DomainSignal): void {
  recordDomainSignal(userId, signal);
}

/**
 * Mark a proactive insight as surfaced
 */
export function markProactiveInsightSurfaced(userId: string, insightId: string): void {
  markInsightSurfaced(userId, insightId);
}

/**
 * Mark a Pattern Mirror insight as surfaced
 */
export function markPatternMirrorSurfaced(userId: string, patternId: string): void {
  markPatternSurfaced(userId, patternId).catch((err) => {
    log.debug({ error: String(err), userId, patternId }, 'Failed to mark pattern surfaced');
  });
}

/**
 * Mark a Relationship Milestone as acknowledged
 */
export function markMilestoneAcknowledged(userId: string, milestoneId: string): void {
  acknowledgeMilestone(userId, milestoneId).catch((err) => {
    log.debug({ error: String(err), userId, milestoneId }, 'Failed to acknowledge milestone');
  });
}

/**
 * Record user reaction to a proactive insight
 */
export function recordProactiveInsightReaction(
  userId: string,
  insightId: string,
  reaction: 'positive' | 'neutral' | 'negative'
): void {
  recordInsightReaction(userId, insightId, reaction);
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format intelligence context for LLM injection
 */
export function formatIntelligenceForLLM(
  result: UnifiedIntelligenceResult,
  options?: {
    maxTokens?: number;
    includeSuperhumanFull?: boolean;
    includeUserKnowledge?: boolean;
    includePatternMirror?: boolean;
    includeEmotionalTrajectory?: boolean;
    includeDreamKeeper?: boolean;
    includeFutureSelf?: boolean;
    includeMilestones?: boolean;
  }
): string {
  const parts: string[] = [];

  // Add user knowledge first (most important for personalization)
  if (options?.includeUserKnowledge !== false && result.userKnowledgeContext) {
    parts.push(result.userKnowledgeContext);
  }

  // Add current context awareness
  const ctx = result.context;
  if (ctx.immediate.currentMood && ctx.immediate.currentMood !== 'neutral') {
    parts.push(`[EMOTIONAL STATE] User appears ${ctx.immediate.currentMood}`);
  }

  // Add temporal context
  parts.push(
    `[TIME] ${ctx.immediate.timeOfDay.replace('_', ' ')} on ${ctx.immediate.dayOfWeek}${ctx.immediate.isWeekend ? ' (weekend)' : ''}`
  );

  // Add active domains
  if (ctx.activeDomains.length > 0) {
    parts.push(`[RELEVANT DOMAINS] ${ctx.activeDomains.slice(0, 5).join(', ')}`);
  }

  // Add cross-domain correlations (max 2)
  for (const corr of result.correlations.slice(0, 2)) {
    if (corr.confidence !== 'suspected') {
      parts.push(`[PATTERN] ${corr.insight}`);
    }
  }

  // "Better Than Human" - Emotional Trajectory context (multi-week arcs)
  if (options?.includeEmotionalTrajectory !== false && result.emotionalTrajectoryContext) {
    parts.push(result.emotionalTrajectoryContext);
  }

  // "Better Than Human" - Pattern Mirror context (behavioral patterns)
  if (options?.includePatternMirror !== false && result.behavioralContext) {
    parts.push(result.behavioralContext);
  }

  // "Better Than Human" - Dream Keeper context (aspirations and dormant dreams)
  if (options?.includeDreamKeeper !== false && result.dreamContext) {
    parts.push(result.dreamContext);
  }

  // "Better Than Human" - Future Self context (letters from future)
  if (options?.includeFutureSelf !== false && result.futureSelfContext) {
    parts.push(result.futureSelfContext);
  }

  // "Better Than Human" - Relationship Milestones context
  if (options?.includeMilestones !== false && result.milestoneContext) {
    parts.push(result.milestoneContext);
  }

  // Add proactive insight if ready (from any source)
  if (result.insightToSurface) {
    const sourceLabelMap: Record<string, string> = {
      pattern_mirror: 'PATTERN INSIGHT',
      emotional_trajectory: 'EMOTIONAL ARC INSIGHT',
      dream_keeper: 'DREAM REMINDER',
      future_self: 'FUTURE SELF LETTER',
      milestone: 'MILESTONE CELEBRATION',
      proactive: 'INSIGHT',
    };
    const sourceLabel = sourceLabelMap[result.insightToSurface.source || 'proactive'] || 'INSIGHT';
    parts.push(`[${sourceLabel} TO SHARE] ${result.insightToSurface.message}`);
  }

  // Add superhuman context
  if (options?.includeSuperhumanFull) {
    parts.push(result.superhumanContext);
  } else {
    // Just include a truncated version
    const truncated = result.superhumanContext.slice(0, 1000);
    if (truncated) {
      parts.push(truncated);
    }
  }

  return parts.join('\n\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// USER KNOWLEDGE EXPORTS
// ============================================================================

/**
 * Get user knowledge for session initialization or debugging
 */
export { getUserKnowledge, formatKnowledgeForContext, clearKnowledgeCache };
export type { UserKnowledge };

export default {
  initializeIntelligence,
  cleanupIntelligenceSession,
  getUnifiedIntelligence,
  processTurnLearning,
  recordSignal,
  markProactiveInsightSurfaced,
  markPatternMirrorSurfaced,
  markMilestoneAcknowledged,
  recordProactiveInsightReaction,
  formatIntelligenceForLLM,
  getUserKnowledge,
  formatKnowledgeForContext,
  clearKnowledgeCache,
};
