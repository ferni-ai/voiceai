/**
 * Ferni TTS Context Bridge
 *
 * Bridges the voice agent's conversation state to Ferni TTS superhuman context.
 * This enables the 8 "Better than Human" transforms to use real conversation data:
 *
 * 1. Circadian Rhythm - Uses user's timezone to adjust tempo
 * 2. Memory Prosody - Emphasizes entities from user's memory
 * 3. Emotional Anticipation - Uses detected user emotion
 * 4. Meaningful Silence - Uses topic sensitivity
 * 5. Relationship Prosody - Uses relationship stage from Firestore
 * 6. Energy Matching - Uses user's speaking energy
 * 7. Backchannels - Uses turn number and conversation flow
 * 8. Breath Patterns - Uses speaking rate for natural breathing
 *
 * @module @ferni/speech/tts/ferni-tts-context-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FerniSuperhumanContext, RememberedEntity } from './ferni-tts-core.js';
import { getFrequentEntities } from '../../memory/dynamic/stm-buffer.js';
import { getFirestoreDb } from '../../services/superhuman/firestore-utils.js';
import type { UserProfile } from '../../types/user-profile.js';

const log = createLogger({ module: 'ferni-tts-bridge' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Voice agent session context that contains conversation state
 */
export interface VoiceAgentContext {
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Active persona ID */
  personaId?: string;
  /** User's timezone (e.g., 'America/New_York') */
  userTimezone?: string;
  /** Current turn number in conversation */
  turnNumber?: number;
  /** User's detected emotion */
  userEmotion?: {
    emotion: string;
    intensity: number;
  };
  /** User's speaking energy level (0.0-1.0) */
  userEnergy?: number;
  /** User's speaking rate multiplier */
  userSpeakingRate?: number;
  /** Topic sensitivity (0.0-1.0) */
  topicSensitivity?: number;
  /** Emotional trajectory */
  emotionalTrajectory?: string;
  /** Whether user is in a vulnerable state */
  isVulnerable?: boolean;
  /** Relationship data from Firestore */
  relationship?: {
    daysSinceFirstInteraction?: number;
    totalInteractions?: number;
    vulnerableMoments?: number;
    trustLevel?: number;
  };
  /** Memory entities relevant to current conversation */
  memoryEntities?: Array<{
    name: string;
    type: string;
    familiarity: number;
    sentiment: number;
  }>;
}

/**
 * Voice emotion result structure (from audio-prosody analysis)
 * This matches the VoiceEmotionResult type from speech/audio-prosody/types.ts
 */
interface VoiceEmotionData {
  primary?: string;
  confidence?: number;
  valence?: number;
  arousal?: number;
  stressLevel?: number;
  anxietyMarkers?: boolean;
  prosody?: {
    speechRate?: number;
    energyMean?: number;
    pitchMean?: number;
  };
}

/**
 * Extended session userData type for voice agents
 *
 * This interface reflects the ACTUAL userData structure populated by:
 * - audio-processor.ts: voiceEmotion, emotionModulation
 * - session-state-handler.ts: turnCount, userProfile data
 * - transcript-handler.ts: turnCount increments
 */
export interface VoiceSessionUserData {
  userId?: string;
  personaId?: string;
  /** Services object containing session services including userProfile */
  services?: {
    sessionId?: string;
    /** User profile from Firestore (contains timezone, firstContact, totalConversations) */
    userProfile?: {
      timezone?: string;
      firstContact?: string;
      totalConversations?: number;
      name?: string;
    };
  };
  /** User's timezone from profile (e.g., 'America/New_York') - legacy field */
  timezone?: string;
  /** Turn count in current session */
  turnCount?: number;

  // Voice emotion analysis (populated by audio-processor.ts)
  /** Voice emotion analysis result from audio prosody */
  voiceEmotion?: VoiceEmotionData;
  /** Emotion modulation for response */
  emotionModulation?: {
    shouldSoftVoice?: boolean;
    suggestedPace?: 'slower' | 'normal' | 'faster';
  };

