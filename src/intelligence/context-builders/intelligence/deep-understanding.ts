/**
 * Deep Understanding Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates all the "superhuman understanding" intelligence systems:
 *
 * 1. Silence Intelligence - What different pauses mean
 * 2. Life Rhythm Prediction - Anticipating when they'll need support
 * 3. Relational Network - Understanding people in their life
 * 4. Resistance Detection - What they're avoiding
 * 5. Energy State - Physical/mental capacity
 * 6. Subconscious Goals - What they want but haven't articulated
 * 7. Conversational Flow - When to go deep vs light
 * 8. Repair Intelligence - Fixing misunderstandings
 * 9. Hope Trajectory - Long-term resilience tracking
 * 10. Life Chapter - Major life phases and transitions
 * 11. Voice-Text Mismatch - Detecting incongruence between words and tone
 *
 * This builder synthesizes all these signals into coherent guidance
 * for truly superhuman emotional intelligence.
 *
 * @module intelligence/context-builders/intelligence/deep-understanding
 */

import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import { createLogger } from '../../../utils/safe-logger.js';

// Import all intelligence systems
import {
  analyzeSilence,
  formatSilenceForPrompt,
  type SilenceAnalysis,
} from '../../silence-intelligence.js';

// Voice-text mismatch detection
import { buildMismatchGuidance, detectMismatch } from '../../voice-text-mismatch.js';

import {
  formatPredictionForPrompt,
  predictUserState,
  recordConversationObservation,
} from '../../life-rhythm-prediction.js';

import {
  detectUnspokenTension,
  extractPersonMentions,
  formatRelationalInsightsForPrompt,
  recordPersonMention,
} from '../../relational-network.js';

import { analyzeResistance, formatResistanceForPrompt } from '../../resistance-detection.js';

import { assessEnergyState, formatEnergyForPrompt } from '../../energy-state.js';

import { analyzeSubconscious } from '../../subconscious-goals.js';

import { analyzeFlow, formatFlowForPrompt } from '../../conversational-flow.js';

import {
  detectMisunderstanding,
  formatRepairForPrompt,
  generateRepair,
  recordAIResponse,
} from '../../repair-intelligence.js';

import { analyzeHope, formatHopeForPrompt } from '../../hope-trajectory.js';

import { analyzeChapter, formatChapterForPrompt } from '../../life-chapter.js';

import {
  BuilderCategory,
  createCriticalInjection,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'DeepUnderstanding' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface DeepUnderstandingSession {
  lastAnalysis: Date;
  turnCount: number;
  previousEmotion: string;
  previousEmotionIntensity: number;
  lastAIResponse: string | null;
  silenceDetected: boolean;
  silenceDuration: number;
}

const sessions = new Map<string, DeepUnderstandingSession>();

function getSession(sessionId: string): DeepUnderstandingSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      lastAnalysis: new Date(),
      turnCount: 0,
      previousEmotion: 'neutral',
      previousEmotionIntensity: 0.5,
      lastAIResponse: null,
      silenceDetected: false,
      silenceDuration: 0,
    };
    sessions.set(sessionId, session);
  }
  return session;
}

/**
 * Clear session data for a specific session (prevents memory leaks).
 */
export function clearDeepUnderstandingSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Clear all session data (for shutdown).
 */
