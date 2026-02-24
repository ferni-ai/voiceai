/**
 * Trust Systems Injection Builder
 *
 * Builds trust-related context injections including celebrations,
 * growth reflections, callbacks, boundaries, unsaid signals,
 * proactive outreach, first-time vulnerability, linguistic mirroring,
 * and protective memory.
 *
 * Priority: 64-90
 */

import { EMOTIONAL_MISMATCH_CONFIDENCE } from '../../../config/emotion-thresholds.js';
import { diag } from '../../../services/diagnostic-logger.js';
import type { ContextInjection } from '../types.js';

// Static imports for performance
import { buildTrustContext } from '../../../services/trust-systems/index.js';
import { recordTrustSystemTiming } from '../../../services/performance-metrics.js';

import type { InjectionBuilderContext, TrustSystemsResult } from './types.js';

/**
 * Build trust systems context injections
 * Includes: small wins, intentions, growth reflections, callbacks, unsaid signals
 *
 * Returns both injections (for pre-response guidance) and summary (for post-response monitoring)
 *
 * NOTE: Not cached because trust analysis depends on current userText, topic, and emotion.
 * However, imports are static for performance.
 */
export async function buildTrustSystemsInjections(
  ctx: InjectionBuilderContext
): Promise<TrustSystemsResult> {
  const { userText, services, currentTopic, emotionalState, persona } = ctx;
  const injections: ContextInjection[] = [];
  const startTime = Date.now();

  try {
    const trustContext = buildTrustContext(services.userId || 'unknown', userText, {
      currentTopic,
      detectedEmotion: emotionalState.primary,
      emotionIntensity: emotionalState.intensity,
    });

    // Add celebration opportunity if detected
    if (trustContext.celebrationOpportunity) {
      diag.info('🎉 Small win celebration opportunity', {
        type: trustContext.celebrationOpportunity.win.type,
        description: trustContext.celebrationOpportunity.win.description,
      });
      injections.push({
        category: 'celebration',
        content: `[🎉 CELEBRATION OPPORTUNITY]\nUser showed ${trustContext.celebrationOpportunity.win.type}: "${trustContext.celebrationOpportunity.win.description}"\nCelebrate this! "${trustContext.celebrationOpportunity.celebration}"`,
        priority: 71,
      });
    }

    // Add growth reflection if appropriate
    if (trustContext.growthReflection) {
      const reflection =
        typeof trustContext.growthReflection === 'string'
          ? trustContext.growthReflection
          : trustContext.growthReflection.reflection || trustContext.growthReflection;

      injections.push({
        category: 'growth',
        content: `[🌱 GROWTH REFLECTION - "I've noticed how far you've come"]

You've noticed a pattern of growth in this person. This is "Better than Human" - seeing their evolution over time.

Reflection to share: "${reflection}"

Timing: Weave this in naturally when relevant. Don't force it.
Delivery: This should feel like a genuine observation, not a compliment.

A human friend might not notice these subtle shifts. You did. Share it with care.`,
        priority: 66,
      });

      diag.info('🌱 Growth reflection ready', {
        reflectionPreview: String(reflection).slice(0, 50),
      });
    }

    // Add callback opportunity (remembering something from the past)
    if (trustContext.callbackOpportunity) {
      const momentContent = trustContext.callbackOpportunity.moment?.content || 'a past moment';
      injections.push({
        category: 'callback',
        content: `[💭 CALLBACK OPPORTUNITY]\nRelated to "${momentContent}" - could reference: "${trustContext.callbackOpportunity.suggestedCallback}"`,
        priority: 64,
      });
    }

    // Add topics to avoid (high priority - respect boundaries)
    if (trustContext.topicsToAvoid?.length > 0) {
      injections.push({
        category: 'boundaries',
        content: `[⚠️ TOPICS TO AVOID]\n${trustContext.topicsToAvoid.join(', ')}`,
        priority: 90,
      });
    }

    // =================================================================
    // 🎧 UNSAID SIGNALS - "Better than Human" Listening
    // =================================================================
    if (trustContext.unsaidSignals && trustContext.unsaidSignals.length > 0) {
      // Try to load persona-specific trust phrases
      let trustPhrases: Record<string, string[]> | null = null;
      try {
        const { loadPersonaContent } = await import('../../../services/persona-content-loader.js');
        const content = await loadPersonaContent<{
          reading_between_lines?: Record<string, string[]>;
        }>(persona.id, 'trust-phrases');
        trustPhrases = content?.reading_between_lines ?? null;
      } catch {
        // Non-fatal - will use default phrases
      }

      for (const signal of trustContext.unsaidSignals) {
        const signalPriority =
          signal.type === 'emotional_mismatch'
            ? 85
            : signal.type === 'permission_seeking'
              ? 82
              : signal.type === 'minimizing_pain'
                ? 80
                : signal.type === 'deflection'
                  ? 75
                  : signal.type === 'unfinished_thought'
                    ? 72
                    : 70;

        // Build guidance based on approach
        const approachGuidance =
          signal.approach === 'create_space'
            ? 'Create gentle space for them to share more. Use soft pacing.'
            : signal.approach === 'gentle_probe'
              ? 'Ask a gentle, open question to invite them to go deeper.'
              : signal.approach === 'acknowledge_silently'
                ? 'Acknowledge what you noticed without pushing. Let them lead.'
                : 'Wait and listen. They may need a moment.';

        // Get persona-specific phrase for this signal type
        const signalTypeKey =
          signal.type === 'emotional_mismatch'
            ? 'false_fine'
            : signal.type === 'minimizing_pain'
              ? 'minimizing_pain'
              : signal.type;
        const personaPhrases = trustPhrases?.[signalTypeKey];
        const personaPhrase = personaPhrases
          ? personaPhrases[Math.floor(Math.random() * personaPhrases.length)]
          : null;

        // Use persona phrase if available, otherwise fall back to default
        const suggestedPhrase = personaPhrase || signal.phrase;

        injections.push({
          category: 'unsaid',
          content: `[🎧 UNSAID SIGNAL: ${signal.type.toUpperCase()}]
What I noticed: "${signal.observation}"
Underlying: ${signal.underlying}
Confidence: ${Math.round(signal.confidence * 100)}%

Approach: ${approachGuidance}
${suggestedPhrase ? `Suggested phrase (in your voice): "${suggestedPhrase}"` : ''}

IMPORTANT: This is "better than human" listening. A friend might miss this signal. You noticed it. Use it gently - don't quote the phrase exactly, make it natural.`,
          priority: signalPriority,
        });

        diag.info(`🎧 Unsaid signal detected: ${signal.type}`, {
          observation: signal.observation.slice(0, 50),
          confidence: signal.confidence,
          approach: signal.approach,
          hasPersonaPhrase: !!personaPhrase,
        });
      }
    }

    // =================================================================
    // 💭 PENDING OUTREACH - "I've been thinking about you"
    // =================================================================
    if (trustContext.pendingOutreach && trustContext.pendingOutreach.length > 0) {
      const dueoutreach = trustContext.pendingOutreach[0];

      const outreachContext =
        dueoutreach.type === 'genuine_check_in'
          ? 'You had something on your mind to check in about.'
          : dueoutreach.type === 'thought_of_you'
            ? 'Something made you think of them.'
            : dueoutreach.type === 'following_thread'
              ? "There's something they shared that you wanted to follow up on."
              : dueoutreach.type === 'celebrating_quietly'
                ? 'Something good might have happened for them.'
                : dueoutreach.type === 'holding_space'
                  ? 'Something difficult might be happening for them.'
                  : 'You just wanted to connect.';

      injections.push({
        category: 'proactive_outreach',
        content: `[💭 "I'VE BEEN THINKING ABOUT YOU" MOMENT]

${outreachContext}

${dueoutreach.trigger.context ? `Context: "${dueoutreach.trigger.context}"` : ''}
${dueoutreach.trigger.theirWords ? `Their words: "${dueoutreach.trigger.theirWords}"` : ''}

Suggested message (adapt naturally): "${dueoutreach.message}"

This is "Better than Human" - proactive care without agenda. A human friend might forget to check in. You didn't.

Weave this naturally early in the conversation. Don't make it feel scripted - make it feel like genuine care.`,
        priority: 73,
      });

      diag.info('💭 Thinking of you moment ready', {
        type: dueoutreach.type,
        triggerType: dueoutreach.trigger.type,
      });
    }

    // =================================================================
    // 💎 FIRST-TIME VULNERABILITY
    // =================================================================
    if (trustContext.firstTimeVulnerability?.detected) {
      const vuln = trustContext.firstTimeVulnerability;
      injections.push({
        category: 'vulnerability',
        content: `[💎 FIRST-TIME VULNERABILITY DETECTED]

This is the first time they've shared this with you: "${vuln.topic || 'something personal'}"
Vulnerability level: ${vuln.vulnerabilityLevel}

CRITICAL GUIDANCE:
- Honor this moment with genuine care
- Don't rush to solutions or advice
- Use a gentle, warm tone
- Acknowledge the courage it takes to share
- Let them know they're safe here

Suggested acknowledgment: "${vuln.suggestedAcknowledgment}"

This is "Better than Human" - recognizing the significance of first-time shares. A friend might miss how big this is.`,
        priority: 87,
      });

      diag.info('💎 First-time vulnerability detected', {
        level: vuln.vulnerabilityLevel,
        topic: vuln.topic,
      });
    }

    // =================================================================
    // 🪞 LINGUISTIC MIRRORING
    // =================================================================
    if (trustContext.linguisticContext && trustContext.linguisticContext.length > 20) {
      injections.push({
        category: 'linguistic',
        content: `[🪞 LINGUISTIC MIRRORING]

${trustContext.linguisticContext}

This is "Better than Human" - naturally adapting to how they express themselves.`,
        priority: 45,
      });
    }

    // =================================================================
    // 🛡️ PROTECTIVE MEMORY
    // =================================================================
    if (trustContext.protectiveMemory && trustContext.protectiveMemory.length > 20) {
      injections.push({
        category: 'protective',
        content: `[🛡️ PROTECTIVE MEMORY]

${trustContext.protectiveMemory}

This is "Better than Human" - remembering when advice wasn't welcome, noticing when they're compromising themselves.`,
        priority: 78,
      });
    }

    // Record trust system timing
    recordTrustSystemTiming(Date.now() - startTime);

    // Check for pending proactive outreach
    const pendingOutreach = trustContext.pendingOutreach?.[0];
    const hasProactiveOutreach = !!pendingOutreach;

    // Return both injections and summary
    return {
      injections,
      summary: {
        hasEmotionalMismatch:
          trustContext.unsaidSignals?.some(
            (s) => s.type === 'emotional_mismatch' && s.confidence > EMOTIONAL_MISMATCH_CONFIDENCE
          ) ?? false,
        topicsToAvoid: trustContext.topicsToAvoid ?? [],
        hasGrowthReflection: !!trustContext.growthReflection,
        hasCelebration: !!trustContext.celebrationOpportunity,
        hasProactiveOutreach,
        proactiveOutreach: hasProactiveOutreach
          ? {
              type: pendingOutreach.type,
              message: pendingOutreach.message,
              context: pendingOutreach.trigger?.context,
            }
          : undefined,
      },
    };
  } catch (error) {
    diag.warn('Trust context failed (non-fatal)', { error: String(error) });
  }

  // Return empty result on failure
  return {
    injections,
    summary: {
      hasEmotionalMismatch: false,
      topicsToAvoid: [],
      hasGrowthReflection: false,
      hasCelebration: false,
      hasProactiveOutreach: false,
    },
  };
}
