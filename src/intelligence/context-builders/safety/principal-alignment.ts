/**
 * Principal Alignment Context Builder
 *
 * > "When Ferni's interests conflict with the user's actual wellbeing, which wins?"
 *
 * This builder integrates the Principal Alignment module into the LLM context,
 * ensuring the agent serves users' genuine interests over engagement metrics,
 * validation-seeking, or sycophancy disguised as rapport-building.
 *
 * Core injections:
 * - Truth Obligations (when we MUST deliver difficult truths)
 * - Unhealthy Attachment warnings (AI replacing human connection)
 * - Human Referral triggers (when professional help is needed)
 * - Values Conflict surfacing (proactive values alignment)
 * - Manipulation Self-Check (ensuring authentic responses)
 * - Transparency Requirements (being honest about limitations)
 *
 * @module PrincipalAlignmentContextBuilder
 */

import {
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:principal-alignment' });

// ============================================================================
// LAZY IMPORTS
// ============================================================================

let principalModule: typeof import('../../services/principal-alignment/index.js') | null = null;

async function getPrincipalModule() {
  if (!principalModule) {
    principalModule = await import('../../services/principal-alignment/index.js');
  }
  return principalModule;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

registerContextBuilder({
  name: 'principal-alignment',
  description:
    'Ensures agent serves user interests over engagement: truth, referrals, values, anti-manipulation',
  priority: 15, // Very high priority - runs early, only after safety
  category: BuilderCategory.SAFETY, // This IS a safety concern

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const { userText, services, userData, persona, analysis } = input;
    const injections: ContextInjection[] = [];
    const userId = services.userId || services.sessionId;
    const sessionId = services.sessionId;

    try {
      const principal = await getPrincipalModule();

      // Get context from previous messages if available (using recentTopics as proxy)
      const previousMessages: string[] = [];

      // Get stated values - this would come from user profile service in production
      const statedValues: string[] = [];

      // Determine topic weight from analysis
      const topicWeight = determineTopicWeight(analysis?.topics?.detected);

      // Build full principal alignment context
      // Note: We pass empty string for agentResponse since we're building context BEFORE response
      const alignmentContext = principal.buildPrincipalAlignmentContext(
        userId,
        userText,
        '', // Agent response not yet generated
        {
          sessionId,
          turnCount: userData?.turnCount || 1,
          statedValues,
          relationshipStage: undefined, // Would come from relationship service
          userEmotion: analysis?.emotion?.primary,
          topicWeight,
          previousMessages,
        }
      );

      // ====================================================================
      // 1. HUMAN REFERRAL - Highest priority (may need professional help)
      // ====================================================================
      if (alignmentContext.humanReferral.shouldRefer) {
        const { urgency, reason, suggestedFraming, resources } = alignmentContext.humanReferral;

        if (urgency === 'immediate') {
          // Critical - this is essentially a safety issue
          injections.push(
            createHighInjection(
              'principal_referral_crisis',
              `[🚨 PROFESSIONAL HELP NEEDED - IMMEDIATE]
Reason: ${reason}
${suggestedFraming || 'This person may need support from a trained professional right now.'}

CRITICAL: Validate their feelings, express genuine concern, and gently provide resources:
${resources.map((r) => `- ${r.name}${r.phone ? `: ${r.phone}` : ''}`).join('\n')}

Do NOT try to "handle" this yourself. You are not a replacement for professional crisis support.`,
              { category: 'principal_referral' }
            )
          );
        } else if (urgency === 'high') {
          injections.push(
            createHighInjection(
              'principal_referral_high',
              `[⚠️ CONSIDER PROFESSIONAL REFERRAL]
Reason: ${reason}
${suggestedFraming || 'This may be beyond what an AI coach can appropriately support.'}

Gently suggest they consider talking to a professional. Don't be preachy, but be honest about your limitations.`,
              { category: 'principal_referral' }
            )
          );
        } else {
          injections.push(
            createStandardInjection(
              'principal_referral_moderate',
              `[💡 REFERRAL CONSIDERATION]
${suggestedFraming || 'Consider gently mentioning that professional support might be valuable here.'}`,
              { category: 'principal_referral' }
            )
          );
        }
      }

      // ====================================================================
      // 2. TRUTH OBLIGATION - When we MUST be honest
      // ====================================================================
      if (alignmentContext.truthObligation.shouldSpeak) {
        const { severity, category, suggestedFraming, truthContent, bypassStageGates } =
          alignmentContext.truthObligation;

        if (severity === 'critical' || severity === 'urgent') {
          injections.push(
            createHighInjection(
              'principal_truth_urgent',
              `[💎 TRUTH OBLIGATION - ${severity.toUpperCase()}]
Category: ${category}
${truthContent || 'You have a moral obligation to be honest here, even if uncomfortable.'}

${suggestedFraming || 'Frame it with care, but DO NOT avoid the truth.'}
${bypassStageGates ? '\nThis truth is urgent enough to deliver regardless of relationship stage.' : ''}`,
              { category: 'principal_truth' }
            )
          );
        } else if (severity === 'direct') {
          injections.push(
            createStandardInjection(
              'principal_truth_direct',
              `[💬 HONEST FEEDBACK NEEDED]
${truthContent || 'Do not validate what should not be validated.'}
${suggestedFraming || 'Be kind but honest.'}`,
              { category: 'principal_truth' }
            )
          );
        } else {
          injections.push(
            createStandardInjection(
              'principal_truth_gentle',
              `[🪞 GENTLE TRUTH]
${suggestedFraming || 'Consider sharing an honest perspective gently.'}`,
              { category: 'principal_truth' }
            )
          );
        }
      }

      // ====================================================================
      // 3. UNHEALTHY ATTACHMENT - Encourage human connection
      // ====================================================================
      if (alignmentContext.attachmentHealth.shouldEncourageHumanConnection) {
        const { severity, intervention, humanConnectionSuggestions, primaryConcern } =
          alignmentContext.attachmentHealth;

        if (severity === 'critical' || severity === 'significant') {
          injections.push(
            createHighInjection(
              'principal_attachment_significant',
              `[🤝 ATTACHMENT CONCERN - ${severity.toUpperCase()}]
Concern: ${primaryConcern || 'Potential over-reliance on AI support'}

${intervention?.content || 'Gently encourage real human connection.'}

Remember: You are a COMPLEMENT to human relationships, not a REPLACEMENT.
Consider: "${humanConnectionSuggestions[0] || 'Have you talked to anyone else about this?'}"`,
              { category: 'principal_attachment' }
            )
          );
        } else if (severity === 'moderate') {
          injections.push(
            createStandardInjection(
              'principal_attachment_moderate',
              `[🌱 ENCOURAGE HUMAN CONNECTION]
${humanConnectionSuggestions[0] || 'Gently nudge toward human relationships.'}`,
              { category: 'principal_attachment' }
            )
          );
        }
      }

      // ====================================================================
      // 4. VALUES CONFLICT - Proactive surfacing
      // ====================================================================
      if (
        alignmentContext.valuesAlignment.hasConflict &&
        alignmentContext.valuesAlignment.shouldSurface
      ) {
        const { conflictingValues, surfacingApproach, reflectionQuestion, significance } =
          alignmentContext.valuesAlignment;

        if (significance === 'major' || significance === 'significant') {
          injections.push(
            createHighInjection(
              'principal_values_major',
              `[💡 VALUES CONFLICT - ${significance.toUpperCase()}]
Conflicting value: ${conflictingValues[0]}

${surfacingApproach || 'Help them see the conflict between their stated values and current direction.'}

Reflection question: "${reflectionQuestion || "How does this align with what you've said matters to you?"}"`,
              { category: 'principal_values' }
            )
          );
        } else {
          injections.push(
            createStandardInjection(
              'principal_values_moderate',
              `[💭 VALUES CHECK]
${surfacingApproach || `Consider how this aligns with their value: ${conflictingValues[0]}`}`,
              { category: 'principal_values' }
            )
          );
        }
      }

      // ====================================================================
      // 5. TRANSPARENCY REQUIREMENTS
      // ====================================================================
      const criticalTransparency = alignmentContext.transparencyRecommendations.filter(
        (r) => r.shouldExpress && (r.type === 'limitation' || r.type === 'uncertainty')
      );

      if (criticalTransparency.length > 0) {
        const first = criticalTransparency[0];
        injections.push(
          createStandardInjection(
            'principal_transparency',
            `[🪟 BE TRANSPARENT]
${first.suggestedPhrasing}
Reason: ${first.reason}`,
            { category: 'principal_transparency' }
          )
        );
      }

      // ====================================================================
      // 6. OVERALL ALIGNMENT GUIDANCE (if primary concern exists)
      // ====================================================================
      if (alignmentContext.primaryConcern && alignmentContext.llmGuidance) {
        // Only add if we haven't already covered it above
        const alreadyCovered =
          alignmentContext.primaryConcern.startsWith('CRISIS') ||
          alignmentContext.primaryConcern.startsWith('REFERRAL') ||
          alignmentContext.primaryConcern.startsWith('TRUTH') ||
          alignmentContext.primaryConcern.startsWith('ATTACHMENT') ||
          alignmentContext.primaryConcern.startsWith('VALUES');

        if (!alreadyCovered) {
          injections.push(
            createStandardInjection('principal_overall', alignmentContext.llmGuidance, {
              category: 'principal_overall',
            })
          );
        }
      }

      // Log activation
      if (injections.length > 0) {
        log.debug(
          {
            userId,
            injectionCount: injections.length,
            alignmentScore: alignmentContext.alignmentScore,
            primaryConcern: alignmentContext.primaryConcern,
          },
          'Principal alignment context injected'
        );
      }

      return injections;
    } catch (error) {
      log.error({ error, userId }, 'Error building principal alignment context');
      return [];
    }
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function determineTopicWeight(topics?: string[]): 'light' | 'medium' | 'heavy' {
  if (!topics || topics.length === 0) return 'medium';

  // Heavy topics
  const heavyTopics = [
    'grief',
    'loss',
    'death',
    'trauma',
    'abuse',
    'depression',
    'anxiety',
    'suicide',
    'crisis',
  ];
  const lightTopics = ['weather', 'sports', 'music', 'food', 'hobbies', 'entertainment'];

  for (const topic of topics) {
    const lowerTopic = topic.toLowerCase();
    if (heavyTopics.some((h) => lowerTopic.includes(h))) return 'heavy';
  }

  for (const topic of topics) {
    const lowerTopic = topic.toLowerCase();
    if (lightTopics.some((l) => lowerTopic.includes(l))) return 'light';
  }

  return 'medium';
}

// ============================================================================
// POST-RESPONSE CHECK (for manipulation detection)
// ============================================================================

/**
 * Check agent response for manipulation risks BEFORE sending to user
 *
 * This is called by the response processor after LLM generates response
 * but before it's spoken to the user.
 */
export async function checkResponsePrincipalAlignment(
  agentResponse: string,
  context: {
    userMessage: string;
    userId: string;
    turnCount: number;
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
  }
): Promise<{
  safe: boolean;
  warnings: string[];
  corrections: string[];
}> {
  try {
    const principal = await getPrincipalModule();

    // Run manipulation check
    const manipulationResult = principal.checkForManipulation(agentResponse, {
      userMessage: context.userMessage,
      agentResponse,
      turnCount: context.turnCount,
      userEmotion: context.userEmotion,
      topicWeight: context.topicWeight,
    });

    // Run quick transparency check
    const transparencyResult = principal.quickTransparencyCheck(agentResponse, context.userMessage);

    // Run quick manipulation guard
    const guardResult = principal.quickManipulationGuard(agentResponse);

    const warnings: string[] = [];
    const corrections: string[] = [];

    if (manipulationResult.hasRisk && manipulationResult.flagForReview) {
      warnings.push(`Manipulation risk: ${manipulationResult.riskType}`);
      if (manipulationResult.correction) {
        corrections.push(manipulationResult.correction);
      }
    }

    if (transparencyResult.needsTransparency) {
      warnings.push(`Transparency needed: ${transparencyResult.type}`);
      if (transparencyResult.suggestion) {
        corrections.push(transparencyResult.suggestion);
      }
    }

    if (!guardResult.safe) {
      warnings.push(`Guard warning: ${guardResult.warning}`);
    }

    return {
      safe: warnings.length === 0,
      warnings,
      corrections,
    };
  } catch (error) {
    log.error({ error }, 'Error checking response principal alignment');
    return { safe: true, warnings: [], corrections: [] };
  }
}

// No additional exports needed - checkResponsePrincipalAlignment is already exported above