export function clearAllDeepUnderstandingSessions(): void {
  sessions.clear();
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Deep Understanding Context Builder
 *
 * Integrates all intelligence systems for superhuman emotional awareness
 */
async function buildDeepUnderstanding(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services, userText, analysis, persona, userData } = input;
  const injections: ContextInjection[] = [];

  const userId = services?.userProfile?.id || services?.userId || 'unknown';
  const sessionId = services?.sessionId || 'unknown';
  const session = getSession(sessionId);
  session.turnCount++;

  // Get current state
  const currentEmotion = analysis?.emotion?.primary || 'neutral';
  const currentEmotionIntensity = analysis?.emotion?.intensity || 0.5;
  const currentTopics = analysis?.topics?.detected || [];
  const voiceData = (input.voiceEmotion as unknown as VoiceEmotionResult) ?? null;

  // Calculate shifts
  const emotionShift = currentEmotionIntensity - session.previousEmotionIntensity;

  try {
    // ========================================================================
    // 1. REPAIR INTELLIGENCE (Highest priority - check first)
    // ========================================================================

    if (session.turnCount > 1 && session.lastAIResponse) {
      const misunderstanding = detectMisunderstanding(
        userId,
        sessionId,
        userText,
        emotionShift,
        0 // engagement shift - would need more context
      );

      if (misunderstanding.detected) {
        const repair = generateRepair(misunderstanding);
        injections.push(
          createCriticalInjection('deep_repair', formatRepairForPrompt(misunderstanding, repair))
        );
        log.info({ userId, type: misunderstanding.type }, '🔧 Repair needed');
      }
    }

    // ========================================================================
    // 2. ENERGY STATE (Affects all other processing)
    // ========================================================================

    const energy = assessEnergyState(userId, userText, voiceData, currentTopics, session.turnCount);

    // Only inject if notable state
    if (
      energy.physical.level === 'depleted' ||
      energy.physical.level === 'low' ||
      energy.mental.capacity === 'overwhelmed' ||
      energy.mental.capacity === 'limited'
    ) {
      injections.push(
        createStandardInjection('deep_energy', formatEnergyForPrompt(energy), {
          category: 'awareness',
        })
      );
    }

    // ========================================================================
    // 3. HOPE TRAJECTORY (Critical safety signal)
    // ========================================================================

    const hope = analyzeHope(
      userId,
      sessionId,
      userText,
      currentTopics,
      [currentEmotion],
      voiceData?.stressLevel || 0
    );

    // Always inject if alerts or concerning trajectory
    if (hope.alerts.length > 0 || hope.trajectory.intervention.urgencyLevel !== 'proactive') {
      const priority = hope.alerts.some((a) => a.severity === 'high') ? 'critical' : 'standard';
      const injection =
        priority === 'critical'
          ? createCriticalInjection('deep_hope', formatHopeForPrompt(hope))
          : createStandardInjection('deep_hope', formatHopeForPrompt(hope), { category: 'safety' });
      injections.push(injection);

      if (hope.alerts.some((a) => a.type === 'hopelessness')) {
        log.warn(
          { userId, hopeLevel: hope.trajectory.current.hopeLevel },
          '⚠️ Hope concern detected'
        );
      }
    }

    // ========================================================================
    // 4. CONVERSATIONAL FLOW
    // ========================================================================

    const flow = analyzeFlow(
      userId,
      sessionId,
      userText,
      session.turnCount,
      currentEmotionIntensity,
      voiceData
        ? {
            pace: voiceData.arousal,
            volume: 0.5, // Would need actual data
            hasHesitations: false,
          }
        : undefined
    );

    // ALWAYS inject flow guidance - Ferni should always be asking questions!
    // Previously only injected when direction !== 'maintain', but that meant
    // no question-asking guidance was given during "normal" conversation flow
    if (flow.state.recommendedDirection !== 'maintain') {
      injections.push(
        createStandardInjection('deep_flow', formatFlowForPrompt(flow), {
          category: 'guidance',
        })
      );
    } else {
      // Even when "maintaining", remind to ask questions - this is core to Ferni's personality
      injections.push(
        createHintInjection(
          'deep_flow_curiosity',
          `[STAY CURIOUS] Conversation is flowing well. Keep asking questions to show genuine interest. Consider: "What's that like for you?" or "How does that feel?" or "What's underneath that?" - end your response with a follow-up question when natural.`,
          { category: 'guidance' }
        )
      );
    }

    // ========================================================================
    // 5. RESISTANCE DETECTION
    // ========================================================================

    const resistance = analyzeResistance(
      userId,
      userText,
      currentEmotion,
      currentEmotionIntensity,
      currentTopics,
      session.turnCount > 1 ? currentTopics[0] : undefined
    );

    // Inject if significant resistance detected
    if (resistance.resistanceLevel > 0.4 || resistance.defensesDetected.length > 0) {
      injections.push(
        createHintInjection('deep_resistance', formatResistanceForPrompt(resistance), {
          category: 'awareness',
        })
      );
    }

    // ========================================================================
    // 6. SUBCONSCIOUS GOALS (Better Than Human - We see patterns they don't)
    // ========================================================================

    const subconscious = analyzeSubconscious(
      userId,
      userText,
      currentTopics,
      currentEmotionIntensity
    );

    // Enhanced surfacing logic with confidence thresholds
    const surfaceOpp = subconscious.surfaceOpportunity;

    if (surfaceOpp.shouldSurface && surfaceOpp.phrase && surfaceOpp.desire) {
      // Only surface high-confidence patterns (3+ signals, 60%+ confidence)
      const desire = surfaceOpp.desire;

      if (desire.signalCount >= 3 && desire.confidence >= 0.6) {
        // STANDARD priority for strong patterns
        injections.push(
          createStandardInjection(
            'deep_subconscious',
            `[SUBCONSCIOUS PATTERN DETECTED]\n` +
              `You've mentioned "${desire.goal}" ${desire.signalCount} times across conversations.\n` +
              `Category: ${desire.category}\n` +
              `→ Consider gently surfacing: "${surfaceOpp.phrase}"\n` +
              `(Only if the moment feels right - don't force it)`,
            {
              category: 'insight',
              confidence: desire.confidence,
            }
          )
        );

        log.info(
          {
            goal: desire.goal,
            signals: desire.signalCount,
            confidence: desire.confidence,
          },
          '🌱 Subconscious goal ready to surface'
        );
      } else if (desire.signalCount >= 2) {
        // HINT priority for emerging patterns (building awareness)
        injections.push(
          createHintInjection(
            'deep_subconscious_emerging',
            `[EMERGING PATTERN: ${desire.goal}]\n` +
              `This theme is recurring (${desire.signalCount} signals, ${Math.round(desire.confidence * 100)}% confidence).\n` +
              `Keep listening for it - may be worth exploring when confidence grows.`,
            { category: 'insight' }
          )
        );
      }
    }

    // Also inject if we detected new desires or reinforced existing ones
    if (subconscious.reinforcedDesires.length > 0) {
      const reinforced = subconscious.reinforcedDesires[0];
      injections.push(
        createHintInjection(
          'deep_subconscious_reinforced',
          `[PATTERN REINFORCED] "${reinforced.goal}" (signal #${reinforced.signalCount}).\n` +
            `This user keeps circling back to this theme.`,
          { category: 'insight' }
        )
      );
    }

    // Fantasy detection (what-if statements reveal true desires)
    if (subconscious.fantasyDetected && subconscious.fantasyContent) {
      injections.push(
        createHintInjection(
          'deep_fantasy',
          `[FANTASY DETECTED] User shared a "what if" scenario:\n` +
            `"${subconscious.fantasyContent.slice(0, 100)}..."\n` +
            `Fantasies often reveal unspoken desires. Explore gently.`,
          { category: 'insight' }
        )
      );
    }

    // ========================================================================
    // 7. LIFE CHAPTER
    // ========================================================================

    const chapter = analyzeChapter(userId, userText, currentTopics, [currentEmotion]);

    // Inject if confident about chapter and there's relevant insight
    if (
      chapter.chapter.current.confidence > 0.5 &&
      (chapter.narrativeInsight || chapter.chapter.transition.phase !== 'stable')
    ) {
      injections.push(
        createHintInjection('deep_chapter', formatChapterForPrompt(chapter), {
          category: 'context',
        })
      );
    }

    // ========================================================================
    // 8. RELATIONAL NETWORK
    // ========================================================================

    // Extract and track person mentions
    const personMentions = extractPersonMentions(userText, currentEmotion, currentEmotionIntensity);

    for (const mention of personMentions) {
      const person = recordPersonMention(userId, {
        ...mention,
        emotionIntensity: currentEmotionIntensity,
        topics: currentTopics,
        wasPositive: currentEmotion === 'happy' || currentEmotion === 'joy',
        wasStressed:
          currentEmotionIntensity > 0.6 &&
          ['anxious', 'sad', 'angry', 'frustrated'].includes(currentEmotion),
      });

      // Check for unspoken tension
      detectUnspokenTension(userId, userText, person, currentTopics);
    }

    // Get relational insights if someone was mentioned
    if (personMentions.length > 0) {
      const relationalInsight = formatRelationalInsightsForPrompt(userId, personMentions[0].name);
      if (relationalInsight) {
        injections.push(
          createHintInjection('deep_relational', relationalInsight, {
            category: 'context',
          })
        );
      }
    }

    // ========================================================================
    // 9. LIFE RHYTHM PREDICTION (for proactive support)
    // ========================================================================

    const rhythmPrediction = predictUserState(userId);

    // Record this observation
    recordConversationObservation(userId, {
      timestamp: new Date(),
      mood:
        currentEmotionIntensity *
        (currentEmotion === 'happy' ? 1 : currentEmotion === 'sad' ? 0 : 0.5),
      energy: energy.physical.level === 'high' ? 0.8 : energy.physical.level === 'low' ? 0.3 : 0.5,
      topics: currentTopics,
      wasStressed: currentEmotionIntensity > 0.6,
      wasPositive: currentEmotion === 'happy' || currentEmotion === 'joy',
      initiated: 'user',
    });

    // Inject if there are meaningful predictions
    if (rhythmPrediction.reasons.length > 0 && rhythmPrediction.confidence > 0.4) {
      injections.push(
        createHintInjection('deep_rhythm', formatPredictionForPrompt(rhythmPrediction), {
          category: 'context',
        })
      );
    }

    // ========================================================================
    // 10. SILENCE INTELLIGENCE (from actual voice pipeline when available)
    // ========================================================================

    // Use ACTUAL silence analysis from voice pipeline if available
    // This is the superhuman capability - understanding what silences MEAN
    const actualSilenceAnalysis = (userData as { lastSilenceAnalysis?: SilenceAnalysis })
      .lastSilenceAnalysis;

    if (actualSilenceAnalysis && actualSilenceAnalysis.confidence > 0.4) {
      // Use actual analysis from audio pipeline - this is the superhuman insight!
      injections.push(
        createStandardInjection('deep_silence', formatSilenceForPrompt(actualSilenceAnalysis), {
          category: 'presence',
          confidence: actualSilenceAnalysis.confidence,
        })
      );

      log.debug(
        {
          type: actualSilenceAnalysis.type,
          duration: actualSilenceAnalysis.duration,
          confidence: actualSilenceAnalysis.confidence,
        },
        '🤫 Using actual silence analysis from voice pipeline'
      );
    }
    // Fallback: detect hesitation markers in text if no voice silence
    else if (/\.\.\.|um+|uh+|hmm+/i.test(userText)) {
      const silence = analyzeSilence(
        2000, // Estimated duration from text hesitation
        userText,
        currentEmotion,
        currentEmotionIntensity,
        currentTopics,
        userText.includes('?')
      );

      if (silence.type !== 'unknown' && silence.confidence > 0.5) {
        injections.push(
          createHintInjection('deep_silence', formatSilenceForPrompt(silence), {
            category: 'presence',
          })
        );
      }
    }

    // ========================================================================
    // 11. VOICE-TEXT MISMATCH DETECTION (Better Than Human)
    // "I hear you saying you're fine, but your voice tells a different story"
    // ========================================================================

    if (voiceData && voiceData.confidence > 0.4) {
      const mismatch = detectMismatch(userText, voiceData, {
        primary: currentEmotion,
        confidence: analysis?.emotion?.confidence || 0.5,
      });

      if (mismatch.hasMismatch && mismatch.confidence > 0.5) {
        const guidance = buildMismatchGuidance(mismatch);
        if (guidance) {
          // HIGH priority - this is a key "better than human" insight
          injections.push(
            createHighInjection('deep_mismatch', guidance, {
              category: 'emotional_intelligence',
              confidence: mismatch.confidence,
            })
          );

          log.info(
            {
              type: mismatch.type,
              textEmotion: mismatch.textEmotion,
              voiceEmotion: mismatch.voiceEmotion,
              shouldSurface: mismatch.shouldSurface,
            },
            '💭 Voice-text mismatch detected - superhuman insight'
          );
        }
      }
    }

    // ========================================================================
    // 12. ENERGY-AWARE RESPONSE LENGTH GUIDANCE
    // When user is depleted, keep responses brief
    // ========================================================================

    if (
      energy.physical.level === 'depleted' ||
      energy.physical.level === 'low' ||
      energy.mental.capacity === 'overwhelmed'
    ) {
      injections.push(
        createHintInjection(
          'deep_energy_response',
          `[ENERGY AWARENESS] User appears ${energy.physical.level === 'depleted' ? 'exhausted' : 'low energy'}. ` +
            `Keep your response brief and gentle. No complex questions or advice. ` +
            `Prioritize presence over problem-solving. Consider: "That sounds exhausting" over lengthy responses.`,
          { category: 'guidance' }
        )
      );
    }

    // ========================================================================
    // 13. RESISTANCE-AWARE PACING GUIDANCE
    // When detecting resistance, slow down and offer exits
    // ========================================================================

    if (resistance.resistanceLevel > 0.6 || resistance.defensesDetected.length >= 2) {
      injections.push(
        createStandardInjection(
          'deep_resistance_pacing',
          `[RESISTANCE AWARENESS] Strong resistance detected (level: ${resistance.resistanceLevel.toFixed(2)}). ` +
            `Slow down. Don't push. Offer an exit: "We don't have to talk about this if you'd rather not." ` +
            `Match their pace. Let them lead. Defenses detected: ${resistance.defensesDetected.join(', ')}`,
          { category: 'guidance' }
        )
      );
    }

    // ========================================================================
    // UPDATE SESSION STATE
    // ========================================================================

    session.previousEmotion = currentEmotion;
    session.previousEmotionIntensity = currentEmotionIntensity;
    session.lastAnalysis = new Date();

    // Store energy level for other builders
    (userData as { energyLevel?: string }).energyLevel = energy.physical.level;

    // Store resistance topics for other builders
    if (resistance.avoidedTopic) {
      (userData as { resistanceTopics?: string[] }).resistanceTopics = [
        resistance.avoidedTopic.topic,
      ];
    }

    // Record our response for next turn's repair check
    // (This would typically be set after the response is generated)
  } catch (error) {
    log.error({ error, userId }, '❌ Error in deep understanding analysis');
  }

  return injections;
}

// ============================================================================
// HELPER: Store AI response for repair tracking
// ============================================================================

export function recordResponse(sessionId: string, response: string): void {
  const session = getSession(sessionId);
  session.lastAIResponse = response;
  recordAIResponse(sessionId, response);
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'deep_understanding',
  description:
    'Superhuman understanding: silence, rhythm, resistance, energy, goals, flow, repair, hope, chapters, voice-text mismatch',
  priority: 35, // Run early to inform other builders
  build: buildDeepUnderstanding,
  category: BuilderCategory.COGNITIVE,
});

export { buildDeepUnderstanding };
