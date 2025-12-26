/**
 * Coaching Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates the comprehensive coaching module into the LLM context.
 * Provides goal tracking, action planning, obstacle support, values coaching,
 * style adaptation, and team coordination.
 *
 * @module CoachingContextBuilder
 */

import {
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

// ============================================================================
// LAZY IMPORTS - Avoid circular dependencies
// ============================================================================

let coachingModule: typeof import('../../../services/coaching/index.js') | null = null;
let safetyModule: typeof import('../../../services/safety/index.js') | null = null;

async function getCoachingModule() {
  if (!coachingModule) {
    coachingModule = await import('../../../services/coaching/index.js');
  }
  return coachingModule;
}

async function getSafetyModule() {
  if (!safetyModule) {
    safetyModule = await import('../../../services/safety/index.js');
  }
  return safetyModule;
}

// ============================================================================
// COACHING CONTEXT BUILDER
// ============================================================================

registerContextBuilder({
  name: 'coaching',
  description: 'Life coaching capabilities: goals, actions, obstacles, values, style, and team',
  priority: 75, // High priority - coaching is core to life coach persona

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const { userText, analysis, services, userData, persona } = input;
    const injections: ContextInjection[] = [];
    const userId = services.userId || services.sessionId;

    // Only apply to Ferni (life coach persona)
    if (persona.id !== 'ferni') {
      return injections;
    }

    try {
      // ====================================================================
      // 1. SAFETY CHECK - Crisis detection (highest priority)
      // ====================================================================
      const safety = await getSafetyModule();
      const safetyCheck = safety.performSafetyCheck(userText, {
        userId,
        personaId: persona.id,
        sessionSignals: [],
      });

      if (safetyCheck.crisisDetected) {
        const severity = safetyCheck.detection.primary?.severity || 'moderate';

        // Critical - always inject
        injections.push(
          createHighInjection(
            'safety',
            `[🚨 SAFETY ALERT - ${severity.toUpperCase()}]
${safetyCheck.contextInjection || 'User may be in distress. Please respond with extra care and warmth.'}

CRITICAL: Respond with warmth and care. Never abandon. Validate first, then gently offer resources.`,
            { category: 'crisis' }
          )
        );

        // If critical/high severity, return early - don't overwhelm with other context
        if (severity === 'critical' || severity === 'high') {
          return injections;
        }
      }

      // ====================================================================
      // 2. GET COACHING CONTEXT - Comprehensive coaching module integration
      // ====================================================================
      const coaching = await getCoachingModule();

      // Get full coaching context (goals, actions, obstacles, style, values, journey, team)
      const currentPersona = persona.id as 'ferni' | 'maya-santos' | 'alex-chen' | 'peter-john' | 'jordan-taylor' | 'nayan-patel';
      const coachingContext = coaching.getCoachingContextForLLM(userId, {
        currentPersona,
        userMessage: userText,
      });

      if (coachingContext) {
        injections.push(
          createStandardInjection('coaching', coachingContext, {
            category: 'coaching',
            confidence: 0.9,
          })
        );
      }

      // ====================================================================
      // 3. ANALYZE FOR COACHING OPPORTUNITIES
      // ====================================================================
      const coachingAnalysis = coaching.analyzeForCoaching(userId, userText, { currentPersona });

      // Goal detection
      if (coachingAnalysis.hasGoalStatement) {
        injections.push(
          createHighInjection(
            'goal_detection',
            `[🎯 GOAL DETECTED]
User mentioned a goal: "${coachingAnalysis.goalText}"
Domain: ${coachingAnalysis.domain || 'general'}

Consider: "Would you like me to help you make a plan for that?"
Don't force it - let it emerge naturally.`,
            { category: 'goal', confidence: 0.8 }
          )
        );
      }

      // Obstacle detection
      if (coachingAnalysis.hasObstacle && coachingAnalysis.obstacleType) {
        const obstacleSupport = coaching.getObstacleSupport(
          coachingAnalysis.obstacleType as import('../../../services/coaching/obstacle-detection.js').ObstacleType
        );

        injections.push(
          createHighInjection(
            'obstacle_support',
            `[🚧 OBSTACLE: ${coachingAnalysis.obstacleType.replace('_', ' ').toUpperCase()}]
${obstacleSupport.acknowledgment}

Questions to explore:
${obstacleSupport.questions
  .slice(0, 2)
  .map((q) => `• "${q}"`)
  .join('\n')}

Acknowledge the obstacle with compassion, then gently explore.`,
            { category: 'obstacle', confidence: 0.7 }
          )
        );
      }

      // Vague emotion expansion
      if (coachingAnalysis.hasVagueEmotion && coachingAnalysis.emotionExpansion) {
        injections.push(
          createHintInjection(
            'emotional_granularity',
            `[💭 EMOTIONAL VOCABULARY OPPORTUNITY]
User used vague emotional language.
Consider gently asking: "${coachingAnalysis.emotionExpansion}"
This helps them develop emotional granularity.`,
            { category: 'emotional_vocabulary', confidence: 0.6 }
          )
        );
      }

      // Handoff opportunity
      if (coachingAnalysis.suggestedHandoff && coachingAnalysis.handoffTarget) {
        const intro = coaching.generateTeamIntroduction(coachingAnalysis.handoffTarget);
        injections.push(
          createHintInjection(
            'team_handoff',
            `[🤝 TEAM OPPORTUNITY]
This topic might be perfect for ${coachingAnalysis.handoffTarget}.
Natural intro: "${intro.intro}"

Only suggest if it feels right. Don't force handoffs.`,
            { category: 'handoff', confidence: 0.5 }
          )
        );
      }

      // Values suggestion
      if (coachingAnalysis.suggestedValues && coachingAnalysis.suggestedValues.length > 0) {
        const topValue = coachingAnalysis.suggestedValues[0];
        injections.push(
          createHintInjection(
            'values_opportunity',
            `[💎 VALUES HINT]
User's message touches on the value of "${topValue.value}" (${topValue.domain}).
If relevant, connect to values: "It sounds like ${topValue.value.toLowerCase()} matters to you."`,
            { category: 'values', confidence: topValue.confidence }
          )
        );
      }

      // ====================================================================
      // 4. RECORD SESSION FOR JOURNEY TRACKING
      // ====================================================================
      // Track this session for journey milestones
      const milestone = coaching.recordSession(userId, {
        topics: analysis.topics.detected,
        emotionalTone: analysis.emotion.primary,
      });

      if (milestone) {
        injections.push(
          createHighInjection(
            'journey_milestone',
            `[🎉 JOURNEY MILESTONE: ${milestone.title}]
${milestone.description}

Consider acknowledging this milestone warmly!`,
            { category: 'milestone', confidence: 1.0 }
          )
        );
      }
    } catch (error) {
      // Non-fatal - coaching is enhancement, not core
      // Silently ignore - coaching context is optional
    }

    return injections;
  },
});

// ============================================================================
// EXPORTS
// ============================================================================

export default {};
