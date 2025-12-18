/**
 * Emotional Engagement Games
 *
 * Tools for emotional awareness and reflection (Ferni's games).
 * - Morning Sky Check: Daily emotional weather check-in
 * - Kintsugi Moments: Reframe setbacks as growth
 * - Question of the Week: Deep weekly reflection
 *
 * @module engagement/emotional-games
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getDailyRitualsService, type EmotionalWeather } from '../../../services/daily-rituals.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { generateWeatherInsight } from './helpers.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// MORNING SKY CHECK
// ============================================================================

export const morningSkyCheckDef: ToolDefinition = {
  id: 'morningSkyCheck',
  name: 'Morning Sky Check',
  description: "Ferni's daily emotional weather check-in",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'daily-ritual', 'emotional-awareness'],

  create: (ctx: ToolContext): Tool => {
    const userId = ctx.userId ?? 'anonymous';
    return llm.tool({
      description: getToolDescription('morningSkyCheck'),
      parameters: z.object({
        mode: z.enum(['start', 'record-weather', 'view-trends']).describe('Mode of sky check'),
        weather: z
          .enum(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow'])
          .optional()
          .describe('User reported emotional weather'),
        energy: z.enum(['high', 'medium', 'low']).optional().describe('User energy level'),
        note: z.string().optional().describe('Optional note about the weather'),
      }),
      execute: async ({ mode, weather, energy, note }) => {
        const service = getDailyRitualsService();

        if (mode === 'start') {
          const opening = service.getRitualOpening('ferni-sky-check');
          return {
            message: opening,
            instruction: 'Ask user to describe their emotional weather using weather metaphors',
          };
        }

        if (mode === 'record-weather' && weather) {
          const emotionalWeather: EmotionalWeather = {
            primary: weather,
            energy: energy || 'medium',
            note,
          };

          const result = service.recordCompletion(userId, 'ferni-sky-check', {
            emotionalWeather,
          });

          const response = service.getWeatherResponse(weather);

          getLogger().info({ userId, weather, streak: result.newStreak }, '🌅 Sky check recorded');

          return {
            response,
            streak: result.newStreak,
            isNewRecord: result.isNewRecord,
            celebration: result.celebration,
            weatherRecorded: weather,
          };
        }

        if (mode === 'view-trends') {
          const trends = service.getWeatherTrends(userId, 7);

          if (!trends.dominantWeather) {
            return {
              message: 'We need a few more sky checks to see patterns. Keep checking in!',
              hasEnoughData: false,
            };
          }

          return {
            dominantWeather: trends.dominantWeather,
            energyTrend: trends.energyTrend,
            pattern: trends.pattern,
            insight: generateWeatherInsight(trends),
          };
        }

        return { error: 'Invalid mode' };
      },
    });
  },
};

// ============================================================================
// KINTSUGI MOMENTS
// ============================================================================

export const kintsugiMomentsDef: ToolDefinition = {
  id: 'kintsugiMoments',
  name: 'Kintsugi Moments',
  description: "Reframe failures as gold - Ferni's growth exercise",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'growth', 'reframing'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('kintsugiMoments'),
      parameters: z.object({
        setback: z.string().describe('The setback or failure to reframe'),
        mode: z.enum(['explore', 'find-gold', 'save']).describe('Stage of the exercise'),
        goldFound: z.string().optional().describe('The growth/lesson found in the setback'),
      }),
      execute: async ({ setback, mode, goldFound }) => {
        if (mode === 'explore') {
          return {
            response:
              `You shared: "${setback}"\n\n` +
              `In Japanese culture, there's an art called kintsugi— <break time="300ms"/>` +
              `when pottery breaks, they repair it with gold. <break time="200ms"/>` +
              `The cracks become part of the beauty. <break time="300ms"/>` +
              `The breaking becomes part of the story.\n\n` +
              `Let's find the gold in this crack. <break time="200ms"/>` +
              `What did this experience teach you? <break time="200ms"/>` +
              `What strength did it reveal or build?`,
            nextStep: 'Ask user to identify what they learned or how they grew',
          };
        }

        if (mode === 'find-gold' && goldFound) {
          return {
            response:
              `The gold you found: "${goldFound}"\n\n` +
              `That's real. <break time="300ms"/>` +
              `The setback was: ${setback}\n` +
              `But it gave you: ${goldFound}\n\n` +
              `The crack is still there. <break time="200ms"/>` +
              `But now it's lined with gold. <break time="300ms"/>` +
              `Would you like me to save this kintsugi moment?`,
            kintsugiMoment: {
              crack: setback,
              gold: goldFound,
              createdAt: new Date().toISOString(),
            },
          };
        }

        if (mode === 'save') {
          return {
            response:
              `Kintsugi moment saved. <break time="200ms"/>` +
              `You can look back at your collection of gilded cracks anytime. <break time="300ms"/>` +
              `They're proof that breaking doesn't mean broken.`,
            saved: true,
          };
        }

        return { error: 'Invalid mode or missing data' };
      },
    });
  },
};

// ============================================================================
// QUESTION OF THE WEEK
// ============================================================================

export const questionOfTheWeekDef: ToolDefinition = {
  id: 'questionOfTheWeek',
  name: 'Question of the Week',
  description: "Ferni's deep weekly question for reflection",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'reflection', 'weekly'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('questionOfTheWeek'),
      parameters: z.object({
        mode: z.enum(['get-question', 'submit-answer', 'view-past']).describe('Mode'),
        answer: z.string().optional().describe('User answer to the question'),
      }),
      execute: async ({ mode, answer }) => {
        const weekOfYear = Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        );

        const questions = [
          'What are you not saying that needs to be said?',
          "What would you do if you knew you couldn't fail?",
          "What is your relationship with 'enough'?",
          'Who do you become when no one is watching?',
          'What are you pretending not to know?',
          'What would your 80-year-old self tell you?',
          "What are you tolerating that you shouldn't?",
          'Where in your life are you playing small?',
          'What would you attempt if you had 10x confidence?',
          'What truth are you avoiding?',
          'When do you feel most like yourself?',
          'What would you do differently if no one would judge?',
          "What is the question you're afraid to ask yourself?",
          'Where are you giving your power away?',
          'What do you need to forgive yourself for?',
          "What are you holding onto that's holding you back?",
          'When did you last do something for the first time?',
          'What would make you feel proud at the end of this year?',
          "What story are you telling yourself that isn't serving you?",
          'Who would you be without your biggest fear?',
        ];

        const currentQuestion = questions[weekOfYear % questions.length];

        if (mode === 'get-question') {
          return {
            question: currentQuestion,
            intro:
              `This week's question: <break time="300ms"/>\n\n"${currentQuestion}"\n\n` +
              `Take your time with this one. <break time="200ms"/>` +
              `There's no right answer. <break time="200ms"/>` +
              `Just what's true for you.`,
            weekNumber: weekOfYear,
          };
        }

        if (mode === 'submit-answer' && answer) {
          return {
            response:
              `Thank you for sharing that. <break time="300ms"/>` +
              `"${answer}"\n\n` +
              `I'll remember this. <break time="200ms"/>` +
              `These answers, over time, they paint a picture of who you're becoming.`,
            saved: true,
            question: currentQuestion,
            answer,
          };
        }

        return { error: 'Invalid mode' };
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionalGameDefinitions: ToolDefinition[] = [
  morningSkyCheckDef,
  kintsugiMomentsDef,
  questionOfTheWeekDef,
];