  // Legacy/alternative fields (for backwards compatibility)
  currentEmotion?: string;
  emotionIntensity?: number;
  userEnergy?: number;
  speakingRate?: number;

  // Topic and conversation state
  topicSensitivity?: number;
  emotionalTrajectory?: string;
  isVulnerable?: boolean;

  // Relationship data (from user profile or Firestore)
  relationshipDays?: number;
  totalInteractions?: number;
  vulnerableMoments?: number;
  trustLevel?: number;

  // Memory entities
  activeMemoryEntities?: Array<{
    name: string;
    type: string;
    familiarity: number;
    sentiment: number;
  }>;

  // User profile data (populated on session init)
  userProfile?: {
    timezone?: string;
    firstContact?: string;
    totalConversations?: number;
  };
}

// ============================================================================
// CONTEXT EXTRACTION
// ============================================================================

/**
 * Extract voice agent context from session userData
 *
 * This reads from the ACTUAL userData structure populated by:
 * - audio-processor.ts: voiceEmotion (emotion, arousal, prosody)
 * - session-init-handler.ts: userProfile (timezone, totalConversations)
 * - transcript-handler.ts: turnCount
 *
 * Falls back to legacy field names for backwards compatibility.
 */
export function extractVoiceAgentContext(
  userData: VoiceSessionUserData | unknown
): VoiceAgentContext {
  if (!userData || typeof userData !== 'object') {
    log.debug('No userData provided, using empty context');
    return {};
  }

  const data = userData as VoiceSessionUserData;

  // Extract emotion from voiceEmotion (primary source) or legacy fields
  let userEmotion: VoiceAgentContext['userEmotion'];
  if (data.voiceEmotion?.primary) {
    userEmotion = {
      emotion: data.voiceEmotion.primary,
      intensity: data.voiceEmotion.confidence ?? data.voiceEmotion.arousal ?? 0.5,
    };
  } else if (data.currentEmotion) {
    // Legacy fallback
    userEmotion = {
      emotion: data.currentEmotion,
      intensity: data.emotionIntensity ?? 0.5,
    };
  }

  // Extract energy from voiceEmotion.arousal (maps -1..1 to 0..1) or legacy field
  let userEnergy = data.userEnergy;
  if (userEnergy === undefined && data.voiceEmotion?.arousal !== undefined) {
    // Map arousal from [-1, 1] to [0, 1]
    userEnergy = (data.voiceEmotion.arousal + 1) / 2;
  }

  // Extract speaking rate from voiceEmotion.prosody or legacy field
  const userSpeakingRate = data.speakingRate ?? data.voiceEmotion?.prosody?.speechRate;

  // Extract timezone from services.userProfile (primary) or legacy fields
  // Priority: services.userProfile.timezone > data.timezone > data.userProfile?.timezone
  const userTimezone =
    data.services?.userProfile?.timezone ?? data.timezone ?? data.userProfile?.timezone;

  // Extract relationship data from services.userProfile (primary) or legacy userProfile
  // services.userProfile is populated by session-init-handler from Firestore
  const profileSource = data.services?.userProfile ?? data.userProfile;

  let relationship: VoiceAgentContext['relationship'];
  if (profileSource?.firstContact || profileSource?.totalConversations) {
    const firstContact = profileSource.firstContact
      ? new Date(profileSource.firstContact)
      : undefined;
    const daysSinceFirst = firstContact
      ? Math.floor((Date.now() - firstContact.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    relationship = {
      daysSinceFirstInteraction: data.relationshipDays ?? daysSinceFirst,
      totalInteractions: data.totalInteractions ?? profileSource.totalConversations,
      vulnerableMoments: data.vulnerableMoments,
      trustLevel: data.trustLevel,
    };
  } else if (data.relationshipDays !== undefined || data.totalInteractions !== undefined) {
    relationship = {
      daysSinceFirstInteraction: data.relationshipDays,
      totalInteractions: data.totalInteractions,
      vulnerableMoments: data.vulnerableMoments,
      trustLevel: data.trustLevel,
    };
  }

  // Detect vulnerability from voiceEmotion
  const isVulnerable =
    data.isVulnerable ??
    (data.voiceEmotion?.anxietyMarkers === true ||
      (data.voiceEmotion?.stressLevel !== undefined && data.voiceEmotion.stressLevel > 0.7));

  const context: VoiceAgentContext = {
    userId: data.userId,
    sessionId: data.services?.sessionId,
    personaId: data.personaId,
    userTimezone,
    turnNumber: data.turnCount,
    userEmotion,
    userEnergy,
    userSpeakingRate,
    topicSensitivity: data.topicSensitivity,
    emotionalTrajectory: data.emotionalTrajectory,
    isVulnerable,
    relationship,
    memoryEntities: data.activeMemoryEntities,
  };

  // Log what we extracted for debugging
  const hasData =
    userEmotion || userEnergy !== undefined || userTimezone || relationship || data.turnCount;
  if (hasData) {
    log.debug(
      {
        hasVoiceEmotion: !!data.voiceEmotion,
        hasServicesUserProfile: !!data.services?.userProfile,
        hasLegacyUserProfile: !!data.userProfile,
        emotion: userEmotion?.emotion,
        energy: userEnergy?.toFixed(2),
        timezone: userTimezone,
        turnCount: data.turnCount,
        hasRelationship: !!relationship,
        relationshipDays: relationship?.daysSinceFirstInteraction,
        totalInteractions: relationship?.totalInteractions,
      },
      '📊 Extracted voice agent context for Ferni TTS'
    );
  }

  return context;
}

// ============================================================================
// CONTEXT CONVERSION
// ============================================================================

/**
 * Convert voice agent context to Ferni TTS superhuman context
 *
 * This is the core bridge function that transforms the voice agent's
 * conversation state into the format Ferni TTS expects for its
 * superhuman transforms.
 */
export function convertToFerniSuperhumanContext(
  agentContext: VoiceAgentContext
): FerniSuperhumanContext {
  // Calculate user's local hour from timezone
  let userLocalHour: number | undefined;
  if (agentContext.userTimezone) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: agentContext.userTimezone,
        hour: 'numeric',
        hour12: false,
      });
      userLocalHour = parseInt(formatter.format(now), 10);
      // Handle midnight edge case: some locales return 24 instead of 0
      if (userLocalHour === 24) userLocalHour = 0;
    } catch (err) {
      log.warn({ timezone: agentContext.userTimezone, error: String(err) }, 'Invalid timezone');
    }
  }

  // Calculate relationship stage (0.0-1.0)
  let relationshipStage: number | undefined;
  if (agentContext.relationship) {
    const { daysSinceFirstInteraction, totalInteractions, trustLevel } = agentContext.relationship;

    if (trustLevel !== undefined) {
      // Direct trust level takes precedence
      relationshipStage = trustLevel;
    } else if (daysSinceFirstInteraction !== undefined || totalInteractions !== undefined) {
      // Calculate from days and interactions
      const daysFactor = Math.min((daysSinceFirstInteraction || 0) / 365, 1.0);
      const interactionsFactor = Math.min((totalInteractions || 0) / 100, 1.0);
      relationshipStage = daysFactor * 0.4 + interactionsFactor * 0.6;
    }
  }

  // Convert memory entities to remembered entities
  const rememberedEntities: RememberedEntity[] | undefined = agentContext.memoryEntities?.map(
    (entity) => ({
      name: entity.name,
      entityType: normalizeEntityType(entity.type),
      familiarity: entity.familiarity,
      emotionalValence: entity.sentiment,
    })
  );

  const superhumanContext: FerniSuperhumanContext = {
    userLocalHour,
    relationshipStage,
    userEnergy: agentContext.userEnergy,
    userEmotion: agentContext.userEmotion
      ? [agentContext.userEmotion.emotion, agentContext.userEmotion.intensity]
      : undefined,
    topicSensitivity: agentContext.topicSensitivity,
    emotionalTrajectory: agentContext.emotionalTrajectory,
    turnNumber: agentContext.turnNumber,
    userSpeakingRate: agentContext.userSpeakingRate,
    rememberedEntities,
  };

  log.debug(
    {
      hasLocalHour: userLocalHour !== undefined,
      hasRelationshipStage: relationshipStage !== undefined,
      hasUserEmotion: !!agentContext.userEmotion,
      entityCount: rememberedEntities?.length || 0,
    },
    'Built Ferni superhuman context'
  );

  return superhumanContext;
}

