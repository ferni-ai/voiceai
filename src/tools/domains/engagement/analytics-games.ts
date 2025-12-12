/**
 * Analytics Engagement Games
 *
 * Tools for pattern detection and self-prediction (Peter's games).
 * - Pattern Detective: Guess your own patterns game
 * - Weekly Prediction: Predict and track weekly behavior
 *
 * @module engagement/analytics-games
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

// ============================================================================
// PATTERN DETECTIVE
// ============================================================================

export const patternDetectiveDef: ToolDefinition = {
  id: 'patternDetective',
  name: 'Pattern Detective',
  description: "Peter's game where user guesses their own patterns",
  domain: 'engagement',
  tags: ['engagement', 'peter', 'patterns', 'self-discovery'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Peter shows user their data and asks them to guess the pattern before revealing his analysis.
Builds self-knowledge and makes data fun.`,
      parameters: z.object({
        action: z.enum(['show-data', 'guess-pattern', 'reveal-pattern']).describe('Game stage'),
        dataType: z
          .enum(['productivity', 'habits', 'mood', 'spending', 'time'])
          .optional()
          .describe('Type of data'),
        userGuess: z.string().optional().describe('User guess about the pattern'),
      }),
      execute: async ({ action, dataType, userGuess }) => {
        if (action === 'show-data') {
          // In real implementation, would pull actual user data
          const mockDataDescriptions: Record<string, string> = {
            productivity: 'Your deep work hours: Mon 2.5h, Tue 3h, Wed 1h, Thu 4h, Fri 1.5h',
            habits:
              'Completion rates: Morning routine 80%, Exercise 45%, Reading 90%, Meditation 30%',
            mood: 'Energy levels tracked: Morning avg 7/10, Afternoon avg 5/10, Evening avg 6/10',
            spending: 'This week: Groceries $120, Coffee $45, Entertainment $80, Transport $35',
            time: 'Screen time: Social 2h, Work 6h, Learning 1h, Entertainment 3h',
          };

          return {
            response:
              `Here's some data about you. <break time=\"300ms\"/>\n\n` +
              `${mockDataDescriptions[dataType || 'productivity']}\n\n` +
              `Before I tell you what I see— <break time=\"200ms\"/>` +
              `what pattern do YOU notice?`,
            dataShown: mockDataDescriptions[dataType || 'productivity'],
            instruction: 'Ask user to guess the pattern',
          };
        }

        if (action === 'guess-pattern' && userGuess) {
          return {
            userGuess,
            response:
              `Your hypothesis: "${userGuess}"\n\n` +
              `Interesting. <break time=\"300ms\"/>Let me show you what I found...`,
            nextStep: 'Call reveal-pattern',
          };
        }

        if (action === 'reveal-pattern') {
          const mockPatterns: Record<string, string> = {
            productivity:
              'Your best deep work happens on Thursdays. Mid-week slump on Wednesdays. Start of week momentum, end of week fatigue.',
            habits:
              "You're crushing knowledge habits (reading 90%) but struggling with physical ones (exercise 45%, meditation 30%). Mind over body pattern.",
            mood: 'Classic energy dip in afternoon. Your mornings are your superpower.',
            spending:
              "Coffee spending is 37% of your grocery budget. That's either a passion or a problem!",
            time: 'Entertainment + Social = 5 hours. Work + Learning = 7 hours. Not bad ratio, but notice the gap.',
          };

          return {
            response:
              `Here's what I see: <break time=\"300ms\"/>\n\n` +
              `${mockPatterns.productivity}\n\n` +
              `The question is— <break time=\"200ms\"/>now that you see it, what will you do with it?`,
            patternRevealed: mockPatterns.productivity,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// WEEKLY PREDICTION
// ============================================================================

export const weeklyPredictionDef: ToolDefinition = {
  id: 'weeklyPrediction',
  name: 'Weekly Prediction',
  description: "Peter's game where user predicts their own weekly behavior",
  domain: 'engagement',
  tags: ['engagement', 'peter', 'predictions', 'self-knowledge'],

  create: (ctx: ToolContext): Tool => {
    const userId = ctx.userId ?? 'anonymous';
    return llm.tool({
      description: `At start of week, user predicts their behavior. At end, Peter compares prediction to reality.
Builds calibration and self-knowledge over time.

Actions:
- make-predictions: Start a new prediction for the week
- save-predictions: Save the user's predictions (after collecting them)
- get-pending: Check if user has pending predictions to resolve
- record-actuals: Record actual results and calculate accuracy`,
      parameters: z.object({
        action: z
          .enum(['make-predictions', 'save-predictions', 'get-pending', 'record-actuals'])
          .describe('Stage of prediction'),
        predictions: z
          .record(z.string(), z.number())
          .optional()
          .describe('User predictions by category (for save-predictions)'),
        actuals: z
          .record(z.string(), z.number())
          .optional()
          .describe('Actual results by category (for record-actuals)'),
        predictionId: z
          .string()
          .optional()
          .describe('ID of prediction to resolve (for record-actuals)'),
      }),
      execute: async ({ action, predictions, actuals, predictionId }) => {
        const categories = [
          'Deep work hours',
          'Exercise sessions',
          'Social time (hours)',
          'Screen time (hours)',
          'Mood average (1-10)',
        ];

        // Lazy import to avoid circular deps
        const { getEngagementStore } = await import('../../../services/engagement-store.js');
        const { getEngagementDataSender } =
          await import('../../../services/engagement-data-sender.js');

        if (action === 'make-predictions') {
          return {
            response:
              `It's prediction time! <break time="300ms"/>\n\n` +
              `I want you to predict your week. <break time="200ms"/>` +
              `Be honest— <break time="200ms"/>what do you THINK will happen, not what you WANT.\n\n` +
              `Categories to predict:\n${categories.map((c) => `• ${c}`).join('\n')}\n\n` +
              `Give me your numbers. <break time="200ms"/>We'll see how well you know yourself.`,
            categories,
            instruction: 'Collect predictions for each category, then call save-predictions',
          };
        }

        if (action === 'save-predictions' && predictions) {
          const store = await getEngagementStore();
          const now = new Date();
          const weekOf = now.toISOString().split('T')[0];
          const id = `pred_${now.getTime()}`;

          await store.savePrediction(userId, {
            id,
            weekOf,
            predictions,
            createdAt: now.toISOString(),
          });

          // Notify frontend
          const dataSender = getEngagementDataSender();
          await dataSender.sendPredictionUpdate(userId);

          getLogger().info({ userId, predictionId: id }, '📊 Weekly prediction saved');

          return {
            response:
              `Predictions locked in! <break time="300ms"/>` +
              `I'll remember these. <break time="200ms"/>` +
              `Come back at the end of the week and we'll see how you did.\n\n` +
              `${Object.entries(predictions)
                .map(([k, v]) => `• ${k}: ${v}`)
                .join('\n')}`,
            predictionId: id,
            weekOf,
            saved: true,
          };
        }

        if (action === 'get-pending') {
          const store = await getEngagementStore();
          const recentPredictions = await store.getRecentPredictions(userId, 10);

          // Find predictions without actuals
          const pending = recentPredictions.filter((p) => !p.completedAt);

          if (pending.length === 0) {
            return {
              response:
                `No pending predictions to resolve. <break time="200ms"/>` +
                `Want to make some predictions for this week?`,
              hasPending: false,
            };
          }

          const oldest = pending[pending.length - 1];
          return {
            response:
              `You have ${pending.length} prediction${pending.length > 1 ? 's' : ''} to resolve! <break time="200ms"/>` +
              `Let's check your prediction from the week of ${oldest.weekOf}.\n\n` +
              `You predicted:\n${Object.entries(oldest.predictions)
                .map(([k, v]) => `• ${k}: ${v}`)
                .join('\n')}\n\n` +
              `What were your actuals?`,
            hasPending: true,
            pendingCount: pending.length,
            oldestPrediction: oldest,
            instruction: 'Collect actuals for each category, then call record-actuals',
          };
        }

        if (action === 'record-actuals' && actuals) {
          const store = await getEngagementStore();

          // Find the prediction to resolve
          let targetId = predictionId;
          if (!targetId) {
            const recentPredictions = await store.getRecentPredictions(userId, 10);
            const pending = recentPredictions.filter((p) => !p.completedAt);
            if (pending.length > 0) {
              targetId = pending[pending.length - 1].id;
            }
          }

          if (!targetId) {
            return {
              error: 'No pending prediction found',
              response:
                `I don't see any predictions waiting to be resolved. <break time="200ms"/>` +
                `Want to make some predictions for this week?`,
            };
          }

          const result = await store.updatePredictionActuals(userId, targetId, actuals);

          if (!result) {
            return { error: 'Prediction not found or already resolved' };
          }

          // Notify frontend
          const dataSender = getEngagementDataSender();
          await dataSender.sendPredictionResolved(userId, targetId, result.accuracy);

          getLogger().info(
            { userId, predictionId: targetId, accuracy: result.accuracy },
            '📊 Weekly prediction resolved'
          );

          // Generate analysis
          const analysis: string[] = [];
          for (const [cat, actual] of Object.entries(actuals)) {
            analysis.push(`• ${cat}: ${actual}`);
          }

          const accuracyResponse =
            result.accuracy >= 75
              ? `<break time="300ms"/>You know yourself well! ${result.accuracy}% accuracy.`
              : result.accuracy >= 50
                ? `<break time="200ms"/>Not bad— ${result.accuracy}% accuracy. Room to improve your self-prediction.`
                : `<break time="200ms"/>Big gap between prediction and reality— ${result.accuracy}% accuracy. What does that tell you?`;

          return {
            response:
              `Actuals recorded! <break time="300ms"/>\n\n` +
              `${analysis.join('\n')}\n\n${accuracyResponse}`,
            accuracy: result.accuracy,
            predictionId: targetId,
            resolved: true,
          };
        }

        return { error: 'Invalid action or missing required data' };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const analyticsGameDefinitions: ToolDefinition[] = [
  patternDetectiveDef,
  weeklyPredictionDef,
];
