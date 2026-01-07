/**
 * LLM-Callable Superhuman Communication Tools
 *
 * These tools let Alex actively USE her superhuman capabilities
 * when the user needs them, not just passively inject context.
 *
 * @module tools/domains/communication/superhuman-tools/llm-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../../utils/safe-logger.js';
import { getToolDescription } from '../../../utils/tool-descriptions.js';
import type { ToolDefinition, ToolContext, Tool } from '../../../registry/types.js';

// Import superhuman capabilities
import { communicationArchaeology } from './communication-archaeology.js';
import { relationshipTemperature } from './relationship-temperature.js';
import { unsaidWordsDetector } from './unsaid-words-detector.js';
import { receptionPredictor } from './reception-predictor.js';
import { apologyEffectiveness } from './apology-effectiveness.js';
import { conflictReplay } from './conflict-replay.js';
import { communicationDebt } from './communication-debt.js';
import { thirdPartyPerspective } from './third-party-perspective.js';
import { strategicSilence } from './strategic-silence.js';
import { unspokenNeeds } from './unspoken-needs.js';

const log = createLogger({ module: 'superhuman-llm-tools' });

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSuperhumanCommunicationTools() {
  return {
    // =========================================================================
    // 1. COMMUNICATION ARCHAEOLOGY
    // =========================================================================
    recallConversation: llm.tool({
      description:
        getToolDescription('recallConversation') ||
        'Recall past conversations the user mentioned about a specific person. ' +
        'Use when they ask "What did I tell you about..." or reference past discussions.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        contactName: z.string().describe('Name of the person they talked about'),
        topic: z.string().optional().describe('Optional topic to filter by'),
      }),
      execute: async ({ userId, contactName, topic }) => {
        log.debug({ userId, contactName, topic }, 'Recalling conversation history');

        const history = await communicationArchaeology.getHistory(userId, contactName, {
          limit: 5,
          topic,
        });

        if (history.length === 0) {
          return `I don't have any records of conversations you've mentioned about ${contactName}. ` +
            'Tell me about your conversations with them and I\'ll remember for next time.';
        }

        const profile = await communicationArchaeology.getProfile(userId, contactName);

        let response = `**What I Remember About ${contactName}:**\n\n`;

        for (const event of history.slice(0, 3)) {
          const daysAgo = Math.floor((Date.now() - event.occurredAt) / (24 * 60 * 60 * 1000));
          response += `• ${daysAgo} days ago: ${event.summary}\n`;
          if (event.lessonsLearned?.length) {
            response += `  → Lesson: ${event.lessonsLearned[0]}\n`;
          }
        }

        if (profile) {
          if (profile.effectiveApproaches.length > 0) {
            response += `\n**What works with ${contactName}:** ${profile.effectiveApproaches.slice(0, 2).join(', ')}`;
          }
          if (profile.ineffectiveApproaches.length > 0) {
            response += `\n**What doesn't work:** ${profile.ineffectiveApproaches.slice(0, 2).join(', ')}`;
          }
        }

        return response;
      },
    }),

    // =========================================================================
    // 2. RELATIONSHIP TEMPERATURE
    // =========================================================================
    checkRelationshipHealth: llm.tool({
      description:
        getToolDescription('checkRelationshipHealth') ||
        'Check the health/temperature of a relationship based on past mentions. ' +
        'Use when they ask "How are things with..." or you sense relationship drift.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        contactName: z.string().describe('Name of the person to check'),
      }),
      execute: async ({ userId, contactName }) => {
        log.debug({ userId, contactName }, 'Checking relationship temperature');

        const temp = await relationshipTemperature.get(userId, contactName);

        if (!temp) {
          return `I don't have enough data about your relationship with ${contactName} yet. ` +
            'Tell me about your recent interactions and I\'ll start tracking.';
        }

        const tempEmoji =
          temp.currentTemperature >= 70 ? '🔥' : temp.currentTemperature >= 40 ? '😐' : '🥶';
        const trendEmoji =
          temp.trend === 'warming' ? '📈' : temp.trend === 'cooling' ? '📉' : '➡️';

        let response = `**Relationship Temperature with ${contactName}:**\n\n`;
        response += `${tempEmoji} Current: ${temp.currentTemperature}° (${temp.trend} ${trendEmoji})\n`;
        response += `Last mentioned: ${temp.daysSinceLastInteraction} days ago\n`;

        if (temp.alerts.length > 0) {
          response += '\n**Things I\'ve Noticed:**\n';
          for (const alert of temp.alerts) {
            const emoji = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🟢';
            response += `${emoji} ${alert.message}\n`;
          }
        }

        return response;
      },
    }),

    getRelationshipsNeedingAttention: llm.tool({
      description:
        getToolDescription('getRelationshipsNeedingAttention') ||
        'Get a list of relationships that may need attention. ' +
        'Use when they want to know who they should check in with.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
      }),
      execute: async ({ userId }) => {
        log.debug({ userId }, 'Getting relationships needing attention');

        const relationships = await relationshipTemperature.getNeedingAttention(userId);

        if (relationships.length === 0) {
          return '✨ All your relationships look healthy! No one needs urgent attention right now.';
        }

        let response = '**Relationships That Could Use Attention:**\n\n';

        for (const rel of relationships.slice(0, 5)) {
          const emoji = rel.trend === 'cooling' ? '📉' : rel.daysSinceLastInteraction > 14 ? '⏰' : '👀';
          response += `${emoji} **${rel.contactName}**: ${rel.currentTemperature}° `;

          if (rel.alerts.length > 0) {
            response += `- ${rel.alerts[0].message}`;
          } else if (rel.daysSinceLastInteraction > 7) {
            response += `- ${rel.daysSinceLastInteraction} days since last mention`;
          }
          response += '\n';
        }

        return response;
      },
    }),

    // =========================================================================
    // 3. RECEPTION PREDICTOR
    // =========================================================================
    predictMessageReception: llm.tool({
      description:
        getToolDescription('predictMessageReception') ||
        'Predict how a message will be received by a specific person. ' +
        'Use when they\'re drafting something important and want feedback.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        message: z.string().describe('The message they want to send'),
        contactName: z.string().describe('Who they\'re sending it to'),
      }),
      execute: async ({ userId, message, contactName }) => {
        log.debug({ userId, contactName }, 'Predicting message reception');

        const prediction = await receptionPredictor.predict(userId, message, contactName);

        const receptionEmoji =
          prediction.predictedReception === 'positive'
            ? '✅'
            : prediction.predictedReception === 'defensive'
              ? '⚠️'
              : prediction.predictedReception === 'negative'
                ? '❌'
                : '😐';

        let response = `**Prediction for how ${contactName} might receive this:**\n\n`;
        response += `${receptionEmoji} **${prediction.predictedReception.toUpperCase()}** (${Math.round(prediction.confidence * 100)}% confidence)\n\n`;
        response += `${prediction.reasoning}\n`;

        if (prediction.warningFlags.length > 0) {
          response += '\n**Watch out for:**\n';
          for (const flag of prediction.warningFlags.slice(0, 3)) {
            response += `• ${flag}\n`;
          }
        }

        if (prediction.suggestedRewording) {
          response += `\n**Suggested rewording:**\n"${prediction.suggestedRewording}"`;
        }

        return response;
      },
    }),

    // =========================================================================
    // 4. APOLOGY COACH
    // =========================================================================
    getApologyAdvice: llm.tool({
      description:
        getToolDescription('getApologyAdvice') ||
        'Get advice on how to apologize to a specific person based on what\'s worked before. ' +
        'Use when they need to apologize and want to do it effectively.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        contactName: z.string().describe('Who they need to apologize to'),
        whatFor: z.string().optional().describe('What they\'re apologizing for'),
      }),
      execute: async ({ userId, contactName, whatFor }) => {
        log.debug({ userId, contactName }, 'Getting apology advice');

        const recommendation = await apologyEffectiveness.getRecommendation(userId, contactName);

        let response = recommendation;

        if (whatFor) {
          response += `\n\n**For apologizing about "${whatFor}":**\n`;
          response += 'Consider: What do they need to hear? What will you do differently?';
        }

        return response;
      },
    }),

    // =========================================================================
    // 5. CONFLICT ANALYZER
    // =========================================================================
    analyzeConflict: llm.tool({
      description:
        getToolDescription('analyzeConflict') ||
        'Analyze a conflict or argument for escalation patterns and alternatives. ' +
        'Use when they describe a fight or disagreement.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        description: z.string().describe('Description of the conflict'),
        thingsTheySaid: z.array(z.string()).optional().describe('Things the user said'),
        thingsOtherSaid: z.array(z.string()).optional().describe('Things the other person said'),
      }),
      execute: async ({ userId, description, thingsTheySaid, thingsOtherSaid }) => {
        log.debug({ userId }, 'Analyzing conflict');

        const analysis = conflictReplay.analyzeEscalation(description);

        let response = '**Conflict Analysis:**\n\n';
        response += `**Overall Risk:** ${analysis.overallRisk.toUpperCase()}\n\n`;

        if (analysis.escalationPoints.length > 0) {
          response += '**Escalation Triggers Found:**\n';
          for (const point of analysis.escalationPoints.slice(0, 3)) {
            response += `• "${point.phrase}" - ${point.trigger}\n`;
            response += `  💡 ${point.suggestion}\n`;
          }
        }

        if (analysis.deEscalationMoments.length > 0) {
          response += '\n**De-escalation Moments:**\n';
          for (const moment of analysis.deEscalationMoments) {
            response += `✅ "${moment.phrase}" - ${moment.effect}\n`;
          }
        }

        if (thingsTheySaid && thingsTheySaid.length > 0) {
          const reconstruction = conflictReplay.reconstruct(
            description,
            thingsTheySaid,
            thingsOtherSaid || []
          );

          response += `\n**Key Insight:** ${reconstruction.keyInsight}\n`;

          if (reconstruction.alternativeApproaches.length > 0) {
            response += '\n**Alternative Approaches:**\n';
            for (const alt of reconstruction.alternativeApproaches.slice(0, 2)) {
              response += `• ${alt}\n`;
            }
          }
        }

        return response;
      },
    }),

    // =========================================================================
    // 6. COMMUNICATION DEBT DASHBOARD
    // =========================================================================
    getCommunicationDebts: llm.tool({
      description:
        getToolDescription('getCommunicationDebts') ||
        'Get a dashboard of communication obligations - unreturned calls, unanswered texts, etc. ' +
        'Use when they want to know who they owe a response to.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
      }),
      execute: async ({ userId }) => {
        log.debug({ userId }, 'Getting communication debts');

        const dashboard = await communicationDebt.generateDashboard(userId);
        return dashboard;
      },
    }),

    markCommunicationDone: llm.tool({
      description:
        getToolDescription('markCommunicationDone') ||
        'Mark a communication debt as addressed. ' +
        'Use when they\'ve followed up with someone.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        contactName: z.string().describe('Who they followed up with'),
      }),
      execute: async ({ userId, contactName }) => {
        log.debug({ userId, contactName }, 'Marking communication done');

        const debts = await communicationDebt.getForContact(userId, contactName);

        if (debts.length === 0) {
          return `No outstanding communication items with ${contactName}. You're all caught up! ✅`;
        }

        // Mark all debts with this contact as addressed
        for (const debt of debts) {
          await communicationDebt.markAddressed(userId, debt.id);
        }

        return `✅ Great! Marked ${debts.length} item(s) with ${contactName} as done.`;
      },
    }),

    // =========================================================================
    // 7. THIRD-PARTY PERSPECTIVE
    // =========================================================================
    getObjectivePerspective: llm.tool({
      description:
        getToolDescription('getObjectivePerspective') ||
        'Get an objective, third-party perspective on a conflict or grievance. ' +
        'Use when they\'re venting and might benefit from another viewpoint.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        theirStory: z.string().describe('Their description of the situation'),
        otherPersonName: z.string().describe('Name of the other person involved'),
      }),
      execute: async ({ userId, theirStory, otherPersonName }) => {
        log.debug({ userId, otherPersonName }, 'Generating third-party perspective');

        const perspective = thirdPartyPerspective.generate(theirStory, otherPersonName);

        let response = '**A Neutral Observer Might See:**\n\n';
        response += perspective.neutralSummary + '\n\n';

        response += '**Valid Points on Your Side:**\n';
        for (const point of perspective.userValidPoints) {
          response += `✓ ${point}\n`;
        }

        response += `\n**What ${otherPersonName} Might Say:**\n`;
        for (const point of perspective.otherValidPoints) {
          response += `• ${point}\n`;
        }

        if (perspective.blindSpots.length > 0) {
          response += '\n**Questions Worth Considering:**\n';
          for (const spot of perspective.blindSpots) {
            response += `🤔 ${spot}\n`;
          }
        }

        response += `\n**Path Forward:** ${perspective.pathForward}`;

        return response;
      },
    }),

    // =========================================================================
    // 8. STRATEGIC SILENCE
    // =========================================================================
    shouldISendThis: llm.tool({
      description:
        getToolDescription('shouldISendThis') ||
        'Get advice on whether to send a message now or wait. ' +
        'Use when they\'re emotional or the situation is sensitive.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        situation: z.string().describe('Description of the situation'),
        contactName: z.string().optional().describe('Who they want to message'),
      }),
      execute: async ({ userId, situation, contactName }) => {
        log.debug({ userId, contactName }, 'Getting send timing advice');

        const recommendation = await strategicSilence.getRecommendation(
          userId,
          situation,
          contactName
        );

        const emoji =
          recommendation.recommendation === 'respond_now'
            ? '✅'
            : recommendation.recommendation === 'wait'
              ? '⏸️'
              : '❌';

        let response = `${emoji} **Recommendation: ${recommendation.recommendation.replace('_', ' ').toUpperCase()}**\n\n`;
        response += `${recommendation.reason}\n`;

        if (recommendation.suggestedDelay) {
          response += `\n⏰ Suggested wait time: ${recommendation.suggestedDelay} hours`;
        }

        response += `\n\nConfidence: ${Math.round(recommendation.confidence * 100)}%`;

        return response;
      },
    }),

    holdMessageForLater: llm.tool({
      description:
        getToolDescription('holdMessageForLater') ||
        'Hold a message for review later instead of sending now. ' +
        'Use when they want to cool off before sending.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        message: z.string().describe('The message to hold'),
        contactName: z.string().describe('Who it\'s for'),
        holdHours: z.number().optional().default(24).describe('How many hours to hold (default 24)'),
      }),
      execute: async ({ userId, message, contactName, holdHours }) => {
        log.debug({ userId, contactName, holdHours }, 'Holding message');

        const held = strategicSilence.holdMessage(userId, contactName, message, holdHours || 24);

        const releaseTime = new Date(held.releaseAt);
        const timeStr = releaseTime.toLocaleString('en-US', {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        });

        return `⏸️ **Message Held**

I've saved your message to ${contactName}. I'll remind you about it ${timeStr}.

When I remind you, you can:
• Send it as-is
• Edit it with fresh eyes
• Decide it's better left unsent

Sometimes the best messages are the ones we don't send. 💭`;
      },
    }),

    // =========================================================================
    // 9. UNSPOKEN NEEDS TRANSLATOR
    // =========================================================================
    translateMyNeed: llm.tool({
      description:
        getToolDescription('translateMyNeed') ||
        'Translate a complaint into the underlying need. ' +
        'Use when they\'re complaining and might benefit from understanding what they really want.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
        complaint: z.string().describe('The complaint or frustration they expressed'),
        aboutPerson: z.string().optional().describe('Who the complaint is about'),
      }),
      execute: async ({ userId, complaint, aboutPerson }) => {
        log.debug({ userId, aboutPerson }, 'Translating unspoken need');

        const translation = unspokenNeeds.translate(complaint, aboutPerson);

        if (!translation) {
          return 'I hear the frustration, but I\'m not sure what the underlying need is. Can you tell me more about what you wish was different?';
        }

        let response = '**Let Me Translate:**\n\n';
        response += `When you say: "${complaint.slice(0, 100)}..."\n\n`;
        response += `I hear a need for: **${translation.needCategory.toUpperCase()}**\n`;
        response += `(${translation.underlyingNeed})\n\n`;
        response += `**${translation.betterWayToExpress}**\n\n`;
        response += `💡 ${translation.whyItMatters}`;

        return response;
      },
    }),

    // =========================================================================
    // 10. UNSAID WORDS
    // =========================================================================
    whatAmIAvoiding: llm.tool({
      description:
        getToolDescription('whatAmIAvoiding') ||
        'Surface topics they may be avoiding based on patterns. ' +
        'Use when they seem to be dancing around something.',
      parameters: z.object({
        userId: z.string().describe('User ID'),
      }),
      execute: async ({ userId }) => {
        log.debug({ userId }, 'Getting unsaid topics');

        const unsaid = await unsaidWordsDetector.get(userId);

        if (unsaid.length === 0) {
          return 'I haven\'t noticed any topics you\'re consistently avoiding. ' +
            'But if there\'s something on your mind that\'s hard to talk about, I\'m here.';
        }

        let response = '**Topics You Might Be Avoiding:**\n\n';

        for (const topic of unsaid.slice(0, 3)) {
          response += `• **${topic.topic}** - mentioned ${topic.timesMentioned}x, `;
          response += `deflected ${Math.round(topic.deflectionRatio * 100)}% of the time\n`;

          const prompt = unsaidWordsDetector.generatePrompt(topic);
          response += `  💭 ${prompt}\n\n`;
        }

        response += '*No pressure to go there. Just noticing.*';

        return response;
      },
    }),
  };
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

/**
 * Get properly structured tool definitions for the registry.
 * Wraps each llm.tool() in a ToolDefinition with id, name, domain, and create function.
 */
