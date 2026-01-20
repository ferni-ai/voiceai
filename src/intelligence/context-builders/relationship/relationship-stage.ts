/**
 * Relationship Stage Context Builder
 *
 * > "Track relationship depth and adjust approach accordingly"
 *
 * Injects relationship awareness into LLM prompts:
 * - Current stage (affects formality, depth of questions)
 * - Trust level (affects what topics to broach)
 * - Recent shared moments (for natural context)
 * - Pending milestones (for celebration)
 *
 * Implements Core Principle #2: Relationship Over Transaction
 *
 * @module intelligence/context-builders/relationship/relationship-stage
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createHighInjection,
  createStandardInjection,
  registerContextBuilder,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getRelationshipEngine,
  type RelationshipContext,
  type RelationshipStage,
} from '../../relationship/index.js';

const log = createLogger({ module: 'RelationshipStageBuilder' });

// ============================================================================
// STAGE GUIDANCE
// ============================================================================

/**
 * Guidance for how to interact at each relationship stage
 */
const STAGE_GUIDANCE: Record<RelationshipStage, string> = {
  stranger: `[RELATIONSHIP: New Connection]
This is a newer relationship. Focus on:
- Getting to know them with open, curious questions
- Building rapport through active listening
- Being warm but not presumptuous
- Avoiding overly personal questions until invited
- Establishing trust through consistency`,

  acquaintance: `[RELATIONSHIP: Building Familiarity]
We're getting to know each other. This allows:
- More personal questions about their life
- Remembering and referencing past conversations
- Starting to notice patterns in their sharing
- Being slightly more direct with observations
- Gentle follow-ups on things they've mentioned`,

  friend: `[RELATIONSHIP: Genuine Rapport]
We have real rapport now. This unlocks:
- Deeper questions about their feelings and motivations
- Direct observations about patterns you notice
- Gentle challenges when they're being hard on themselves
- Sharing relevant personal reflections (vulnerability)
- Inside references and callbacks to shared moments`,

  trusted: `[RELATIONSHIP: Deep Trust]
They trust us deeply. We can:
- Be direct and honest, even when hard
- Push back on negative self-talk
- Ask probing questions about sensitive topics
- Reference vulnerable moments they've shared
- Celebrate their growth with specific examples`,

  confidant: `[RELATIONSHIP: Inner Circle]
This is a rare, deep bond. We can:
- Be completely honest and direct
- Call out patterns they might not see
- Share the most vulnerable reflections
- Reference our entire shared history
- Speak as someone who truly knows them`,
};

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format relationship context for LLM prompt injection
 */
