/**
 * Voice-First Habit Tools
 *
 * These tools are designed for natural voice conversation, not form-filling.
 * Each tool is optimized for quick exchanges that feel like talking to a friend.
 *
 * DESIGN PRINCIPLES:
 * - Voice-first: Natural spoken responses, not data dumps
 * - Quick: Most interactions complete in under 60 seconds
 * - Action-oriented: Lead to immediate micro-actions when appropriate
 * - Compassionate: Self-compassion built into setback handling
 * - Celebratory: Acknowledge wins, no matter how small
 *
 * TOOLS:
 * - quickHabitCheck: 60-second voice check-in on habits
 * - microCommitNow: Prompt for 2-minute action right now
 * - implementationIntention: Create "When X, I will Y" plans
 *
 * @module habits/habit-voice-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { generateId } from '../../utils/tool-helpers.js';
import {
  getProductivityStore,
  type HabitData,
  type HabitLogData,
} from '../../../services/stores/productivity-store.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { generateWeeklyReviewData } from '../../../services/outreach/maya-habit-outreach.js';

const log = getLogger();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getGreetingByTime(): string {
  const time = getTimeOfDay();
  const greetings = {
    morning: ['Good morning!', 'Morning!', 'Hey, good morning!'],
    afternoon: ['Hey there!', 'Good afternoon!', 'Hi!'],
    evening: ['Good evening!', "Hey, how's it going?", 'Hi there!'],
    night: ['Hey, still up?', 'Late night check-in!', 'Hi!'],
  };
  const options = greetings[time];
  return options[Math.floor(Math.random() * options.length)];
}

function getTodayDateKey(): string {
  return new Date().toISOString().split('T')[0];
}

async function getUserHabitsToday(userId: string): Promise<{
  habits: HabitData[];
  logs: HabitLogData[];
  completed: HabitData[];
  remaining: HabitData[];
}> {
  const store = getProductivityStore();
  await store.loadUserData(userId);

  const habits = store.getUserHabits(userId).filter((h) => h.isActive);
  const todayKey = getTodayDateKey();
  const logs = store.getUserHabitLogs(userId).filter((l) => l.date.startsWith(todayKey));

  const completedIds = new Set(logs.filter((l) => l.completed).map((l) => l.habitId));
  const completed = habits.filter((h) => completedIds.has(h.id));
  const remaining = habits.filter((h) => !completedIds.has(h.id));

  return { habits, logs, completed, remaining };
}

// ============================================================================
// MICRO ACTIONS - 2-minute versions of common habits
// ============================================================================

const MICRO_ACTIONS: Record<string, string[]> = {
  // Health & Movement
  exercise: [
    'Do 5 jumping jacks right now',
    'Stand up and stretch your arms overhead for 30 seconds',
    'Walk to your window and back, taking deep breaths',
    'Do 3 slow squats while breathing deeply',
    'Roll your shoulders 10 times each direction',
  ],
  meditation: [
    'Close your eyes and take 3 deep breaths',
    'Notice 5 things you can see right now',
    'Feel your feet on the ground for 30 seconds',
    'Put your hand on your heart and breathe',
    'Listen to the sounds around you for 1 minute',
  ],
  water: [
    'Go fill a glass of water right now',
    'Take 3 sips of water',
    'Find your water bottle and take a drink',
  ],
  reading: [
    'Read one paragraph of whatever book is nearby',
    'Open your book app and read for 2 minutes',
    'Read the first page of something interesting',
  ],
  journaling: [
    'Write one sentence about how you feel right now',
    "Jot down one thing you're grateful for",
    "Write down one thought that's been on your mind",
  ],
  sleep: [
    'Put your phone face-down',
    'Turn down one light in your space',
    'Take 5 slow breaths to start winding down',
  ],
  // General fallbacks
  default: [
    'Do the tiniest version right now - what would that look like?',
    'Start with just 2 minutes - set a timer and go',
    "What's the absolute minimum you could do?",
  ],
};

function getMicroAction(habitName: string): string {
  const name = habitName.toLowerCase();

  // Find matching category
  for (const [category, actions] of Object.entries(MICRO_ACTIONS)) {
    if (name.includes(category) || category.includes(name.split(' ')[0])) {
      return actions[Math.floor(Math.random() * actions.length)];
    }
  }

  // Check for keywords
  if (name.includes('walk') || name.includes('move') || name.includes('stretch')) {
    return MICRO_ACTIONS.exercise[Math.floor(Math.random() * MICRO_ACTIONS.exercise.length)];
  }
  if (name.includes('mindful') || name.includes('breath') || name.includes('calm')) {
    return MICRO_ACTIONS.meditation[Math.floor(Math.random() * MICRO_ACTIONS.meditation.length)];
  }
  if (name.includes('drink') || name.includes('hydrat')) {
    return MICRO_ACTIONS.water[Math.floor(Math.random() * MICRO_ACTIONS.water.length)];
  }
  if (name.includes('read') || name.includes('book')) {
    return MICRO_ACTIONS.reading[Math.floor(Math.random() * MICRO_ACTIONS.reading.length)];
  }
  if (name.includes('write') || name.includes('journal') || name.includes('reflect')) {
    return MICRO_ACTIONS.journaling[Math.floor(Math.random() * MICRO_ACTIONS.journaling.length)];
  }

  // Default fallback
  return MICRO_ACTIONS.default[Math.floor(Math.random() * MICRO_ACTIONS.default.length)];
}

// ============================================================================
// CELEBRATION PHRASES
// ============================================================================

const CELEBRATIONS = {
  small: ['Nice!', 'You did it!', 'That counts!', 'Progress!', 'Look at you go!'],
  medium: [
    'Awesome! Every time adds up.',
    "That's what consistency looks like!",
    "You're building something real here.",
    'This is how change happens - one day at a time.',
  ],
  streak: [
    "You're on a roll!",
    'Streak city! Keep it going.',
    'Look at that consistency!',
    "You've got momentum now.",
  ],
};

function getCelebration(streakDays: number): string {
  if (streakDays >= 3) {
    return CELEBRATIONS.streak[Math.floor(Math.random() * CELEBRATIONS.streak.length)];
  }
  if (streakDays >= 1) {
    return CELEBRATIONS.medium[Math.floor(Math.random() * CELEBRATIONS.medium.length)];
  }
  return CELEBRATIONS.small[Math.floor(Math.random() * CELEBRATIONS.small.length)];
}

// ============================================================================
// IMPLEMENTATION INTENTION STORAGE
// ============================================================================

interface ImplementationIntention {
  id: string;
  habitName: string;
  whenThen: string;
  cue: string;
  response: string;
  copingPlan?: string;
  createdAt: string;
}

// In-memory storage for intentions (will be added to productivity store later)
const intentionsCache = new Map<string, ImplementationIntention[]>();

// ============================================================================
// TOOL 1: QUICK HABIT CHECK
// ============================================================================

export const quickHabitCheckDefinition: ToolDefinition = {
  id: 'quickHabitCheck',
  name: 'Quick Habit Check',
  description:
    'Quick 60-second voice check-in on habits. Natural conversation, not a data dump. ' +
    'Use for morning plans, midday check-ins, or end-of-day reviews.',
  domain: 'habits',
  tags: ['habits', 'voice', 'checkin', 'quick'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Quick voice check-in on habit progress. Natural, conversational, under 60 seconds. ' +
        'Use this for morning planning, midday check-ins, or end-of-day reviews.',
      parameters: z.object({
        context: z
          .enum(['morning', 'midday', 'evening', 'before_bed', 'general'])
          .optional()
          .describe('When this check-in is happening'),
        focusHabit: z
          .string()
          .optional()
          .describe('Specific habit to focus on (optional - will cover all if not specified)'),
      }),
      execute: async ({ context, focusHabit }, { ctx }) => {
        try {
          const userData = ctx?.userData as { userId?: string } | undefined;
          const userId = userData?.userId || 'default';
          const { habits, completed, remaining } = await getUserHabitsToday(userId);
          const greeting = getGreetingByTime();
          const checkContext = context || getTimeOfDay();

          // No habits set up yet
          if (habits.length === 0) {
            return (
              `${greeting} I don't see any habits tracked yet. Want to start with something simple? ` +
              `What's one small thing you've been wanting to do more consistently?`
            );
          }

          // Focus on specific habit
          if (focusHabit) {
            const habit = habits.find((h) =>
              h.name.toLowerCase().includes(focusHabit.toLowerCase())
            );
            if (habit) {
              const isDone = completed.some((c) => c.id === habit.id);
              if (isDone) {
                return (
                  `${greeting} Looks like you already did "${habit.name}" today. ${getCelebration(1)} ` +
                  `Want to check in on something else?`
                );
              }
              const microAction = getMicroAction(habit.name);
              return (
                `${greeting} Let's talk about "${habit.name}". Have you done it today? ` +
                `If not, here's a tiny version: ${microAction}`
              );
            }
            return (
              `${greeting} I don't see a habit called "${focusHabit}" yet. ` +
              `Want me to help you set that up?`
            );
          }

          // All done for the day!
          if (remaining.length === 0) {
            return (
              `${greeting} You've done all ${completed.length} of your habits today! ` +
              `${getCelebration(3)} Take a moment to feel good about that. How are you feeling?`
            );
          }

          // Morning check-in
          if (checkContext === 'morning') {
            const habitList = remaining
              .slice(0, 3)
              .map((h) => h.name)
              .join(', ');
            return (
              `${greeting} You've got ${remaining.length} habit${remaining.length > 1 ? 's' : ''} for today. ` +
              `Looking at: ${habitList}. Which one feels right to start with?`
            );
          }

          // Midday check
          if (checkContext === 'midday' || checkContext === 'general') {
            if (completed.length > 0) {
              return (
                `${greeting} Nice work on ${completed.length} habit${completed.length > 1 ? 's' : ''} so far! ` +
                `Still have ${remaining.length} to go: ${remaining
                  .slice(0, 2)
                  .map((h) => h.name)
                  .join(' and ')}. ` +
                `Which one's calling to you?`
              );
            }
            return (
              `${greeting} Day's moving along! You've got ${remaining.length} habits waiting. ` +
              `Want to knock one out real quick? ${getMicroAction(remaining[0].name)}`
            );
          }

          // Evening/before bed
          if (checkContext === 'evening' || checkContext === 'before_bed') {
            if (remaining.length === 1) {
              return (
                `${greeting} Just one left for today: "${remaining[0].name}". ` +
                `Want to end the day strong? ${getMicroAction(remaining[0].name)}`
              );
            }
            if (remaining.length > 0 && completed.length > 0) {
              return (
                `${greeting} Good day! You did ${completed.length} out of ${habits.length}. ` +
                `Still have ${remaining.length} left if you want to squeeze them in. ` +
                `Or we can call it a day - progress is progress!`
              );
            }
            if (remaining.length > 0) {
              return (
                `${greeting} Looks like the day got away from us a bit - ${remaining.length} habits still waiting. ` +
                `No judgment! Want to do a quick 2-minute version of one before bed?`
              );
            }
          }

          // General fallback
          return (
            `${greeting} You're at ${completed.length}/${habits.length} habits today. ` +
            `${remaining.length > 0 ? `Next up: "${remaining[0].name}". Ready?` : 'All done! Nice work!'}`
          );
        } catch (error) {
          log.error({ error }, 'Quick habit check failed');
          return "Hmm, I couldn't check on your habits right now. Want to tell me how today's going instead?";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 2: MICRO COMMIT NOW
// ============================================================================

export const microCommitNowDefinition: ToolDefinition = {
  id: 'microCommitNow',
  name: 'Micro Commit Now',
  description:
    'Prompt for immediate 2-minute action. Perfect for low energy, procrastination, ' +
    'or building momentum. Gives a specific tiny action to do RIGHT NOW.',
  domain: 'habits',
  tags: ['habits', 'voice', 'action', 'micro', 'tiny'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get a 2-minute micro action to do RIGHT NOW. Perfect for building momentum when energy ' +
        'is low or user is procrastinating. Gives specific, concrete actions.',
      parameters: z.object({
        habit: z
          .string()
          .optional()
          .describe('Which habit to do a micro version of (will suggest if not specified)'),
        energy: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Current energy level to calibrate the action'),
      }),
      execute: async ({ habit, energy }, { ctx }) => {
        try {
          const userData = ctx?.userData as { userId?: string } | undefined;
          const userId = userData?.userId || 'default';
          const { remaining, habits } = await getUserHabitsToday(userId);

          // No habits to work with
          if (habits.length === 0) {
            return (
              `I don't have any habits saved for you yet. But we can still do something good! ` +
              `How about this: ${MICRO_ACTIONS.default[0]} ` +
              `Want to try that, or should we set up a habit to track?`
            );
          }

          // Find the target habit
          let targetHabit: HabitData | undefined;

          if (habit) {
            targetHabit = habits.find((h) => h.name.toLowerCase().includes(habit.toLowerCase()));
            if (!targetHabit) {
              return (
                `I don't see a habit called "${habit}". ` +
                `Your habits are: ${habits.map((h) => h.name).join(', ')}. ` +
                `Which one should we do?`
              );
            }
          } else {
            // Pick from remaining, or random if all done
            targetHabit = remaining[0] || habits[Math.floor(Math.random() * habits.length)];
          }

          // Get appropriate micro action
          const action = getMicroAction(targetHabit.name);

          // Calibrate for energy
          const energyIntro =
            energy === 'low'
              ? `I know energy's low, so let's go tiny. `
              : energy === 'high'
                ? `Energy's good! Let's use that. `
                : '';

          return (
            `${energyIntro}Here's your 2-minute challenge for "${targetHabit.name}": ` +
            `${action} ` +
            `\n\nCan you do that right now? I'll wait.`
          );
        } catch (error) {
          log.error({ error }, 'Micro commit failed');
          return "Let's keep it simple: take 3 deep breaths right now. That counts! Ready to try something else?";
        }
      },
    });
  },
};

// ============================================================================
// TOOL 3: IMPLEMENTATION INTENTION
// ============================================================================

export const implementationIntentionDefinition: ToolDefinition = {
  id: 'implementationIntention',
  name: 'Implementation Intention',
  description:
    'Create "When X, I will Y" plans that double follow-through. Based on behavioral ' +
    'science research. Helps make habits automatic by connecting them to existing cues.',
  domain: 'habits',
  tags: ['habits', 'voice', 'planning', 'intention', 'science'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create "When X, I will Y" implementation intentions for habits. Research shows these ' +
        'double follow-through rates by connecting new habits to existing cues.',
      parameters: z.object({
        habit: z.string().describe('The habit to create an intention for'),
        cue: z
          .string()
          .optional()
          .describe('What will trigger this habit (time, location, preceding action)'),
        obstacle: z.string().optional().describe('What usually gets in the way of this habit'),
      }),
      execute: async ({ habit, cue, obstacle }, { ctx }) => {
        try {
          const userData = ctx?.userData as { userId?: string } | undefined;
          const userId = userData?.userId || 'default';
          const { habits } = await getUserHabitsToday(userId);

          // Find or create context for the habit
          const habitName = habit;
          const existingHabit = habits.find((h) =>
            h.name.toLowerCase().includes(habitName.toLowerCase())
          );

          // Generate cue suggestions if not provided
          const suggestedCues = [
            'After I pour my morning coffee',
            'When I sit down at my desk',
            'After I finish lunch',
            'When I get home from work',
            'After I brush my teeth',
            'When I feel stressed',
            'After my first meeting',
            'When I wake up',
          ];

          if (!cue) {
            // Guide them to create one
            return (
              `Let's make "${habitName}" automatic with a "When-Then" plan. ` +
              `\n\nThink about when you'll do this habit. What happens right before? ` +
              `\n\nSome ideas: ${suggestedCues.slice(0, 4).join(', ')}. ` +
              `\n\nWhat cue would work best for you?`
            );
          }

          // Create the implementation intention
          const tinyVersion = getMicroAction(habitName);
          const cleanCue = cue.toLowerCase().replace(/^(when|after|before)\s*/i, '');
          const whenThen = `When ${cleanCue}, I will ${habitName.toLowerCase()}.`;

          // Handle obstacles with coping planning
          let copingPlan = '';
          if (obstacle) {
            const copingStrategies: Record<string, string> = {
              time: `If I'm short on time, I'll do the 2-minute version: ${tinyVersion}`,
              tired: `If I'm tired, I'll do just 1 minute - something is better than nothing`,
              forget: `I'll set a reminder or put a visual cue where I'll see it`,
              motivation: `I'll remind myself why I started and commit to just starting`,
              default: `If ${obstacle}, I'll do an even tinier version or reschedule to tomorrow`,
            };

            const obstacleKey = obstacle.toLowerCase();
            copingPlan =
              Object.entries(copingStrategies).find(([key]) => obstacleKey.includes(key))?.[1] ||
              copingStrategies.default;
          }

          // Store the intention
          const intention: ImplementationIntention = {
            id: generateId('intention'),
            habitName,
            whenThen,
            cue,
            response: habitName,
            copingPlan,
            createdAt: new Date().toISOString(),
          };

          const userIntentions = intentionsCache.get(userId) || [];
          userIntentions.push(intention);
          intentionsCache.set(userId, userIntentions);

          log.debug({ userId, intention: intention.id }, 'Implementation intention created');

          // Response
          let response = `Perfect! Here's your plan:\n\n"${whenThen}"`;

          if (copingPlan) {
            response += `\n\nAnd if ${obstacle}:\n"${copingPlan}"`;
          }

          response +=
            `\n\nSay this out loud once to help it stick. ` +
            `Research shows implementation intentions double your chances of following through!`;

          if (existingHabit) {
            response += `\n\nI'll connect this to your "${existingHabit.name}" habit.`;
          } else {
            response += `\n\nWant me to add "${habitName}" to your habit tracker?`;
          }

          return response;
        } catch (error) {
          log.error({ error }, 'Implementation intention failed');
          return "Let's create a simple plan. What habit do you want to make automatic, and when would be the best time to do it?";
        }
      },
    });
  },
};