/**
 * Normalize entity type string to valid RememberedEntity type
 */
function normalizeEntityType(type: string): RememberedEntity['entityType'] {
  const normalized = type.toLowerCase();

  switch (normalized) {
    case 'person':
    case 'people':
    case 'human':
      return 'person';
    case 'place':
    case 'location':
    case 'city':
    case 'country':
      return 'place';
    case 'project':
    case 'work':
    case 'task':
      return 'project';
    case 'pet':
    case 'animal':
      return 'pet';
    default:
      return 'other';
  }
}

// ============================================================================
// HIGH-LEVEL BRIDGE
// ============================================================================

/**
 * Bridge voice agent session to Ferni TTS superhuman context
 *
 * This is the main entry point for the bridge. It takes the voice agent's
 * session userData and produces a ready-to-use FerniSuperhumanContext.
 *
 * @example
 * ```ts
 * import { bridgeToFerniContext } from './ferni-tts-context-bridge.js';
 *
 * // In voice agent's ttsNode:
 * const superhumanContext = bridgeToFerniContext(session.userData);
 * ferniTTS.setSuperhumanContext(superhumanContext);
 * ```
 */
export function bridgeToFerniContext(userData: unknown): FerniSuperhumanContext {
  const agentContext = extractVoiceAgentContext(userData);
  return convertToFerniSuperhumanContext(agentContext);
}