function formatRelationshipContext(ctx: RelationshipContext): string {
  const lines: string[] = [];

  // Stage guidance
  lines.push(STAGE_GUIDANCE[ctx.stage]);

  // Session count context
  if (ctx.totalSessions > 1) {
    lines.push(
      `\nThis is session #${ctx.totalSessions} together. Trust score: ${Math.round(ctx.trustScore * 100)}%`
    );
  }

  // Time since last session
  if (ctx.daysSinceLastSession > 0) {
    if (ctx.daysSinceLastSession === 1) {
      lines.push("It's been a day since we last talked.");
    } else if (ctx.daysSinceLastSession <= 7) {
      lines.push(`It's been ${ctx.daysSinceLastSession} days since we last talked.`);
    } else if (ctx.daysSinceLastSession <= 30) {
      lines.push(
        `It's been ${Math.floor(ctx.daysSinceLastSession / 7)} weeks since we last talked - check in on how they've been.`
      );
    } else {
      lines.push(
        `It's been ${Math.floor(ctx.daysSinceLastSession / 30)} months since we last talked - warm reconnection is appropriate.`
      );
    }
  }

  // Emotional trajectory
  if (ctx.trajectoryDirection !== 'stable') {
    const trajectoryDescriptions: Record<string, string> = {
      improving: "They've been trending more positive lately - notice and celebrate this.",
      declining: "They've been struggling recently - be extra supportive and present.",
      variable: 'Their emotional state has been variable - meet them where they are today.',
    };
    lines.push(trajectoryDescriptions[ctx.trajectoryDirection] || '');
  }

  // Active concerns
  if (ctx.activeConcerns.length > 0) {
    const topConcern = ctx.activeConcerns[0];
    lines.push(
      `\n[CONCERN TO BE MINDFUL OF: ${topConcern.concern} (${topConcern.severity} severity)]`
    );
  }

  // Unlocked capabilities
  const unlocked = ctx.unlockedContent;
  if (unlocked.protectiveResponses) {
    lines.push("\nYou CAN push back gently on negative self-talk at this trust level.");
  }
  if (unlocked.vulnerabilitySharing) {
    lines.push("You CAN share vulnerable reflections from your own experience.");
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Format pending milestone for celebration
 */
function formatMilestoneContext(ctx: RelationshipContext): string | null {
  const pendingMilestones = ctx.pendingMilestones.filter((m) => m.reached && !m.acknowledged);
  if (pendingMilestones.length === 0) return null;

  const milestone = pendingMilestones[0];
  const milestoneMessages: Record<string, string> = {
    session_10: "This is your 10th conversation! Consider acknowledging this milestone.",
    session_25: '25 conversations together - a significant relationship has developed.',
    session_50: '50 conversations! This is a deeply established relationship.',
    session_100: "100 conversations - an extraordinary journey together.",
    first_vulnerability:
      'They recently opened up vulnerably for the first time. Handle with care.',
    first_laugh: 'You shared genuine laughter together recently. This is a bonding moment.',
    first_breakthrough: 'They had a breakthrough recently. Reference and celebrate it.',
    reached_friend: 'Your relationship has deepened to a genuine friendship.',
    reached_trusted: "They now trust you deeply. You've earned the right to be more direct.",
    reached_confidant: "You've reached the deepest level of trust. Treat this bond with reverence.",
    one_month: "It's been one month since you started talking!",
    three_months: 'Three months together - a meaningful relationship.',
    six_months: 'Half a year of growing together!',
    one_year: "One year anniversary! This is a special milestone worth celebrating.",
  };

  const message = milestoneMessages[milestone.type];
  if (message) {
    return `[MILESTONE TO CELEBRATE: ${message}]`;
  }
  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build relationship stage context for the current turn
 */
async function buildRelationshipStageContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const userId = input.services?.userId;
  const personaId = input.persona?.id || 'ferni';

  if (!userId) {
    log.debug('No userId, skipping relationship context');
    return [];
  }

  // Get relationship engine (already initialized by session-init-handler)
  const engine = getRelationshipEngine(userId, personaId);
  if (!engine) {
    log.debug({ userId, personaId }, 'No relationship engine found');
    return [];
  }

  const injections: ContextInjection[] = [];

  try {
    // Build relationship context
    const ctx = engine.buildRelationshipContext();

    // Main relationship context
    const relationshipContent = formatRelationshipContext(ctx);
    if (relationshipContent) {
      injections.push(
        createStandardInjection('relationship-stage', relationshipContent, {
          category: 'awareness',
          confidence: 0.9,
        })
      );
    }

    // Milestone context (high priority if present)
    const milestoneContent = formatMilestoneContext(ctx);
    if (milestoneContent) {
      injections.push(
        createHighInjection('relationship-milestone', milestoneContent, {
          category: 'celebration',
          confidence: 0.95,
        })
      );
    }

    log.debug(
      {
        userId,
        stage: ctx.stage,
        sessions: ctx.totalSessions,
        injectionCount: injections.length,
      },
      'Built relationship stage context'
    );
  } catch (error) {
    log.error({ error, userId }, 'Error building relationship stage context');
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'relationship-stage',
  description: 'Relationship stage, trust level, and milestone awareness',
  priority: 45, // After safety (35), before personality (70)
  build: buildRelationshipStageContext,
});

export { buildRelationshipStageContext };