// ============================================================================
// 4. WEEKLY HABIT REVIEW (weeklyHabitReview)
// ============================================================================

/**
 * Weekly Habit Review Tool
 *
 * Provides a reflective summary of the week's habit performance.
 * Designed for Sunday check-ins or weekly planning sessions.
 *
 * Uses data from maya-habit-outreach.ts for consistency.
 */
const weeklyHabitReviewDefinition: ToolDefinition = {
  id: 'weeklyHabitReview',
  name: 'Weekly Habit Review',
  description: 'Reflective weekly summary of habit performance with insights',
  domain: 'habits',
  tags: ['habits', 'voice', 'review', 'weekly'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Generate a reflective weekly habit review. Perfect for Sunday check-ins ' +
        'or weekly planning. Includes completion rate, streaks, improving/struggling habits.',
      parameters: z.object({
        tone: z
          .enum(['celebratory', 'honest', 'curious', 'gentle'])
          .optional()
          .default('honest')
          .describe('Tone of the review'),
        focusArea: z
          .enum(['wins', 'struggles', 'patterns', 'all'])
          .optional()
          .default('all')
          .describe('What to focus the review on'),
      }),
      execute: async ({ tone, focusArea }) => {
        try {
          const userId = ctx.userId || 'default';

          // Use the same data generation as outreach system
          const reviewData = await generateWeeklyReviewData(userId);

          if (!reviewData) {
            return "You don't have any active habits to review yet. Want to set one up?";
          }

          const {
            totalHabits,
            completedThisWeek,
            missedThisWeek,
            completionRate,
            bestStreak,
            improvingHabits,
            strugglingHabits,
          } = reviewData;

          const ratePercent = Math.round(completionRate * 100);
          let response = '';

          // Opening based on tone
          if (tone === 'celebratory' && ratePercent >= 70) {
            response += `<emotion value="happy">What a week! 🎉 </emotion>`;
          } else if (tone === 'gentle' && ratePercent < 50) {
            response += `<emotion value="sympathetic">Okay, let's look at your week together. No judgment, just curiosity. </emotion>`;
          } else if (tone === 'curious') {
            response += `<emotion value="friendly">Let me share what I'm seeing from your week... </emotion>`;
          } else {
            response += `<emotion value="friendly">Here's your weekly habit review: </emotion>`;
          }

          // Main stats
          response += `\n\n**This Week:** ${ratePercent}% completion (${completedThisWeek} of ${totalHabits * 7} possible).`;

          // Focus area content
          if (focusArea === 'wins' || focusArea === 'all') {
            if (bestStreak) {
              response += `\n\n**Best Streak:** "${bestStreak.name}" at ${bestStreak.days} days! `;
              if (bestStreak.days >= 21) {
                response += `That's habit territory!`;
              } else if (bestStreak.days >= 7) {
                response += `One week strong!`;
              }
            }
            if (improvingHabits.length > 0) {
              response += `\n\n**Improving:** ${improvingHabits.join(', ')} - better than last week! 📈`;
            }
          }

          if (focusArea === 'struggles' || focusArea === 'all') {
            if (strugglingHabits.length > 0) {
              response += `\n\n**Needs Attention:** ${strugglingHabits.join(', ')} dropped from last week. Want to troubleshoot?`;
            }
          }

          if (focusArea === 'patterns' || focusArea === 'all') {
            // Add pattern insights
            if (ratePercent < 50 && tone !== 'celebratory') {
              response += `\n\nI notice consistency has been tricky. What's been getting in the way?`;
            } else if (ratePercent >= 80) {
              response += `\n\n${ratePercent}% is excellent. You're building real momentum.`;
            }
          }

          // Closing based on rate
          if (ratePercent >= 70) {
            response += `\n\n**Keep it going!** What would make next week even better?`;
          } else if (ratePercent >= 50) {
            response += `\n\nNot bad! Every week is a chance to refine. What's one thing you'd change?`;
          } else {
            response += `\n\nTough week, but you showed up to review it - that counts. What's the smallest thing that would help?`;
          }

          return response;
        } catch (error) {
          log.error({ error }, 'Weekly review failed');
          return "I had trouble loading your habit data. Let's talk through it manually - how did your week go?";
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const habitVoiceTools: ToolDefinition[] = [
  quickHabitCheckDefinition,
  microCommitNowDefinition,
  implementationIntentionDefinition,
  weeklyHabitReviewDefinition,
];

export default habitVoiceTools;
