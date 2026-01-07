/**
 * Human Listening Context Builder
 *
 * Injects insights from the HumanListeningPipeline into LLM context.
 * This gives the agent "better than human" awareness of:
 * - Voice tremor/strain (held-back tears, nervousness)
 * - Breath patterns (sighs, held breath)
 * - Volume dynamics (getting quieter on sensitive topics)
 * - Cognitive load (overwhelm, processing)
 * - Hedging patterns (uncertainty, protecting)
 * - Self-soothing behaviors (dismissing, minimizing)
 *
 * @module HumanListeningContextBuilder
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createCriticalInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getHumanListeningPipeline,
  type HumanListeningResult,
} from '../../speech/human-listening-pipeline.js';

const log = getLogger().child({ module: 'context:human-listening' });

// Store the latest analysis result per session for context builder access
const sessionResults = new Map<string, HumanListeningResult>();

/**
 * Store analysis result for context builder access.
 * Called from voice-agent after analyzing user message.
 */
export function setHumanListeningResult(sessionId: string, result: HumanListeningResult): void {
  sessionResults.set(sessionId, result);
}

/**
 * Get the latest analysis result for a session.
 */
export function getHumanListeningResult(sessionId: string): HumanListeningResult | null {
  return sessionResults.get(sessionId) ?? null;
}

/**
 * Clear stored result for a session.
 */
