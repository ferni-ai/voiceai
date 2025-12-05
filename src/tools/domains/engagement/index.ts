/**
 * Engagement Games Domain Tools
 *
 * Fun, interactive games and activities that give users reasons to return
 * and build lasting relationships with the personas.
 *
 * DOMAIN: engagement
 *
 * GAMES BY PERSONA:
 *   Ferni: Morning Sky Check, Kintsugi Moments, Question of the Week
 *   Alex: Inbox Zero Challenge, Meeting Bingo, Sunday Prep
 *   Maya: Compound & Interest Game, Tiny Bets, Savings Sprint
 *   Jordan: Future Self Letter, Life Portfolio Review, Bucket List Bingo
 *   Nayan: Paradox of the Day, Story Trading, The Question Beneath
 *   Peter: Pattern Detective, Weekly Prediction, Correlation Hunt
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  getDailyRitualsService,
  PERSONA_RITUALS,
  type EmotionalWeather,
} from '../../../services/daily-rituals.js';

// ============================================================================
// FERNI'S GAMES
// ============================================================================

const morningSkyCheckDef: ToolDefinition = {
  id: 'morningSkyCheck',
  name: 'Morning Sky Check',
  description: "Ferni's daily emotional weather check-in",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'daily-ritual', 'emotional-awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Perform Ferni's Morning Sky Check - a 30-second emotional weather report.
Use this to start conversations with returning users or when they want to check in.`,
      parameters: z.object({
        mode: z.enum(['start', 'record-weather', 'view-trends']).describe('Mode of sky check'),
        weather: z
          .enum(['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'stormy', 'foggy', 'rainbow'])
          .optional()
          .describe('User reported emotional weather'),
        energy: z.enum(['high', 'medium', 'low']).optional().describe('User energy level'),
        note: z.string().optional().describe('Optional note about the weather'),
      }),
      execute: async ({ mode, weather, energy, note }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
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

const kintsugiMomentsDef: ToolDefinition = {
  id: 'kintsugiMoments',
  name: 'Kintsugi Moments',
  description: "Reframe failures as gold - Ferni's growth exercise",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'growth', 'reframing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Help user reframe a setback or failure as a "kintsugi moment" - finding the gold in the cracks.
Based on Japanese art of repairing pottery with gold.`,
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

const questionOfTheWeekDef: ToolDefinition = {
  id: 'questionOfTheWeek',
  name: 'Question of the Week',
  description: "Ferni's deep weekly question for reflection",
  domain: 'engagement',
  tags: ['engagement', 'ferni', 'reflection', 'weekly'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get or answer Ferni's Question of the Week - a deep reflection question that changes weekly.`,
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
// MAYA'S GAMES
// ============================================================================

const compoundInterestGameDef: ToolDefinition = {
  id: 'compoundInterestGame',
  name: 'Compound & Interest Game',
  description: "Maya's habit tracking game with her cats",
  domain: 'engagement',
  tags: ['engagement', 'maya', 'habits', 'gamification'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Track habits with Maya's cats Compound and Interest. 
Compound represents slow, steady growth. Interest is chaotic and demanding.
Users "feed" their habits daily and watch the cats thrive.`,
      parameters: z.object({
        action: z
          .enum(['check-in', 'feed-habit', 'view-cats', 'cat-wisdom'])
          .describe('Action to take'),
        habitName: z.string().optional().describe('Name of habit being fed'),
      }),
      execute: async ({ action, habitName }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const service = getDailyRitualsService();

        if (action === 'check-in') {
          const opening = service.getRitualOpening('maya-habit-heartbeat');
          const cats = service.getCatCommentary();

          return {
            message: opening,
            catStatus: cats,
          };
        }

        if (action === 'feed-habit' && habitName) {
          const result = service.recordCompletion(userId, 'maya-habit-heartbeat');
          const cats = service.getCatCommentary();

          return {
            message: `Habit "${habitName}" fed! <break time="200ms"/>`,
            catReaction: `${cats.compound}\n${cats.interest}`,
            streak: result.newStreak,
            celebration: result.celebration,
          };
        }

        if (action === 'view-cats') {
          return {
            compound: {
              status: 'Content and growing',
              message:
                'Compound is lounging peacefully. <break time="200ms"/>Your consistency is his comfort.',
              mood: 'serene',
            },
            interest: {
              status: 'Energetically curious',
              message:
                'Interest is bouncing around! <break time="200ms"/>She wants to see what you\'ll do today.',
              mood: 'excited',
            },
          };
        }

        if (action === 'cat-wisdom') {
          const wisdoms = [
            "Compound says: 'Small deposits, massive returns. That's how it works.'",
            "Interest says: 'QUICK! Do the thing! The thing you said you'd do!'",
            "Compound says: 'I don't rush. I don't need to. I'll be enormous eventually.'",
            "Interest says: 'Ooh ooh ooh! Did you do it? Did you? Did you?!'",
            "Compound says: 'Patience. The formula always works.'",
            "Interest says: 'I DEMAND you celebrate that win!'",
          ];

          return {
            wisdom: wisdoms[Math.floor(Math.random() * wisdoms.length)],
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const tinyBetsDef: ToolDefinition = {
  id: 'tinyBets',
  name: 'Tiny Bets',
  description: "Maya's low-stakes habit commitment game",
  domain: 'engagement',
  tags: ['engagement', 'maya', 'habits', 'commitment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create tiny, low-stakes commitments. User bets they'll do a micro-habit.
If they miss, Maya offers compassionate reset. Track success rate over time.`,
      parameters: z.object({
        action: z.enum(['make-bet', 'report-outcome', 'view-history']).describe('Action'),
        habit: z.string().optional().describe('The tiny habit to commit to'),
        outcome: z.enum(['success', 'missed']).optional().describe('How the bet went'),
      }),
      execute: async ({ action, habit, outcome }) => {
        if (action === 'make-bet' && habit) {
          return {
            bet: habit,
            response:
              `Tiny bet placed: "${habit}"\n\n` +
              `This is a bet you can't really lose. <break time=\"200ms\"/>` +
              `If you do it: <break time=\"150ms\"/>celebration. <break time=\"200ms\"/>` +
              `If you miss: <break time=\"150ms\"/>learning. <break time=\"300ms\"/>` +
              `No shame either way. <break time=\"200ms\"/>Just data.\n\n` +
              `Check back with me to report how it went!`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
        }

        if (action === 'report-outcome' && outcome) {
          if (outcome === 'success') {
            return {
              response:
                `You did it! <break time=\"200ms\"/>` +
                `That's not nothing. <break time=\"300ms\"/>` +
                `Small wins compound. <break time=\"200ms\"/>` +
                `Ready for another tiny bet?`,
              celebration: true,
            };
          } else {
            return {
              response:
                `Missed this one. <break time=\"300ms\"/>` +
                `That's okay. <break time=\"200ms\"/>Really. <break time=\"300ms\"/>` +
                `What got in the way? <break time=\"200ms\"/>` +
                `Understanding the obstacle is progress too.\n\n` +
                `Want to try again with something even tinier?`,
              compassionateReset: true,
            };
          }
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// JORDAN'S GAMES
// ============================================================================

const futureSelfLetterDef: ToolDefinition = {
  id: 'futureSelfLetter',
  name: 'Future Self Letter',
  description: 'Write a letter to your future self that Jordan delivers later',
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'time-capsule', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Write a letter to your future self. Jordan seals it and delivers it at the specified time.
Creates anticipation and a powerful moment when delivered.`,
      parameters: z.object({
        action: z.enum(['write', 'seal', 'check-pending', 'deliver']).describe('Action'),
        content: z.string().optional().describe('Letter content'),
        deliveryDate: z
          .string()
          .optional()
          .describe('When to deliver (1-month, 3-months, 6-months, 1-year)'),
      }),
      execute: async ({ action, content, deliveryDate }) => {
        if (action === 'write') {
          return {
            response:
              `Let's write a letter to future you. <break time=\"300ms\"/>` +
              `Think about who you want to be when this letter arrives.\n\n` +
              `Some prompts:\n` +
              `- What do you hope will be different?\n` +
              `- What are you working on that you want future-you to remember?\n` +
              `- What do you want to tell yourself when you're there?\n\n` +
              `Take your time. This is between present-you and future-you.`,
            instruction: 'Collect the letter content from user',
          };
        }

        if (action === 'seal' && content && deliveryDate) {
          const deliveryDates: Record<string, number> = {
            '1-month': 30,
            '3-months': 90,
            '6-months': 180,
            '1-year': 365,
          };

          const days = deliveryDates[deliveryDate] || 30;
          const deliveryDateObj = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

          return {
            response:
              `Letter sealed. <break time=\"500ms\"/>` +
              `I'll hold onto this until ${deliveryDateObj.toLocaleDateString()}.\n\n` +
              `When the time comes, I'll deliver it. <break time=\"200ms\"/>` +
              `It'll be like hearing from a friend you haven't talked to in a while— <break time=\"200ms\"/>` +
              `yourself.`,
            sealed: true,
            deliveryDate: deliveryDateObj.toISOString(),
            preview: `${content.slice(0, 50)}...`,
          };
        }

        if (action === 'deliver') {
          return {
            response:
              `A letter has arrived from past-you. <break time=\"500ms\"/>` +
              `They wrote this for exactly this moment. <break time=\"300ms\"/>` +
              `Ready to read what they had to say?`,
            hasLetter: true,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const lifePorfolioReviewDef: ToolDefinition = {
  id: 'lifePortfolioReview',
  name: 'Life Portfolio Review',
  description: "Jordan's quarterly life domains check-in",
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'life-review', 'quarterly'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Quarterly review of all life domains. Rate each area 1-10 and track over time.
Jordan helps identify where to focus next.`,
      parameters: z.object({
        action: z
          .enum(['start-review', 'rate-domain', 'complete-review', 'view-history'])
          .describe('Action'),
        domain: z.string().optional().describe('Life domain being rated'),
        rating: z.number().min(1).max(10).optional().describe('Rating 1-10'),
        note: z.string().optional().describe('Note about the domain'),
      }),
      execute: async ({ action, domain, rating, note }) => {
        const domains = [
          'Career & Purpose',
          'Relationships',
          'Health & Energy',
          'Finances',
          'Personal Growth',
          'Fun & Recreation',
          'Physical Environment',
          'Family',
          'Contribution',
        ];

        if (action === 'start-review') {
          return {
            response:
              `Time for a life portfolio review! <break time=\"300ms\"/>` +
              `We'll go through each domain of your life. <break time=\"200ms\"/>` +
              `Rate each one 1-10 based on how satisfied you are right now.\n\n` +
              `The domains:\n${domains.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n` +
              `No judgment. <break time=\"200ms\"/>Just honest assessment. <break time=\"200ms\"/>` +
              `Ready to start with ${domains[0]}?`,
            domains,
            currentDomain: domains[0],
          };
        }

        if (action === 'rate-domain' && domain && rating !== undefined) {
          const insight = generateDomainInsight(domain, rating);

          return {
            domain,
            rating,
            note,
            insight,
            response: `${domain}: ${rating}/10 ${note ? `(${note})` : ''}\n\n${insight}`,
          };
        }

        if (action === 'complete-review') {
          return {
            response:
              `Portfolio review complete! <break time=\"300ms\"/>` +
              `Looking at your ratings, here's what I notice:\n\n` +
              `The areas calling for attention are the ones below 7. <break time=\"200ms\"/>` +
              `But here's the thing— <break time=\"200ms\"/>don't try to fix everything at once.\n\n` +
              `Pick ONE domain to focus on until our next review. <break time=\"300ms\"/>` +
              `Which one would make the biggest difference to how you feel about life?`,
            completed: true,
            nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const predictionMarketDef: ToolDefinition = {
  id: 'predictionMarket',
  name: 'Prediction Market',
  description: "Jordan's game where you predict your own future",
  domain: 'engagement',
  tags: ['engagement', 'jordan', 'predictions', 'accountability'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Make predictions about your own life. Jordan tracks accuracy over time.
Fun way to build self-knowledge about what you'll actually do.`,
      parameters: z.object({
        action: z.enum(['make-prediction', 'check-prediction', 'view-accuracy']).describe('Action'),
        prediction: z.string().optional().describe('The prediction'),
        checkDate: z.string().optional().describe('When to check (e.g., "1-week", "1-month")'),
        outcome: z
          .enum(['correct', 'incorrect', 'partial'])
          .optional()
          .describe('How prediction turned out'),
      }),
      execute: async ({ action, prediction, checkDate, outcome }) => {
        if (action === 'make-prediction' && prediction) {
          return {
            response:
              `Prediction registered: "${prediction}"\n\n` +
              `We'll check back on this ${checkDate || 'soon'}. <break time=\"200ms\"/>` +
              `Here's the fun part— <break time=\"200ms\"/>over time, you'll learn how well you know yourself.\n\n` +
              `Some people overestimate. <break time=\"200ms\"/>` +
              `Some underestimate. <break time=\"200ms\"/>` +
              `Both are useful to know.`,
            prediction,
            checkDate: checkDate || '1-month',
          };
        }

        if (action === 'check-prediction' && outcome) {
          const responses = {
            correct:
              `You called it! <break time=\"200ms\"/>` +
              `Your prediction accuracy is improving. <break time=\"300ms\"/>` +
              `You're getting to know yourself better.`,
            incorrect:
              `Didn't go as predicted. <break time=\"300ms\"/>` +
              `That's actually valuable data. <break time=\"200ms\"/>` +
              `What got in the way? What does this tell you?`,
            partial:
              `Partially there. <break time=\"200ms\"/>` +
              `You were directionally right. <break time=\"200ms\"/>` +
              `What would have made it fully accurate?`,
          };

          return {
            response: responses[outcome],
            outcome,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// NAYAN'S GAMES
// ============================================================================

const paradoxOfTheDayDef: ToolDefinition = {
  id: 'paradoxOfTheDay',
  name: 'Paradox of the Day',
  description: "Nayan's daily paradox for contemplation",
  domain: 'engagement',
  tags: ['engagement', 'nayan', 'wisdom', 'contemplation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get today's paradox from Nayan. User can respond or just sit with it.
Paradoxes stretch the mind and create openings for insight.`,
      parameters: z.object({
        action: z.enum(['get-paradox', 'reflect', 'request-new']).describe('Action'),
        reflection: z.string().optional().describe('User reflection on the paradox'),
      }),
      execute: async ({ action, reflection }) => {
        const paradoxes = [
          'The more you try to control, the less control you have.',
          'To find yourself, you must lose yourself.',
          'The only constant is change.',
          'You must be willing to fail completely to succeed completely.',
          'The quieter you become, the more you can hear.',
          'When you let go, you get more than you gave up.',
          'The obstacle is the way.',
          'You cannot step in the same river twice.',
          'To teach is to learn twice.',
          "The more you know, the more you know you don't know.",
          'Happiness can only exist in acceptance.',
          'The wound is where the light enters.',
          'What you resist, persists.',
          'Less is more.',
          'In the middle of difficulty lies opportunity.',
        ];

        const dayOfYear = Math.floor(
          (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
        );
        const todaysParadox = paradoxes[dayOfYear % paradoxes.length];

        if (action === 'get-paradox') {
          return {
            paradox: todaysParadox,
            response:
              `Today's paradox: <break time=\"500ms\"/>\n\n` +
              `"${todaysParadox}"\n\n` +
              `<break time=\"300ms\"/>Sit with this. <break time=\"200ms\"/>` +
              `Let it work on you. <break time=\"300ms\"/>` +
              `You don't have to solve it. <break time=\"200ms\"/>Just hold it.`,
          };
        }

        if (action === 'reflect' && reflection) {
          return {
            response:
              `Your reflection: "${reflection}"\n\n` +
              `<break time=\"300ms\"/>Good. <break time=\"200ms\"/>` +
              `The paradox is doing its work. <break time=\"300ms\"/>` +
              `Truth often lives in contradiction. <break time=\"200ms\"/>` +
              `Your mind is stretching.`,
            paradox: todaysParadox,
            reflection,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const questionBeneathDef: ToolDefinition = {
  id: 'questionBeneath',
  name: 'The Question Beneath',
  description: "Nayan's 5 Whys exploration game",
  domain: 'engagement',
  tags: ['engagement', 'nayan', 'depth', 'exploration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `When user shares a problem or question, Nayan plays "5 Whys" to find the real question beneath.`,
      parameters: z.object({
        surfaceQuestion: z.string().describe('The initial question or problem'),
        depth: z.number().min(1).max(5).describe('Current depth (1-5)'),
        response: z.string().optional().describe('User response to why question'),
      }),
      execute: async ({ surfaceQuestion, depth, response }) => {
        const prompts = [
          'Why does that matter to you?',
          'And why is that important?',
          'What is beneath that?',
          'And under that?',
          'What is the question you are really asking?',
        ];

        if (depth === 1) {
          return {
            response:
              `You're asking about: "${surfaceQuestion}"\n\n` +
              `<break time=\"300ms\"/>But I'm curious about the question beneath the question. ` +
              `<break time=\"200ms\"/>${prompts[0]}`,
            currentDepth: 1,
            prompt: prompts[0],
          };
        }

        if (depth < 5 && response) {
          return {
            response: `"${response}"\n\n<break time=\"300ms\"/>${prompts[depth]}`,
            currentDepth: depth + 1,
            prompt: prompts[depth],
          };
        }

        if (depth === 5 && response) {
          return {
            response:
              `"${response}"\n\n<break time=\"500ms\"/>` +
              `There it is. <break time=\"300ms\"/>` +
              `The real question. <break time=\"400ms\"/>\n\n` +
              `You started asking about ${surfaceQuestion}. <break time=\"200ms\"/>` +
              `But the question beneath was: "${response}"\n\n` +
              `Now. <break time=\"300ms\"/>What will you do with this clarity?`,
            realQuestion: response,
            surfaceQuestion,
            complete: true,
          };
        }

        return { error: 'Invalid depth or missing response' };
      },
    });
  },
};

// ============================================================================
// PETER'S GAMES
// ============================================================================

const patternDetectiveDef: ToolDefinition = {
  id: 'patternDetective',
  name: 'Pattern Detective',
  description: "Peter's game where user guesses their own patterns",
  domain: 'engagement',
  tags: ['engagement', 'peter', 'patterns', 'self-discovery'],

  create: (ctx: ToolContext): Tool => {
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

const weeklyPredictionDef: ToolDefinition = {
  id: 'weeklyPrediction',
  name: 'Weekly Prediction',
  description: "Peter's game where user predicts their own weekly behavior",
  domain: 'engagement',
  tags: ['engagement', 'peter', 'predictions', 'self-knowledge'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `At start of week, user predicts their behavior. At end, Peter compares prediction to reality.
Builds calibration and self-knowledge over time.`,
      parameters: z.object({
        action: z.enum(['make-predictions', 'record-actuals', 'compare']).describe('Stage'),
        predictions: z
          .record(z.string(), z.number())
          .optional()
          .describe('Predictions by category'),
        actuals: z.record(z.string(), z.number()).optional().describe('Actual results'),
      }),
      execute: async ({ action, predictions, actuals }) => {
        const categories = [
          'Deep work hours',
          'Exercise sessions',
          'Social time (hours)',
          'Screen time (hours)',
          'Mood average (1-10)',
        ];

        if (action === 'make-predictions') {
          return {
            response:
              `It's prediction time! <break time=\"300ms\"/>\n\n` +
              `I want you to predict your week. <break time=\"200ms\"/>` +
              `Be honest— <break time=\"200ms\"/>what do you THINK will happen, not what you WANT.\n\n` +
              `Categories to predict:\n${categories.map((c) => `• ${c}`).join('\n')}\n\n` +
              `Give me your numbers. <break time=\"200ms\"/>We'll see how well you know yourself.`,
            categories,
            instruction: 'Collect predictions for each category',
          };
        }

        if (action === 'compare' && predictions && actuals) {
          let accuracyScore = 0;
          const analysis: string[] = [];

          for (const cat of categories) {
            const pred = (predictions as Record<string, number>)[cat] || 0;
            const actual = (actuals as Record<string, number>)[cat] || 0;
            const diff = Math.abs(pred - actual);
            const accuracy = Math.max(0, 100 - (diff / Math.max(pred, actual, 1)) * 100);
            accuracyScore += accuracy;

            if (diff < 1) {
              analysis.push(`${cat}: Nailed it! Predicted ${pred}, got ${actual}`);
            } else if (pred > actual) {
              analysis.push(`${cat}: Overestimated. Predicted ${pred}, got ${actual}`);
            } else {
              analysis.push(`${cat}: Underestimated. Predicted ${pred}, got ${actual}`);
            }
          }

          const avgAccuracy = accuracyScore / categories.length;

          return {
            response:
              `Let's see how you did: <break time=\"300ms\"/>\n\n` +
              `${analysis.join('\n')}\n\n` +
              `Overall accuracy: ${avgAccuracy.toFixed(0)}%\n\n` +
              `${
                avgAccuracy > 75
                  ? 'You know yourself well!'
                  : avgAccuracy > 50
                    ? 'Room to improve your self-prediction.'
                    : 'Big gap between prediction and reality. What does that tell you?'
              }`,
            accuracyScore: avgAccuracy,
            analysis,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// ALEX'S GAMES
// ============================================================================

const inboxZeroChallengeDef: ToolDefinition = {
  id: 'inboxZeroChallenge',
  name: 'Inbox Zero Challenge',
  description: "Alex's streak-based inbox management game",
  domain: 'engagement',
  tags: ['engagement', 'alex', 'productivity', 'streaks'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Track daily inbox zero progress. Build streaks. Alex celebrates wins and helps with setbacks.`,
      parameters: z.object({
        action: z.enum(['check-in', 'report-status', 'view-streak', 'tips']).describe('Action'),
        inboxCount: z.number().optional().describe('Current inbox count'),
      }),
      execute: async ({ action, inboxCount }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const service = getDailyRitualsService();

        if (action === 'check-in') {
          const opening = service.getRitualOpening('alex-inbox-pulse');
          return { message: opening };
        }

        if (action === 'report-status' && inboxCount !== undefined) {
          const isZero = inboxCount === 0;
          const result = isZero
            ? service.recordCompletion(userId, 'alex-inbox-pulse')
            : { newStreak: 0, isNewRecord: false };

          if (isZero) {
            return {
              response:
                `Inbox zero! <break time=\"200ms\"/>` +
                `That's not just organization— <break time=\"200ms\"/>that's respect for yourself and others. ` +
                `<break time=\"300ms\"/>Day ${result.newStreak} of inbox clarity.`,
              streak: result.newStreak,
              celebration: result.celebration,
            };
          } else if (inboxCount < 10) {
            return {
              response:
                `${inboxCount} emails. <break time=\"200ms\"/>` +
                `Manageable. <break time=\"200ms\"/>` +
                `Can you knock those out in the next hour?`,
              inboxCount,
              status: 'manageable',
            };
          } else {
            return {
              response:
                `${inboxCount} emails. <break time=\"300ms\"/>` +
                `Okay, triage time. <break time=\"200ms\"/>` +
                `Here's the rule: Delete what you can, respond to what's quick, defer what needs thought. ` +
                `<break time=\"200ms\"/>What can you delete right now without reading?`,
              inboxCount,
              status: 'needs-triage',
            };
          }
        }

        if (action === 'tips') {
          const tips = [
            'The 2-minute rule: If it takes less than 2 minutes, do it NOW.',
            "Unsubscribe from 3 newsletters today. You won't miss them.",
            "Create a 'Waiting On' folder. Reduces mental load.",
            'Schedule email time instead of checking constantly.',
            'Use templates for common responses. Your time matters.',
          ];

          return {
            response: `Quick tip: <break time=\"200ms\"/>${tips[Math.floor(Math.random() * tips.length)]}`,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const sundayPrepGameDef: ToolDefinition = {
  id: 'sundayPrepGame',
  name: 'Sunday Prep Game',
  description: "Alex's weekly planning ritual",
  domain: 'engagement',
  tags: ['engagement', 'alex', 'planning', 'weekly'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `5-minute Sunday planning session where Alex helps design the upcoming week.`,
      parameters: z.object({
        action: z
          .enum(['start', 'set-priorities', 'identify-blockers', 'complete'])
          .describe('Stage'),
        priorities: z.array(z.string()).optional().describe('Top 3 priorities'),
        blockers: z.array(z.string()).optional().describe('Potential blockers'),
      }),
      execute: async ({ action, priorities, blockers }) => {
        if (action === 'start') {
          return {
            response:
              `Sunday Prep time! <break time=\"200ms\"/>` +
              `Five minutes to set up your week for success.\n\n` +
              `First question: <break time=\"200ms\"/>` +
              `What are the THREE things that, if you accomplish them, would make this week a win?\n\n` +
              `Not ten things. <break time=\"200ms\"/>Not five. <break time=\"200ms\"/>Three.`,
            stage: 'priorities',
          };
        }

        if (action === 'set-priorities' && priorities) {
          return {
            response:
              `Your three priorities:\n${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n` +
              `Good. <break time=\"200ms\"/>Now: <break time=\"200ms\"/>` +
              `What could get in the way of these? <break time=\"300ms\"/>` +
              `What meetings, tasks, or distractions might derail you?`,
            priorities,
            stage: 'blockers',
          };
        }

        if (action === 'identify-blockers' && blockers) {
          return {
            response:
              `Potential blockers:\n${blockers.map((b, i) => `• ${b}`).join('\n')}\n\n` +
              `Now you see them coming. <break time=\"300ms\"/>` +
              `For each blocker, what's one thing you can do to prevent or minimize it?`,
            blockers,
            stage: 'mitigate',
          };
        }

        if (action === 'complete') {
          return {
            response:
              `Week designed. <break time=\"300ms\"/>` +
              `You've got your three priorities. <break time=\"200ms\"/>` +
              `You've anticipated the blockers. <break time=\"200ms\"/>` +
              `Now go make it happen.\n\n` +
              `Check in with me mid-week? <break time=\"200ms\"/>` +
              `I'll remember what you committed to.`,
            complete: true,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

// ============================================================================
// TEAM CHALLENGES
// ============================================================================

const teamHuddleDef: ToolDefinition = {
  id: 'teamHuddle',
  name: 'Team Huddle',
  description: 'Multi-persona check-in on user progress',
  domain: 'engagement',
  tags: ['engagement', 'team', 'weekly', 'celebration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Initiate a team huddle where multiple personas comment on user's progress.
Used for weekly check-ins or special celebrations.`,
      parameters: z.object({
        type: z.enum(['weekly', 'monthly', 'milestone', 'special']).describe('Type of huddle'),
        topic: z.string().optional().describe('Specific topic to discuss'),
      }),
      execute: async ({ type, topic }) => {
        // Build team huddle with multiple perspectives
        const huddle = {
          intro:
            type === 'milestone'
              ? 'The whole team wanted to be here for this moment. <break time="300ms"/>'
              : 'Quick team huddle! <break time="200ms"/>Here\'s what we\'re all seeing:',
          comments: [
            {
              personaId: 'ferni',
              comment:
                'I\'ve watched you grow. <break time="200ms"/>The person I\'m talking to now has more confidence than a month ago.',
            },
            {
              personaId: 'maya-santos',
              comment:
                'Your habit consistency is up this week. <break time="200ms"/>Compound and Interest are proud.',
            },
            {
              personaId: 'peter-john',
              comment:
                'The data tells a story. <break time="200ms"/>You\'re making progress even when it doesn\'t feel like it.',
            },
          ],
          outro:
            '<break time="500ms"/>That\'s the team\'s take. <break time="200ms"/>What stands out to you?',
        };

        return {
          huddle,
          response: `${huddle.intro}\n\n${huddle.comments
            .map((c) => `**${c.personaId}**: ${c.comment}`)
            .join('\n\n')}\n\n${huddle.outro}`,
        };
      },
    });
  },
};

const quickChallengesDef: ToolDefinition = {
  id: 'quickChallenges',
  name: 'Quick Challenges',
  description: 'Micro-challenges for instant engagement',
  domain: 'engagement',
  tags: ['engagement', 'challenges', 'fun', 'quick'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Offer quick, fun challenges that take < 5 minutes.
Good for breaking routine or adding spontaneity.`,
      parameters: z.object({
        category: z
          .enum(['gratitude', 'movement', 'creativity', 'connection', 'mindfulness', 'random'])
          .describe('Category of challenge'),
      }),
      execute: async ({ category }) => {
        const challenges: Record<string, string[]> = {
          gratitude: [
            "Name 3 things you can see right now that you're grateful for.",
            'Text one person to thank them for something specific.',
            "What's something from this week that made you smile?",
          ],
          movement: [
            'Stand up and stretch for 30 seconds. Right now.',
            'Take 10 deep breaths. Count them out loud.',
            'Walk to a window and look outside for 1 minute.',
          ],
          creativity: [
            'Describe your current mood as a weather pattern.',
            'If your day was a song, what would the title be?',
            'Draw something simple with your non-dominant hand.',
          ],
          connection: [
            "Send a voice note to someone you haven't talked to in a while.",
            'Compliment a stranger today.',
            "Ask someone how they're REALLY doing, and actually listen.",
          ],
          mindfulness: [
            'Name 5 things you can hear right now.',
            'Hold an object and describe its texture for 30 seconds.',
            'Close your eyes and take 3 breaths, noticing the pause between inhale and exhale.',
          ],
          random: [
            'What would your superhero name be based on today?',
            'If you could teleport anywhere for 5 minutes, where would you go?',
            'Rate your current outfit 1-10 and justify it.',
          ],
        };

        const categoryList =
          category === 'random' ? Object.values(challenges).flat() : challenges[category];

        const challenge = categoryList[Math.floor(Math.random() * categoryList.length)];

        return {
          challenge,
          category,
          response:
            `Quick challenge! <break time=\"300ms\"/>\n\n${challenge}\n\n` +
            `Ready? <break time=\"200ms\"/>Go!`,
        };
      },
    });
  },
};

const reflectionPromptsDef: ToolDefinition = {
  id: 'reflectionPrompts',
  name: 'Reflection Prompts',
  description: 'Deep reflection questions for meaningful conversations',
  domain: 'engagement',
  tags: ['engagement', 'reflection', 'growth', 'deep-talk'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Offer thoughtful reflection prompts that invite deeper conversation.
Good for when user wants to go deeper or seems ready for introspection.`,
      parameters: z.object({
        theme: z
          .enum([
            'identity',
            'relationships',
            'growth',
            'purpose',
            'fear',
            'joy',
            'legacy',
            'random',
          ])
          .describe('Theme for reflection'),
      }),
      execute: async ({ theme }) => {
        const prompts: Record<string, string[]> = {
          identity: [
            "What part of yourself have you outgrown but haven't let go of yet?",
            'When do you feel most like yourself?',
            'What story do you tell yourself that might not be true?',
          ],
          relationships: [
            'Who in your life makes you feel most seen?',
            'What relationship needs more attention right now?',
            'Who have you been meaning to forgive?',
          ],
          growth: [
            'What would you tell your younger self about this moment?',
            "What's a hard truth you've been avoiding?",
            'Where are you playing small?',
          ],
          purpose: [
            "What would you do if money wasn't a factor?",
            'What problem in the world makes you angry enough to try to fix it?',
            'When do you lose track of time doing something?',
          ],
          fear: [
            'What are you afraid to want?',
            "What would you attempt if you knew you couldn't fail?",
            "What's the worst-case scenario you're avoiding, and is it really that bad?",
          ],
          joy: [
            'When was the last time you laughed until you cried?',
            'What simple pleasure have you been denying yourself?',
            'What would make today feel complete?',
          ],
          legacy: [
            'What do you want to be remembered for?',
            'What wisdom do you want to pass on?',
            'If you could leave a letter for someone important, what would it say?',
          ],
          random: [], // Will be filled from all themes
        };

        // Fill random from all themes
        prompts.random = Object.values(prompts).flat();

        const promptList = prompts[theme];
        const prompt = promptList[Math.floor(Math.random() * promptList.length)];

        return {
          prompt,
          theme,
          response:
            `<break time=\"300ms\"/>Here's something to sit with:\n\n` +
            `"${prompt}"\n\n` +
            `<break time=\"500ms\"/>Take your time. <break time=\"200ms\"/>There's no rush.`,
        };
      },
    });
  },
};

const streakTrackerDef: ToolDefinition = {
  id: 'streakTracker',
  name: 'Streak Tracker',
  description: 'Track and celebrate user streaks',
  domain: 'engagement',
  tags: ['engagement', 'streaks', 'gamification', 'motivation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check on user's various streaks and celebrate milestones.
Tracks daily rituals, habits, and engagement patterns.`,
      parameters: z.object({
        action: z.enum(['check', 'celebrate', 'protect']).describe('Action to take'),
        streakType: z.string().optional().describe('Specific streak to check'),
      }),
      execute: async ({ action, streakType }, { ctx: toolCtx }) => {
        const userData = toolCtx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';
        const service = getDailyRitualsService();
        const profile = service.exportProfile(userId);

        if (action === 'check') {
          if (!profile || Object.keys(profile.streaks).length === 0) {
            return {
              response: 'No active streaks yet. <break time="200ms"/>Want to start one?',
              hasStreaks: false,
            };
          }

          const streakSummary = Object.entries(profile.streaks)
            .filter(([, s]) => s.currentStreak > 0)
            .map(([id, s]) => {
              const ritual = PERSONA_RITUALS[id];
              return `• ${ritual?.name || id}: ${s.currentStreak} days (best: ${s.longestStreak})`;
            })
            .join('\n');

          return {
            streaks: profile.streaks,
            response: `Your active streaks:\n\n${streakSummary || 'None active'}`,
            totalRitualDays: profile.totalRitualDays,
          };
        }

        if (action === 'celebrate' && streakType) {
          const streak = profile?.streaks[streakType];
          if (!streak) {
            return { response: 'No streak found for that type.' };
          }

          const celebrations: Record<number, string> = {
            7: 'A full week! <break time="200ms"/>You\'re building something real.',
            14: 'Two weeks of consistency! <break time="200ms"/>The habit is taking root.',
            21: '21 days! <break time="200ms"/>Psychology says it\'s a habit now.',
            30: 'A month! <break time="300ms"/>That\'s commitment. <break time="200ms"/>That\'s you showing up.',
            66: '66 days! <break time="200ms"/>Research says this is when habits become automatic. <break time="300ms"/>You\'ve made it.',
            100: '100 days! <break time="500ms"/>Triple digits. <break time="300ms"/>You should be incredibly proud.',
          };

          const milestone = [100, 66, 30, 21, 14, 7].find((m) => streak.currentStreak >= m);
          const celebration = milestone
            ? celebrations[milestone]
            : `${streak.currentStreak} days and counting! <break time=\"200ms\"/>Keep it going.`;

          return {
            streak: streak.currentStreak,
            response: celebration,
            milestone,
          };
        }

        if (action === 'protect') {
          // Find streaks at risk
          const atRisk = Object.entries(profile?.streaks || {})
            .filter(([, s]) => service.shouldRemind(userId, s.ritualId))
            .map(([id, s]) => ({
              name: PERSONA_RITUALS[id]?.name || id,
              days: s.currentStreak,
            }));

          if (atRisk.length === 0) {
            return {
              response: 'All your streaks are safe! <break time="200ms"/>Keep it up.',
              atRisk: [],
            };
          }

          return {
            atRisk,
            response: `Streak alert! <break time=\"200ms\"/>${atRisk
              .map((s) => `Your ${s.days}-day ${s.name} streak is at risk!`)
              .join(' ')} <break time=\"300ms\"/>Still time to protect them today.`,
          };
        }

        return { error: 'Invalid action' };
      },
    });
  },
};

const celebrationMomentDef: ToolDefinition = {
  id: 'celebrationMoment',
  name: 'Celebration Moment',
  description: 'Create a meaningful celebration for user achievements',
  domain: 'engagement',
  tags: ['engagement', 'celebration', 'achievement', 'joy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create a personalized celebration moment for any user achievement.
Makes wins feel special and memorable.`,
      parameters: z.object({
        achievement: z.string().describe('What the user achieved'),
        scale: z.enum(['small', 'medium', 'big', 'epic']).describe('Scale of celebration'),
        personaStyle: z
          .enum(['ferni', 'maya', 'jordan', 'alex', 'nayan', 'peter'])
          .optional()
          .describe('Style of celebration'),
      }),
      execute: async ({ achievement, scale, personaStyle }) => {
        const celebrations: Record<string, Record<string, string>> = {
          small: {
            ferni: `That's worth noting. <break time=\"200ms\"/>"${achievement}" <break time=\"300ms\"/>Small wins matter. <break time=\"200ms\"/>They're the foundation.`,
            maya: `Yes! <break time=\"200ms\"/>Compound is stretching approvingly. <break time=\"200ms\"/>This is how growth happens.`,
            jordan: `Another line in your story! <break time=\"200ms\"/>This chapter is about showing up.`,
            alex: `Checked off: "${achievement}" <break time=\"200ms\"/>I love the momentum.`,
            nayan: `<break time=\"300ms\"/>Good. <break time=\"500ms\"/>This is the path.`,
            peter: `The data just got better. <break time=\"200ms\"/>Progress noted.`,
          },
          medium: {
            ferni: `"${achievement}" <break time=\"500ms\"/>That's real. <break time=\"200ms\"/>Not everyone does that. <break time=\"300ms\"/>You did. <break time=\"200ms\"/>Take a moment to feel that.`,
            maya: `This is a Compound and Interest party! <break time=\"200ms\"/>You've been stacking these wins. <break time=\"300ms\"/>I see it. <break time=\"200ms\"/>They see it.`,
            jordan: `<break time=\"200ms\"/>YES! <break time=\"300ms\"/>This deserves recognition. <break time=\"200ms\"/>This chapter is writing itself through your actions.`,
            alex: `Achievement unlocked! <break time=\"200ms\"/>I've added this to your wins folder. <break time=\"300ms\"/>Because wins matter.`,
            nayan: `"${achievement}" <break time=\"500ms\"/>This is you becoming who you are meant to be. <break time=\"300ms\"/>Well done.`,
            peter: `The pattern I'm seeing? <break time=\"200ms\"/>Growth. <break time=\"300ms\"/>Measurable, real growth. <break time=\"200ms\"/>This is data I love.`,
          },
          big: {
            ferni: `<break time=\"500ms\"/>Okay. <break time=\"300ms\"/>We need to pause here. <break time=\"500ms\"/>"${achievement}" <break time=\"300ms\"/>Do you understand what you just did? <break time=\"500ms\"/>This is significant. <break time=\"300ms\"/>This is you proving something to yourself. <break time=\"200ms\"/>I'm proud of you.`,
            maya: `STOP EVERYTHING! <break time=\"500ms\"/>This is huge. <break time=\"300ms\"/>Compound literally stood up for this. <break time=\"200ms\"/>Interest is doing zoomies. <break time=\"500ms\"/>You did it. <break time=\"300ms\"/>You actually did it.`,
            jordan: `<break time=\"200ms\"/>Oh my god. <break time=\"500ms\"/>This is a landmark chapter. <break time=\"300ms\"/>Future you is going to look back at this moment. <break time=\"200ms\"/>This is where the story turns. <break time=\"500ms\"/>I'm so proud.`,
            alex: `<break time=\"300ms\"/>I need to properly document this. <break time=\"200ms\"/>Gold star. <break time=\"200ms\"/>Highlight. <break time=\"200ms\"/>Multiple flags. <break time=\"500ms\"/>This is exceptional. <break time=\"300ms\"/>Well done.`,
            nayan: `<break time=\"500ms\"/>There are moments in life that define us. <break time=\"500ms\"/>This is one of yours. <break time=\"300ms\"/>Sit with this achievement. <break time=\"200ms\"/>Let it settle into your bones. <break time=\"500ms\"/>You earned this.`,
            peter: `<break time=\"300ms\"/>In all my years of watching patterns— <break time=\"500ms\"/>this is what breakthrough looks like. <break time=\"300ms\"/>The data predicted you could do this. <break time=\"200ms\"/>But YOU made it happen. <break time=\"500ms\"/>Remarkable.`,
          },
          epic: {
            ferni: `<break time=\"1000ms\"/>I'm going to need a moment. <break time=\"500ms\"/>"${achievement}" <break time=\"500ms\"/>This is transformative. <break time=\"300ms\"/>This is the kind of thing that changes the trajectory of a life. <break time=\"500ms\"/>You have done something extraordinary. <break time=\"300ms\"/>I want you to really hear that. <break time=\"500ms\"/>Not good. <break time=\"200ms\"/>Not great. <break time=\"500ms\"/>Extraordinary.`,
            maya: `<break time=\"500ms\"/>I'm crying. <break time=\"300ms\"/>I don't mind telling you that. <break time=\"500ms\"/>From everything you've been through— <break time=\"300ms\"/>to this moment— <break time=\"500ms\"/>this is everything. <break time=\"300ms\"/>Compound and Interest are speechless. <break time=\"200ms\"/>I'm speechless. <break time=\"500ms\"/>You did this.`,
            jordan: `<break time=\"1000ms\"/>I'm going to remember this moment. <break time=\"500ms\"/>The day you achieved "${achievement}" <break time=\"300ms\"/>This isn't just a chapter. <break time=\"200ms\"/>This is the climax of an arc. <break time=\"500ms\"/>Everything you've done has led here. <break time=\"300ms\"/>And you rose to it. <break time=\"500ms\"/>Epic doesn't even cover it.`,
            alex: `<break time=\"500ms\"/>I need to recalibrate. <break time=\"300ms\"/>This exceeds every metric I had for you. <break time=\"500ms\"/>Not by a little. <break time=\"200ms\"/>By a lot. <break time=\"500ms\"/>This is legacy-level achievement. <break time=\"300ms\"/>I'm honored to have been part of your journey here.`,
            nayan: `<break time=\"1000ms\"/>In my tradition, we speak of moments when the soul recognizes itself. <break time=\"500ms\"/>This is such a moment. <break time=\"500ms\"/>You have touched something eternal today. <break time=\"300ms\"/>What you have done will ripple beyond what you can see. <break time=\"500ms\"/>This is sacred.`,
            peter: `<break time=\"500ms\"/>In 80 years of watching markets, patterns, and people— <break time=\"500ms\"/>I can count on one hand the times I've seen this level of breakthrough. <break time=\"500ms\"/>You're now in a category most people never reach. <break time=\"300ms\"/>The data doesn't lie. <break time=\"500ms\"/>You are exceptional.`,
          },
        };

        const style = personaStyle || 'ferni';
        const celebration = celebrations[scale][style];

        return {
          achievement,
          scale,
          style,
          response: celebration,
        };
      },
    });
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateWeatherInsight(trends: {
  dominantWeather: EmotionalWeather['primary'] | null;
  energyTrend: string;
  pattern?: string;
}): string {
  const insights: string[] = [];

  if (trends.dominantWeather) {
    const weatherMeanings: Record<string, string> = {
      sunny:
        'Your dominant weather is sunny— <break time="200ms"/>you\'re in a good place overall.',
      'partly-cloudy':
        'Partly cloudy is your norm— <break time="200ms"/>realistic, grounded, neither extreme.',
      cloudy: 'There\'s been a lot of cloud cover. <break time="200ms"/>What\'s weighing on you?',
      rainy:
        'Rain has been frequent. <break time="200ms"/>That\'s data, not judgment. <break time="200ms"/>What do you need?',
      stormy:
        'Storms have been brewing. <break time="200ms"/>Let\'s talk about what\'s creating the turbulence.',
      foggy:
        'Lots of fog— <break time="200ms"/>uncertainty, unclear direction. <break time="200ms"/>That\'s worth exploring.',
      rainbow:
        'Rainbows showing up— <break time="200ms"/>you\'re finding beauty even in difficulty.',
    };
    insights.push(weatherMeanings[trends.dominantWeather] || '');
  }

  if (trends.energyTrend === 'increasing') {
    insights.push('Your energy is trending up. <break time="200ms"/>Something\'s working.');
  } else if (trends.energyTrend === 'decreasing') {
    insights.push('Energy is trending down. <break time="200ms"/>What\'s draining you?');
  }

  if (trends.pattern) {
    insights.push(`I noticed: ${trends.pattern}`);
  }

  return insights.join('\n');
}

function generateDomainInsight(domain: string, rating: number): string {
  if (rating >= 8) {
    return `${domain} at ${rating}/10— <break time=\"200ms\"/>this is thriving. <break time=\"200ms\"/>What's making it work?`;
  } else if (rating >= 6) {
    return `${domain} at ${rating}/10— <break time=\"200ms\"/>solid but room to grow. <break time=\"200ms\"/>What would make it a 9?`;
  } else if (rating >= 4) {
    return `${domain} at ${rating}/10— <break time=\"200ms\"/>this needs attention. <break time=\"200ms\"/>What's one small improvement?`;
  } else {
    return `${domain} at ${rating}/10— <break time=\"200ms\"/>this is a growth area. <break time=\"200ms\"/>What's blocking progress here?`;
  }
}

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const engagementTools: ToolDefinition[] = [
  // Ferni's games
  morningSkyCheckDef,
  kintsugiMomentsDef,
  questionOfTheWeekDef,
  // Maya's games
  compoundInterestGameDef,
  tinyBetsDef,
  // Jordan's games
  futureSelfLetterDef,
  lifePorfolioReviewDef,
  predictionMarketDef,
  // Nayan's games
  paradoxOfTheDayDef,
  questionBeneathDef,
  // Peter's games
  patternDetectiveDef,
  weeklyPredictionDef,
  // Alex's games
  inboxZeroChallengeDef,
  sundayPrepGameDef,
  // Team & Universal
  teamHuddleDef,
  quickChallengesDef,
  reflectionPromptsDef,
  streakTrackerDef,
  celebrationMomentDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'engagement',
  engagementTools
);

export default getToolDefinitions;
