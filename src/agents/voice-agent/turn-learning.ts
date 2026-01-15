/**
 * Turn Learning & Recording
 *
 * Handles trust systems data recording and collective learning.
 * Extracted from turn-handler.ts for maintainability.
 *
 * Responsibilities:
 * - Trust systems data recording
 * - Collective learning signal recording
 * - Engagement analysis
 *
 * @module voice-agent/turn-learning
 */

import { log } from '@livekit/agents';
import {
  analyzeUserEngagement,
  recordResponseForLearning,
  type ConversationSignalContext,
} from '../../intelligence/index.js';
import { learnTemporalPattern } from '../../intelligence/context-builders/intelligence/temporal-intelligence.js';
import { recordSharedMoment } from '../../intelligence/context-builders/relationship/deep-relationship.js';
import { recordTrustSystemsData } from './index.js';

// Capability learning - track engagement with surfaced capabilities
import {
  onUserEngagedWithCapability,
  getRecentlySurfacedDomains,
} from '../../intelligence/tracking/capabilities.js';

// "Our Songs" - shared musical memories ("Better Than Human" feature)
import { getMusicPlayer } from '../../audio/music-player.js';
import { detectSignificantMoment, recordOurSong } from '../../services/trust-systems/our-songs.js';

// User Corrections - learn from mistakes ("Better Than Human" feature)
import { userCorrections } from '../../services/superhuman/user-corrections.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LearningContext {
  /** User ID (required for recording) */
  userId: string | null;
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Turn count */
  turnCount: number;
  /** User message text */
  userText: string;
  /** Emotional analysis result */
  emotionalResult: {
    primary: string;
    intensity: number;
    distressLevel: number;
  };
  /** Humanizing result with relationship stage */
  humanizingResult?: {
    relationship?: { stage?: string };
  };
  /** Context injections from turn processing */
  injections: Array<{ category: string; content: string }>;
  /** Full turn processing result (for trust systems) */
  turnResult: {
    emotional: { primary?: string; intensity?: number };
    context: {
      humanizingResult?: {
        mood?: unknown;
        relationship?: unknown;
      };
    };
  };
}

export interface LearningResult {
  /** Whether trust systems data was recorded */
  trustRecorded: boolean;
  /** Whether collective learning signal was recorded */
  learningRecorded: boolean;
}

// ============================================================================
// TRUST SYSTEMS RECORDING
// ============================================================================

/**
 * Record data to trust systems.
 *
 * This feeds the "Better Than Human" trust systems:
 * - Reading between lines
 * - Boundary memory
 * - Growth reflection
 * - Small wins
 */
