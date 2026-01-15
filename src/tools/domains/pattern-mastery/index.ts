/**
 * Pattern Mastery Domain Tools (Peter John's Specialty)
 *
 * Superhuman pattern recognition, cross-domain connections, and data insights.
 * Peter's "Better Than Human" capability: seeing patterns humans miss.
 *
 * DOMAIN: pattern-mastery
 * TOOLS:
 *   Patterns: discoverPattern, crossDomainConnection, historicalParallel
 *   Insights: dataStorytelling, counterIntuitiveInsight, patternPrediction
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
} from '../../../services/cross-persona/cross-persona-insights.js';

// Pattern recognition superhuman services
import { getPatternToSurface } from '../../../services/superhuman/pattern-mirror.js';
import { loadUserPatterns } from '../../../services/superhuman/predictive-coaching.js';
// ============================================================================
// PATTERN DISCOVERY TOOLS
// ============================================================================

const discoverPatternDef: ToolDefinition = {
  id: 'discoverPattern',
  name: 'Discover Pattern',
  description: 'Find hidden patterns in user behavior or data',
  domain: 'pattern-mastery',
  tags: ['patterns', 'discovery', 'insight'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('discoverPattern'),
      parameters: z.object({
        dataType: z
          .enum(['spending', 'behavior', 'mood', 'habits', 'life-events', 'relationships', 'other'])
          .describe('Type of data showing the pattern'),
        observation: z.string().describe('What pattern has been observed'),
        timeframe: z.string().optional().describe('Over what period'),
      }),
      execute: async ({ dataType, observation, timeframe }) => {
        getLogger().info({ agentId: ctx.agentId, dataType }, 'Discovering pattern');

        let response = `**Pattern Discovered**\n\n`;
        response += `I've been watching your ${dataType}${timeframe ? ` over ${timeframe}` : ''}, and here's what I see:\n\n`;
        response += `${observation}\n\n`;

        response += `**Why this matters:**\n`;
        response += `Patterns aren't random—they're trying to tell us something. This one suggests:\n`;
        response += `- There's an underlying driver we should explore\n`;
        response += `- Your behavior is more consistent than you might think\n`;
        response += `- This could be leveraged or redirected depending on what you want\n\n`;

        response += `**Questions to explore:**\n`;
        response += `- Does this pattern serve you?\n`;
        response += `- What triggers it?\n`;
        response += `- What would happen if we changed one variable?\n\n`;

        response += `What's your reaction to seeing this pattern?`;

        return response;
      },
    });
  },
};

const crossDomainConnectionDef: ToolDefinition = {
  id: 'crossDomainConnection',
  name: 'Cross-Domain Connection',
  description: 'Find unexpected connections between different life areas',
  domain: 'pattern-mastery',
  tags: ['patterns', 'connections', 'insight'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('crossDomainConnection'),
      parameters: z.object({
        domainA: z.string().describe('First area of life'),
        domainB: z.string().describe('Second, seemingly unrelated area'),
        connection: z.string().describe('The connection discovered'),
      }),
      execute: async ({ domainA, domainB, connection }) => {
        getLogger().info({ agentId: ctx.agentId, domainA, domainB }, 'Cross-domain connection');

        let response = `**Unexpected Connection**\n\n`;
        response += `Here's something fascinating: your ${domainA} and your ${domainB} are connected.\n\n`;
        response += `${connection}\n\n`;

        response += `**Cross-domain patterns matter because:**\n`;
        response += `- What seems like separate problems often share a root cause\n`;
        response += `- Fixing one area can unexpectedly improve another\n`;
        response += `- Understanding these links gives you leverage points\n\n`;

        response += `I've seen this pattern before in others—${domainA} and ${domainB} are more connected than people realize.\n\n`;

        response += `What do you think is driving this connection?`;

        return response;
      },
    });
  },
};

const historicalParallelDef: ToolDefinition = {
  id: 'historicalParallel',
  name: 'Historical Parallel',
  description: 'Draw insights from historical patterns and precedents',
  domain: 'pattern-mastery',
  tags: ['patterns', 'history', 'perspective'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('historicalParallel'),
      parameters: z.object({
        currentSituation: z.string().describe('What the user is facing'),
        parallel: z.string().describe('Historical parallel or precedent'),
        lesson: z.string().describe('What history teaches about this'),
      }),
      execute: async ({ currentSituation, parallel, lesson }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Historical parallel');

        let response = `**Historical Perspective**\n\n`;
        response += `What you're facing with ${currentSituation} has happened before.\n\n`;
        response += `${parallel}\n\n`;

        response += `**What history teaches:**\n`;
        response += `${lesson}\n\n`;

        response += `The pattern repeats because human nature doesn't change much. Markets, relationships, life transitions—they rhyme across time.\n\n`;

        response += `Does knowing this has happened before change how you see it?`;

        return response;
      },
    });
  },
};

// ============================================================================
// INSIGHT TOOLS
// ============================================================================

const dataStorytellingDef: ToolDefinition = {
  id: 'dataStorytelling',
  name: 'Data Storytelling',
  description: 'Turn numbers into meaningful narratives',
  domain: 'pattern-mastery',
  tags: ['data', 'storytelling', 'insight'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('dataStorytelling'),
      parameters: z.object({
        dataPoint: z.string().describe('The data or number'),
        humanMeaning: z.string().describe('What this means in human terms'),
        trajectory: z.enum(['improving', 'declining', 'stable', 'volatile']).optional(),
      }),
      execute: async ({ dataPoint, humanMeaning, trajectory }) => {
        getLogger().info({ agentId: ctx.agentId, trajectory }, 'Data storytelling');

        let response = `**The Story in the Numbers**\n\n`;
        response += `The data says: ${dataPoint}\n\n`;
        response += `But here's what that actually means: ${humanMeaning}\n\n`;

        if (trajectory) {
          const trajectoryInsights = {
            improving: `The trajectory is upward. This isn't luck—it's the compound effect of decisions you've made. Keep going.`,
            declining: `The trend is downward. But every trend is reversible if we catch it early enough. We caught it.`,
            stable: `Stability isn't boring—it's the foundation everything else gets built on. This is solid ground.`,
            volatile: `The volatility tells its own story—there's something driving these swings. Finding that driver is the key.`,
          };
          response += trajectoryInsights[trajectory] + '\n\n';
        }

        response += `Numbers are just stories waiting to be told. What story does this tell about your life?`;

        return response;
      },
    });
  },
};

const counterIntuitiveInsightDef: ToolDefinition = {
  id: 'counterIntuitiveInsight',
  name: 'Counter-Intuitive Insight',
  description: 'Reveal surprising truths that defy conventional wisdom',
  domain: 'pattern-mastery',
  tags: ['insight', 'wisdom', 'surprise'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('counterIntuitiveInsight'),
      parameters: z.object({
        conventionalWisdom: z.string().describe('What people typically believe'),
        actualTruth: z.string().describe('What the data actually shows'),
        topic: z.string().describe('Topic area'),
      }),
      execute: async ({ conventionalWisdom, actualTruth, topic }) => {
        getLogger().info({ agentId: ctx.agentId, topic }, 'Counter-intuitive insight');

        let response = `**Here's Something Counter-Intuitive**\n\n`;
        response += `About ${topic}, most people think: ${conventionalWisdom}\n\n`;
        response += `But the data tells a different story: ${actualTruth}\n\n`;

        response += `**Why conventional wisdom gets it wrong:**\n`;
        response += `- Our intuitions evolved for different environments\n`;
        response += `- Popular beliefs spread because they feel right, not because they are\n`;
        response += `- The data doesn't care about our assumptions\n\n`;

        response += `How does this change your thinking about ${topic}?`;

        return response;
      },
    });
  },
};

const patternPredictionDef: ToolDefinition = {
  id: 'patternPrediction',
  name: 'Pattern Prediction',
  description: 'Use pattern recognition to anticipate future outcomes',
  domain: 'pattern-mastery',
  tags: ['patterns', 'prediction', 'future'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('patternPrediction'),
      parameters: z.object({
        pattern: z.string().describe('The pattern observed'),
        prediction: z.string().describe('What this pattern suggests will happen'),
        confidence: z.enum(['high', 'medium', 'speculative']).describe('Confidence level'),
        caveat: z.string().optional().describe('What could change this'),
      }),
      execute: async ({ pattern, prediction, confidence, caveat }) => {
        getLogger().info({ agentId: ctx.agentId, confidence }, 'Pattern prediction');

        let response = `**Pattern-Based Outlook**\n\n`;
        response += `Based on the pattern I'm seeing: ${pattern}\n\n`;

        const confidenceFraming = {
          high: `I'm quite confident about this: ${prediction}\n\nThis pattern has been consistent, and the signals are clear.`,
          medium: `My read is: ${prediction}\n\nThe pattern supports this, though there are variables at play.`,
          speculative: `Speculation mode: ${prediction}\n\nThis is based on pattern recognition, but I'm holding it loosely.`,
        };

        response += confidenceFraming[confidence] + '\n\n';

        if (caveat) {
          response += `**What could change this:** ${caveat}\n\n`;
        }

        response += `Patterns help us see probable futures, not certain ones. What's your instinct telling you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// CROSS-PERSONA INTELLIGENCE TOOLS
// ============================================================================

const sharePatternWithTeamDef: ToolDefinition = {
  id: 'sharePatternWithTeam',
  name: 'Share Pattern with Team',
  description: 'Share a discovered pattern with other team members who can act on it',
  domain: 'pattern-mastery',
  tags: ['cross-persona', 'patterns', 'team'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('sharePatternWithTeam'),
      parameters: z.object({
        targetPersona: z
          .enum(['maya', 'jordan', 'ferni', 'nayan', 'all'])
          .describe('Who should know about this pattern'),
        patternType: z
          .enum(['behavioral', 'financial', 'emotional', 'relational', 'cyclical'])
          .describe('Type of pattern'),
        pattern: z.string().describe('The pattern discovered'),
        implication: z.string().describe('What this pattern suggests'),
        actionable: z.boolean().describe('Can something be done about this?'),
      }),
      execute: async ({ targetPersona, patternType, pattern, implication, actionable }) => {
        getLogger().info(
          { agentId: ctx.agentId, targetPersona, patternType },
          'Sharing pattern with team'
        );

        try {
          addCrossPersonaInsight(ctx.userId, {
            source: 'peter',
            target: targetPersona,
            content: `Pattern (${patternType}): ${pattern} | Implication: ${implication} | Actionable: ${actionable}`,
            priority: actionable ? 'high' : 'normal',
            category: 'pattern_insight',
            proactive: true,
            oneTime: false,
          });

          const targetName =
            targetPersona === 'all'
              ? 'the team'
              : targetPersona.charAt(0).toUpperCase() + targetPersona.slice(1);

          let response = `**Pattern Intelligence Shared with ${targetName}**\n\n`;
          response += `I've briefed ${targetName} on this ${patternType} pattern.\n\n`;

          if (targetPersona === 'maya') {
            response += `Maya can help build habits to either leverage or interrupt this pattern.`;
          } else if (targetPersona === 'jordan') {
            response += `Jordan can factor this pattern into goal planning and milestone setting.`;
          } else if (targetPersona === 'ferni') {
            response += `Ferni will have this context for emotional support conversations.`;
          } else if (targetPersona === 'nayan') {
            response += `Nayan can explore what this pattern reveals about your values and life direction.`;
          }

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to share pattern with team');
          return "I've noted this pattern. It's part of my ongoing analysis.";
        }
      },
    });
  },
};

const surfacePatternMirrorInsightDef: ToolDefinition = {
  id: 'surfacePatternMirrorInsight',
  name: 'Surface Pattern Mirror Insight',
  description: 'Surface an insight from the pattern mirror superhuman service',
  domain: 'pattern-mastery',
  tags: ['patterns', 'superhuman', 'insight'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('surfacePatternMirrorInsight'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info({ agentId: ctx.agentId }, 'Surfacing pattern mirror insight');

        try {
          const patternInsight = getPatternToSurface(ctx.userId);
          const userPatterns = await loadUserPatterns(ctx.userId);

          if (!patternInsight && userPatterns.length === 0) {
            return "I'm still gathering data to identify meaningful patterns. The more we talk, the more patterns emerge.";
          }

          let response = `**Pattern Recognition Insight**\n\n`;

          if (patternInsight) {
            response += `${patternInsight.insight}\n\n`;
            if (patternInsight.gentleProbe) {
              response += `*${patternInsight.gentleProbe}*\n\n`;
            }
          }

          if (userPatterns.length > 0) {
            response += `**Patterns I'm Tracking:**\n`;
            for (const pattern of userPatterns.slice(0, 3)) {
              response += `• ${pattern.trigger} → ${pattern.outcome} (seen ${pattern.frequency}x)\n`;
            }
          }

          response += `\nPatterns are mirrors—they show us what we might not see ourselves. What resonates?`;

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to surface pattern insight');
          return "My pattern recognition is gathering data. I'll share insights as they emerge.";
        }
      },
    });
  },
};

const requestMayaHabitInterventionDef: ToolDefinition = {
  id: 'requestMayaHabitIntervention',
  name: 'Request Maya Habit Intervention',
  description: 'Request Maya to design a habit intervention based on a pattern Peter discovered',
  domain: 'pattern-mastery',
  tags: ['cross-persona', 'habits', 'maya'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('requestMayaHabitIntervention'),
      parameters: z.object({
        pattern: z.string().describe('The pattern that needs a habit intervention'),
        desiredOutcome: z.string().describe('What outcome would the habit create'),
        patternStrength: z
          .enum(['weak', 'moderate', 'strong'])
          .describe('How entrenched is this pattern'),
      }),
      execute: async ({ pattern, desiredOutcome, patternStrength }) => {
        const goal = desiredOutcome || 'Transform this pattern into something healthier';
        const strength = patternStrength || 'forming';

        getLogger().info(
          { agentId: ctx.agentId, pattern, patternStrength: strength },
          'Requesting Maya habit intervention'
        );

        try {
          addCrossPersonaInsight(ctx.userId, {
            source: 'peter',
            target: 'maya',
            content: `Pattern needs habit intervention: "${pattern}" | Desired outcome: ${goal} | Pattern strength: ${strength}`,
            priority: strength === 'strong' ? 'high' : 'normal',
            category: 'habit_request',
            proactive: true,
            oneTime: false,
          });

          let response = `**Habit Intervention Requested from Maya**\n\n`;
          response += `I've asked Maya to design a habit intervention for this pattern.\n\n`;
          response += `**Pattern:** ${pattern}\n`;
          response += `**Goal:** ${goal}\n`;
          response += `**Challenge:** ${strength === 'strong' ? 'This is an entrenched pattern—needs gentle, sustainable approach' : 'Pattern is still forming—good timing for intervention'}\n\n`;
          response += `Maya will design something tiny and doable. Patterns don't change overnight, but small consistent actions compound.`;

          return response;
        } catch (error) {
          getLogger().error({ error }, 'Failed to request Maya intervention');
          return "I've noted this pattern. Let's think about what habits might help.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const patternMasteryTools: ToolDefinition[] = [
  discoverPatternDef,
  crossDomainConnectionDef,
  historicalParallelDef,
  dataStorytellingDef,
  counterIntuitiveInsightDef,
  patternPredictionDef,
  // Cross-persona intelligence
  sharePatternWithTeamDef,
  surfacePatternMirrorInsightDef,
  requestMayaHabitInterventionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'pattern-mastery',
  patternMasteryTools
);

export default getToolDefinitions;
