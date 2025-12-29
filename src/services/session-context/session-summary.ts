/**
 * Session Summary Storage - Voice ↔ App Sync (Phase 1)
 *
 * Stores conversation summaries after voice sessions so the app
 * can show what was discussed, and future voice calls can reference
 * what the user browsed in the app.
 *
 * > "Better than Human" = Every touchpoint knows your whole story.
 *
 * @module services/session-context/session-summary
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SessionSummary' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceSessionSummary {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Session start time */
  startedAt: Date;
  /** Session end time */
  endedAt: Date;
  /** Duration in seconds */
  durationSeconds: number;
  /** Personas engaged during session */
  personasEngaged: string[];
  /** Main topics discussed */
  mainTopics: string[];
  /** LLM-generated natural summary */
  naturalSummary: string;
  /** Key insights detected during conversation */
  insightsGenerated: SessionInsight[];
  /** Topics that were started but not fully explored */
  unfinishedTopics: string[];
  /** Commitments made during conversation */
  commitmentsMade: string[];
  /** Follow-up suggestions */
  suggestedFollowUp?: string;
  /** Emotional journey during conversation */
  emotionalArc: EmotionalMoment[];
  /** Overall emotional state at end */
  endingEmotionalState: string;
  /** Was this a significant conversation? */
  wasSignificant: boolean;
  /** Significance score 0-1 */
  significanceScore: number;
}

export interface SessionInsight {
  type: 'pattern' | 'concern' | 'growth' | 'memory' | 'breakthrough';
  content: string;
  confidence: number;
  timestamp: Date;
  personaId?: string;
}

export interface EmotionalMoment {
  timestamp: Date;
  emotion: string;
  intensity: number;
  trigger?: string;
}

export interface ActiveUserContext {
  /** User ID */
  userId: string;
  /** Last interaction type */
  lastInteractionType: 'voice' | 'app' | 'push' | 'sms';
  /** Last interaction timestamp */
  lastInteractionAt: Date;
  /** Current conversation thread ID (for continuity) */
  conversationThreadId?: string;
  /** Topics pending discussion */
  pendingTopics: string[];
  /** Unfinished business from previous conversations */
  unfinishedBusiness: UnfinishedItem[];
  /** Current emotional state */
  emotionalState: {
    current: string;
    confidence: number;
    trajectory: 'improving' | 'stable' | 'declining';
    updatedAt: Date;
  };
  /** Most recent voice session summary */
  lastVoiceSession?: VoiceSessionSummary;
  /** What user has been looking at in the app */
  appBrowsingContext?: AppBrowsingContext;
}

export interface UnfinishedItem {
  topic: string;
  context: string;
  detectedAt: Date;
  personaId?: string;
}

export interface AppBrowsingContext {
  /** Screens/features viewed recently */
  recentScreens: string[];
  /** Time spent on each screen (seconds) */
  timeSpent: Record<string, number>;
  /** Specific interactions (expanded charts, clicked items) */
  interactions: string[];
  /** Last updated */
  updatedAt: Date;
}

// ============================================================================
// IN-MEMORY STORAGE (Firestore integration below)
// ============================================================================

const sessionSummaries = new Map<string, VoiceSessionSummary>();
const activeContexts = new Map<string, ActiveUserContext>();

// ============================================================================
// SESSION SUMMARY FUNCTIONS
// ============================================================================

/**
 * Store a voice session summary.
 * Call this when a voice session ends.
 */
