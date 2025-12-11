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
      description:
        'Identify and explain a hidden pattern in user behavior, spending, habits, or life.',
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
      description: 'Reveal surprising connections between seemingly unrelated areas of life.',
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
      description: 'Provide perspective by showing historical parallels to current situations.',
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
      description: 'Transform data and numbers into a compelling human story.',
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
      description: 'Share a counter-intuitive insight that challenges conventional thinking.',
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
      description: 'Make informed predictions based on observed patterns.',
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
// DOMAIN TOOLS COLLECTION
// ============================================================================

const patternMasteryTools: ToolDefinition[] = [
  discoverPatternDef,
  crossDomainConnectionDef,
  historicalParallelDef,
  dataStorytellingDef,
  counterIntuitiveInsightDef,
  patternPredictionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'pattern-mastery',
  patternMasteryTools
);

export default getToolDefinitions;
