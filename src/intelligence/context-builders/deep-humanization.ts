/**
 * Deep Humanization Context Builder
 *
 * Integrates all the humanization systems into the prompt pipeline:
 * - Relationship Artifacts (shared moments, callbacks)
 * - Arc-Aware Behavior Selection (phase-appropriate behaviors)
 * - Internal Monologue (thoughts that may surface)
 * - Story Unlocks (relationship-gated stories)
 * - Vocabulary Mirroring (adopted language)
 *
 * This is the orchestration layer that makes Ferni feel ALIVE.
 *
 * @module @ferni/context-builders/deep-humanization
 */

import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS } from '../distress-levels.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// Import humanization systems
import {
  arcAwareSelector,
  internalMonologue,
  relationshipArtifacts,
  storyUnlocks,
  vocabularyMirroring,
  type MonologueContext,
  type TurnAnalysisContext,
  type UnlockContext,
} from '../../services/humanization/index.js';

import { getEmotionalArcTracker, type NarrativePhase } from '../../conversation/index.js';
import { getPersonaRelationshipStage } from '../../services/per-persona-relationship.js';

const log = createLogger({ module: 'DeepHumanization' });

// ============================================================================
// TYPES
// ============================================================================

interface DeepHumanizationState {
  previousPhase?: NarrativePhase;
  lastCallbackTurn?: number;
  lastStoryTurn?: number;
  thoughtsSurfacedThisSession: number;
}

// Session state tracking
const sessionStates = new Map<string, DeepHumanizationState>();

function getSessionState(sessionId: string): DeepHumanizationState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      thoughtsSurfacedThisSession: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

