/**
 * Daily Briefing Tool
 *
 * Morning briefing and end-of-day reflection for voice-first productivity.
 *
 * Features:
 * - Morning briefing (weather, calendar, tasks, goals)
 * - End-of-day reflection
 * - Weekly review
 * - Personalized insights
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// Import from other tools to aggregate data
// Note: In production, these would be services
import { getTodaysTasks, getOverdueTasks, getUpcomingTasks, type Task } from './tasks.js';
import { getUpcomingBills, calculateMonthlyTotal, type Bill } from './bills.js';
import { getDueHabits, calculateStreak, type Habit } from './habits.js';
import { getTodayJournal, getJournalStreak, type JournalEntry } from './notes.js';
import { getDueDoses, getUpcomingDoses, getMedsNeedingRefill, type Medication } from './medications.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyBriefing {
  date: Date;
  weather?: WeatherInfo;
  tasks: TaskSummary;
  habits: HabitSummary;
  calendar: CalendarSummary;
  bills: BillSummary;
  medications: MedicationSummary;
  quote?: string;
}

interface WeatherInfo {
  temp: number;
  condition: string;
  high: number;
  low: number;
  precipitation?: number;
}

interface TaskSummary {
  total: number;
  overdue: number;
  highPriority: number;
  topTasks: string[];
}

interface HabitSummary {
  due: number;
  longestStreak: number;
  habitNames: string[];
}

interface CalendarSummary {
  events: number;
  nextEvent?: string;
  busyHours: number;
}

interface BillSummary {
  dueThisWeek: number;
  totalDue: number;
  needsAttention: boolean;
}

interface MedicationSummary {
  dosesToday: number;
  dueNow: number;
  needsRefill: string[];
}

// ============================================================================
// MOTIVATIONAL QUOTES
// ============================================================================

const MORNING_QUOTES = [
  "The secret of getting ahead is getting started. – Mark Twain",
  "Each morning we are born again. What we do today matters most. – Buddha",
  "The only way to do great work is to love what you do. – Steve Jobs",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. – Winston Churchill",
  "The future depends on what you do today. – Mahatma Gandhi",
  "Don't watch the clock; do what it does. Keep going. – Sam Levenson",
  "Believe you can and you're halfway there. – Theodore Roosevelt",
  "Start where you are. Use what you have. Do what you can. – Arthur Ashe",
  "The best time to plant a tree was 20 years ago. The second best time is now. – Chinese Proverb",
  "Your time is limited, don't waste it living someone else's life. – Steve Jobs",
];

const EVENING_REFLECTIONS = [
  "Rest and self-care are so important. When you take time to replenish your spirit, it allows you to serve others from the overflow.",
  "What went well today is as important as what you'll do tomorrow.",
  "Finish each day and be done with it. Tomorrow is a new day.",
  "The day is done. Be proud of yourself for making it through.",
  "Take a moment to appreciate your effort, not just your results.",
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRandomQuote(quotes: string[]): string {
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function formatGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' });
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createDailyBriefingTools() {
  return {
    getMorningBriefing: llm.tool({
      description: `Get a comprehensive morning briefing.
Use when user says:
- "Good morning"
- "What's on my plate today?"
- "Brief me"
- "Start my day"`,
      parameters: z.object({
        userName: z.string().optional().describe('User\'s name for personalization'),
      }),
      execute: async ({ userName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string; name?: string } | undefined;
        const userId = userData?.userId || 'default';
        const name = userName || userData?.name || '';

        const greeting = formatGreeting();
        const date = getFormattedDate();
        const dayOfWeek = getDayOfWeek();

        let response = `☀️ **${greeting}${name ? ', ' + name : ''}!**\n`;
        response += `📅 ${date}\n\n`;

        // Tasks
        try {
          const todayTasks = getTodaysTasks(userId);
          const overdueTasks = getOverdueTasks(userId);

          if (overdueTasks.length > 0) {
            response += `⚠️ **Overdue:** ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''}\n`;
          }

          if (todayTasks.length > 0) {
            response += `📋 **Today's Tasks:** ${todayTasks.length}\n`;
            const topTasks = todayTasks.slice(0, 3);
            topTasks.forEach((t) => {
              const priority = t.priority === 'urgent' || t.priority === 'high' ? '🔴 ' : '';
              response += `  • ${priority}${t.title}\n`;
            });
            if (todayTasks.length > 3) {
              response += `  ...and ${todayTasks.length - 3} more\n`;
            }
          } else {
            response += `📋 **Tasks:** All clear! ✨\n`;
          }
          response += '\n';
        } catch {
          // Tasks module not loaded
        }

        // Habits
        try {
          const dueHabits = getDueHabits(userId);
          if (dueHabits.length > 0) {
            response += `✨ **Habits to do:** ${dueHabits.length}\n`;
            dueHabits.slice(0, 3).forEach((h: Habit) => {
              const streak = calculateStreak(h.id);
              const streakStr = streak > 0 ? ` 🔥${streak}` : '';
              response += `  • ${h.name}${streakStr}\n`;
            });
            response += '\n';
          }
        } catch {
          // Habits module not loaded
        }

        // Medications
        try {
          const dueMeds = getDueDoses(userId);
          const upcomingMeds = getUpcomingDoses(userId);
          const needsRefill = getMedsNeedingRefill(userId);

          if (dueMeds.length > 0) {
            response += `💊 **Medications due now:** ${dueMeds.length}\n`;
            dueMeds.forEach((d: { medication: Medication; scheduledTime: string }) => {
              response += `  • ${d.medication.name} (${d.medication.dosage})\n`;
            });
            response += '\n';
          } else if (upcomingMeds.length > 0) {
            const next = upcomingMeds[0];
            const time = next.scheduledTime;
            const [hours, mins] = time.split(':').map(Number);
            const period = hours >= 12 ? 'PM' : 'AM';
            const hours12 = hours % 12 || 12;
            response += `💊 **Next medication:** ${next.medication.name} at ${hours12}:${mins.toString().padStart(2, '0')} ${period}\n\n`;
          }

          if (needsRefill.length > 0) {
            response += `⚠️ **Refill needed:** ${needsRefill.map((m: Medication) => m.name).join(', ')}\n\n`;
          }
        } catch {
          // Medications module not loaded
        }

        // Bills
        try {
          const upcomingBills = getUpcomingBills(userId, 7);
          if (upcomingBills.length > 0) {
            const total = upcomingBills.reduce((sum: number, b: Bill) => sum + b.amount, 0);
            response += `💰 **Bills this week:** ${upcomingBills.length} ($${total.toFixed(0)})\n\n`;
          }
        } catch {
          // Bills module not loaded
        }

        // Motivational quote
        const quote = getRandomQuote(MORNING_QUOTES);
        response += `---\n💭 *"${quote}"*`;

        return response;
      },
    }),

    getEveningReflection: llm.tool({
      description: `Get an end-of-day reflection prompt.
Use when user says:
- "End my day"
- "Daily reflection"
- "How did I do today?"`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        let response = `🌙 **Evening Reflection**\n`;
        response += `${getFormattedDate()}\n\n`;

        // Check what was accomplished
        try {
          const todayTasks = getTodaysTasks(userId);
          const overdueTasks = getOverdueTasks(userId);
          const completedToday = todayTasks.filter((t) => t.status === 'completed');

          response += `**📊 Today's Progress:**\n`;
          response += `  ✅ Completed: ${completedToday.length} task${completedToday.length !== 1 ? 's' : ''}\n`;

          if (todayTasks.length > completedToday.length) {
            response += `  📋 Remaining: ${todayTasks.length - completedToday.length}\n`;
          }

          if (overdueTasks.length > 0) {
            response += `  ⚠️ Overdue: ${overdueTasks.length}\n`;
          }
          response += '\n';
        } catch {
          // Tasks module not loaded
        }

        // Habit progress
        try {
          const dueHabits = getDueHabits(userId);
          if (dueHabits.length === 0) {
            response += `✨ **All habits completed!** Great discipline!\n\n`;
          } else {
            response += `🔔 **Habits still pending:** ${dueHabits.length}\n`;
            dueHabits.forEach((h: Habit) => {
              response += `  • ${h.name}\n`;
            });
            response += '\n';
          }
        } catch {
          // Habits module not loaded
        }

        // Journal prompt
        try {
          const todayJournal = getTodayJournal(userId);
          const journalStreak = getJournalStreak(userId);

          if (!todayJournal) {
            response += `📓 **Haven't journaled yet today**\n`;
            response += `  🔥 Current streak: ${journalStreak} days\n`;
            response += `  Say "let's journal" to reflect on your day!\n\n`;
          } else {
            response += `📓 **Journaled today** ✅ (${journalStreak} day streak)\n\n`;
          }
        } catch {
          // Notes module not loaded
        }

        // Reflection prompt
        const reflection = getRandomQuote(EVENING_REFLECTIONS);
        response += `---\n`;
        response += `💭 *${reflection}*\n\n`;

        response += `**Reflection Questions:**\n`;
        response += `1. What was your biggest win today?\n`;
        response += `2. What would you do differently?\n`;
        response += `3. What are you grateful for?\n`;

        return response;
      },
    }),

    getQuickStatus: llm.tool({
      description: `Get a quick status check - what needs attention right now.
Use for "what's up?" or "quick update" requests.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        let response = `⚡ **Quick Status**\n\n`;
        let hasItems = false;

        // Overdue tasks
        try {
          const overdue = getOverdueTasks(userId);
          if (overdue.length > 0) {
            response += `⚠️ **${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}**\n`;
            hasItems = true;
          }
        } catch {}

        // Due medications
        try {
          const dueMeds = getDueDoses(userId);
          if (dueMeds.length > 0) {
            response += `💊 **${dueMeds.length} medication${dueMeds.length > 1 ? 's' : ''} due**\n`;
            hasItems = true;
          }
        } catch {}

        // Due habits
        try {
          const dueHabits = getDueHabits(userId);
          if (dueHabits.length > 0) {
            response += `✨ **${dueHabits.length} habit${dueHabits.length > 1 ? 's' : ''} to do**\n`;
            hasItems = true;
          }
        } catch {}

        // Bills due soon
        try {
          const urgentBills = getUpcomingBills(userId, 3);
          if (urgentBills.length > 0) {
            response += `💰 **${urgentBills.length} bill${urgentBills.length > 1 ? 's' : ''} due in 3 days**\n`;
            hasItems = true;
          }
        } catch {}

        if (!hasItems) {
          response += `✅ All clear! Nothing urgent right now.\n`;
        }

        return response;
      },
    }),

    getWeeklyReview: llm.tool({
      description: `Get a weekly review of progress and accomplishments.
Use for Sunday/Monday weekly reviews.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        let response = `📊 **Weekly Review**\n`;
        response += `Week of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}\n\n`;

        // Tasks overview
        try {
          const upcoming = getUpcomingTasks(userId, 7);
          const overdue = getOverdueTasks(userId);

          response += `**📋 Tasks**\n`;
          response += `  • Upcoming this week: ${upcoming.length}\n`;
          if (overdue.length > 0) {
            response += `  • Overdue: ${overdue.length}\n`;
          }
          response += '\n';
        } catch {}

        // Bill summary
        try {
          const weekBills = getUpcomingBills(userId, 7);
          const monthlyTotal = calculateMonthlyTotal(userId);

          response += `**💰 Bills**\n`;
          response += `  • Due this week: ${weekBills.length}\n`;
          if (monthlyTotal > 0) {
            response += `  • Monthly total: $${monthlyTotal.toFixed(0)}\n`;
          }
          response += '\n';
        } catch {}

        // Journal streak
        try {
          const journalStreak = getJournalStreak(userId);
          response += `**📓 Journaling**\n`;
          response += `  • Current streak: ${journalStreak} day${journalStreak !== 1 ? 's' : ''}\n\n`;
        } catch {}

        // Planning prompts
        response += `---\n`;
        response += `**Planning Questions:**\n`;
        response += `1. What are your top 3 priorities this week?\n`;
        response += `2. What habits do you want to focus on?\n`;
        response += `3. What can you let go of this week?\n`;

        return response;
      },
    }),

    getMotivation: llm.tool({
      description: `Get a motivational message or quote.
Use when user needs encouragement.`,
      parameters: z.object({
        type: z.enum(['quote', 'encouragement', 'reminder']).optional().default('quote'),
      }),
      execute: async ({ type }) => {
        if (type === 'quote') {
          const quote = getRandomQuote(MORNING_QUOTES);
          return `💭 *"${quote}"*`;
        }

        if (type === 'encouragement') {
          const messages = [
            "You're doing better than you think. Keep going!",
            "Progress, not perfection. Every step counts.",
            "Remember why you started. You've got this!",
            "One task at a time. One day at a time.",
            "You've overcome challenges before. You'll overcome this too.",
            "Be kind to yourself. You're doing your best.",
          ];
          return `🌟 ${getRandomQuote(messages)}`;
        }

        // Reminder
        const reminders = [
          "Don't forget to take breaks. Rest is productive.",
          "Have you had water recently? Stay hydrated!",
          "Check your posture. Shoulders back, deep breath.",
          "When's the last time you stepped outside?",
          "Remember: done is better than perfect.",
        ];
        return `💡 ${getRandomQuote(reminders)}`;
      },
    }),
  };
}

export default createDailyBriefingTools;

// Export helper functions for use by other modules
export {
  getFormattedDate,
  getDayOfWeek,
  formatGreeting,
  getRandomQuote,
  MORNING_QUOTES,
  EVENING_REFLECTIONS,
};

