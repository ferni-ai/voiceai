/**
 * Life Thesis Tools
 *
 * Universal tools for saving, retrieving, and reminding users of their "whys".
 * Each persona uses these tools within their domain expertise.
 *
 * Example Use Cases:
 * - Peter: "Why did I buy this stock?" → remindThesis('investment')
 * - Maya: "I want to quit running" → remindThesis('habit')
 * - Jordan: "I'm discouraged about my goal" → remindThesis('goal')
 * - Ferni: "I'm second-guessing my career" → remindThesis('career')
 * - Nayan: "I'm struggling with my commitment" → remindThesis('commitment')
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  saveHabitThesis,
  saveGoalThesis,
  saveCareerThesis,
  saveRelationshipThesis,
  saveHealthThesis,
  saveDecisionThesis,
  saveBoundaryThesis,
  saveCommitmentThesis,
  generateReminder,
  getThesesByDomain,
  getAllTheses,
  updateThesis,
  invalidateThesis,
  type ThesisDomain,
} from '../../../services/life-thesis/index.js';

// ============================================
// SAVE HABIT THESIS (Maya's domain)
// ============================================

export const saveHabitThesisDef: ToolDefinition = {
  id: 'saveHabitThesis',
  name: 'Save Habit Thesis',
  description: `Save why someone is building a new habit. Capture their motivation NOW so it can be recalled when they want to quit.`,
  domain: 'life-thesis',
  tags: ['thesis', 'habits', 'motivation', 'maya'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone is building a new habit. Capture their motivation NOW so it can be recalled when they want to quit.

Use when:
- Someone commits to a new daily/weekly habit
- Someone explains why a habit matters to them
- Someone is starting their habit journey with clear motivation

Captures: The "why", the identity they're building, what reward they expect, known challenges.`,
      parameters: z.object({
        habitName: z.string().describe('Name of the habit (e.g., "morning meditation")'),
        thesis: z
          .string()
          .describe('Their "why" - the core reason for this habit in their own words'),
        description: z.string().describe('What the habit involves'),
        cue: z.string().describe('What triggers the habit (e.g., "after morning coffee")'),
        routine: z.string().describe('The habit action itself'),
        reward: z.string().describe('What they expect to feel/gain'),
        identity: z.string().describe('The identity statement: "I am someone who..."'),
        challenges: z.array(z.string()).describe('Known obstacles they expect'),
        confidence: z.number().min(1).max(10).describe('How confident they feel (1-10)'),
        motivationSource: z.string().describe('What sparked this motivation'),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId, habit: params.habitName }, 'Saving habit thesis');

        try {
          const thesis = await saveHabitThesis(ctx.userId, params.habitName, params.thesis, {
            description: params.description,
            cue: params.cue,
            routine: params.routine,
            reward: params.reward,
            identity: params.identity,
            challenges: params.challenges,
            confidence: params.confidence,
            motivationSource: params.motivationSource,
          });

          return `Got it. I've captured why "${params.habitName}" matters to you. When the going gets tough, I'll remind you: "${params.thesis}". Your identity goal: "${params.identity}"`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save habit thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE GOAL THESIS (Jordan's domain)
// ============================================

export const saveGoalThesisDef: ToolDefinition = {
  id: 'saveGoalThesis',
  name: 'Save Goal Thesis',
  description: `Save why someone set a specific goal. Capture their motivation NOW so it can be recalled when they feel like giving up.`,
  domain: 'life-thesis',
  tags: ['thesis', 'goals', 'motivation', 'jordan'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone set a specific goal. Capture their motivation NOW so it can be recalled when they feel like giving up.

Use when:
- Someone commits to a meaningful goal
- Someone articulates WHY this goal matters
- A goal has milestones or measurable targets

Captures: The "why", target metrics, milestones, what they're sacrificing.`,
      parameters: z.object({
        goalName: z.string().describe('Name of the goal'),
        thesis: z.string().describe('Their "why" - the core reason for pursuing this goal'),
        targetDate: z.string().optional().describe('Target completion date (ISO string)'),
        metric: z
          .object({
            name: z.string(),
            current: z.number(),
            target: z.number(),
            unit: z.string(),
          })
          .optional()
          .describe('Measurable target if applicable'),
        milestones: z
          .array(
            z.object({
              percentage: z.number(),
              description: z.string(),
            })
          )
          .optional()
          .describe('Key milestones along the way'),
        sacrifices: z.array(z.string()).optional().describe("What they're giving up for this"),
        stakeholders: z.array(z.string()).optional().describe('Who else is affected'),
        challenges: z.array(z.string()).describe('Expected obstacles'),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId, goal: params.goalName }, 'Saving goal thesis');

        try {
          await saveGoalThesis(ctx.userId, params.goalName, params.thesis, {
            targetDate: params.targetDate ? new Date(params.targetDate) : undefined,
            metric: params.metric,
            milestones: params.milestones,
            sacrifices: params.sacrifices,
            stakeholders: params.stakeholders,
            challenges: params.challenges,
            confidence: params.confidence,
            motivationSource: params.motivationSource,
          });

          const metricNote = params.metric
            ? ` Your target: ${params.metric.current} → ${params.metric.target} ${params.metric.unit}.`
            : '';
          return `Your "${params.goalName}" thesis is locked in.${metricNote} When you doubt yourself, I'll remind you why this matters.`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save goal thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE CAREER THESIS
// ============================================

export const saveCareerThesisDef: ToolDefinition = {
  id: 'saveCareerThesis',
  name: 'Save Career Thesis',
  description: `Save why someone chose their current career path, role, or company. For when they question their choice.`,
  domain: 'life-thesis',
  tags: ['thesis', 'career', 'motivation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone chose their current career path, role, or company. For when they question their choice.

Use when:
- Someone takes a new job
- Someone commits to a career path
- Someone articulates what matters in their work

Captures: Values, tradeoffs they're accepting, growth areas.`,
      parameters: z.object({
        thesis: z.string().describe('Their "why" for this career choice'),
        role: z.string().optional(),
        company: z.string().optional(),
        path: z.string().optional().describe('Career path (e.g., "startup founder", "senior IC")'),
        values: z.array(z.string()).describe('What matters to them in work'),
        tradeoffs: z.array(z.string()).describe("What they're accepting/giving up"),
        growthAreas: z.array(z.string()).describe('What they hope to learn'),
        timeframe: z.string().optional().describe("How long they'll give it"),
        challenges: z.array(z.string()),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId }, 'Saving career thesis');

        try {
          await saveCareerThesis(ctx.userId, params.thesis, params);

          return `Career thesis captured. Values you're honoring: ${params.values.join(', ')}. When work gets hard, I'll remind you what you're building toward.`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save career thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE RELATIONSHIP THESIS
// ============================================

export const saveRelationshipThesisDef: ToolDefinition = {
  id: 'saveRelationshipThesis',
  name: 'Save Relationship Thesis',
  description: `Save what someone loves about a person and why the relationship matters. For conflict moments.`,
  domain: 'life-thesis',
  tags: ['thesis', 'relationships', 'love'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save what someone loves about a person and why the relationship matters. For conflict moments.

Use when:
- Someone reflects deeply on a relationship
- Someone commits to working on a relationship
- Someone wants to remember the good during hard times

Captures: What they love, what's challenging, how they grow together.`,
      parameters: z.object({
        personName: z.string(),
        thesis: z.string().describe('Why this relationship matters'),
        relationshipType: z.enum(['partner', 'family', 'friend', 'colleague', 'mentor', 'other']),
        whatYouLove: z.array(z.string()).describe('Specific things they love'),
        whatsChallenging: z.array(z.string()).describe('Known challenges'),
        howYouGrow: z.array(z.string()).describe('How this person helps them grow'),
        boundaries: z.array(z.string()).optional(),
        commitments: z.array(z.string()).optional(),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info(
          { userId: ctx.userId, person: params.personName },
          'Saving relationship thesis'
        );

        try {
          await saveRelationshipThesis(ctx.userId, params.personName, params.thesis, params);

          return `I've captured what ${params.personName} means to you. When things get hard between you, I can remind you: "${params.whatYouLove[0]}"`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save relationship thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE HEALTH THESIS
// ============================================

export const saveHealthThesisDef: ToolDefinition = {
  id: 'saveHealthThesis',
  name: 'Save Health Thesis',
  description: `Save why someone is making a health change. For when they want to quit.`,
  domain: 'life-thesis',
  tags: ['thesis', 'health', 'fitness', 'wellness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone is making a health change. For when they want to quit.

Use when:
- Starting a fitness journey
- Making dietary changes
- Working on sleep
- Addressing mental health
- Quitting a substance

Captures: Current state, target state, approach, measurables.`,
      parameters: z.object({
        thesis: z.string().describe('Their "why" for this health change'),
        area: z.enum([
          'exercise',
          'nutrition',
          'sleep',
          'mental_health',
          'substance',
          'medical',
          'other',
        ]),
        currentState: z.string().describe('Where they are now'),
        targetState: z.string().describe('Where they want to be'),
        approach: z.string().describe("The method/program they're following"),
        doctorAdvised: z.boolean().optional(),
        measurables: z
          .array(
            z.object({
              name: z.string(),
              baseline: z.number(),
              target: z.number(),
              unit: z.string(),
            })
          )
          .optional(),
        challenges: z.array(z.string()),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId, area: params.area }, 'Saving health thesis');

        try {
          await saveHealthThesis(ctx.userId, params.thesis, params);

          return `Health thesis saved. Your transformation: ${params.currentState} → ${params.targetState}. When it gets hard, I'll remind you why you started.`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save health thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE DECISION THESIS
// ============================================

export const saveDecisionThesisDef: ToolDefinition = {
  id: 'saveDecisionThesis',
  name: 'Save Decision Thesis',
  description: `Save the reasoning behind a major life decision. For when they have second thoughts.`,
  domain: 'life-thesis',
  tags: ['thesis', 'decisions', 'reasoning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save the reasoning behind a major life decision. For when they have second thoughts.

Use when:
- Someone makes a big decision (move, purchase, ending something)
- Someone weighs options carefully
- Someone wants to remember their clear-headed reasoning

Captures: Alternatives considered, pros/cons, deal-breakers.`,
      parameters: z.object({
        decision: z.string().describe('The decision made'),
        thesis: z.string().describe('Why they made this choice'),
        alternatives: z.array(z.string()).describe('What they considered'),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
        dealBreakers: z.array(z.string()).describe('What would make them reverse'),
        stakeholders: z.array(z.string()).optional(),
        reversible: z.boolean(),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId }, 'Saving decision thesis');

        try {
          await saveDecisionThesis(ctx.userId, params.decision, params.thesis, params);

          const reversibleNote = params.reversible
            ? ' (This is reversible if needed.)'
            : " (You noted this isn't easily reversible.)";
          return `Decision recorded: "${params.decision}". If you have doubts later, I'll walk you through your reasoning.${reversibleNote}`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save decision thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE BOUNDARY THESIS
// ============================================

export const saveBoundaryThesisDef: ToolDefinition = {
  id: 'saveBoundaryThesis',
  name: 'Save Boundary Thesis',
  description: `Save why someone set a personal boundary. For when they're tempted to compromise.`,
  domain: 'life-thesis',
  tags: ['thesis', 'boundaries', 'self-care'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone set a personal boundary. For when they're tempted to compromise.

Use when:
- Someone sets a clear boundary
- Someone articulates what they need/won't accept
- Someone commits to enforcing a limit

Captures: The boundary, who it's with, how to enforce it.`,
      parameters: z.object({
        thesis: z.string().describe('Why this boundary matters'),
        boundary: z.string().describe('The boundary itself'),
        withWhom: z.string().describe('Who this boundary is with'),
        triggerSituation: z.string().describe('When this boundary applies'),
        whatYouNeed: z.string().describe('What they need to protect'),
        whatYouWontAccept: z.string(),
        consequences: z.string().optional().describe('What happens if violated'),
        howToEnforce: z.string(),
        challenges: z.array(z.string()),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId }, 'Saving boundary thesis');

        try {
          await saveBoundaryThesis(ctx.userId, params.thesis, params);

          return `Boundary recorded: "${params.boundary}" with ${params.withWhom}. When you're tempted to bend, I'll remind you why you drew this line.`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save boundary thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// SAVE COMMITMENT THESIS
// ============================================

export const saveCommitmentThesisDef: ToolDefinition = {
  id: 'saveCommitmentThesis',
  name: 'Save Commitment Thesis',
  description: `Save why someone made a commitment (to themselves or others). For when keeping it is hard.`,
  domain: 'life-thesis',
  tags: ['thesis', 'commitments', 'promises'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Save why someone made a commitment (to themselves or others). For when keeping it is hard.

Use when:
- Someone makes a promise
- Someone commits to a course of action
- Someone articulates what they're willing to sacrifice

Captures: The commitment, to whom, costs and gains.`,
      parameters: z.object({
        commitment: z.string().describe('The commitment made'),
        thesis: z.string().describe('Why they made this commitment'),
        toWhom: z.string().describe('Who they\'re committing to (can be "myself")'),
        duration: z.string().optional(),
        conditions: z.array(z.string()).optional(),
        whatItCosts: z.string(),
        whatYouGain: z.string(),
        renewalCriteria: z.string().optional(),
        challenges: z.array(z.string()),
        confidence: z.number().min(1).max(10),
        motivationSource: z.string(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId }, 'Saving commitment thesis');

        try {
          await saveCommitmentThesis(ctx.userId, params.commitment, params.thesis, params);

          const toWhomNote = params.toWhom === 'myself' ? 'to yourself' : `to ${params.toWhom}`;
          return `Commitment locked in ${toWhomNote}: "${params.commitment}". When it's hard to keep, I'll remind you what you gain: "${params.whatYouGain}"`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to save commitment thesis');
          return "I couldn't save that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// REMIND THESIS (Universal)
// ============================================

export const remindThesisDef: ToolDefinition = {
  id: 'remindThesis',
  name: 'Remind Thesis',
  description: `Recall someone's original "why" when they're struggling, doubting, or want to quit.`,
  domain: 'life-thesis',
  tags: ['thesis', 'reminder', 'motivation', 'universal'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Recall someone's original "why" when they're struggling, doubting, or want to quit.

Use when:
- Someone expresses doubt about a commitment
- Someone wants to quit something
- Someone is in conflict and needs perspective
- Someone forgot why they started

Returns: Their original motivation, reflective questions, encouragement.`,
      parameters: z.object({
        domain: z
          .enum([
            'investment',
            'habit',
            'goal',
            'career',
            'relationship',
            'health',
            'learning',
            'decision',
            'boundary',
            'commitment',
          ])
          .describe('Which type of thesis to recall'),
        currentSituation: z.string().describe("What they're currently facing"),
        emotionalState: z.string().optional().describe('How they seem to be feeling'),
      }),
      execute: async (params) => {
        getLogger().info(
          { userId: ctx.userId, domain: params.domain },
          'Generating thesis reminder'
        );

        try {
          const reminder = await generateReminder(
            ctx.userId,
            params.domain as ThesisDomain,
            params.currentSituation,
            params.emotionalState
          );

          if (!reminder) {
            return `I don't have a saved thesis for your ${params.domain}. Would you like to capture one now while you're thinking about it?`;
          }

          const dayText = reminder.daysSinceCreation === 1 ? 'day' : 'days';
          return JSON.stringify({
            message: `${reminder.daysSinceCreation} ${dayText} ago, when you felt ${reminder.thesis.emotionalState.atCreation}, you wrote this: "${reminder.thesis.thesis}"`,
            encouragement: reminder.encouragement,
            reflectionQuestions: reminder.questions,
            expectedOutcomes: reminder.thesis.expectedOutcomes,
            knownChallenges: reminder.thesis.knownChallenges,
          });
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to generate reminder');
          return "I couldn't retrieve that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// GET THESES (Universal)
// ============================================

export const getThesesDef: ToolDefinition = {
  id: 'getTheses',
  name: 'Get Theses',
  description: `Get all saved theses for a domain or all domains. Use to understand someone's commitments.`,
  domain: 'life-thesis',
  tags: ['thesis', 'list', 'universal'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get all saved theses for a domain. Use to understand someone's commitments.

Use when:
- Someone asks "what have I committed to?"
- You need context on their active commitments
- Reviewing progress across a life area`,
      parameters: z.object({
        domain: z
          .enum([
            'investment',
            'habit',
            'goal',
            'career',
            'relationship',
            'health',
            'learning',
            'decision',
            'boundary',
            'commitment',
          ])
          .optional()
          .describe('Leave empty to get ALL theses'),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId, domain: params.domain }, 'Getting theses');

        try {
          const theses = params.domain
            ? await getThesesByDomain(ctx.userId, params.domain as ThesisDomain)
            : await getAllTheses(ctx.userId);

          if (theses.length === 0) {
            const domainText = params.domain ? `${params.domain} theses` : 'theses';
            return `No ${domainText} saved yet. Would you like to capture one?`;
          }

          return JSON.stringify({
            count: theses.length,
            theses: theses.map((t) => ({
              id: t.id,
              domain: t.domain,
              type: t.type,
              thesis: t.thesis,
              daysOld: Math.floor((Date.now() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
              isActive: !t.updates.some((u) => !u.stillValid),
            })),
          });
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to get theses');
          return "I couldn't retrieve theses right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// REVIEW THESIS (Universal)
// ============================================

export const reviewThesisDef: ToolDefinition = {
  id: 'reviewThesis',
  name: 'Review Thesis',
  description: `Update a thesis after a scheduled review or life change.`,
  domain: 'life-thesis',
  tags: ['thesis', 'review', 'update', 'universal'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Update a thesis after a scheduled review or life change.

Use when:
- Someone reviews their commitments
- Something has changed
- Someone wants to invalidate a previous thesis`,
      parameters: z.object({
        thesisId: z.string(),
        note: z.string().describe('Update note'),
        stillValid: z.boolean().describe('Is this thesis still valid?'),
        newConfidence: z.number().min(1).max(10).optional(),
        trigger: z
          .enum(['scheduled_review', 'struggle_moment', 'milestone', 'change_in_circumstances'])
          .optional(),
      }),
      execute: async (params) => {
        getLogger().info({ userId: ctx.userId, thesisId: params.thesisId }, 'Reviewing thesis');

        try {
          if (!params.stillValid) {
            await invalidateThesis(ctx.userId, params.thesisId, params.note);
            return 'Thesis marked as no longer valid. That clarity is valuable too - knowing when something has changed is wisdom.';
          }

          const updated = await updateThesis(ctx.userId, params.thesisId, {
            note: params.note,
            stillValid: true,
            newConfidence: params.newConfidence,
            trigger: params.trigger,
          });

          const confidenceNote = params.newConfidence
            ? ` Your confidence is now ${params.newConfidence}/10.`
            : '';
          return `Thesis updated.${confidenceNote} Staying connected to your why is powerful.`;
        } catch (error) {
          getLogger().error({ error: String(error) }, 'Failed to review thesis');
          return "I couldn't update that thesis right now. Let's try again.";
        }
      },
    });
  },
};

// ============================================
// Export all tools
// ============================================

export const thesisTools: ToolDefinition[] = [
  saveHabitThesisDef,
  saveGoalThesisDef,
  saveCareerThesisDef,
  saveRelationshipThesisDef,
  saveHealthThesisDef,
  saveDecisionThesisDef,
  saveBoundaryThesisDef,
  saveCommitmentThesisDef,
  remindThesisDef,
  getThesesDef,
  reviewThesisDef,
];

export function createThesisTools(): ToolDefinition[] {
  return thesisTools;
}
