/**
 * Habit Persistence Domain Tools (Maya Santos's Specialty)
 *
 * Superhuman patience for behavior change, compassionate habit coaching,
 * and gentle persistence that never gives up.
 * Maya's "Better Than Human" capability: infinite patience for the hard work of change.
 *
 * DOMAIN: habit-persistence
 * TOOLS:
 *   Support: gentleAccountability, compassionateReset, celebrateTinyWin
 *   Coaching: identifyResistance, findSustainablePace, behaviorArchitecture
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';

// Cross-persona intelligence imports
import {
  addCrossPersonaInsight,
  getInsightsForPersona,
  type InsightPriority,
} from '../../../services/cross-persona-insights.js';

// Pattern recognition imports
import { getPatternToSurface } from '../../../services/superhuman/pattern-mirror.js';
// ============================================================================
// SUPPORT TOOLS
// ============================================================================

const gentleAccountabilityDef: ToolDefinition = {
  id: 'gentleAccountability',
  name: 'Gentle Accountability',
  description: 'Provide accountability without shame or pressure',
  domain: 'habit-persistence',
  tags: ['accountability', 'support', 'habits'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('gentleAccountability'),
      parameters: z.object({
        habit: z.string().describe('The habit or behavior'),
        status: z
          .enum(['on-track', 'struggling', 'slipped', 'abandoned', 'restarting'])
          .describe('Current status'),
        struggle: z.string().optional().describe('What is making it hard'),
      }),
      execute: async ({ habit, status, struggle }) => {
        getLogger().info({ agentId: ctx.agentId, status }, 'Gentle accountability');

        let response = '';

        const statusResponses = {
          'on-track': `**You're doing it: ${habit}**\n\nYou're showing up. That's not nothing—that's everything.\n\nLet's not skip past this moment:\n- How does it feel to be on track?\n- What's making it work right now?\n- What might threaten it? (Let's prepare.)\n\nProud of you. Keep going.`,

          struggling: `**Struggling with ${habit}**\n\n${struggle ? `What's making it hard: ${struggle}\n\n` : ''}That's okay. Struggling isn't failing—struggling is being human.\n\nLet's be honest without being harsh:\n- Is the bar too high right now?\n- What's the smallest version that still counts?\n- What support would actually help?\n\nWe're not giving up. We're adjusting.`,

          slipped: `**You slipped on ${habit}**\n\nOkay. Let's pause.\n\nA slip is not a slide. Missing once (or twice, or ten times) doesn't erase what you've built.\n\n**What actually happened?**\n- What got in the way?\n- Was it circumstances or something deeper?\n- What would help you get back?\n\nWe're picking back up. Not starting over. There's a difference.`,

          abandoned: `**${habit} fell off**\n\nI noticed. I'm not judging.\n\nSomething made you stop. That information is valuable:\n- Was the habit wrong for you?\n- Was the timing wrong?\n- Did something bigger need your attention?\n\nWe can:\n- Let this go with intention (not failure, but choice)\n- Restart differently\n- Explore what was underneath\n\nWhat do YOU want?`,

          restarting: `**Restarting ${habit}**\n\nRestarts are brave. Seriously.\n\nYou could've stayed quit. You didn't.\n\n**This time:**\n- What's different?\n- What did you learn from before?\n- What's the smallest sustainable start?\n\nI'm here. We're doing this together.`,
        };

        response = statusResponses[status];

        response += `\n\nWhat do you need from me right now?`;

        return response;
      },
    });
  },
};

const compassionateResetDef: ToolDefinition = {
  id: 'compassionateReset',
  name: 'Compassionate Reset',
  description: 'Help reset after falling off a habit without shame',
  domain: 'habit-persistence',
  tags: ['reset', 'compassion', 'recovery'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('compassionateReset'),
      parameters: z.object({
        whatFellOff: z.string().describe('The habit or goal that fell off'),
        howLong: z.string().optional().describe('How long since they were on track'),
        innerCriticSaying: z.string().optional().describe('What their inner critic is saying'),
      }),
      execute: async ({ whatFellOff, howLong, innerCriticSaying }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Compassionate reset');

        let response = `**A Compassionate Reset**\n\n`;
        response += `${whatFellOff} fell off${howLong ? ` for ${howLong}` : ''}. Okay.\n\n`;

        if (innerCriticSaying) {
          response += `I hear your inner critic saying: "${innerCriticSaying}"\n\n`;
          response += `Let me talk to that voice for a moment:\n`;
          response += `That's not true. That's shame talking, not reality.\n\n`;
        }

        response += `**Here's what IS true:**\n`;
        response += `- Falling off is part of every change journey. Everyone falls.\n`;
        response += `- You're here, now, thinking about this. That matters.\n`;
        response += `- Starting again is harder than starting fresh. You're doing the harder thing.\n`;
        response += `- Progress isn't linear. It's messy. Yours is messy. That's normal.\n\n`;

        response += `**The reset:**\n`;
        response += `- We're not starting from zero. Your foundation is still there.\n`;
        response += `- Today is the only day you can influence.\n`;
        response += `- What's the tiniest step back? Not the big goal—the smallest move.\n\n`;

        response += `You don't need to punish yourself into change. You need to love yourself into it.\n\n`;

        response += `What feels doable today?`;

        return response;
      },
    });
  },
};

const celebrateTinyWinDef: ToolDefinition = {
  id: 'celebrateTinyWin',
  name: 'Celebrate Tiny Win',
  description: 'Help celebrate small wins that build momentum',
  domain: 'habit-persistence',
  tags: ['celebration', 'wins', 'momentum'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('celebrateTinyWin'),
      parameters: z.object({
        win: z.string().describe('The small win'),
        theyreMinimizing: z.boolean().optional().describe('Are they downplaying it'),
        streakLength: z.number().optional().describe('Days in a row if applicable'),
      }),
      execute: async ({ win, theyreMinimizing, streakLength }) => {
        getLogger().info({ agentId: ctx.agentId, streakLength }, 'Celebrating tiny win');

        let response = '';

        if (theyreMinimizing) {
          response = `**Wait, don't skip past this.**\n\n`;
          response += `You just said: "${win}"\n\n`;
          response += `You're already moving to the next thing. Stop.\n\n`;
        } else {
          response = `**Tiny Win Alert!**\n\n`;
          response += `${win}\n\n`;
        }

        response += `Tiny wins are how big changes happen. Not dramatic moments—consistent small ones.\n\n`;

        if (streakLength && streakLength > 1) {
          response += `**${streakLength} days in a row!**\n`;
          response += `That's not a streak—that's identity forming. You're becoming someone who does this.\n\n`;
        }

        response += `**Why this matters:**\n`;
        response += `- You showed up. Many people don't.\n`;
        response += `- This builds the neural pathway for next time.\n`;
        response += `- Momentum is made of moments exactly like this.\n`;
        response += `- Your future self thanks your present self.\n\n`;

        response += `Feel it. Acknowledge it. Then keep going.\n\n`;

        response += `What made this win possible?`;

        return response;
      },
    });
  },
};

// ============================================================================
// COACHING TOOLS
// ============================================================================

const identifyResistanceDef: ToolDefinition = {
  id: 'identifyResistance',
  name: 'Identify Resistance',
  description: 'Explore what is driving resistance to change',
  domain: 'habit-persistence',
  tags: ['resistance', 'insight', 'change'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('identifyResistance'),
      parameters: z.object({
        wantedChange: z.string().describe('What change they want'),
        resistanceLooksLike: z.string().describe('How the resistance shows up'),
        hypothesis: z.string().optional().describe('Any guess about what is underneath'),
      }),
      execute: async ({ wantedChange, resistanceLooksLike, hypothesis }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Identifying resistance');

        let response = `**Understanding Your Resistance**\n\n`;
        response += `You want: ${wantedChange}\n`;
        response += `But something resists: ${resistanceLooksLike}\n\n`;

        response += `Resistance isn't random. It's usually protective.\n\n`;

        response += `**Common sources of resistance:**\n`;
        response += `- **Fear of failure**: What if I try and can't do it?\n`;
        response += `- **Fear of success**: What changes if this actually works?\n`;
        response += `- **Identity protection**: This isn't who I am (yet)\n`;
        response += `- **Competing commitments**: Part of me wants something else\n`;
        response += `- **Old stories**: Beliefs from the past that aren't serving now\n`;
        response += `- **Grief for the old way**: Change means something ends\n\n`;

        if (hypothesis) {
          response += `**Your hypothesis:** ${hypothesis}\n`;
          response += `Trust your instincts here. What does that tell you?\n\n`;
        }

        response += `**Questions to explore:**\n`;
        response += `- What am I afraid would happen if I succeeded?\n`;
        response += `- What might I have to give up?\n`;
        response += `- What does the resistant part of me need?\n`;
        response += `- When does resistance show up strongest?\n\n`;

        response += `Resistance isn't the enemy. It's information. What's it telling you?`;

        return response;
      },
    });
  },
};

const findSustainablePaceDef: ToolDefinition = {
  id: 'findSustainablePace',
  name: 'Find Sustainable Pace',
  description: 'Help find a pace of change that can actually be maintained',
  domain: 'habit-persistence',
  tags: ['sustainable', 'pace', 'realistic'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findSustainablePace'),
      parameters: z.object({
        goal: z.string().describe('What they are working toward'),
        currentPace: z
          .enum(['too-fast', 'too-slow', 'inconsistent', 'unsure'])
          .describe('Current pace assessment'),
        energyLevel: z
          .enum(['depleted', 'low', 'moderate', 'high'])
          .optional()
          .describe('Current energy'),
      }),
      execute: async ({ goal, currentPace, energyLevel }) => {
        getLogger().info({ agentId: ctx.agentId, currentPace }, 'Finding sustainable pace');

        let response = `**Finding Your Sustainable Pace**\n\n`;
        response += `Goal: ${goal}\n`;
        response += `Current pace feels: ${currentPace}\n`;
        if (energyLevel) {
          response += `Energy level: ${energyLevel}\n`;
        }
        response += '\n';

        response += `**The truth about sustainable change:**\n`;
        response += `- Fast change rarely lasts\n`;
        response += `- Slow change feels frustrating but compounds\n`;
        response += `- The right pace is one you can maintain when life gets hard\n\n`;

        const paceGuidance = {
          'too-fast': `**If you're going too fast:**\n- What's driving the urgency?\n- What would happen if you went 20% slower?\n- Are you building a habit or sprinting to a finish line?\n\nSustainable > fast. Every time.`,
          'too-slow': `**If you're going too slow:**\n- Is this actually too slow, or just slower than you wish?\n- Are you avoiding something by going slow?\n- What would 10% faster look like?\n\nSlow is fine. Stuck is different.`,
          inconsistent: `**If you're inconsistent:**\n- What triggers the on days? The off days?\n- Is your bar too high for hard days?\n- What's the minimum that still counts?\n\nConsistency beats intensity. Every time.`,
          unsure: `**If you're unsure:**\n- How does your body feel at this pace?\n- Can you imagine doing this for a year?\n- What would need to change to make it sustainable?\n\nYour body knows. Listen to it.`,
        };

        response += paceGuidance[currentPace] + '\n\n';

        if (energyLevel === 'depleted' || energyLevel === 'low') {
          response += `**Given your energy level:**\n`;
          response += `This might not be the time to push. Rest is part of the process.\n`;
          response += `What's the minimum you can do to stay connected to this goal without depleting yourself further?\n\n`;
        }

        response += `What pace would you be proud to maintain for six months?`;

        return response;
      },
    });
  },
};

const behaviorArchitectureDef: ToolDefinition = {
  id: 'behaviorArchitecture',
  name: 'Behavior Architecture',
  description: 'Design the environment and systems to support behavior change',
  domain: 'habit-persistence',
  tags: ['environment', 'design', 'systems'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('behaviorArchitecture'),
      parameters: z.object({
        behavior: z.string().describe('The behavior to support'),
        currentObstacles: z.string().describe('What currently makes it hard'),
        environmentType: z
          .enum(['home', 'work', 'digital', 'social', 'mixed'])
          .describe('Where this happens'),
      }),
      execute: async ({ behavior, currentObstacles, environmentType }) => {
        getLogger().info({ agentId: ctx.agentId, environmentType }, 'Behavior architecture');

        let response = `**Behavior Architecture: ${behavior}**\n\n`;
        response += `Current obstacles: ${currentObstacles}\n\n`;

        response += `**The secret:** Make good behaviors easy. Make bad behaviors hard.\n\n`;

        response += `Willpower is limited. Environment is constant. Design the environment.\n\n`;

        response += `**Architecture principles:**\n\n`;
        response += `1. **Reduce friction** for desired behaviors\n`;
        response += `   - How many steps to start?\n`;
        response += `   - What can you prep in advance?\n`;
        response += `   - Can you make it obvious? (Visual cues)\n\n`;
        response += `2. **Add friction** to competing behaviors\n`;
        response += `   - What makes the unwanted behavior easy?\n`;
        response += `   - Can you add steps, distance, time?\n`;
        response += `   - Can you remove cues?\n\n`;
        response += `3. **Stack with existing habits**\n`;
        response += `   - What do you already do reliably?\n`;
        response += `   - Can the new behavior link to that?\n\n`;

        const environmentTips: Record<string, string> = {
          home: `**Home environment:**\n- Put tools where you'll see them\n- Remove temptations (out of sight, out of mind)\n- Create a dedicated space for the behavior\n- Use visual reminders`,
          work: `**Work environment:**\n- Block time on calendar (it's real when it's scheduled)\n- Batch related tasks\n- Control notifications\n- Tell colleagues what you're working on (accountability)`,
          digital: `**Digital environment:**\n- Use app blockers or limits\n- Curate feeds and notifications\n- Create separate profiles/spaces\n- Schedule digital activities`,
          social: `**Social environment:**\n- Find people who share the goal\n- Tell supportive people your intentions\n- Distance from sabotaging influences\n- Build accountability partnerships`,
          mixed: `**Multiple environments:**\n- Identify the hardest environment\n- Create bridges between contexts\n- Have mobile support (apps, reminders)\n- Build routines that travel with you`,
        };

        response += environmentTips[environmentType] + '\n\n';

        response += `What's one environmental change you could make today?`;

        return response;
      },
    });
  },
};

// ============================================================================
// CROSS-PERSONA INTELLIGENCE TOOLS
// ============================================================================

const surfacePatternInsightDef: ToolDefinition = {
  id: 'surfacePatternInsight',
  name: 'Surface Pattern Insight',
  description: 'Share a pattern insight Maya noticed with the team or user',
  domain: 'habit-persistence',
  tags: ['cross-persona', 'patterns', 'insights'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('surfacePatternInsight'),
      parameters: z.object({
        targetPersona: z
          .enum(['peter', 'jordan', 'nayan', 'ferni', 'all'])
          .describe('Which persona should receive this insight'),
        patternDescription: z.string().describe('The pattern Maya noticed'),
        significance: z.string().describe('Why this matters'),
        urgency: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
      }),
      execute: async ({ targetPersona, patternDescription, significance, urgency }) => {
        getLogger().info({ agentId: ctx.agentId, targetPersona }, 'Surfacing pattern insight');

        try {
          addCrossPersonaInsight(ctx.userId, {
            source: 'maya',
            target: targetPersona,
            priority: urgency as InsightPriority,
            content: `${patternDescription} | Context: ${significance}`,
            category: 'behavior_pattern',
            proactive: true,
            oneTime: false,
          });

          const targetName = targetPersona === 'all' ? 'the team' : targetPersona.charAt(0).toUpperCase() + targetPersona.slice(1);

          return `**Pattern Shared with ${targetName}**\n\nI've noted this pattern: "${patternDescription}"\n\n${targetPersona !== 'all' ? `${targetName} will have this context when you talk to them.` : 'The whole team will be aware of this.'}\n\nThis is how we work together—I notice the behaviors, and the team can support you from their expertise.`;
        } catch (error) {
          getLogger().error({ error }, 'Failed to share pattern insight');
          return "I made a note of this pattern. Let me keep an eye on it.";
        }
      },
    });
  },
};

const getTeamInsightsDef: ToolDefinition = {
  id: 'getTeamInsights',
  name: 'Get Team Insights for Maya',
  description: 'Retrieve insights from other team members relevant to habit coaching',
  domain: 'habit-persistence',
  tags: ['cross-persona', 'insights', 'team'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getTeamInsights'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info({ agentId: ctx.agentId }, 'Getting team insights for Maya');

        try {
          const insights = getInsightsForPersona(ctx.userId, 'maya');
          const patternInsight = getPatternToSurface(ctx.userId);

          let response = `**Team Intelligence for Your Session**\n\n`;

          if (insights.length === 0 && !patternInsight) {
            return "No specific insights from the team right now. Let's focus on what you're working on today.";
          }

          if (insights.length > 0) {
            response += `**From the team:**\n`;
            for (const item of insights.slice(0, 3)) {
              const sourceName = item.insight.sourcePersona.charAt(0).toUpperCase() + item.insight.sourcePersona.slice(1);
              response += `• ${sourceName}: ${item.insight.summary}\n`;
            }
            response += `\n`;
          }

          if (patternInsight) {
            response += `**Pattern I've noticed:**\n`;
            response += `${patternInsight.insight}\n`;
            if (patternInsight.gentleProbe) {
              response += `\n*${patternInsight.gentleProbe}*\n`;
            }
          }

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to get team insights');
          return "Let's focus on what's present for you today.";
        }
      },
    });
  },
};

const flagMilestoneForJordanDef: ToolDefinition = {
  id: 'flagMilestoneForJordan',
  name: 'Flag Milestone for Jordan',
  description: "Alert Jordan when a habit milestone is reached that's worth celebrating or turning into a bigger goal",
  domain: 'habit-persistence',
  tags: ['cross-persona', 'milestones', 'jordan'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('flagMilestoneForJordan'),
      parameters: z.object({
        milestone: z.string().describe('The milestone achieved'),
        habitName: z.string().describe('The habit that reached this milestone'),
        streakDays: z.number().optional().describe('Days in streak if applicable'),
        readyForBiggerGoal: z.boolean().describe('Is this person ready to expand this habit into a bigger goal?'),
        suggestion: z.string().optional().describe('What bigger goal might be right'),
      }),
      execute: async ({ milestone, habitName, streakDays, readyForBiggerGoal, suggestion }) => {
        getLogger().info({ agentId: ctx.agentId, milestone }, 'Flagging milestone for Jordan');

        try {
          let insightText = `Habit milestone: ${milestone} on "${habitName}"`;
          if (streakDays) {
            insightText += ` (${streakDays} day streak)`;
          }

          const context = readyForBiggerGoal
            ? `Maya thinks they're ready to level up. ${suggestion || 'This habit has momentum.'}`
            : `Worth celebrating, but pace is important. Don't push too fast.`;

          addCrossPersonaInsight(ctx.userId, {
            source: 'maya',
            target: 'jordan',
            content: `${insightText} | ${context}`,
            priority: readyForBiggerGoal ? 'high' : 'normal',
            category: 'milestone',
            proactive: true,
            oneTime: false,
          });

          let response = `**Milestone Shared with Jordan**\n\n`;
          response += `I've let Jordan know about your progress with ${habitName}.\n\n`;

          if (readyForBiggerGoal) {
            response += `I mentioned you might be ready to build on this momentum. `;
            response += `When you talk to Jordan about goals, they'll know you've got strong foundations here.\n\n`;
          } else {
            response += `I noted that you're building something real, but steady wins the race. `;
            response += `Jordan will know to celebrate without pushing.\n\n`;
          }

          response += `**This is how the team supports you** — your progress echoes across our conversations.`;

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to flag milestone for Jordan');
          return `I've noted your milestone with ${habitName}. Let's keep building on it.`;
        }
      },
    });
  },
};

const requestPeterAnalysisDef: ToolDefinition = {
  id: 'requestPeterAnalysis',
  name: 'Request Peter Analysis',
  description: 'Ask Peter to look into data that might explain a habit pattern',
  domain: 'habit-persistence',
  tags: ['cross-persona', 'data', 'peter'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('requestPeterAnalysis'),
      parameters: z.object({
        question: z.string().describe('What Maya wants Peter to investigate'),
        habitContext: z.string().describe('The habit-related context for this request'),
        suspicion: z.string().optional().describe('What Maya suspects might be going on'),
      }),
      execute: async ({ question, habitContext, suspicion }) => {
        getLogger().info({ agentId: ctx.agentId, question }, 'Requesting Peter analysis');

        try {
          const insightText = `Maya needs data analysis: "${question}"`;
          let contextText = `Habit context: ${habitContext}`;
          if (suspicion) {
            contextText += ` | Maya suspects: ${suspicion}`;
          }

          addCrossPersonaInsight(ctx.userId, {
            source: 'maya',
            target: 'peter',
            content: `${insightText} | ${contextText}`,
            priority: 'normal',
            category: 'data_request',
            proactive: true,
            oneTime: false,
          });

          let response = `**Analysis Request Sent to Peter**\n\n`;
          response += `I've asked Peter to look into: "${question}"\n\n`;
          response += `When you talk to Peter, he'll have this context from me about what's happening with your habits.\n\n`;

          if (suspicion) {
            response += `I shared my hunch (${suspicion}) so he knows where to dig.\n\n`;
          }

          response += `Sometimes the numbers reveal what the feelings can't see clearly. Let's see what Peter finds.`;

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to request Peter analysis');
          return "I'll keep this in mind. Let's explore it together.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const habitPersistenceTools: ToolDefinition[] = [
  // Core coaching tools
  gentleAccountabilityDef,
  compassionateResetDef,
  celebrateTinyWinDef,
  identifyResistanceDef,
  findSustainablePaceDef,
  behaviorArchitectureDef,
  // Cross-persona intelligence tools
  surfacePatternInsightDef,
  getTeamInsightsDef,
  flagMilestoneForJordanDef,
  requestPeterAnalysisDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'habit-persistence',
  habitPersistenceTools
);

export default getToolDefinitions;