export async function storeSessionSummary(summary: VoiceSessionSummary): Promise<void> {
  // Store in memory
  sessionSummaries.set(summary.sessionId, summary);

  // Update active context
  const context = activeContexts.get(summary.userId) || createEmptyContext(summary.userId);
  context.lastInteractionType = 'voice';
  context.lastInteractionAt = summary.endedAt;
  context.lastVoiceSession = summary;
  context.pendingTopics = summary.unfinishedTopics;
  context.emotionalState = {
    current: summary.endingEmotionalState,
    confidence: 0.7,
    trajectory: 'stable',
    updatedAt: summary.endedAt,
  };

  // Add unfinished items
  for (const topic of summary.unfinishedTopics) {
    if (!context.unfinishedBusiness.find((u) => u.topic === topic)) {
      context.unfinishedBusiness.push({
        topic,
        context: `From conversation on ${summary.endedAt.toLocaleDateString()}`,
        detectedAt: summary.endedAt,
      });
    }
  }

  activeContexts.set(summary.userId, context);

  log.info(
    {
      userId: summary.userId,
      sessionId: summary.sessionId,
      duration: summary.durationSeconds,
      topics: summary.mainTopics.length,
      insights: summary.insightsGenerated.length,
      significant: summary.wasSignificant,
    },
    '📝 Voice session summary stored'
  );

  // Persist to Firestore
  await persistSummaryToFirestore(summary);
  await persistContextToFirestore(context);
}

/**
 * Get the most recent session summary for a user.
 */
export async function getLastSessionSummary(
  userId: string
): Promise<VoiceSessionSummary | null> {
  // Try memory first
  const context = activeContexts.get(userId);
  if (context?.lastVoiceSession) {
    return context.lastVoiceSession;
  }

  // Try Firestore
  return loadLastSummaryFromFirestore(userId);
}

/**
 * Get active user context for cross-channel awareness.
 */
export async function getActiveUserContext(
  userId: string
): Promise<ActiveUserContext | null> {
  // Try memory first
  const context = activeContexts.get(userId);
  if (context) {
    return context;
  }

  // Try Firestore
  return loadContextFromFirestore(userId);
}

// ============================================================================
// APP BROWSING TRACKING
// ============================================================================

/**
 * Record that user viewed a screen in the app.
 * Call this from frontend analytics.
 */
export async function recordAppScreenView(
  userId: string,
  screenName: string,
  durationSeconds: number
): Promise<void> {
  const context = activeContexts.get(userId) || createEmptyContext(userId);

  if (!context.appBrowsingContext) {
    context.appBrowsingContext = {
      recentScreens: [],
      timeSpent: {},
      interactions: [],
      updatedAt: new Date(),
    };
  }

  // Add to recent screens (keep last 10)
  if (!context.appBrowsingContext.recentScreens.includes(screenName)) {
    context.appBrowsingContext.recentScreens.unshift(screenName);
    if (context.appBrowsingContext.recentScreens.length > 10) {
      context.appBrowsingContext.recentScreens.pop();
    }
  }

  // Update time spent
  context.appBrowsingContext.timeSpent[screenName] =
    (context.appBrowsingContext.timeSpent[screenName] || 0) + durationSeconds;

  context.appBrowsingContext.updatedAt = new Date();
  context.lastInteractionType = 'app';
  context.lastInteractionAt = new Date();

  activeContexts.set(userId, context);

  log.debug({ userId, screenName, durationSeconds }, '📱 App screen view recorded');
}

/**
 * Record a specific interaction in the app.
 */
export async function recordAppInteraction(
  userId: string,
  interaction: string
): Promise<void> {
  const context = activeContexts.get(userId) || createEmptyContext(userId);

  if (!context.appBrowsingContext) {
    context.appBrowsingContext = {
      recentScreens: [],
      timeSpent: {},
      interactions: [],
      updatedAt: new Date(),
    };
  }

  // Add interaction (keep last 20)
  context.appBrowsingContext.interactions.unshift(interaction);
  if (context.appBrowsingContext.interactions.length > 20) {
    context.appBrowsingContext.interactions.pop();
  }

  context.appBrowsingContext.updatedAt = new Date();
  activeContexts.set(userId, context);

  log.debug({ userId, interaction }, '👆 App interaction recorded');
}

// ============================================================================
// CONTEXT FORMATTING FOR LLM
// ============================================================================

/**
 * Format the active user context for LLM injection.
 * Use this at the start of a voice call.
 */