const deepHumanizationBuilder: ContextBuilder = {
  name: 'deep-humanization',
  description:
    'Integrates relationship artifacts, arc-awareness, internal monologue, and vocabulary mirroring',
  priority: 25, // After basic context, before persona quirks

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, userProfile, persona, userText, analysis, bundleRuntime } = input;
    const injections: ContextInjection[] = [];

    const sessionId = services.sessionId;
    if (!sessionId || !userData) return injections;

    const turn = userData.turnCount || 1;
    const userId = userProfile?.id || sessionId;
    const personaId = persona?.identity?.id || 'ferni';
    const state = getSessionState(sessionId);

    // Extract emotion info from analysis
    const emotionPrimary = analysis?.emotion?.primary;
    const emotionalIntensity = analysis?.emotion?.intensity;
    const isVulnerable = analysis?.emotion?.distressLevel
      ? analysis.emotion.distressLevel >= DISTRESS.MODERATE
      : false;
    const hasBreakthrough = analysis?.emotion?.markers?.includes('breakthrough') || false;
    const currentTopic = analysis?.topics?.primary || userData.lastTopic;

    // Get emotional arc context
    const arcTracker = getEmotionalArcTracker();
    const arc = arcTracker.getArc();
    const currentPhase = ((
      arcTracker as unknown as { getCurrentPhase?: () => NarrativePhase }
    ).getCurrentPhase?.() || determinePhaseFromTurn(turn, arc)) as NarrativePhase;

    // Get relationship stage
    const relationshipStage = getPersonaRelationshipStage(userProfile, personaId);

    try {
      // =====================================================================
      // 1. ARC-AWARE BEHAVIOR SELECTION
      // =====================================================================
      const arcRecommendation = arcAwareSelector.getRecommendation(turn, state.previousPhase, {
        userEmotion: emotionPrimary,
        emotionalIntensity,
        topicWeight: getTopicWeight(currentTopic),
        hasActiveCallback: turn - (state.lastCallbackTurn || 0) > 5,
        relationshipStage,
      });

      // Add arc guidance
      const arcGuidance = buildArcGuidance(arcRecommendation, currentPhase);
      if (arcGuidance) {
        injections.push(
          createStandardInjection('arc_guidance', arcGuidance, {
            category: 'humanization',
          })
        );
      }

      state.previousPhase = currentPhase;

      // =====================================================================
      // 2. RELATIONSHIP ARTIFACTS - Analyze and get callbacks
      // =====================================================================
      if (userText) {
        const turnContext: TurnAnalysisContext = {
          userMessage: userText,
          ferniResponse: '', // Current response not yet generated
          turn,
          topic: currentTopic,
          emotion: emotionPrimary,
          emotionalIntensity,
          isBreakthrough: hasBreakthrough,
          isVulnerable,
        };

        const artifacts = relationshipArtifacts.getOrCreate(userId, personaId);

        // Analyze the turn for new artifacts
        const turnAnalysis = relationshipArtifacts.analyze(turnContext, artifacts);

        // Record any new artifacts
        if (turnAnalysis.newBreakthrough && turnAnalysis.newBreakthrough.whatHappened) {
          relationshipArtifacts.recordBreakthrough(userId, personaId, {
            whatHappened: turnAnalysis.newBreakthrough.whatHappened,
            turn,
            timestamp: Date.now(),
            userReaction: turnAnalysis.newBreakthrough.userReaction || 'quiet',
            topic: turnAnalysis.newBreakthrough.topic || 'general',
            callbackPhrase: turnAnalysis.newBreakthrough.callbackPhrase || 'Remember when...',
            timesReferenced: 0,
          });
        }

        // Update vocabulary
        for (const vocab of turnAnalysis.vocabularyUpdates) {
          relationshipArtifacts.updateVocabulary(
            userId,
            personaId,
            vocab.word,
            vocab.category,
            currentTopic
          );
        }

        relationshipArtifacts.incrementTurns(userId, personaId);

        // Get callback opportunity if appropriate
        if (
          arcRecommendation.behaviors.useInsideReferences &&
          turn - (state.lastCallbackTurn || 0) > 8
        ) {
          const callback = relationshipArtifacts.getBestCallback(artifacts, {
            topic: currentTopic,
            emotion: emotionPrimary,
            turn,
          });

          if (callback && callback.content) {
            injections.push(
              createHintInjection('callback_opportunity', buildCallbackHint(callback), {
                category: 'humanization',
              })
            );
            state.lastCallbackTurn = turn;
          }
        }
      }

      // =====================================================================
      // 3. INTERNAL MONOLOGUE - Generate and potentially surface thoughts
      // =====================================================================
      if (userText && state.thoughtsSurfacedThisSession < 3) {
        const monologueContext: MonologueContext = {
          userMessage: userText,
          turn,
          topic: currentTopic,
          emotion: emotionPrimary,
          emotionalIntensity,
          recentTopics: userData.recentTopics || [],
          relationshipStage,
        };

        // Process for thoughts
        internalMonologue.process(sessionId, monologueContext, bundleRuntime);

        // Decide if we should surface a thought
        if (arcRecommendation.behaviors.surfaceVulnerability || currentPhase === 'release') {
          const surfaceDecision = internalMonologue.decideSurfacing(sessionId, {
            turn,
            emotionalIntensity,
            isVulnerableMoment: isVulnerable,
            currentPhase,
          });

          if (surfaceDecision.shouldSurface && surfaceDecision.thought) {
            injections.push(
              createHintInjection('internal_thought', buildThoughtHint(surfaceDecision), {
                category: 'humanization',
              })
            );

            internalMonologue.markSurfaced(sessionId, surfaceDecision.thought.id);
            state.thoughtsSurfacedThisSession++;
          }
        }
      }

      // =====================================================================
      // 4. STORY UNLOCKS - Check for appropriate stories
      // =====================================================================
      if (arcRecommendation.behaviors.offerStories && turn - (state.lastStoryTurn || 0) > 10) {
        const unlockContext: UnlockContext = {
          relationshipStage,
          currentPhase,
          userEmotion: emotionPrimary,
          emotionalIntensity,
          currentTopic,
          turn,
          storiesTold: userData.storiesShared || [],
          isVulnerableMoment: isVulnerable,
        };

        const bestStory = storyUnlocks.getBest(unlockContext);

        if (bestStory && bestStory.fitScore > 40) {
          injections.push(
            createHintInjection('story_opportunity', buildStoryHint(bestStory), {
              category: 'humanization',
            })
          );
        }
      }

      // =====================================================================
      // 5. VOCABULARY MIRRORING - Get words to echo
      // =====================================================================
      if (userText && arcRecommendation.behaviors.mirrorVocabulary) {
        // Analyze vocabulary
        vocabularyMirroring.analyze(userId, {
          userMessage: userText,
          turn,
          emotion: emotionPrimary,
          topic: currentTopic,
        });

        // Get mirroring opportunities
        const opportunities = vocabularyMirroring.getOpportunities(userId, {
          emotion: emotionPrimary,
          topic: currentTopic,
          isVulnerable,
        });

        if (opportunities.length > 0) {
          injections.push(
            createHintInjection('vocab_mirror', buildVocabHint(opportunities), {
              category: 'humanization',
            })
          );
        }
      }
    } catch (error) {
      log.debug(
        { error: String(error), sessionId },
        'Deep humanization context builder error (non-fatal)'
      );
    }

    return injections;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function determinePhaseFromTurn(
  turn: number,
  arc: ReturnType<ReturnType<typeof getEmotionalArcTracker>['getArc']>
): NarrativePhase {
  if (turn <= 3) return 'opening';
  if (turn > 15 && (arc.currentArousal || 0) < 0.4) return 'closing';
  if ((arc.currentArousal || 0) > 0.7) return 'peak';
  if (arc.trajectory === 'declining') return 'release';
  return 'building';
}

