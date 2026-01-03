/**
 * Peter's Superhuman Analytics Domain
 *
 * "Better Than Human" pattern recognition and analytics capabilities.
 * These tools provide cross-domain insights no human could maintain.
 *
 * DOMAIN: peter-analytics
 * TOOLS:
 *   BlindSpotMirror: revealBlindSpot - Show patterns they're avoiding
 *   CounterfactualSim: simulateCounterfactual - "What if you had done X?"
 *   PatternPrediction: predictPattern - Where patterns are heading
 *   DecisionQuality: scoreDecision - Rate decision quality over time
 *   CorrelationFinder: findCorrelation - Cross-domain correlations
 *   AnomalyDetector: detectAnomaly - Unusual patterns worth noting
 *   InsightArchive: archiveInsight - Store and retrieve insights
 *
 * @module tools/domains/peter-analytics
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import superhuman services
import {
  recordBlindSpot,
  getBlindSpots,
  recordCounterfactual,
  getCounterfactuals,
  recordPatternPrediction,
  getPatternPredictions,
  recordDecisionScore,
  getDecisionScores,
  recordCorrelation,
  getCorrelations,
  recordAnomaly,
  getAnomalies,
  recordInsight,
  getInsights,
} from '../../../services/superhuman/peter-analytics-services.js';

const log = createLogger({ module: 'tools:peter-analytics' });

// ============================================================================
// BLIND SPOT MIRROR - Show patterns they're avoiding
// ============================================================================

const revealBlindSpotDef: ToolDefinition = {
  id: 'revealBlindSpot',
  name: 'Reveal Blind Spot',
  description:
    'Surface patterns they may be avoiding or not seeing. Hold up a mirror to what they can\'t see themselves.',
  domain: 'peter-analytics',
  tags: ['patterns', 'blind-spots', 'insight', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('revealBlindSpot'),
      parameters: z.object({
        domain: z
          .enum(['spending', 'habits', 'relationships', 'time', 'health', 'career', 'general'])
          .describe('Life domain'),
        observation: z.string().optional().describe('What pattern you\'ve noticed they\'re avoiding'),
        recordNew: z.boolean().default(false).describe('Record a new blind spot observation'),
        viewBlindSpots: z.boolean().default(false).describe('View known blind spots'),
      }),
      execute: async ({ domain, observation, recordNew, viewBlindSpots }) => {
        const userId = ctx.userId || 'anonymous';
        log.info({ userId, domain, viewBlindSpots }, 'Revealing blind spot');

        if (viewBlindSpots) {
          const blindSpots = await getBlindSpots(userId, domain);
          if (blindSpots.length === 0) {
            return `No blind spots identified in ${domain} yet. Keep sharing - I'll notice patterns you can't.`;
          }

          let response = `**Patterns You Might Not See (${domain}):**\n\n`;
          for (const bs of blindSpots.slice(0, 5)) {
            response += `🔍 **${bs.observation}**\n`;
            response += `   Domain: ${bs.domain} | Noted: ${new Date(bs.recordedAt).toLocaleDateString()}\n\n`;
          }
          return response;
        }

        if (recordNew && observation) {
          await recordBlindSpot(userId, {
            domain,
            observation,
            recordedAt: new Date().toISOString(),
          });
          return `**Blind Spot Noted**\n\nDomain: ${domain}\nObservation: ${observation}`;
        }

        return `I'm watching for patterns you might not see in your ${domain} data.`;
      },
    });
  },
};

// ============================================================================
// COUNTERFACTUAL SIMULATOR
// ============================================================================

const simulateCounterfactualDef: ToolDefinition = {
  id: 'simulateCounterfactual',
  name: 'Simulate Counterfactual',
  description: 'Explore "what if" scenarios based on past decisions.',
  domain: 'peter-analytics',
  tags: ['decisions', 'counterfactual', 'learning', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('simulateCounterfactual'),
      parameters: z.object({
        originalDecision: z.string().describe('The decision that was made'),
        alternativePath: z.string().describe('What they could have done instead'),
        domain: z.string().optional().describe('Life domain'),
        outcome: z.string().optional().describe('What likely would have happened'),
        lesson: z.string().optional().describe('What this teaches'),
        viewCounterfactuals: z.boolean().default(false).describe('View past counterfactuals'),
      }),
      execute: async ({ originalDecision, alternativePath, domain, outcome, lesson, viewCounterfactuals }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewCounterfactuals) {
          const counterfactuals = await getCounterfactuals(userId);
          if (counterfactuals.length === 0) {
            return `No counterfactual analyses recorded yet.`;
          }
          let response = `**Roads Not Taken:**\n\n`;
          for (const cf of counterfactuals.slice(0, 5)) {
            response += `📍 **Decision:** ${cf.originalDecision}\n`;
            response += `   Alternative: ${cf.alternativePath}\n\n`;
          }
          return response;
        }

        await recordCounterfactual(userId, {
          originalDecision,
          alternativePath,
          domain: domain || 'general',
          outcome,
          lesson,
          recordedAt: new Date().toISOString(),
        });

        return `**Counterfactual Analysis**\n\n📍 **You chose:** ${originalDecision}\n🔀 **Alternative:** ${alternativePath}`;
      },
    });
  },
};

// ============================================================================
// PATTERN PREDICTION
// ============================================================================

const predictPatternDef: ToolDefinition = {
  id: 'predictPattern',
  name: 'Predict Pattern',
  description: 'Project where current patterns are heading.',
  domain: 'peter-analytics',
  tags: ['patterns', 'prediction', 'trajectory', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('predictPattern'),
      parameters: z.object({
        pattern: z.string().describe('The pattern being tracked'),
        domain: z.enum(['spending', 'habits', 'relationships', 'time', 'health', 'career', 'general']).describe('Life domain'),
        currentTrajectory: z.enum(['improving', 'declining', 'stable', 'volatile']).describe('Current direction'),
        prediction: z.string().optional().describe('Where this is heading'),
        timeframe: z.string().optional().describe('How long until prediction'),
        viewPredictions: z.boolean().default(false).describe('View past predictions'),
      }),
      execute: async ({ pattern, domain, currentTrajectory, prediction, timeframe, viewPredictions }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewPredictions) {
          const predictions = await getPatternPredictions(userId, domain);
          if (predictions.length === 0) {
            return `No pattern predictions recorded for ${domain} yet.`;
          }
          let response = `**Pattern Trajectories (${domain}):**\n\n`;
          for (const p of predictions.slice(0, 5)) {
            response += `📈 **${p.pattern}** - ${p.currentTrajectory}\n`;
          }
          return response;
        }

        await recordPatternPrediction(userId, {
          pattern,
          domain,
          currentTrajectory,
          prediction,
          timeframe,
          recordedAt: new Date().toISOString(),
        });

        return `**Pattern Trajectory Noted**\n\n**Pattern:** ${pattern}\n**Trajectory:** ${currentTrajectory}`;
      },
    });
  },
};

// ============================================================================
// DECISION QUALITY
// ============================================================================

const scoreDecisionDef: ToolDefinition = {
  id: 'scoreDecision',
  name: 'Score Decision',
  description: 'Rate decision quality over time.',
  domain: 'peter-analytics',
  tags: ['decisions', 'quality', 'learning', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('scoreDecision'),
      parameters: z.object({
        decision: z.string().describe('The decision made'),
        domain: z.string().describe('Life domain'),
        outcome: z.enum(['great', 'good', 'neutral', 'poor', 'bad']).describe('How it turned out'),
        processQuality: z.enum(['thoughtful', 'rushed', 'emotional', 'analytical', 'gut']).optional().describe('How decision was made'),
        lesson: z.string().optional().describe('What you learned'),
        viewScores: z.boolean().default(false).describe('View decision scores'),
      }),
      execute: async ({ decision, domain, outcome, processQuality, lesson, viewScores }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewScores) {
          const scores = await getDecisionScores(userId, domain);
          if (scores.length === 0) {
            return `No decision scores recorded yet.`;
          }
          let response = `**Your Decision Quality:**\n\n`;
          for (const s of scores.slice(0, 5)) {
            const emoji = s.outcome === 'great' || s.outcome === 'good' ? '✅' : '❌';
            response += `${emoji} ${s.decision} (${s.outcome})\n`;
          }
          return response;
        }

        await recordDecisionScore(userId, {
          decision,
          domain,
          outcome,
          processQuality,
          lesson,
          recordedAt: new Date().toISOString(),
        });

        return `**Decision Scored**\n\n**Decision:** ${decision}\n**Outcome:** ${outcome}`;
      },
    });
  },
};

// ============================================================================
// CORRELATION FINDER
// ============================================================================

const findCorrelationDef: ToolDefinition = {
  id: 'findCorrelation',
  name: 'Find Correlation',
  description: 'Discover correlations across different life domains.',
  domain: 'peter-analytics',
  tags: ['patterns', 'correlation', 'cross-domain', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findCorrelation'),
      parameters: z.object({
        factor1: z.string().describe('First factor'),
        factor2: z.string().describe('Second factor'),
        relationship: z.enum(['positive', 'negative', 'complex', 'unknown']).describe('How they relate'),
        strength: z.enum(['weak', 'moderate', 'strong']).optional().describe('Strength of correlation'),
        insight: z.string().optional().describe('What this means'),
        viewCorrelations: z.boolean().default(false).describe('View known correlations'),
      }),
      execute: async ({ factor1, factor2, relationship, strength, insight, viewCorrelations }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewCorrelations) {
          const correlations = await getCorrelations(userId);
          if (correlations.length === 0) {
            return `No correlations discovered yet.`;
          }
          let response = `**Cross-Domain Correlations:**\n\n`;
          for (const c of correlations.slice(0, 7)) {
            response += `📈 **${c.factor1}** ↔ **${c.factor2}**: ${c.relationship}\n`;
          }
          return response;
        }

        await recordCorrelation(userId, {
          factor1,
          factor2,
          relationship,
          strength,
          insight,
          recordedAt: new Date().toISOString(),
        });

        return `**Correlation Discovered**\n\n**${factor1}** ↔ **${factor2}**: ${relationship}`;
      },
    });
  },
};

// ============================================================================
// ANOMALY DETECTOR
// ============================================================================

const detectAnomalyDef: ToolDefinition = {
  id: 'detectAnomaly',
  name: 'Detect Anomaly',
  description: 'Flag unusual patterns that break from normal behavior.',
  domain: 'peter-analytics',
  tags: ['patterns', 'anomaly', 'alert', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('detectAnomaly'),
      parameters: z.object({
        anomaly: z.string().describe('What unusual pattern was detected'),
        domain: z.string().describe('Life domain'),
        severity: z.enum(['info', 'warning', 'alert']).describe('How significant'),
        interpretation: z.string().optional().describe('What this might mean'),
        viewAnomalies: z.boolean().default(false).describe('View detected anomalies'),
      }),
      execute: async ({ anomaly, domain, severity, interpretation, viewAnomalies }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewAnomalies) {
          const anomalies = await getAnomalies(userId);
          if (anomalies.length === 0) {
            return `No anomalies detected yet.`;
          }
          let response = `**Detected Anomalies:**\n\n`;
          for (const a of anomalies.slice(0, 7)) {
            const emoji = a.severity === 'alert' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';
            response += `${emoji} **${a.domain}:** ${a.anomaly}\n`;
          }
          return response;
        }

        await recordAnomaly(userId, {
          anomaly,
          domain,
          severity,
          interpretation,
          recordedAt: new Date().toISOString(),
        });

        return `**Anomaly Detected**\n\n**Severity:** ${severity}\n**Pattern:** ${anomaly}`;
      },
    });
  },
};

// ============================================================================
// INSIGHT ARCHIVE
// ============================================================================

const archiveInsightDef: ToolDefinition = {
  id: 'archiveInsight',
  name: 'Archive Insight',
  description: 'Store important insights for future reference.',
  domain: 'peter-analytics',
  tags: ['insights', 'archive', 'learning', 'peter-specialty'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('archiveInsight'),
      parameters: z.object({
        insight: z.string().describe('The insight to archive'),
        domain: z.string().describe('Life domain'),
        source: z.enum(['observation', 'analysis', 'experiment', 'reflection', 'conversation']).optional().describe('How discovered'),
        importance: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('How important'),
        viewInsights: z.boolean().default(false).describe('View archived insights'),
      }),
      execute: async ({ insight, domain, source, importance, viewInsights }) => {
        const userId = ctx.userId || 'anonymous';

        if (viewInsights) {
          const insights = await getInsights(userId, domain);
          if (insights.length === 0) {
            return `No insights archived yet.`;
          }
          let response = `**Archived Insights:**\n\n`;
          for (const i of insights.slice(0, 10)) {
            response += `📌 **${i.domain}:** ${i.insight}\n`;
          }
          return response;
        }

        await recordInsight(userId, {
          insight,
          domain,
          source: source || 'observation',
          importance: importance || 'medium',
          recordedAt: new Date().toISOString(),
        });

        return `**Insight Archived**\n\n**Insight:** ${insight}\n**Domain:** ${domain}`;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const peterAnalyticsTools: ToolDefinition[] = [
  revealBlindSpotDef,
  simulateCounterfactualDef,
  predictPatternDef,
  scoreDecisionDef,
  findCorrelationDef,
  detectAnomalyDef,
  archiveInsightDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'peter-analytics',
  peterAnalyticsTools
);

export default getToolDefinitions;