export function formatContextForVoiceCall(context: ActiveUserContext): string {
  const lines: string[] = [];

  lines.push('[CROSS-CHANNEL CONTEXT]');
  lines.push('');

  // Last voice session
  if (context.lastVoiceSession) {
    const daysSince = Math.round(
      (Date.now() - context.lastVoiceSession.endedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince <= 7) {
      lines.push(`Last conversation: ${daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}`);
      lines.push(`Topics discussed: ${context.lastVoiceSession.mainTopics.join(', ')}`);

      if (context.lastVoiceSession.naturalSummary) {
        lines.push(`Summary: ${context.lastVoiceSession.naturalSummary}`);
      }

      if (context.lastVoiceSession.unfinishedTopics.length > 0) {
        lines.push(`Unfinished topics: ${context.lastVoiceSession.unfinishedTopics.join(', ')}`);
      }

      lines.push('');
    }
  }

  // App browsing context
  if (context.appBrowsingContext && context.appBrowsingContext.recentScreens.length > 0) {
    const hoursSince = Math.round(
      (Date.now() - context.appBrowsingContext.updatedAt.getTime()) / (1000 * 60 * 60)
    );

    if (hoursSince <= 24) {
      lines.push('Since our last conversation, they\'ve been looking at:');

      // Find screens with significant time
      const significantScreens = Object.entries(context.appBrowsingContext.timeSpent)
        .filter(([_, time]) => time > 30) // More than 30 seconds
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      for (const [screen, time] of significantScreens) {
        const minutes = Math.round(time / 60);
        lines.push(`  - ${screen} (${minutes > 0 ? `${minutes} min` : `${time} sec`})`);
      }

      if (context.appBrowsingContext.interactions.length > 0) {
        lines.push(`Recent interactions: ${context.appBrowsingContext.interactions.slice(0, 3).join(', ')}`);
      }

      lines.push('');
    }
  }

  // Pending topics
  if (context.pendingTopics.length > 0) {
    lines.push(`Topics to follow up on: ${context.pendingTopics.join(', ')}`);
    lines.push('');
  }

  // Emotional state
  if (context.emotionalState.current !== 'neutral') {
    lines.push(`Last known emotional state: ${context.emotionalState.current} (${context.emotionalState.trajectory})`);
    lines.push('');
  }

  // Guidance
  if (lines.length > 2) {
    lines.push('GUIDANCE:');
    lines.push('- Reference previous conversations naturally, not robotically');
    lines.push('- If they looked at something in the app, ask if they want to discuss it');
    lines.push('- Pick up unfinished topics when natural');
    lines.push('- Show continuity: "Last time we talked about..."');
  }

  return lines.join('\n');
}

/**
 * Format context for displaying in the app after a voice call.
 */
export function formatContextForApp(context: ActiveUserContext): {
  bridgeMessage?: string;
  insights: SessionInsight[];
  pendingTopics: string[];
  emotionalState: string;
} {
  const result = {
    bridgeMessage: undefined as string | undefined,
    insights: [] as SessionInsight[],
    pendingTopics: context.pendingTopics,
    emotionalState: context.emotionalState.current,
  };

  if (context.lastVoiceSession) {
    const hoursSince = Math.round(
      (Date.now() - context.lastVoiceSession.endedAt.getTime()) / (1000 * 60 * 60)
    );

    if (hoursSince <= 24) {
      // Generate bridge message
      if (context.lastVoiceSession.wasSignificant) {
        result.bridgeMessage = "I've been thinking about what you shared earlier...";
      } else if (context.lastVoiceSession.insightsGenerated.length > 0) {
        result.bridgeMessage = "I noticed something from our conversation...";
      } else if (context.lastVoiceSession.unfinishedTopics.length > 0) {
        result.bridgeMessage = "There's more I wanted to explore with you...";
      }

      result.insights = context.lastVoiceSession.insightsGenerated;
    }
  }

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyContext(userId: string): ActiveUserContext {
  return {
    userId,
    lastInteractionType: 'app',
    lastInteractionAt: new Date(),
    pendingTopics: [],
    unfinishedBusiness: [],
    emotionalState: {
      current: 'neutral',
      confidence: 0.5,
      trajectory: 'stable',
      updatedAt: new Date(),
    },
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

async function persistSummaryToFirestore(summary: VoiceSessionSummary): Promise<void> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    await db
      .collection('bogle_users')
      .doc(summary.userId)
      .collection('voice_sessions')
      .doc(summary.sessionId)
      .set({
        ...summary,
        startedAt: summary.startedAt.toISOString(),
        endedAt: summary.endedAt.toISOString(),
        emotionalArc: summary.emotionalArc.map((m) => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
        insightsGenerated: summary.insightsGenerated.map((i) => ({
          ...i,
          timestamp: i.timestamp.toISOString(),
        })),
      });

    log.debug({ userId: summary.userId, sessionId: summary.sessionId }, 'Session summary persisted to Firestore');
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to persist session summary to Firestore');
  }
}

async function persistContextToFirestore(context: ActiveUserContext): Promise<void> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    await db
      .collection('bogle_users')
      .doc(context.userId)
      .collection('active_context')
      .doc('current')
      .set({
        ...context,
        lastInteractionAt: context.lastInteractionAt.toISOString(),
        emotionalState: {
          ...context.emotionalState,
          updatedAt: context.emotionalState.updatedAt.toISOString(),
        },
        unfinishedBusiness: context.unfinishedBusiness.map((u) => ({
          ...u,
          detectedAt: u.detectedAt.toISOString(),
        })),
        appBrowsingContext: context.appBrowsingContext
          ? {
              ...context.appBrowsingContext,
              updatedAt: context.appBrowsingContext.updatedAt.toISOString(),
            }
          : undefined,
        // Don't store full lastVoiceSession here (it's in voice_sessions collection)
        lastVoiceSession: undefined,
      });

    log.debug({ userId: context.userId }, 'Active context persisted to Firestore');
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to persist active context to Firestore');
  }
}

async function loadLastSummaryFromFirestore(userId: string): Promise<VoiceSessionSummary | null> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('voice_sessions')
      .orderBy('endedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    return {
      ...data,
      startedAt: new Date(data.startedAt),
      endedAt: new Date(data.endedAt),
      emotionalArc: (data.emotionalArc || []).map((m: Record<string, unknown>) => ({
        ...m,
        timestamp: new Date(m.timestamp as string),
      })),
      insightsGenerated: (data.insightsGenerated || []).map((i: Record<string, unknown>) => ({
        ...i,
        timestamp: new Date(i.timestamp as string),
      })),
    } as VoiceSessionSummary;
  } catch (err) {
    log.warn({ error: String(err), userId }, 'Failed to load session summary from Firestore');
    return null;
  }
}

async function loadContextFromFirestore(userId: string): Promise<ActiveUserContext | null> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.default.firestore();

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('active_context')
      .doc('current')
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    const context: ActiveUserContext = {
      ...data,
      lastInteractionAt: new Date(data.lastInteractionAt),
      emotionalState: {
        ...data.emotionalState,
        updatedAt: new Date(data.emotionalState.updatedAt),
      },
      unfinishedBusiness: (data.unfinishedBusiness || []).map((u: Record<string, unknown>) => ({
        ...u,
        detectedAt: new Date(u.detectedAt as string),
      })),
      appBrowsingContext: data.appBrowsingContext
        ? {
            ...data.appBrowsingContext,
            updatedAt: new Date(data.appBrowsingContext.updatedAt),
          }
        : undefined,
    } as ActiveUserContext;

    // Also load last voice session
    context.lastVoiceSession = await loadLastSummaryFromFirestore(userId) || undefined;

    // Cache in memory
    activeContexts.set(userId, context);

    return context;
  } catch (err) {
    log.warn({ error: String(err), userId }, 'Failed to load active context from Firestore');
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  formatContextForVoiceCall as formatSessionContextForLLM,
};
