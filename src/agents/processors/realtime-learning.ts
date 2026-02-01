/**
 * Real-time Learning Processing
 *
 * Handles "Better than Human" real-time memory capture and learning.
 * Extracted from turn-processor.ts for maintainability.
 *
 * This module coordinates:
 * - Relationship network extraction (social graph)
 * - Dynamic memory capture (fast capture + deep extraction)
 * - Knowledge graph capture (entities, facts, relationships)
 * - Periodic auto-save for data persistence
 * - Speculative persona preloading for instant handoffs
 * - Proactive memory surfacing
 */

import { diag } from '../../services/diagnostic-logger.js';
import { safeFireAndForget } from '../../utils/safe-fire-and-forget.js';
import { recordMention, extractNames } from '../../services/superhuman/relationship-network.js';
import { fastCapture } from '../../memory/dynamic/index.js';
import { triggerAutoSave } from '../../services/realtime-persistence.js';
import { analyzeAndPreload } from '../shared/performance/speculative-preloading.js';
import type { TurnAnalysisResult, TurnContext } from './types.js';
import type { UserData } from '../shared/types.js';
import type { SessionServices, UserProfile } from '../../services/index.js';

/**
 * Input for real-time learning processing
 */
export interface RealtimeLearningInput {
  /** User's message text */
  userText: string;
  /** Analysis result from message analysis */
  analysisResult: TurnAnalysisResult;
  /** Session services */
  services: SessionServices;
  /** User data */
  userData: UserData;
  /** Turn count */
  turnCount: number;
  /** Persona ID */
  personaId?: string;
}

/**
 * Result from proactive surfacing check
 */
export interface ProactiveSurfacingOpportunity {
  type: string;
  entity: { canonicalName: string; type: string };
  timing: string;
  naturalPhrasing: string;
  receptivityScore?: number;
}

/**
 * Process real-time learning for a turn.
 *
 * This coordinates all "Better than Human" memory and learning:
 * - Social graph extraction (names, relationships)
 * - Dynamic memory capture (entities, topics, facts)
 * - Knowledge graph capture (LLM-powered extraction)
 * - Periodic auto-save (prevent data loss)
 * - Speculative preloading (predict handoffs)
 *
 * All operations are fire-and-forget to avoid blocking turn processing.
 */
export function processRealtimeLearning(input: RealtimeLearningInput): void {
  const { userText, analysisResult, services, userData, turnCount, personaId } = input;

  if (!services.userId) {
    return;
  }

  const userId = services.userId;
  const sessionId = services.sessionId;

  // 1. RELATIONSHIP NETWORK: Extract and record names/relationships mentioned
  safeFireAndForget(
    async () => {
      const extractedNames = extractNames(userText);

      for (const { name, context } of extractedNames) {
        await recordMention(userId, {
          name,
          type: 'acquaintance',
          context,
        });
        diag.state('Recorded person mention', { name });
      }
    },
    { context: 'relationship-network-extraction' }
  );

  // 2. DYNAMIC MEMORY: Fast capture (< 50ms) + async deep extraction
  safeFireAndForget(
    async () => {
      const captureResult = await fastCapture({
        transcript: userText,
        userId,
        sessionId,
        turnNumber: turnCount,
        voiceEmotion: analysisResult.analysis.emotion.primary,
        personaId,
      });

      // Record to STM buffer for session context
      const { recordTurn } = await import('../../memory/dynamic/index.js');
      recordTurn(sessionId, userId, captureResult, userText, turnCount);

      if (captureResult.mentionedEntities.length > 0 || captureResult.asyncJobId) {
        diag.state('Dynamic memory capture', {
          entityCount: captureResult.mentionedEntities.length,
          topicCount: captureResult.topicHints.length,
          asyncJobId: captureResult.asyncJobId,
          captureTimeMs: captureResult.captureTimeMs,
        });
      }
    },
    { context: 'dynamic-memory-capture' }
  );

  // 2b. KNOWLEDGE GRAPH CAPTURE: Extract entities, facts, relationships via LLM
  safeFireAndForget(
    async () => {
      try {
        const { captureTurn, isKnowledgeCaptureReady } =
          await import('../../memory/knowledge-graph/index.js');

        if (!isKnowledgeCaptureReady()) return;

        // Convert string valence to numeric
        const valenceToNumber = (v?: string): number | undefined => {
          if (!v) return undefined;
          if (v === 'positive') return 1;
          if (v === 'negative') return -1;
          return 0;
        };

        const captureResult = await captureTurn({
          userId,
          sessionId,
          turnNumber: turnCount,
          transcript: userText,
          personaId,
          emotion: analysisResult?.analysis?.emotion
            ? {
                primary: analysisResult.analysis.emotion.primary,
                intensity: analysisResult.analysis.emotion.intensity,
                valence: valenceToNumber(analysisResult.analysis.emotion.valence),
              }
            : undefined,
          topic: analysisResult?.analysis?.topics?.detected?.[0],
          recentContext: undefined,
        });

        if (captureResult.entities.created > 0 || captureResult.entities.updated > 0) {
          diag.state('Knowledge graph updated', {
            entitiesCreated: captureResult.entities.created,
            entitiesUpdated: captureResult.entities.updated,
            factsCount: captureResult.facts.count,
            relationshipsCount: captureResult.relationships.count,
            timeMs: captureResult.metrics.totalTimeMs,
          });
        }
      } catch (error) {
        diag.debug('Knowledge graph capture failed (non-blocking)', { error: String(error) });
      }
    },
    { context: 'knowledge-graph-capture' }
  );

  // 3. PERIODIC AUTO-SAVE: Persist extracted details and social graph every 3 turns
  const extractedDetails = (userData as Record<string, unknown>).extractedDetails as
    | Array<{ type: string; value: string }>
    | undefined;
  if (extractedDetails) {
    triggerAutoSave(userId, turnCount, extractedDetails);
  } else {
    triggerAutoSave(userId, turnCount);
  }

  // 4. SPECULATIVE PERSONA PRELOADING: Predict handoff before user requests it
  analyzeAndPreload(userText, {
    sessionId,
    userId,
    currentPersona: personaId || 'ferni',
    buildInsightsFn: async (targetPersonaId: string) => {
      return {
        personaId: targetPersonaId,
        userId,
        generatedAt: Date.now(),
        personaBriefing: `Pre-warmed context for ${targetPersonaId}`,
      };
    },
  });
}

