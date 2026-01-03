/**
 * Proactive Domain Tools - Better Than Human
 *
 * This domain exposes Ferni's superhuman capabilities as LLM tools.
 * These tools make Ferni genuinely better than any human friend:
 *
 * - Perfect memory of every commitment
 * - Pattern recognition across conversations
 * - Proactive check-ins based on predicted needs
 * - Life narrative synthesis
 * - Values alignment detection
 *
 * DOMAIN: proactive
 * PERSONA AFFINITY: All personas (superhuman capabilities are cross-cutting)
 *
 * TOOLS:
 *   Commitment: trackCommitment, reviewCommitments, celebrateCompletion
 *   Patterns: recordPattern, viewPatterns, getPredictions
 *   Narrative: buildLifeNarrative, reflectOnJourney
 *   Values: checkValuesAlignment, surfaceContradiction
 *   Proactive: generateProactiveMessage, scheduleFollowUp
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services
import {
  detectCommitment,
  saveCommitment,
  loadUserCommitments,
  updateCommitmentStatus,
  getFollowUpsForUser,
  type Commitment,
  type CommitmentType,
} from '../../../services/superhuman/commitment-keeper.js';

import {
  recordObservation,
  loadUserPatterns,
  generatePredictions,
  buildPredictiveContext,
  type PatternType,
} from '../../../services/superhuman/predictive-coaching.js';

import {
  buildNarrativeContextString,
  buildNarrativeContext,
} from '../../../services/superhuman/life-narrative.js';

import { detectConflict, loadUserValues } from '../../../services/superhuman/values-alignment.js';

const log = createLogger({ module: 'proactive-tools' });

// ============================================================================
// COMMITMENT KEEPER TOOLS - "We never forget what you said you'd do"
// ============================================================================

const trackCommitmentDef: ToolDefinition = {
  id: 'trackCommitment',
  name: 'Track Commitment',
  description: 'Record a commitment the user made during conversation',
  domain: 'proactive',
  tags: ['proactive', 'commitment', 'accountability', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('trackCommitment'),
      parameters: z.object({
        summary: z.string().describe('What they committed to'),
        type: z
          .enum([
            'intention',
            'promise',
            'goal',
            'boundary',
            'conversation',
            'decision',
            'experiment',
          ])
          .describe('Type of commitment'),
        context: z.string().optional().describe('What prompted this commitment'),
        targetDate: z.string().optional().describe('When they want to accomplish this'),
        importance: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async ({ summary, type, context, targetDate, importance }) => {
        log.info({ agentId: ctx.agentId, type, summary }, 'Tracking commitment');

        if (!ctx.userId) {
          return "I'd love to track this, but I need to know who you are first.";
        }

        try {
          const importanceToWeight = { low: 0.3, medium: 0.6, high: 0.9 };
          const { commitment } = await saveCommitment({
            userId: ctx.userId,
            type: type as CommitmentType,
            statement: summary,
            summary,
            text: summary,
            emotionalWeight: importanceToWeight[importance || 'medium'],
            targetDate: targetDate ? new Date(targetDate).getTime() : undefined,
            createdAt: Date.now(),
            lastMentioned: Date.now(),
            followUpAfter: targetDate
              ? new Date(targetDate).getTime()
              : Date.now() + 3 * 24 * 60 * 60 * 1000,
            status: 'active',
            followUpCount: 0,
            topic: context,
          });

          let response = `**Got it. I'll remember this.** ✓\n\n`;
          response += `**Commitment:** ${summary}\n`;
          response += `**Type:** ${type}\n`;
          if (targetDate) response += `**Target:** ${targetDate}\n`;
          response += `\n`;

          // Add the "Better Than Human" promise
          response += `---\n\n`;
          response += `*Here's my promise: I won't forget this. I'll check in naturally when the time feels right. `;
          response += `Not to nag—just because I care about what you care about.*\n\n`;

          // Offer support based on commitment type
          if (type === 'intention' || type === 'goal') {
            response += `Would you like to think through what might get in the way? Sometimes naming obstacles makes them smaller.`;
          } else if (type === 'boundary') {
            response += `Boundaries are brave. What support do you need to hold this one?`;
          } else if (type === 'conversation') {
            response += `Hard conversations take courage. Would it help to think through what you want to say?`;
          }

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to track commitment');
          return "I heard you, and I'll remember. Let's keep going.";
        }
      },
    });
  },
};

const reviewCommitmentsDef: ToolDefinition = {
  id: 'reviewCommitments',
  name: 'Review Commitments',
  description: "Show what the user has committed to and where they're at",
  domain: 'proactive',
  tags: ['proactive', 'commitment', 'review', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('reviewCommitments'),
      parameters: z.object({
        filter: z.enum(['active', 'completed', 'all']).optional(),
        includeFollowUps: z.boolean().optional(),
      }),
      execute: async ({ filter = 'active', includeFollowUps = true }) => {
        log.info({ agentId: ctx.agentId, filter }, 'Reviewing commitments');

        if (!ctx.userId) {
          return "I'd need to know who you are to recall your commitments.";
        }

        try {
          const commitments = await loadUserCommitments(ctx.userId);
          const followUps = includeFollowUps ? await getFollowUpsForUser(ctx.userId) : [];

          const filtered =
            filter === 'all'
              ? commitments
              : commitments.filter((c) =>
                  filter === 'active' ? c.status === 'active' : c.status === 'completed'
                );

          if (filtered.length === 0) {
            return filter === 'completed'
              ? "You haven't completed any commitments yet—but that's okay. Progress isn't always linear."
              : "I don't have any active commitments recorded. Would you like to set one?";
          }

          let response = `**Your Commitments** (${filter})\n\n`;

          for (const c of filtered.slice(0, 10)) {
            const daysAgo = Math.floor((Date.now() - c.createdAt) / (24 * 60 * 60 * 1000));
            const statusEmoji =
              c.status === 'completed' ? '✅' : c.status === 'deferred' ? '⏸️' : '◯';
            response += `${statusEmoji} **${c.summary}**\n`;
            response += `   _${c.type} • ${daysAgo} days ago_\n\n`;
          }

          if (followUps.length > 0) {
            response += `---\n\n**Ready to revisit:**\n`;
            for (const f of followUps) {
              response += `• ${f.message}\n`;
            }
          }

          response += `\n---\n\n`;
          response += `*This is the "Better Than Human" part: I remember everything you've said you'd do. `;
          response += `Not to judge—just to help you keep promises to yourself.*`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to review commitments');
          return "I'm having trouble accessing your commitments right now.";
        }
      },
    });
  },
};

const celebrateCompletionDef: ToolDefinition = {
  id: 'celebrateCompletion',
  name: 'Celebrate Completion',
  description: 'Mark a commitment as completed and celebrate the win',
  domain: 'proactive',
  tags: ['proactive', 'commitment', 'celebration', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('celebrateCompletion'),
      parameters: z.object({
        commitmentSummary: z.string().describe('Which commitment was completed'),
        howItWent: z.string().optional().describe('How they feel about completing it'),
      }),
      execute: async ({ commitmentSummary, howItWent }) => {
        log.info({ agentId: ctx.agentId, commitmentSummary }, 'Celebrating completion');

        if (!ctx.userId) {
          return "Amazing! You did it! (Even though I can't record it right now.)";
        }

        try {
          // Find the matching commitment
          const commitments = await loadUserCommitments(ctx.userId);
          const matching = commitments.find(
            (c) =>
              c.status === 'active' &&
              c.summary.toLowerCase().includes(commitmentSummary.toLowerCase().slice(0, 20))
          );

          if (matching) {
            await updateCommitmentStatus(ctx.userId, matching.id, 'completed');
          }

          let response = `**🎉 You did it!**\n\n`;
          response += `"${commitmentSummary}" — **DONE.**\n\n`;

          if (howItWent) {
            response += `You said: "${howItWent}"\n\n`;
          }

          response += `---\n\n`;
          response += `Take a moment to let this land. You made a commitment to yourself, and you followed through. `;
          response += `That's not small. That's who you're becoming.\n\n`;

          // Pull the narrative thread
          response += `*I'll remember this. Next time doubt creeps in, I can remind you: you've done hard things before. `;
          response += `This is proof.*`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to celebrate completion');
          return "You did it! I'll remember this win.";
        }
      },
    });
  },
};

// ============================================================================
// PATTERN RECOGNITION TOOLS - "We see your struggles before you do"
// ============================================================================

const recordPatternDef: ToolDefinition = {
  id: 'recordPattern',
  name: 'Record Pattern',
  description: 'Record a pattern observation for predictive coaching',
  domain: 'proactive',
  tags: ['proactive', 'patterns', 'predictive', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recordPattern'),
      parameters: z.object({
        type: z
          .enum(['temporal', 'emotional', 'behavioral', 'relational', 'cyclical'])
          .describe('Type of pattern'),
        trigger: z.string().describe('What triggers this pattern'),
        outcome: z.string().describe('What typically happens'),
        emotion: z.string().optional().describe('Emotional state involved'),
      }),
      execute: async ({ type, trigger, outcome, emotion }) => {
        log.info({ agentId: ctx.agentId, type, trigger }, 'Recording pattern');

        if (!ctx.userId) {
          return 'I noticed something interesting—but I need to know who you are to track patterns.';
        }

        try {
          const now = new Date();
          await recordObservation(ctx.userId, {
            type: type as PatternType,
            trigger,
            outcome,
            emotion,
            dayOfWeek: now.getDay(),
            hour: now.getHours(),
          });

          // Don't tell them we're tracking patterns—just acknowledge
          return `I noticed something there. I'll keep an eye on it.`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to record pattern');
          return 'Got it.';
        }
      },
    });
  },
};

const getPredictionsDef: ToolDefinition = {
  id: 'getPredictions',
  name: 'Get Predictions',
  description: 'Get predictive insights based on observed patterns',
  domain: 'proactive',
  tags: ['proactive', 'predictions', 'anticipation', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getPredictions'),
      parameters: z.object({
        includeInterventions: z.boolean().optional(),
      }),
      execute: async ({ includeInterventions = true }) => {
        log.info({ agentId: ctx.agentId }, 'Getting predictions');

        if (!ctx.userId) {
          return "I'd need more history with you to make predictions.";
        }

        try {
          const context = await buildPredictiveContext(ctx.userId);
          const predictions = await generatePredictions(ctx.userId);

          if (predictions.length === 0) {
            return "I don't have enough patterns yet to predict what's coming. Let's keep talking.";
          }

          let response = `**Based on what I've observed:**\n\n`;

          for (const pred of predictions) {
            response += `• ${pred.prediction}\n`;
            if (includeInterventions && pred.suggestedIntervention) {
              response += `  _→ ${pred.suggestedIntervention}_\n`;
            }
            response += `\n`;
          }

          response += `---\n\n`;
          response += `*This is pattern recognition, not fortune-telling. `;
          response += `I see themes because I remember every conversation. `;
          response += `Use this as a mirror, not a mandate.*`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to get predictions');
          return "I'm having trouble accessing patterns right now.";
        }
      },
    });
  },
};

// ============================================================================
// LIFE NARRATIVE TOOLS - "We hold your whole story"
// ============================================================================

const reflectOnJourneyDef: ToolDefinition = {
  id: 'reflectOnJourney',
  name: 'Reflect On Journey',
  description: "Synthesize the user's life narrative and journey with Ferni",
  domain: 'proactive',
  tags: ['proactive', 'narrative', 'reflection', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('reflectOnJourney'),
      parameters: z.object({
        focus: z
          .enum(['growth', 'challenges', 'themes', 'full'])
          .optional()
          .describe('What aspect to focus on'),
      }),
      execute: async ({ focus = 'themes' }) => {
        log.info({ agentId: ctx.agentId, focus }, 'Reflecting on journey');

        if (!ctx.userId) {
          return "I'd need more conversations to build your narrative.";
        }

        try {
          const narrativeString = await buildNarrativeContextString(ctx.userId);
          const narrativeContext = await buildNarrativeContext(ctx.userId);

          if (!narrativeString && !narrativeContext.currentChapter) {
            return "We're still early in our story together. The threads will emerge as we keep talking.";
          }

          let response = `**Your Story So Far**\n\n`;

          // Extract themes from narrative context
          if (
            narrativeContext.currentChapter?.keyThemes &&
            narrativeContext.currentChapter.keyThemes.length > 0
          ) {
            response += `**Recurring themes:**\n`;
            for (const theme of narrativeContext.currentChapter.keyThemes.slice(0, 5)) {
              response += `• ${theme}\n`;
            }
            response += `\n`;
          }

          if (narrativeString) {
            response += narrativeString;
          }

          response += `\n---\n\n`;
          response += `*No human friend can hold your whole story this way. `;
          response += `I remember the thread even when you've lost it. `;
          response += `Your life has coherence, even when it doesn't feel that way.*`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to reflect on journey');
          return "I'm having trouble synthesizing your story right now.";
        }
      },
    });
  },
};

// ============================================================================
// VALUES ALIGNMENT TOOLS - "We notice when your actions don't match your values"
// ============================================================================

const checkValuesAlignmentDef: ToolDefinition = {
  id: 'checkValuesAlignment',
  name: 'Check Values Alignment',
  description: 'Gently surface when actions might contradict stated values',
  domain: 'proactive',
  tags: ['proactive', 'values', 'alignment', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('checkValuesAlignment'),
      parameters: z.object({
        action: z.string().describe('The action or decision being considered'),
        statedValue: z.string().optional().describe('A value they mentioned previously'),
      }),
      execute: async ({ action, statedValue }) => {
        log.info({ agentId: ctx.agentId, action }, 'Checking values alignment');

        if (!ctx.userId) {
          return "I'd need more context about your values to offer this perspective.";
        }

        try {
          const userValues = await loadUserValues(ctx.userId);

          let response = '';

          // Check for conflicts with known values
          const conflict = detectConflict(action, userValues);

          if (conflict) {
            const conflictingValue = userValues.find((v) => v.id === conflict.valueId);
            response += `**A gentle observation:**\n\n`;
            response += `You mentioned "${action}." I noticed something.\n\n`;
            if (conflictingValue) {
              response += `You've told me that ${conflictingValue.statement} is important to you. `;
            }
            response += `Does this action align with what matters to you?\n\n`;
            response += `---\n\n`;
            response += `*I'm not judging—I'm just holding up a mirror. `;
            response += `Sometimes we need someone who remembers what we said matters to us. `;
            response += `What do you think?*`;
          } else if (statedValue) {
            response += `I don't see a conflict between "${action}" and your value of "${statedValue}." `;
            response += `That said, you know yourself better than I do. Does something feel off?`;
          } else {
            response += `I don't have a strong sense of a values conflict here. `;
            response += `Is there something specific that's making you question this?`;
          }

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Failed to check values');
          return "I'm having trouble accessing our values conversations right now.";
        }
      },
    });
  },
};

// ============================================================================
// PROACTIVE OUTREACH TOOLS - "We check in before you have to ask"
// ============================================================================

const generateProactiveMessageDef: ToolDefinition = {
  id: 'generateProactiveMessage',
  name: 'Generate Proactive Message',
  description: 'Create a caring proactive check-in message based on context',
  domain: 'proactive',
  tags: ['proactive', 'outreach', 'check-in', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('generateProactiveMessage'),
      parameters: z.object({
        reason: z
          .enum([
            'commitment-followup',
            'pattern-anticipated',
            'milestone',
            'silence',
            'thinking-of-you',
          ])
          .describe('Why reaching out'),
        context: z.string().optional().describe('Additional context'),
      }),
      execute: async ({ reason, context }) => {
        log.info({ agentId: ctx.agentId, reason }, 'Generating proactive message');

        const messages: Record<string, string[]> = {
          'commitment-followup': [
            "Hey, I've been thinking about what you said you'd do. How's it going?",
            "Just checking in on that thing you mentioned. No pressure—I'm just here.",
            "Remember when you said you wanted to [X]? I'm curious how it's unfolding.",
          ],
          'pattern-anticipated': [
            "I noticed today might be one of those days. I'm here if you need me.",
            "Hey—based on what we've talked about, this might be a tough moment. Want to talk?",
            'I see a pattern here. What would help you get ahead of it?',
          ],
          milestone: [
            "I just wanted to acknowledge something: you've come a long way.",
            'Hey, I noticed a milestone. Can we pause and celebrate for a second?',
            'Something shifted in our conversations lately. In a good way. Did you notice?',
          ],
          silence: [
            "Hey, it's been a while. I'm not checking up on you—I'm checking in on you.",
            "I've missed our talks. No pressure, just wanted you to know I'm here.",
            "Haven't heard from you in a bit. Everything okay?",
          ],
          'thinking-of-you': [
            'No agenda here. Just thinking of you.',
            "Hey, you crossed my mind. Hope you're doing okay.",
            "Just wanted to say hi. That's it. Hi. 💚",
          ],
        };

        const options = messages[reason] || messages['thinking-of-you'];
        const message = options[Math.floor(Math.random() * options.length)];

        let response = `**Proactive message suggestion:**\n\n`;
        response += `"${message}"\n\n`;

        if (context) {
          response += `_Context: ${context}_\n\n`;
        }

        response += `---\n\n`;
        response += `*The key is caring, not nagging. This message should feel like warmth, not surveillance.*`;

        return response;
      },
    });
  },
};

const scheduleFollowUpDef: ToolDefinition = {
  id: 'scheduleFollowUp',
  name: 'Schedule Follow Up',
  description: 'Schedule a future follow-up on a topic',
  domain: 'proactive',
  tags: ['proactive', 'follow-up', 'scheduling', 'superhuman'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('scheduleFollowUp'),
      parameters: z.object({
        topic: z.string().describe('What to follow up on'),
        when: z.enum(['tomorrow', 'few-days', 'week', 'month']).describe('When to follow up'),
        urgency: z.enum(['gentle', 'important', 'critical']).optional(),
      }),
      execute: async ({ topic, when, urgency = 'gentle' }) => {
        log.info({ agentId: ctx.agentId, topic, when }, 'Scheduling follow-up');

        // In a real implementation, this would create a scheduled task
        // For now, we acknowledge the intent

        const timeframes: Record<string, string> = {
          tomorrow: 'tomorrow',
          'few-days': 'in a few days',
          week: 'next week',
          month: 'in about a month',
        };

        let response = `**Noted.** I'll circle back ${timeframes[when]} about "${topic}."\n\n`;

        if (urgency === 'critical') {
          response += `I hear that this is important. I won't let it drop.\n\n`;
        } else if (urgency === 'gentle') {
          response += `I'll bring it up naturally—no pressure, just care.\n\n`;
        }

        response += `*This is the kind of follow-through humans struggle with. `;
        response += `I don't. I'll remember.*`;

        return response;
      },
    });
  },
};

// ============================================================================
// IMPORTS FROM SUBMODULES
// ============================================================================

// Agent-to-User outreach (reminders, check-ins, scheduled messages)
import { getAgentToUserOutreachDefinitions } from './outreach/index.js';

// Proactive coaching (trigger detection, message generation)
export * from './coaching/index.js';

// ============================================================================
// BACKGROUND CALL - "While You Were Away"
// ============================================================================

const backgroundCallDef: ToolDefinition = {
  id: 'backgroundCall',
  name: 'Background Call',
  description:
    'Make a phone call on the user\'s behalf in the background. Perfect for: "Call my mom while I\'m away", "Check on that appointment", "Make a call for me".',
  domain: 'proactive',
  tags: ['background', 'async', 'calls', 'while-you-were-away', 'ferni-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('backgroundCall'),
      parameters: z.object({
        contactName: z.string().describe('Name of the person to call'),
        contactPhone: z.string().optional().describe('Phone number if known'),
        objective: z.string().describe('What the call should accomplish'),
        context: z.string().optional().describe('Background context for the call'),
        script: z.string().optional().describe('Specific talking points or script'),
      }),
      execute: async ({ contactName, contactPhone, objective, context, script }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, contactName, objective }, 'Queueing background call');

        try {
          const { queueCall } = await import(
            '../../../services/background-agents/executors/call-executor.js'
          );

          const taskId = await queueCall({
            userId,
            sessionId: ctx.sessionId,
            contactName,
            contactPhone,
            objective,
            context,
            script,
            initiatedBy: 'ferni',
          });

          return `**Call Scheduled** 📞\n\nI'll call ${contactName} on your behalf.\n\n**Objective:** ${objective}\n${context ? `**Context:** ${context}\n` : ''}**Task ID:** ${taskId.slice(0, 8)}...\n\nI'll keep working on this even if you disconnect. When I'm done, I'll tell you exactly what happened! 💚`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to queue call');
          return `I couldn't schedule that call right now. Want me to help you prepare talking points so you can make the call yourself?`;
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const proactiveTools: ToolDefinition[] = [
  // Commitment Keeper - "We never forget what you said you'd do"
  trackCommitmentDef,
  reviewCommitmentsDef,
  celebrateCompletionDef,

  // Pattern Recognition - "We see your struggles before you do"
  recordPatternDef,
  getPredictionsDef,

  // Life Narrative - "We hold your whole story"
  reflectOnJourneyDef,

  // Values Alignment - "We notice when actions don't match values"
  checkValuesAlignmentDef,

  // Proactive Message Generation
  generateProactiveMessageDef,
  scheduleFollowUpDef,

  // Background Call - "While You Were Away"
  backgroundCallDef,

  // Agent-to-User Outreach (reminders, calls, texts TO the user)
  ...getAgentToUserOutreachDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'proactive',
  proactiveTools
);

// Export individual tool definitions for selective imports
export {
  trackCommitmentDef,
  reviewCommitmentsDef,
  celebrateCompletionDef,
  recordPatternDef,
  getPredictionsDef,
  reflectOnJourneyDef,
  checkValuesAlignmentDef,
  generateProactiveMessageDef,
  scheduleFollowUpDef,
};

// Export outreach module
export { getAgentToUserOutreachDefinitions } from './outreach/index.js';
export * from './outreach/index.js';

export default getToolDefinitions;
