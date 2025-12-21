/**
 * Unified Humanizing Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This CONSOLIDATES all humanization logic into a single builder:
 * - Active listening cues
 * - Emotional mirroring
 * - Response length guidance
 * - Energy awareness
 * - Spontaneous elements
 * - Natural uncertainty
 *
 * The key insight: In high-emotion moments, we REDUCE humanization features
 * and focus purely on presence. The user needs us, not our personality.
 *
 * This builder replaces:
 * - humanizing.ts
 * - deep-humanization.ts
 * - conversation-humanizing.ts
 * - natural-uncertainty.ts
 * - response-length.ts
 * - energy-mirroring.ts
 * - energy-awareness.ts
 *
 * Those files are kept for backwards compatibility but this is the preferred approach.
 *
 * @module intelligence/context-builders/unified-humanizing
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  HumanizationOrchestrator,
  type HumanizationInput,
} from '../unified/humanization-orchestrator.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';
import { createStandardInjection, createHintInjection, registerContextBuilder } from './index.js';
import { BuilderCategory } from './categories.js';
import { DISTRESS } from '../distress-levels.js';

const log = createLogger({ module: 'context:unified-humanizing' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const unifiedHumanizingBuilder: ContextBuilder = {
  name: 'unified-humanizing',
  description:
    'Consolidated humanization: active listening, emotional mirroring, spontaneous elements',
  priority: 75, // Runs after most content builders but before final polish
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userText, analysis, userData, persona, services } = input;
    const injections: ContextInjection[] = [];

    // Skip if no persona
    if (!persona) {
      return injections;
    }

    // Build humanization input
    const humanizationInput: HumanizationInput = {
      analysis: {
        emotion: {
          primary: analysis.emotion.primary,
          secondary: undefined,
          confidence: analysis.emotion.confidence ?? 0.5,
          valence:
            analysis.emotion.valence === 'positive'
              ? 0.5
              : analysis.emotion.valence === 'negative'
                ? -0.5
                : 0,
          intensity: analysis.emotion.intensity,
          distressLevel: analysis.emotion.distressLevel ?? 0,
          suggestedTone: mapTone(analysis.emotion.suggestedTone),
          source: 'text',
        },
        intent: {
          primary: analysis.intent.primary,
          confidence: analysis.intent.confidence,
          requiresEmpathy: analysis.intent.requiresEmpathy ?? false,
          requiresAction: analysis.intent.requiresAction ?? false,
          suggestedApproach: Array.isArray(analysis.intent.suggestedApproach)
            ? analysis.intent.suggestedApproach[0] ?? 'Listen and respond naturally'
            : analysis.intent.suggestedApproach ?? 'Listen and respond naturally',
          isQuestion: analysis.intent.isQuestion ?? false,
          isWrappingUp: analysis.intent.primary === 'ending_conversation',
        },
        context: {
          phase: mapPhase(analysis.state.phase),
          topics: analysis.topics.detected,
          currentTopic: analysis.topics.primary ?? analysis.topics.detected[0] ?? null,
          isTopicShift: analysis.topics.isTopicShift ?? false,
          turnCount: userData?.turnCount ?? 1,
          topicsToCircleBack: [],
          relationshipStage: mapRelationshipStage(services?.userProfile?.relationshipStage),
        },
        mismatch: {
          detected: false,
          confidence: 0,
          type: 'none',
          textEmotion: analysis.emotion.primary,
          voiceEmotion: 'unknown',
          interpretation: '',
          approach: '',
          shouldSurface: false,
        },
        signals: {
          isRushed: detectRushed(userText),
          isRelaxed: detectRelaxed(userText),
          needsSupport:
            (analysis.emotion.distressLevel ?? 0) > DISTRESS.MODERATE ||
            (analysis.intent.requiresEmpathy ?? false),
          isPersonalSharing: detectPersonalSharing(userText, analysis.emotion.distressLevel ?? 0),
          seekingAdvice: analysis.intent.primary === 'seeking_advice',
          isVenting: detectVenting(userText, analysis.emotion.valence),
          madeDecision: detectDecision(userText),
          markers: [],
        },
        guidance: {
          responseLength: { min: 25, max: 70 },
          priorityFocus: 'Listen and respond naturally',
          approach: 'supportive',
          guidelines: [],
          useHighEmotionMode:
            (analysis.emotion.distressLevel ?? 0) >= DISTRESS.HIGH ||
            analysis.emotion.intensity > 0.8,
        },
        contextForPrompt: '',
        processingTimeMs: 0,
        timestamp: new Date(),
      },
      persona,
      turnNumber: userData?.turnCount ?? 1,
      sessionCount: services?.userProfile?.totalConversations ?? 1,
      userName: userData?.userName || services?.userProfile?.name,
      recentTopics: userData?.recentTopics ?? [],
      relationshipStage: mapRelationshipStage(services?.userProfile?.relationshipStage),
    };

    // Generate humanization
    const orchestrator = HumanizationOrchestrator.getInstance();
    const humanization = orchestrator.humanize(humanizationInput);

    // Create injection from humanization result
    if (humanization.promptInjection) {
      if (humanization.focusedSupportMode) {
        // In focused support mode, this is more important
        injections.push(
          createStandardInjection('unified_humanizing', humanization.promptInjection, {
            category: 'humanizing',
            confidence: 0.9,
          })
        );
      } else {
        // Normal mode - hint priority
        injections.push(
          createHintInjection('unified_humanizing', humanization.promptInjection, {
            category: 'humanizing',
            confidence: 0.8,
          })
        );
      }
    }

    log.debug(
      {
        focusedSupportMode: humanization.focusedSupportMode,
        activeListeningCount: humanization.activeListening.length,
        spontaneousCount: humanization.spontaneousElements.filter((e) => e.shouldUse).length,
      },
      '💫 Unified humanization applied'
    );

    return injections;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapTone(
  tone?: string
): 'gentle' | 'warm' | 'enthusiastic' | 'calm' | 'serious' | 'reassuring' {
  const toneMap: Record<
    string,
    'gentle' | 'warm' | 'enthusiastic' | 'calm' | 'serious' | 'reassuring'
  > = {
    warm: 'warm',
    gentle: 'gentle',
    enthusiastic: 'enthusiastic',
    calm: 'calm',
    serious: 'serious',
    friendly: 'warm',
    reassuring: 'reassuring',
    informative: 'calm',
    measured: 'calm',
  };
  return toneMap[tone || 'warm'] || 'warm';
}

function mapPhase(
  phase: string
): 'greeting' | 'warming_up' | 'exploring' | 'advising' | 'supporting' | 'wrapping_up' {
  const phaseMap: Record<
    string,
    'greeting' | 'warming_up' | 'exploring' | 'advising' | 'supporting' | 'wrapping_up'
  > = {
    greeting: 'greeting',
    warming_up: 'warming_up',
    exploring: 'exploring',
    advising: 'advising',
    supporting: 'supporting',
    wrapping_up: 'wrapping_up',
    follow_up: 'greeting',
  };
  return phaseMap[phase] || 'exploring';
}

function mapRelationshipStage(
  stage?: string
): 'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'trusted' {
  const stageMap: Record<
    string,
    'stranger' | 'acquaintance' | 'friend' | 'close_friend' | 'trusted'
  > = {
    stranger: 'stranger',
    acquaintance: 'acquaintance',
    friend: 'friend',
    close_friend: 'close_friend',
    trusted: 'trusted',
    first_meeting: 'stranger',
    getting_started: 'acquaintance',
    building_trust: 'friend',
    established: 'close_friend',
    deep_partnership: 'trusted',
  };
  return stageMap[stage || 'stranger'] || 'stranger';
}

function detectRushed(text: string): boolean {
  const rushPatterns =
    /\b(gotta go|quick question|running late|no time|hurry|briefly|short on time)\b/i;
  return rushPatterns.test(text);
}

function detectRelaxed(text: string): boolean {
  const relaxedPatterns = /\b(anyway|so tell me|just wanted to|wondering|been thinking)\b/i;
  return relaxedPatterns.test(text) || text.split(/\s+/).length > 40;
}

function detectPersonalSharing(text: string, distressLevel: number): boolean {
  const personalPatterns =
    /\b(my (wife|husband|kid|mom|dad|family)|i feel|makes me|i'm worried|i'm scared)\b/i;
  return personalPatterns.test(text) || distressLevel > 0.5;
}

function detectVenting(text: string, valence?: string): boolean {
  const ventingPatterns = /\b(just need to|had to tell|so frustrating|can't stand|ugh|argh)\b/i;
  return ventingPatterns.test(text) && valence === 'negative';
}

function detectDecision(text: string): boolean {
  const decisionPatterns = /\b(i've decided|going to|made up my mind|i'm going|i will)\b/i;
  return decisionPatterns.test(text);
}

// Register the builder
registerContextBuilder(unifiedHumanizingBuilder);

// ============================================================================
// EXPORTS
// ============================================================================

export default unifiedHumanizingBuilder;