/**
 * Check for proactive memory surfacing opportunities.
 *
 * Returns memories worth mentioning at this moment in the conversation.
 * This is "Better than Human" - we bring up relevant memories at the right time.
 */
export async function checkProactiveSurfacing(
  userId: string,
  userText: string,
  options: {
    sessionId: string;
    personaId: string;
    turnNumber: number;
    surfacingCountThisSession: number;
    sessionTopics: string[];
    conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';
    lastTurnWasQuestion: boolean;
    detectedEmotion?: string;
  }
): Promise<ProactiveSurfacingOpportunity[]> {
  try {
    const { checkProactiveSurfacing: checkSurfacing, isEntityStoreReady } =
      await import('../../memory/entity-store/integration.js');

    if (!isEntityStoreReady()) {
      return [];
    }

    const opportunities = await checkSurfacing(userId, userText, options);

    if (opportunities.length > 0) {
      diag.state('Proactive surfacing opportunities found', {
        count: opportunities.length,
        types: opportunities.map((o: { type: string }) => o.type),
      });
    }

    return opportunities;
  } catch (error) {
    diag.debug('Proactive surfacing check failed (non-blocking)', { error: String(error) });
    return [];
  }
}

/**
 * Extract outreach context for intelligent proactive check-ins.
 *
 * This feeds the "Better Than Human" proactive outreach system.
 */
export function extractOutreachContext(userId: string, sessionId: string, userText: string): void {
  if (!userId || userText.length <= 10) {
    return;
  }

  // Import and call is handled via the intelligence publisher
  // This is a fire-and-forget operation
  import('../../services/intelligence-publisher.js')
    .then(({ publishOutreachExtraction }) => {
      publishOutreachExtraction(userId, sessionId, {
        message: userText,
      });
    })
    .catch((error) => {
      diag.debug('Outreach extraction failed (non-blocking)', { error: String(error) });
    });
}

/**
 * Detect and save cross-session reflection moments.
 *
 * "Better Than Human" - We remember significant moments and reflect on them next session.
 */
export async function processReflectionMoment(
  userText: string,
  currentTopic: string | undefined,
  emotion: string,
  emotionIntensity: number,
  sessionId: string,
  personaId: string,
  userProfile: UserProfile | null | undefined
): Promise<void> {
  if (!userProfile || emotionIntensity <= 0.6) {
    return;
  }

  try {
    const { detectReflectionMoment, saveReflectionMoment } =
      await import('../../intelligence/cross-session-reflection.js');

    const reflectionMoment = detectReflectionMoment(
      userText,
      currentTopic || 'general',
      emotion,
      emotionIntensity,
      sessionId,
      personaId
    );

    if (reflectionMoment) {
      saveReflectionMoment(userProfile, reflectionMoment);
      diag.debug('Reflection moment captured', {
        type: reflectionMoment.type,
        topic: reflectionMoment.topic,
        weight: reflectionMoment.emotionalWeight,
      });
    }
  } catch (error) {
    diag.debug('Reflection moment processing failed (non-blocking)', { error: String(error) });
  }
}