// ============================================================================
// ASYNC ENRICHMENT (Optional)
// ============================================================================

/**
 * Enrich context with data from Firestore (async)
 *
 * This is an optional step that fetches additional context from Firestore,
 * such as relationship data and memory entities that might not be in
 * the session userData.
 *
 * Use this when you need the most complete context possible and can
 * afford the async overhead.
 *
 * @param userId - User ID to fetch data for
 * @param baseContext - Base context to enrich
 * @returns Enriched context with Firestore data
 */
export async function enrichContextFromFirestore(
  userId: string,
  baseContext: FerniSuperhumanContext
): Promise<FerniSuperhumanContext> {
  // Skip if we already have relationship data
  if (baseContext.relationshipStage !== undefined) {
    log.debug({ userId }, 'Skipping Firestore enrichment - relationship data already present');
    return baseContext;
  }

  try {
    const db = getFirestoreDb();
    if (!db) {
      log.debug({ userId }, 'Firestore not available, returning base context');
      return baseContext;
    }

    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (!profileDoc.exists) {
      log.debug({ userId }, 'No user profile found, returning base context');
      return baseContext;
    }

    const profile = profileDoc.data() as UserProfile;
    const now = new Date();

    // Calculate relationship metrics
    const relationshipDays = profile.firstContact
      ? Math.floor(
          (now.getTime() - new Date(profile.firstContact).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;
    const totalInteractions = profile.totalConversations || 0;

    // Calculate relationship stage (0.0-1.0)
    // Weight: 40% from time (max out at 1 year), 60% from interactions (max out at 100)
    const daysFactor = Math.min(relationshipDays / 365, 1.0);
    const interactionsFactor = Math.min(totalInteractions / 100, 1.0);
    const relationshipStage = daysFactor * 0.4 + interactionsFactor * 0.6;

    log.debug(
      {
        userId,
        relationshipDays,
        totalInteractions,
        relationshipStage: relationshipStage.toFixed(2),
      },
      'Enriched context from Firestore'
    );

    return {
      ...baseContext,
      relationshipStage,
    };
  } catch (err) {
    log.warn({ userId, error: String(err) }, 'Failed to enrich context from Firestore');
    return baseContext;
  }
}

/**
 * Enrich context with active memory entities (async)
 *
 * Fetches entities from dynamic memory that are relevant to the current
 * conversation. Uses the STM (Short-Term Memory) buffer to get frequently
 * mentioned entities from the current session.
 *
 * @param sessionId - Session ID (used to get STM buffer data)
 * @param baseContext - Base context to enrich
 * @param conversationTopics - Optional topics to filter by relevance
 * @returns Enriched context with memory entities
 */
export async function enrichContextWithMemory(
  sessionId: string,
  baseContext: FerniSuperhumanContext,
  _conversationTopics?: string[]
): Promise<FerniSuperhumanContext> {
  // Skip if we already have memory entities
  if (baseContext.rememberedEntities && baseContext.rememberedEntities.length > 0) {
    log.debug({ sessionId }, 'Skipping memory enrichment - entities already present');
    return baseContext;
  }

  try {
    // Get frequently mentioned entities from STM buffer
    const frequentEntities = getFrequentEntities(sessionId, 10);

    if (frequentEntities.length === 0) {
      log.debug({ sessionId }, 'No frequent entities in STM buffer');
      return baseContext;
    }

    // Convert to RememberedEntity format for Ferni TTS
    // The familiarity is based on mention count (normalized to 0.0-1.0)
    // The emotional valence defaults to neutral (0) since STM doesn't track sentiment
    const maxMentions = Math.max(...frequentEntities.map((e) => e.mentionCount));
    const rememberedEntities: RememberedEntity[] = frequentEntities.map((entity) => ({
      name: entity.name,
      entityType: normalizeEntityType(entity.type),
      familiarity: Math.min(entity.mentionCount / Math.max(maxMentions, 5), 1.0),
      emotionalValence: 0, // Neutral default - could be enhanced with sentiment from contexts
    }));

    log.debug(
      {
        sessionId,
        entityCount: rememberedEntities.length,
        topEntities: rememberedEntities.slice(0, 3).map((e) => e.name),
      },
      'Enriched context with STM memory entities'
    );

    return {
      ...baseContext,
      rememberedEntities,
    };
  } catch (err) {
    log.warn({ sessionId, error: String(err) }, 'Failed to enrich context with memory');
    return baseContext;
  }
}

// ============================================================================
// CONTEXT CACHING
// ============================================================================

/**
 * Simple in-memory cache for superhuman context
 * Avoids re-computing context for rapid TTS calls within the same turn
 */
const contextCache = new Map<
  string,
  {
    context: FerniSuperhumanContext;
    timestamp: number;
  }
>();

const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Get cached context or compute new one
 */
export function getCachedOrComputeContext(
  cacheKey: string,
  userData: unknown
): FerniSuperhumanContext {
  const cached = contextCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.context;
  }

  const context = bridgeToFerniContext(userData);
  contextCache.set(cacheKey, { context, timestamp: now });

  // Cleanup old entries
  for (const [key, value] of contextCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS * 2) {
      contextCache.delete(key);
    }
  }

  return context;
}

/**
 * Clear context cache for a session
 */
export function clearContextCache(sessionId: string): void {
  contextCache.delete(sessionId);
}

/**
 * Clear all cached contexts
 */
export function clearAllContextCache(): void {
  contextCache.clear();
}