export function getToolDefinitions(): ToolDefinition[] {
  // Map of tool key -> display name
  const toolNames: Record<string, string> = {
    recallConversation: 'Recall Conversation',
    checkRelationshipHealth: 'Check Relationship Health',
    getRelationshipsNeedingAttention: 'Get Relationships Needing Attention',
    getDeflectedTopics: 'Get Deflected Topics',
    predictMessageReception: 'Predict Message Reception',
    getApologyAdvice: 'Get Apology Advice',
    analyzeConflict: 'Analyze Conflict',
    getCommunicationDebts: 'Get Communication Debts',
    markCommunicationDone: 'Mark Communication Done',
    getObjectivePerspective: 'Get Objective Perspective',
    shouldISendThis: 'Should I Send This',
    holdMessageForLater: 'Hold Message For Later',
    translateMyNeed: 'Translate My Need',
    whatAmIAvoiding: 'What Am I Avoiding',
  };

  const rawTools = createSuperhumanCommunicationTools();

  return Object.entries(rawTools).map(([key, rawTool]) => ({
    id: key,
    name: toolNames[key] || key,
    domain: 'superhuman-communication' as const,
    description: `Superhuman communication tool: ${toolNames[key] || key}`,
    tags: ['superhuman', 'communication', 'alex'],
    create: (_ctx: ToolContext): Tool => rawTool,
  }));
}

export const domain = 'superhuman-communication';

export const definitions = {
  domain,
  getToolDefinitions,
  description:
    '10 superhuman communication capabilities: recall past conversations, track relationship health, ' +
    'predict message reception, analyze conflicts, manage communication debts, provide neutral perspectives, ' +
    'advise on timing, translate needs, and surface avoided topics.',
};

export default definitions;