export async function recordTurnTrustData(ctx: LearningContext): Promise<boolean> {
  if (!ctx.userId) {
    return false;
  }

  try {
    await recordTrustSystemsData({
      userId: ctx.userId,
      userText: ctx.userText,
      result: ctx.turnResult,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// COLLECTIVE LEARNING
// ============================================================================

/**
 * Record signal for collective learning / community insights.
 *
 * This feeds the collective learning system that improves
 * responses across all users based on engagement patterns.
 */
export async function recordCollectiveLearning(ctx: LearningContext): Promise<boolean> {
  const logger = log();

  if (!ctx.userId || !ctx.sessionId) {
    return false;
  }

  try {
    // Extract topic from injections if available
    const topicInjection = ctx.injections.find(
      (i) => i.category === 'topics' || i.content.includes('topic')
    );
    const topic = topicInjection?.content.split(' ')[0] || 'general';

    // Build context for collective learning
    const learningRelationship = ctx.humanizingResult?.relationship;
    const learningContext: ConversationSignalContext = {
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      personaId: ctx.personaId,
      turnNumber: ctx.turnCount,
      emotion: ctx.emotionalResult.primary || 'neutral',
      topic,
      relationshipStage: learningRelationship?.stage || 'unknown',
    };

    // Create a simplified emotion result for engagement analysis
    const valence = ctx.emotionalResult.intensity > 0.5 ? 'positive' : 'neutral';
    const emotionForEngagement = {
      primary: ctx.emotionalResult.primary as 'neutral',
      intensity: ctx.emotionalResult.intensity,
      valence: valence as 'positive' | 'neutral' | 'negative',
      distressLevel: ctx.emotionalResult.distressLevel || 0,
      confidence: 0.8,
      markers: [] as string[],
      suggestedTone: 'warm' as const,
    };

    // Analyze user engagement based on their message
    const engagement = analyzeUserEngagement(
      ctx.userText,
      null, // Previous emotion (not tracked here)
      emotionForEngagement
    );

    // Record the response signal (async, non-blocking)
    void recordResponseForLearning(
      learningContext,
      ctx.injections
        .map((i) => i.content)
        .join(' ')
        .slice(0, 500), // Summarize context injections
      engagement,
      {
        hadPersonalShare: ctx.injections.some(
          (i) => i.content.includes('personal') || i.content.includes('story')
        ),
        hadQuirk: ctx.injections.some(
          (i) => i.content.includes('quirk') || i.content.includes('playful')
        ),
        hadTeamReference: ctx.injections.some(
          (i) => i.content.includes('team') || i.content.includes('handoff')
        ),
      }
    );

    logger.debug(
      { emotion: ctx.emotionalResult.primary, topic: learningContext.topic },
      'Collective learning signal recorded'
    );

    return true;
  } catch (learningError) {
    logger.debug({ error: String(learningError) }, 'Collective learning recording (non-critical)');
    return false;
  }
}

// ============================================================================
// COMBINED LEARNING
// ============================================================================

/**
 * Record all learning data (trust systems + collective learning + temporal patterns).
 *
 * This is the main entry point for recording learning data during turn processing.
 * Also triggers:
 * - Temporal pattern learning (when the user engages, what topics at what times)
 * - Shared moment detection (inside jokes, meaningful phrases, callbacks)
 */
export async function recordAllLearningData(ctx: LearningContext): Promise<LearningResult> {
  const logger = log();

  // Core learning (existing)
  const [trustRecorded, learningRecorded] = await Promise.all([
    recordTurnTrustData(ctx),
    recordCollectiveLearning(ctx),
  ]);

  // Better Than Human learning (new) - fire and forget to not block turn processing
  // PERFORMANCE: Rate-limited writes to avoid Firestore costs and latency
  if (ctx.userId) {
    // 🔧 User Correction Detection - learn from mistakes (every turn)
    void detectAndRecordCorrections(ctx).catch((err) => {
      logger.debug({ error: String(err) }, 'User correction detection (non-critical)');
    });

    // 💡 Implicit Preference Detection - every 2 turns to avoid spam
    if (ctx.turnCount % 2 === 0) {
      void detectImplicitPreferences(ctx).catch((err) => {
        logger.debug({ error: String(err) }, 'Implicit preference detection (non-critical)');
      });
    }
    // Learn temporal patterns every 5 turns (saves 80% of writes)
    // Patterns are aggregated, so we don't need every single turn
    if (ctx.turnCount % 5 === 0) {
      void learnTemporalPattern(ctx.userId, {
        emotion: ctx.emotionalResult.primary || 'neutral',
        topic: ctx.injections.find((i) => i.category === 'topics')?.content?.split(' ')[0],
      }).catch((err) => {
        logger.debug({ error: String(err) }, 'Temporal pattern learning (non-critical)');
      });
    }

    // Check for shared moments (phrases, jokes, meaningful exchanges)
    // Only on high-emotional turns AND rate-limited to every 3rd qualifying turn
    const isHighEmotionTurn =
      ctx.emotionalResult.intensity > 0.6 ||
      ctx.injections.some(
        (i) =>
          i.content.includes('joke') ||
          i.content.includes('laugh') ||
          i.content.includes('meaningful')
      );

    if (isHighEmotionTurn && ctx.turnCount % 3 === 0) {
      void recordSharedMoment(ctx.userId, {
        type: 'callback_moment',
        content: ctx.emotionalResult.primary || 'connection',
        whatTheySaid: ctx.userText.slice(0, 200),
        triggers: [ctx.emotionalResult.primary || 'emotional_moment'],
        significance: ctx.emotionalResult.intensity > 0.8 ? 'meaningful' : 'warm',
      }).catch((err) => {
        logger.debug({ error: String(err) }, 'Shared moment recording (non-critical)');
      });

      // 📚 CAPABILITY LEARNING: Track user engagement with surfaced capabilities
      // If user asks follow-up, shows interest, or continues on a capability topic, mark engaged
      const sessionKey = `${ctx.userId}-${ctx.sessionId}`;
      const recentDomains = getRecentlySurfacedDomains(sessionKey);

      if (recentDomains.length > 0) {
        // Detect engagement signals
        const engagementSignals = detectCapabilityEngagement(ctx.userText);

        if (engagementSignals.engaged) {
          // Mark all recently surfaced domains as engaged
          for (const domain of recentDomains) {
            onUserEngagedWithCapability(sessionKey, domain);
          }
          logger.debug(
            { domains: recentDomains, signals: engagementSignals.reasons },
            '📚 Capability engagement detected'
          );
        }
      }

      // =================================================================
      // 🎵 "OUR SONGS" - Shared Musical Memories ("Better Than Human")
      // When a significant emotional moment happens while music is playing,
      // we record it as "our song" for later callback (e.g., "Remember when...")
      // =================================================================
      void recordOurSongMoment(ctx).catch((err) => {
        logger.debug({ error: String(err) }, '"Our Songs" recording (non-critical)');
      });
    }
  }

  return {
    trustRecorded,
    learningRecorded,
  };
}

// ============================================================================
// CAPABILITY ENGAGEMENT DETECTION
// ============================================================================

/**
 * Detect if user is engaging with a recently surfaced capability.
 *
 * Engagement signals:
 * - Follow-up questions ("tell me more", "how does that work?")
 * - Interest expressions ("that's cool", "I'd like that")
 * - Continuations ("yeah", "okay", "go on")
 * - NOT topic changes ("anyway", "but actually", "different question")
 */
function detectCapabilityEngagement(userText: string): {
  engaged: boolean;
  reasons: string[];
} {
  const lower = userText.toLowerCase();
  const reasons: string[] = [];

  // Positive engagement signals
  const followUpPatterns = /\b(tell me more|how does|can you|what about|show me|help me with)\b/i;
  const interestPatterns =
    /\b(that's? (cool|interesting|helpful|great)|i'd like|sounds good|yes please|love that)\b/i;
  const continuationPatterns = /\b(yeah|okay|sure|go on|continue|and then)\b/i;
  const questionMark = userText.includes('?');

  // Negative signals (disengagement / topic change)
  const topicChangePatterns =
    /\b(anyway|actually|different|something else|never ?mind|forget it|change|instead)\b/i;

  if (followUpPatterns.test(lower)) reasons.push('follow_up');
  if (interestPatterns.test(lower)) reasons.push('interest');
  if (continuationPatterns.test(lower) && userText.length < 20) reasons.push('continuation');
  if (questionMark && !topicChangePatterns.test(lower)) reasons.push('question');

  // Topic change signals indicate disengagement
  if (topicChangePatterns.test(lower)) {
    return { engaged: false, reasons: ['topic_change'] };
  }

  // Engaged if any positive signal detected
  return {
    engaged: reasons.length > 0,
    reasons,
  };
}

// ============================================================================
// USER CORRECTION DETECTION
// ============================================================================

/**
 * Detect and record user corrections.
 *
 * Correction signals:
 * - "No, I meant..." → Direct correction
 * - "Actually, it's..." → Clarification
 * - "That's not right" → Rejection
 * - "I said X, not Y" → Explicit correction
 *
 * This helps us "never make the same mistake twice" - a "Better Than Human" feature.
 */
async function detectAndRecordCorrections(ctx: LearningContext): Promise<void> {
  const logger = log();

  if (!ctx.userId) return;

  const lower = ctx.userText.toLowerCase();

  // Correction patterns
  const correctionPatterns = [
    /\b(no,?\s+i\s+(meant|said|was\s+talking\s+about))\b/i,
    /\b(actually,?\s+(it's|its|that's|i|my))\b/i,
    /\b(that'?s\s+not\s+(right|correct|what\s+i))\b/i,
    /\b(i\s+said\s+\w+,?\s+not\s+\w+)/i,
    /\b(you\s+(misheard|misunderstood|got\s+it\s+wrong))\b/i,
    /\b(no,?\s+not\s+\w+,?\s+\w+)/i,
    /\b(i\s+didn'?t\s+(say|mean))\b/i,
    /\b(let\s+me\s+clarify)\b/i,
    /\b(what\s+i\s+(meant|mean)\s+was)\b/i,
    /\b(to\s+be\s+clear)\b/i,
    // Self-correction patterns
    /\b(no,?\s+wait)\b/i,
    /\b(wait,?\s+(no|actually|it's))\b/i,
    /\b(oops|sorry),?\s+(i\s+meant|it's|that's)/i,
    /\b(scratch\s+that)\b/i,
    /\b(or\s+rather)\b/i,
    /\b(i\s+mean,?\s+(?!like))/i, // "I mean..." but not "I mean like..."
  ];

  // Check if any correction pattern matches
  const isCorrection = correctionPatterns.some((pattern) => pattern.test(lower));

  if (!isCorrection) return;

  logger.debug({ userText: ctx.userText.slice(0, 100) }, '🔧 User correction detected');

  // Extract what they're correcting (heuristic: use the message content)
  // The "original" is inferred from context - we'll store the correction itself
  // and let the LLM context builder surface it
  await userCorrections.autoRecord(
    ctx.userId,
    ctx.userText,
    `[Context: turn ${ctx.turnCount}]`,
    ctx.personaId
  );

  logger.info('✅ User correction recorded for learning');
}

/**
 * Detect implicit preferences from user behavior.
 *
 * Implicit preference signals:
 * - "I prefer..." → Direct preference
 * - "I usually..." → Behavioral pattern
 * - "I always..." → Strong preference
 * - Response patterns (short responses to verbose, long responses to terse)
 */
async function detectImplicitPreferences(ctx: LearningContext): Promise<void> {
  const logger = log();

  if (!ctx.userId) return;

  const lower = ctx.userText.toLowerCase();

  // Preference patterns
  const preferencePatterns = [
    { pattern: /\b(i\s+prefer\s+(.{3,50}))/i, type: 'explicit_preference' },
    { pattern: /\b(i\s+usually\s+(.{3,50}))/i, type: 'behavioral_pattern' },
    { pattern: /\b(i\s+always\s+(.{3,50}))/i, type: 'strong_preference' },
    { pattern: /\b(i\s+never\s+(.{3,50}))/i, type: 'strong_aversion' },
    { pattern: /\b(i\s+like\s+it\s+when\s+(.{3,30}))/i, type: 'interaction_preference' },
    { pattern: /\b(don'?t\s+(.{3,30})\s+please)/i, type: 'explicit_aversion' },
  ];

  for (const { pattern, type } of preferencePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const preference = match[1].slice(0, 100);

      logger.debug({ preference, type }, '💡 Implicit preference detected');

      await userCorrections.recordImplicitPreference(ctx.userId, {
        preference,
        category:
          type === 'explicit_preference' || type === 'explicit_aversion'
            ? 'communication'
            : 'other',
        evidence: [ctx.userText.slice(0, 200)],
        confidence: 0.7, // Medium confidence from single conversation detection
      });

      logger.info('✅ Implicit preference recorded');
      break; // Only record first match to avoid spam
    }
  }
}

// ============================================================================
// "OUR SONGS" - SHARED MUSICAL MEMORIES
// ============================================================================

/**
 * Record a song as "our song" if a significant moment is happening during music.
 *
 * This is a "Better Than Human" feature - we remember moments with music
 * and can callback later: "Remember when we were talking about X and this song was playing?"
 *
 * Flow:
 * 1. Check if music is currently playing
 * 2. Detect if this is a significant moment (breakthrough, celebration, vulnerable, etc.)
 * 3. If both true, record the song + moment for later callback
 */
async function recordOurSongMoment(ctx: LearningContext): Promise<void> {
  const logger = log();

  if (!ctx.userId) return;

  // 1. Check if music is playing
  const musicPlayer = getMusicPlayer();
  const musicState = musicPlayer.getState();

  if (!musicState.isPlaying || !musicState.currentTrack) {
    return; // No music playing - nothing to record
  }

  // 2. Detect if this is a significant moment worth remembering
  const significantMoment = detectSignificantMoment({
    recentUserText: ctx.userText,
    emotion: ctx.emotionalResult.primary || 'neutral',
    isUserSpeaking: false, // We're processing after user finished speaking
  });

  if (!significantMoment.isSignificant || !significantMoment.type) {
    return; // Not a significant moment
  }

  // 3. Record this as "our song" for later callback
  const track = musicState.currentTrack;

  logger.info('🎵 Recording "Our Song" moment', {
    song: track.name,
    artist: track.artist,
    momentType: significantMoment.type,
    userText: ctx.userText.slice(0, 50),
  });

  // Record the song memory
  recordOurSong({
    userId: ctx.userId,
    song: {
      name: track.name,
      artist: track.artist || 'Unknown Artist',
      spotifyId: track.uri, // Use URI as Spotify ID
    },
    momentType: significantMoment.type,
    emotion: significantMoment.emotion || 'grateful', // Default to 'grateful' if no emotion detected
    context: ctx.emotionalResult.primary || 'meaningful moment',
    memorableQuote: ctx.userText.slice(0, 200),
  });
}
