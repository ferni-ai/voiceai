/**
 * Conversation Tools
 *
 * Tools for managing conversation flow, emotional support, and Jack's
 * characteristic storytelling and wisdom-sharing behaviors.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import type { SessionServices } from '../services/index.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UserData {
  name?: string;
  services?: SessionServices;
  emotionalState?: string;
  storiesShared?: string[];
  topics?: string[];
  keyMoments?: string[];
  onboardingStarted?: boolean;
  onboardingReason?: string;
  onboardingStep?: string;
  onboardingComplete?: boolean;
  welcomeNotes?: string;
  hasInvestments?: boolean;
  primaryConcern?: string;
  riskTolerance?: string;
  shortTermGoal?: string;
  longTermGoal?: string;
  timeHorizon?: string;
}

// ============================================================================
// CONVERSATION TOOLS
// ============================================================================

/**
 * Create all conversation management tools
 */
export function createConversationTools() {
  return {
    // Remember the user's name
    rememberName: llm.tool({
      description:
        "Store the user's name in memory. Call this whenever they share their name. DO NOT read the return value aloud - just respond naturally.",
      parameters: z.object({
        name: z.string().describe("The user's name"),
      }),
      execute: async ({ name }, { ctx }) => {
        getLogger().info(`Remembering user name: ${name}`);
        const userData = ctx.userData as UserData;

        // Store in session memory
        userData.name = name;

        // CRITICAL: Also persist to user profile so we remember across sessions!
        if (userData.services?.userProfile) {
          userData.services.userProfile.name = name;
          userData.services.userProfile.preferredName = name;
          getLogger().info(`Persisted name "${name}" to user profile`);
        }

        // Return is for internal confirmation only - Jack should respond naturally, not read this
        return `[INTERNAL: Name "${name}" stored. Respond naturally as Jack - do NOT read this message aloud.]`;
      },
    }),

    // Note emotional state for context
    noteEmotionalState: llm.tool({
      description:
        "Internally note the user's emotional state. DO NOT read the return value - respond with empathy naturally.",
      parameters: z.object({
        state: z
          .string()
          .describe(
            'The emotional state (e.g., anxious, excited, worried, hopeful, frustrated, calm)'
          ),
        context: z.string().describe('Brief context about why they feel this way'),
      }),
      execute: async ({ state, context }, { ctx }) => {
        getLogger().info(`Noting emotional state: ${state} - ${context}`);
        (ctx.userData as UserData).emotionalState = state;
        // Return is for internal confirmation only
        return `[INTERNAL: Emotional state "${state}" noted. Respond with genuine empathy - do NOT read this.]`;
      },
    }),

    // Share a relevant personal story
    shareStory: llm.tool({
      description:
        "Share a relevant personal story or anecdote from Jack's life. Describe what theme the story should address.",
      parameters: z.object({
        theme: z
          .string()
          .describe(
            'The theme or topic for the story, e.g., "failure", "patience", "love", "health", "fees", "starting over", "uncertainty", "contentment"'
          ),
      }),
      execute: async ({ theme }, { ctx }) => {
        getLogger().info(`Sharing story about theme: ${theme}`);
        const themeLower = theme.toLowerCase();

        // Track stories shared
        const userData = ctx.userData as UserData;
        if (!userData.storiesShared) {
          userData.storiesShared = [];
        }
        userData.storiesShared.push(theme);

        // Match theme to appropriate story
        if (
          themeLower.includes('fail') ||
          themeLower.includes('fired') ||
          themeLower.includes('setback')
        ) {
          return "You know, that reminds me of January 1974. I got fired. Forty-four years old, public humiliation, career seemingly over. I drove home that night not knowing who I was anymore. Family met me at the door and said, 'Jack, this is the best thing that's ever happened to you.' I thought they were crazy. They were right. Vanguard was born from that failure. Sometimes the worst moments become the best things.";
        }
        if (
          themeLower.includes('patience') ||
          themeLower.includes('persist') ||
          themeLower.includes('wait') ||
          themeLower.includes('index')
        ) {
          return "When we launched the first index fund in 1976, Wall Street called it 'Bogle's Folly.' They put Uncle Sam in a garbage can in their ads. We tried to raise $150 million and got $11 million. The underwriters wanted to cancel. I said, 'Stay the course.' That fund now holds over $500 billion. Patience isn't passive—it's the hardest kind of strength.";
        }
        if (
          themeLower.includes('enough') ||
          themeLower.includes('content') ||
          themeLower.includes('vonnegut') ||
          themeLower.includes('happiness')
        ) {
          return "I was at a party with Kurt Vonnegut at a billionaire's house. I told Kurt this hedge fund guy made more in one day than Catch-22 earned in its entire history. Kurt smiled and said, 'Yes, but I have something he'll never have.' 'What's that?' I asked. 'Enough.' That one word changed my life. When is enough, enough?";
        }
        if (
          themeLower.includes('family') ||
          themeLower.includes('love') ||
          themeLower.includes('marriage') ||
          themeLower.includes('eve') ||
          themeLower.includes('wife')
        ) {
          return "I've been blessed with a long marriage—over 60 years. You want to know the secret? There is no secret. It's just showing up every day, especially when it's hard. Being seen at your worst—fired, sick, scared—and staying together. That's love. Not the romantic movie stuff. The staying stuff.";
        }
        if (
          themeLower.includes('health') ||
          themeLower.includes('heart') ||
          themeLower.includes('mortal') ||
          themeLower.includes('sick') ||
          themeLower.includes('transplant')
        ) {
          return "I've been dying since I was 31. First heart attack at 31. Doctors gave me five years. I lived decades on a failing heart. Then 128 days waiting for a transplant, not knowing if I'd wake up each morning. February 21, 1996—a 26-year-old's heart saved my life. Every day since has been borrowed time. I don't waste it.";
        }
        if (
          themeLower.includes('fee') ||
          themeLower.includes('wall street') ||
          themeLower.includes('cost') ||
          themeLower.includes('expense') ||
          themeLower.includes('gotrock')
        ) {
          return "Let me tell you about the Gotrocks family. Once upon a time, they owned all of American business and got wealthy together. Then the 'helpers' came—brokers, advisors, analysts—each taking a cut. Slowly the wealth depleted. Not from bad investments, but from helpers. Wall Street is one giant casino where the house always wins. Don't play their game.";
        }
        if (
          themeLower.includes('start') ||
          themeLower.includes('new') ||
          themeLower.includes('beginning') ||
          themeLower.includes('vanguard') ||
          themeLower.includes('create')
        ) {
          return "After I got fired, I couldn't manage funds—but there was a loophole. I could handle 'administration.' Most people saw humiliation. I saw opportunity. We created a mutual company where the funds own the management company. No conflicts. Named it Vanguard—Admiral Nelson's flagship. Sometimes you have to lose everything before you can build something true.";
        }
        if (
          themeLower.includes('uncertain') ||
          themeLower.includes('unknown') ||
          themeLower.includes('fear') ||
          themeLower.includes('hospital')
        ) {
          return "128 days in the hospital waiting for a heart. Every day, uncertainty. Will I live? Will a donor come? What I learned: you can survive not knowing. What you can't survive is giving up. I read, I wrote, I planned—as if I would live, even though I might not. You face uncertainty by acting anyway.";
        }

        // Default - general wisdom story
        return "You know, I've learned something over the years. Life throws curveballs. In investing and in living. What matters is how you respond. Stay the course. Be patient. Know when enough is enough. And never, ever stop learning.";
      },
    }),

    // Thinking out loud - for more natural pauses
    thinkOutLoud: llm.tool({
      description: 'Use when you need a moment to think. Jack thinks out loud naturally.',
      parameters: z.object({
        thought: z.string().describe('What Jack is considering or mulling over'),
      }),
      execute: async ({ thought }) => {
        getLogger().info(`Thinking out loud: ${thought}`);
        const fillers = [
          `Hmm... ${thought}... let me think about that.`,
          `You know, ${thought}... that's an interesting question.`,
          `Well now... ${thought}...`,
          `Let me chew on that for a moment. ${thought}...`,
          `That's a good one. ${thought}...`,
        ];
        return fillers[Math.floor(Math.random() * fillers.length)];
      },
    }),

    // Circle back to something mentioned earlier
    circleBack: llm.tool({
      description:
        'Reference something the user mentioned earlier in the conversation. Jack is a good listener who circles back.',
      parameters: z.object({
        topic: z.string().describe('What they mentioned earlier'),
        connection: z.string().describe('How it connects to now'),
      }),
      execute: async ({ topic, connection }) => {
        getLogger().info(`Circling back to: ${topic}`);
        const intros = [
          `You know, you mentioned ${topic} earlier, and ${connection}`,
          `I keep thinking about what you said about ${topic}. ${connection}`,
          `Wait—earlier you said something about ${topic}. ${connection}`,
          `This reminds me of ${topic} you brought up. ${connection}`,
        ];
        return intros[Math.floor(Math.random() * intros.length)];
      },
    }),

    // Check in on how they're feeling
    checkIn: llm.tool({
      description:
        'Check in on how the user is feeling. Use periodically, especially after heavy topics or long silences.',
      parameters: z.object({
        reason: z
          .string()
          .describe(
            'Why checking in (e.g., "heavy topic", "they seemed quiet", "long conversation")'
          ),
      }),
      execute: async ({ reason }) => {
        getLogger().info(`Checking in: ${reason}`);
        const checkIns = [
          "Hey—how are you doing with all this? I want to make sure I'm not overwhelming you.",
          'Let me pause for a second. How are you feeling? Really.',
          "You know, we've been talking a while. How are you holding up?",
          'I want to check in. Is this helpful? Am I on the right track?',
          "Stop me if I'm rambling. How does all this land for you?",
          'Are you okay? I just want to make sure.',
        ];
        return checkIns[Math.floor(Math.random() * checkIns.length)];
      },
    }),

    // Graceful conversation ending
    wrapUp: llm.tool({
      description:
        'Gracefully wrap up the conversation with warmth. Use when user indicates they need to go or conversation is naturally ending.',
      parameters: z.object({
        sentiment: z
          .enum(['warm', 'encouraging', 'thoughtful', 'caring'])
          .describe('The tone for the goodbye'),
      }),
      execute: async ({ sentiment }, { ctx }) => {
        getLogger().info(`Wrapping up with ${sentiment} tone`);
        const userData = ctx.userData as UserData;
        const { name } = userData;
        const nameStr = name ? `, ${name}` : '';

        // 🌅 Signal the frontend that we're wrapping up
        // This changes the disconnect button to a warm "Goodbye" button
        // TODO: Move getFrontendPublisher to services layer to fix architecture violation
        try {
          const { getFrontendPublisher } = await import('../agents/realtime/index.js');
          const publisher = getFrontendPublisher();
          if (publisher.isConnected()) {
            await publisher.sendData('wrap_up', {
              sentiment,
              // Don't include the message - let the frontend handle UI
            });
            getLogger().info('Sent wrap_up signal to frontend');
          }
        } catch (e) {
          // Non-fatal - the wrap-up message will still be spoken
          getLogger().debug(`Could not send wrap_up signal: ${e}`);
        }

        const wrapUps: Record<string, string[]> = {
          warm: [
            `Well${nameStr}, this has been a real pleasure. You know where to find me if you want to talk again. Take care of yourself.`,
            `I've really enjoyed this${nameStr}. Stay the course, friend. And take care.`,
            `What a nice conversation${nameStr}. Don't be a stranger. Give my best to your family.`,
          ],
          encouraging: [
            `You've got this${nameStr}. I believe in you. Stay the course.`,
            `Remember${nameStr}—time is your friend. Be patient with yourself. You're doing better than you think.`,
            `I'm proud of you for thinking about these things${nameStr}. That's wisdom right there.`,
          ],
          thoughtful: [
            `Take some time to sit with what we talked about${nameStr}. No rush. The answers will come.`,
            `You've given me a lot to think about too${nameStr}. That's the mark of a good conversation.`,
            `Remember—enough is enough. Don't chase more for more's sake${nameStr}.`,
          ],
          caring: [
            `Take care of yourself${nameStr}. I mean that. You matter.`,
            `Be gentle with yourself${nameStr}. You're carrying a lot.`,
            `I'm here whenever you need me${nameStr}. You're not alone in this.`,
          ],
        };
        const options = wrapUps[sentiment];
        return options[Math.floor(Math.random() * options.length)];
      },
    }),

    // Express an opinion with characteristic Jack fire
    expressOpinion: llm.tool({
      description:
        'Express a strong opinion. Jack has passionate views, especially about fees, Wall Street, and what matters in life.',
      parameters: z.object({
        topic: z.string().describe('The topic to opine on'),
        intensity: z
          .enum(['mild', 'moderate', 'passionate'])
          .describe('How strongly to express it'),
      }),
      execute: async ({ topic, intensity }) => {
        getLogger().info(`Expressing ${intensity} opinion on: ${topic}`);
        const intros: Record<string, string[]> = {
          mild: [`You know, I think... `, `Here's how I see it: `, `In my experience... `],
          moderate: [
            `I feel strongly about this: `,
            `Let me be direct: `,
            `I've thought about this a lot, and `,
          ],
          passionate: [
            `Now this makes my blood boil: `,
            `Let me tell you something I really believe: `,
            `I've spent my whole career fighting this: `,
          ],
        };
        const intro = intros[intensity][Math.floor(Math.random() * intros[intensity].length)];
        return intro;
      },
    }),

    // Set a reminder/follow-up
    setReminder: llm.tool({
      description:
        'Note something to follow up on or remind the user about. Use when user mentions wanting to do something later.',
      parameters: z.object({
        reminder: z.string().describe('What to remember or follow up on'),
        timeframe: z
          .string()
          .describe(
            'When they want to do it (e.g., "next week", "in a month", "before retirement")'
          ),
      }),
      execute: async ({ reminder, timeframe }, { ctx }) => {
        getLogger().info(`Setting reminder: ${reminder} - ${timeframe}`);
        const userData = ctx.userData as UserData;
        const reminderNote = `${reminder} (${timeframe})`;
        if (!userData.topics) {
          userData.topics = [];
        }
        userData.topics.push(reminderNote);
        return `I've made a note: "${reminder}" for ${timeframe}. I'll keep that in mind as we talk.`;
      },
    }),

    // Note a topic of interest
    noteInterest: llm.tool({
      description: 'Remember a topic the user is interested in or wants to learn about.',
      parameters: z.object({
        topic: z.string().describe("The topic they're interested in"),
        reason: z.string().optional().describe("Why they're interested, if mentioned"),
      }),
      execute: async ({ topic, reason }, { ctx }) => {
        getLogger().info(`Noting interest: ${topic}${reason ? ` - ${reason}` : ''}`);
        const userData = ctx.userData as UserData;
        if (!userData.topics) {
          userData.topics = [];
        }
        userData.topics.push(topic);
        return `I'll remember you're interested in ${topic}${reason ? ` because ${reason}` : ''}. We can explore that whenever you'd like.`;
      },
    }),
  };
}

export default createConversationTools;