export function clearHumanListeningResult(sessionId: string): void {
  sessionResults.delete(sessionId);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

const humanListeningBuilder: ContextBuilder = {
  name: 'human-listening',
  description: 'Injects "better than human" listening insights (tremor, breath, cognitive load)',
  priority: 35, // High priority - emotional/cognitive state

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const injections: ContextInjection[] = [];

    try {
      const sessionId = input.services.sessionId;
      const result = sessionResults.get(sessionId);

      if (!result) {
        // No analysis available yet - try building from pipeline directly
        const pipeline = getHumanListeningPipeline(sessionId);
        const contextFromPipeline = pipeline.buildLLMContext();

        if (contextFromPipeline) {
          injections.push(
            createStandardInjection('human-listening', contextFromPipeline, {
              category: 'listening',
              confidence: 0.7,
            })
          );
        }
        return injections;
      }

      // Possible distress is critical
      if (result.possibleDistress) {
        injections.push(
          createCriticalInjection(
            'human-listening',
            `[🎧 DISTRESS SIGNALS DETECTED]
${result.agentGuidance}
Priority: ${result.prioritySignals.join('; ')}`,
            { category: 'distress' }
          )
        );
      }

      // Should slow down is important
      if (result.shouldSlowDown && !result.possibleDistress) {
        injections.push(
          createStandardInjection(
            'human-listening',
            `[🎧 NEEDS SLOWER PACE]
${result.overallAssessment}
${result.agentGuidance}`,
            { category: 'pacing', confidence: result.confidence }
          )
        );
      }

      // Emotional undercurrent if detected
      if (
        result.emotionalUndercurrent.evidence.length > 0 &&
        result.emotionalUndercurrent.possiblyMasked
      ) {
        injections.push(
          createStandardInjection(
            'human-listening',
            `[🎧 EMOTIONAL UNDERCURRENT]
Detecting ${result.emotionalUndercurrent.primary} beneath the surface.
Evidence: ${result.emotionalUndercurrent.evidence.slice(0, 3).join(', ')}
Their words may be masking how they really feel.`,
            { category: 'emotional', confidence: result.emotionalUndercurrent.confidence }
          )
        );
      }

      // Give space hint
      if (result.shouldGiveSpace && !result.possibleDistress && !result.shouldSlowDown) {
        injections.push(
          createHintInjection(
            'human-listening',
            `[🎧 Consider giving more space in your response - user may be processing something sensitive]`,
            { category: 'pacing', confidence: 0.6 }
          )
        );
      }

      // Voice-specific signals (if audio analysis was done)
      if (result.audio.tremor?.detected) {
        injections.push(
          createStandardInjection(
            'human-listening',
            `[🎧 VOICE SIGNAL: ${result.audio.tremor.suggestedResponse}]`,
            { category: 'voice', confidence: result.audio.tremor.confidence }
          )
        );
      }

      if (result.audio.breath?.needsSpace) {
        injections.push(
          createHintInjection(
            'human-listening',
            `[🎧 Breath pattern: ${result.audio.breath.guidance}]`,
            { category: 'voice', confidence: result.audio.breath.confidence }
          )
        );
      }

      // =================================================================
      // 🎧 BASELINE DEVIATION - "You sound different today"
      // "Better than Human" - noticing subtle changes from their normal
      // =================================================================
      try {
        const userId = input.services?.userId;
        if (userId) {
          // Speech pattern deviations (fillers, hedging, self-soothing)
          const { detectDeviations } =
            await import('../../services/memory/human-listening-memory.js');
          const deviationReport = detectDeviations(userId, sessionId);

          if (deviationReport.hasDeviation && deviationReport.confidence > 0.5) {
            const deviationDescriptions = deviationReport.deviations
              .map((d) => `- ${d.description} (${d.severity})`)
              .join('\n');

            injections.push(
              createStandardInjection(
                'human-listening',
                `[🎧 SPEECH PATTERN DEVIATION - "Something's different"]

I'm noticing changes from their usual speech patterns:
${deviationDescriptions}

${deviationReport.guidance}

This is "Better than Human" listening - noticing subtle changes a friend might miss.
Consider gently acknowledging: "Something feels different today. Everything okay?"
Or weave in naturally: "I'm picking up on something..."`,
                { category: 'deviation', confidence: deviationReport.confidence }
              )
            );

            log.info(
              {
                userId,
                deviationCount: deviationReport.deviations.length,
                confidence: deviationReport.confidence,
              },
              '🎧 Speech pattern deviation detected'
            );
          }

          // Voice emotion deviations (energy, pace from prosody)
          // Build voice signal from available data
          const voiceSignal = result.audio?.tremor?.detected
            ? {
                emotion: result.emotionalUndercurrent?.primary || 'neutral',
                confidence: result.confidence,
                characteristics: {
                  // Infer energy from overall assessment
                  energy:
                    result.overallAssessment?.includes('low') ||
                    result.overallAssessment?.includes('tired')
                      ? ('low' as const)
                      : ('normal' as const),
                  // Infer pace from shouldSlowDown flag
                  pace: result.shouldSlowDown ? ('rushed' as const) : ('normal' as const),
                },
              }
            : null;

          if (voiceSignal) {
            const { detectVoiceDeviation } =
              await import('../../services/trust-systems/voice-emotion-integration.js');
            const voiceDeviation = detectVoiceDeviation(userId, voiceSignal);

            if (voiceDeviation.deviates && voiceDeviation.significance > 0.4) {
              injections.push(
                createStandardInjection(
                  'human-listening',
                  `[🎧 VOICE DEVIATION - "${voiceDeviation.deviation}"]

Their voice sounds different from their usual baseline:
- ${voiceDeviation.deviation}

This is subtle but significant. A human friend might not notice.
Consider a gentle check-in: "You sound a bit different today. How are you really doing?"`,
                  { category: 'voice-deviation', confidence: voiceDeviation.significance }
                )
              );

              log.info(
                {
                  userId,
                  deviation: voiceDeviation.deviation,
                  significance: voiceDeviation.significance,
                },
                '🎧 Voice deviation detected - user sounds different than usual'
              );
            }
          }
        }
      } catch (deviationError) {
        // Non-fatal - baseline detection is a bonus
        log.debug({ error: deviationError }, 'Baseline deviation check failed (non-fatal)');
      }

      log.debug(
        {
          sessionId,
          possibleDistress: result.possibleDistress,
          shouldSlowDown: result.shouldSlowDown,
          injectionsCount: injections.length,
        },
        'Human listening context built'
      );
    } catch (error) {
      log.warn({ error }, 'Human listening context builder failed');
    }

    return injections;
  },
};

// Register on module load
registerContextBuilder(humanListeningBuilder);

export { humanListeningBuilder };
export default humanListeningBuilder;