function getTopicWeight(topic?: string | null): 'light' | 'medium' | 'heavy' {
  if (!topic) return 'medium';
  const heavy = ['death', 'grief', 'trauma', 'abuse', 'suicide', 'crisis'];
  const light = ['weather', 'food', 'movies', 'music', 'hobby'];
  const lower = topic.toLowerCase();
  if (heavy.some((h) => lower.includes(h))) return 'heavy';
  if (light.some((l) => lower.includes(l))) return 'light';
  return 'medium';
}

function buildArcGuidance(
  recommendation: ReturnType<typeof arcAwareSelector.getRecommendation>,
  phase: NarrativePhase
): string {
  const { personality, behaviors } = recommendation;
  const lines: string[] = [];

  lines.push(`[CONVERSATION PHASE: ${phase.toUpperCase()}]`);
  lines.push(`Focus: ${personality.focus.replace(/_/g, ' ')}`);

  // Phase-specific guidance
  if (phase === 'opening') {
    lines.push('• Settle in. Read the room. Light touches only.');
  } else if (phase === 'building') {
    lines.push('• Follow their threads. Ask deeper questions.');
  } else if (phase === 'peak') {
    lines.push("• BE PRESENT. Less words. Don't fill silence.");
  } else if (phase === 'release') {
    lines.push('• Gentle landing. Acknowledge what happened.');
  } else if (phase === 'closing') {
    lines.push('• Natural wrap-up. Leave warmth, not homework.');
  }

  // Behavior flags
  const active: string[] = [];
  if (behaviors.askDeepQuestions) active.push('deep questions OK');
  if (behaviors.offerStories) active.push('stories OK');
  if (behaviors.surfaceVulnerability) active.push('vulnerability OK');
  if (behaviors.useBackchannels) active.push('backchannels OK');

  if (active.length > 0) {
    lines.push(`Active: ${active.join(', ')}`);
  }

  return lines.join('\n');
}

function buildCallbackHint(
  callback: ReturnType<typeof relationshipArtifacts.getBestCallback>
): string {
  if (!callback) return '';

  return `[CALLBACK OPPORTUNITY]
Type: ${callback.type}
Content: "${callback.content}"
Use naturally if the moment fits. Don't force it.`;
}

function buildThoughtHint(decision: ReturnType<typeof internalMonologue.decideSurfacing>): string {
  if (!decision.thought) return '';

  // IMPORTANT: Don't inject literal phrases - the LLM copies them verbatim
  // Just describe the type of thought that surfaced
  return `[INTERNAL THOUGHT SURFACING]
Type: ${decision.thought.type.replace(/_/g, ' ')}
A genuine thought arose from processing what they shared. Express it naturally in your own words if it fits.`;
}

function buildStoryHint(result: ReturnType<typeof storyUnlocks.getBest>): string {
  if (!result) return '';

  // IMPORTANT: Don't inject literal introductions - the LLM copies them verbatim
  return `[STORY OPPORTUNITY]
You have a relevant personal story that fits this moment (${Math.round(result.fitScore)}% fit).
This story is UNLOCKED for this relationship. Share naturally if it feels right - in your own words.`;
}

function buildVocabHint(
  opportunities: ReturnType<typeof vocabularyMirroring.getOpportunities>
): string {
  if (opportunities.length === 0) return '';

  const words = opportunities.map((o) => `"${o.word}" (${o.category})`).join(', ');

  return `[VOCABULARY MIRRORING]
Words they use: ${words}
Echo these naturally in your response to build rapport.`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up session state
 */
export function cleanupDeepHumanization(sessionId: string): void {
  sessionStates.delete(sessionId);
  internalMonologue.clear(sessionId);
  storyUnlocks.clearSession(sessionId);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(deepHumanizationBuilder);

export { deepHumanizationBuilder };
export default deepHumanizationBuilder;
