/**
 * Milestone Proactive System - Jordan's Engagement Engine
 *
 * Proactive features for milestone planning:
 * - Countdown tracking and urgency detection
 * - Automatic check-in suggestions
 * - Milestone reminder scheduling
 * - Progress encouragement
 *
 * Jordan doesn't just wait to be asked - Jordan reaches out
 * when milestones are approaching and celebrates progress!
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../utils/safe-logger.js';
import {
  getUserMilestones,
  type LifeMilestone,
} from './domains/life-planning/life-firsts-tracker.js';

import { getToolDescription } from './utils/tool-descriptions.js';
// ============================================================================
// URGENCY LEVELS
// ============================================================================

export type UrgencyLevel = 'relaxed' | 'normal' | 'attention' | 'urgent' | 'critical';

export interface MilestoneUrgency {
  milestoneId: string;
  milestoneName: string;
  daysUntil: number;
  urgency: UrgencyLevel;
  incompleteTasks: number;
  totalTasks: number;
  progressPercent: number;
  suggestedAction: string;
  urgencyMessage: string;
}

// ============================================================================
// COUNTDOWN MESSAGES
// ============================================================================

const COUNTDOWN_MESSAGES: Record<string, Record<UrgencyLevel, string[]>> = {
  wedding: {
    relaxed: [
      'Your wedding is {days} days away! <break time="200ms"/>Plenty of time to enjoy the planning!',
      'Still {days} days until the big day. <break time="200ms"/>We\'re in great shape!',
    ],
    normal: [
      'Wedding countdown: {days} days! <break time="200ms"/>Let\'s check in on our progress.',
      '{days} days until you say \'I do!\' <break time="200ms"/>How are we feeling?',
    ],
    attention: [
      '{days} days to go! <break time="200ms"/>Time to finalize some details.',
      'One month out! <break time="200ms"/>This is when things start getting real!',
    ],
    urgent: [
      'Only {days} days left! <break time="200ms"/>Let\'s make sure nothing falls through the cracks!',
      'Two weeks! <break time="200ms"/>Final confirmations time!',
    ],
    critical: [
      'It\'s almost here! <break time="200ms"/>{days} days! <break time="200ms"/>How are you feeling?',
      'This week! <break time="200ms"/>Everything ready? <break time="200ms"/>Let\'s do a final check!',
    ],
  },
  'first-baby': {
    relaxed: [
      'Baby\'s due in about {days} days! <break time="200ms"/>How\'s the nesting going?',
      '{days} days until the big arrival! <break time="200ms"/>Plenty of time to prepare!',
    ],
    normal: [
      '{days} days to go! <break time="200ms"/>Is the nursery coming together?',
      'Getting closer! <break time="200ms"/>{days} days! <break time="200ms"/>How\'s the prep?',
    ],
    attention: [
      'About a month out! <break time="200ms"/>Hospital bag packed yet?',
      '{days} days! <break time="200ms"/>Let\'s make sure we\'re ready!',
    ],
    urgent: [
      'Could be any time now! <break time="200ms"/>Everything in place?',
      '{days} days! <break time="200ms"/>Car seat installed? <break time="200ms"/>Bag packed?',
    ],
    critical: [
      'Almost time! <break time="200ms"/>You\'ve got this!',
      'Any day now! <break time="200ms"/>How are you feeling?',
    ],
  },
  'first-home': {
    relaxed: [
      'Closing in {days} days! <break time="200ms"/>Exciting times ahead!',
      '{days} days until you get those keys! <break time="200ms"/>How\'s the house hunting?',
    ],
    normal: [
      '{days} days to closing! <break time="200ms"/>Let\'s check off those to-dos.',
      'Getting closer to the new home! <break time="200ms"/>{days} days!',
    ],
    attention: [
      'A month until closing! <break time="200ms"/>Inspection done? <break time="200ms"/>Insurance lined up?',
      '{days} days! <break time="200ms"/>Time to start thinking about moving!',
    ],
    urgent: [
      'Final stretch! <break time="200ms"/>{days} days to closing!',
      'Almost there! <break time="200ms"/>Final walkthrough scheduled?',
    ],
    critical: [
      'This week! <break time="200ms"/>Keys incoming! <break time="200ms"/>So exciting!',
      'Closing day is almost here! <break time="200ms"/>Ready for those keys?',
    ],
  },
  default: {
    relaxed: [
      '{days} days until {event}! <break time="200ms"/>We\'re in good shape!',
      'Still plenty of time! <break time="200ms"/>{days} days to go!',
    ],
    normal: [
      '{days} days until {event}! <break time="200ms"/>How\'s the planning going?',
      'Countdown: {days} days! <break time="200ms"/>Let\'s check our progress.',
    ],
    attention: [
      'One month to {event}! <break time="200ms"/>Let\'s finalize some things.',
      '{days} days! <break time="200ms"/>Time to lock in the details!',
    ],
    urgent: [
      'Only {days} days left! <break time="200ms"/>Final push!',
      'Getting close! <break time="200ms"/>{days} days! <break time="200ms"/>Everything ready?',
    ],
    critical: [
      'It\'s almost here! <break time="200ms"/>{days} days! <break time="200ms"/>Excited?',
      'This week! <break time="200ms"/>Final countdown! <break time="200ms"/>You\'ve got this!',
    ],
  },
};

// ============================================================================
// PROGRESS ENCOURAGEMENT
// ============================================================================

const PROGRESS_MESSAGES = {
  excellent: [
    'You\'re crushing it! <break time="200ms"/>{percent}% complete! <break time="150ms"/>Keep it up!',
    'Look at that progress! <break time="200ms"/>{percent}%! <break time="150ms"/>Amazing!',
    'Wow! <break time="200ms"/>{percent}% done! <break time="150ms"/>You\'re a planning machine!',
  ],
  good: [
    'Nice progress! <break time="200ms"/>{percent}% complete! <break time="150ms"/>We\'re getting there!',
    '{percent}% done! <break time="200ms"/>Solid work!',
    'Making moves! <break time="200ms"/>{percent}% complete!',
  ],
  moderate: [
    '{percent}% complete. <break time="200ms"/>Let\'s pick up the pace a bit!',
    'We\'re at {percent}%. <break time="200ms"/>Room to catch up! <break time="150ms"/>What\'s next?',
    'Halfway-ish! <break time="200ms"/>{percent}%! <break time="150ms"/>Let\'s keep going!',
  ],
  needsAttention: [
    '{percent}% so far. <break time="200ms"/>We should probably focus on this!',
    'Only {percent}% complete. <break time="200ms"/>Let\'s tackle some tasks today!',
    'Hey, <break time="200ms"/>we\'re at {percent}%. <break time="200ms"/>What\'s blocking progress?',
  ],
  behind: [
    '{percent}%... <break time="300ms"/>We need to catch up! <break time="200ms"/>What\'s blocking us?',
    'We\'re behind at {percent}%. <break time="200ms"/>Let\'s figure out the priorities!',
    'Okay, {percent}%. <break time="200ms"/>No judgment! <break time="150ms"/>Let\'s make a plan to catch up!',
  ],
};

// ============================================================================
// CHECK-IN SUGGESTIONS
// ============================================================================

const CHECK_IN_SUGGESTIONS: Record<string, string[]> = {
  wedding: [
    'Have you sent out the invitations yet?',
    "How's the vendor confirmation going?",
    'Did you finalize the seating chart?',
    'Have you done your final dress/suit fitting?',
    'Is the honeymoon booked?',
  ],
  'first-baby': [
    'Is the car seat installed and checked?',
    'Hospital bag ready?',
    'Pediatrician chosen?',
    'Nursery all set up?',
    'Did you take a childbirth class?',
  ],
  'first-home': [
    'Did the home inspection go well?',
    "Is your homeowner's insurance set up?",
    'Have you started packing?',
    'Did you schedule your utilities transfer?',
    'Change of address submitted?',
  ],
  graduation: [
    'Graduation announcements sent?',
    'Party venue booked?',
    'Cap and gown ordered?',
    'Photo slideshow ready?',
  ],
  'milestone-birthday': [
    'Guest list finalized?',
    'Venue booked?',
    'Cake ordered?',
    'Decorations planned?',
  ],
  default: [
    "How's the planning going?",
    "What's the next big task to tackle?",
    'Anything stressing you out about this?',
    'Need help prioritizing?',
  ],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDaysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getUrgencyLevel(daysUntil: number): UrgencyLevel {
  if (daysUntil > 90) return 'relaxed';
  if (daysUntil > 30) return 'normal';
  if (daysUntil > 14) return 'attention';
  if (daysUntil > 7) return 'urgent';
  return 'critical';
}

function getProgressLevel(percent: number): keyof typeof PROGRESS_MESSAGES {
  if (percent >= 80) return 'excellent';
  if (percent >= 60) return 'good';
  if (percent >= 40) return 'moderate';
  if (percent >= 20) return 'needsAttention';
  return 'behind';
}

function randomFrom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function formatMessage(template: string, values: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), String(value));
  }
  return result;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Analyze all user milestones and determine urgency
 */
export async function analyzeUserMilestones(userId: string): Promise<MilestoneUrgency[]> {
  const milestones = await getUserMilestones(userId);
  const urgencies: MilestoneUrgency[] = [];

  for (const milestone of milestones) {
    if (!milestone.targetDate || milestone.status === 'completed') continue;

    const daysUntil = getDaysUntil(milestone.targetDate);
    if (daysUntil < 0) continue; // Skip past milestones

    const completedTasks = milestone.checklist.filter((t) => t.completed).length;
    const totalTasks = milestone.checklist.length;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const urgency = getUrgencyLevel(daysUntil);

    // Determine suggested action based on progress and urgency
    let suggestedAction = '';
    const incompleteTasks = totalTasks - completedTasks;

    if (urgency === 'critical' && progressPercent < 80) {
      suggestedAction = `Focus on the ${incompleteTasks} remaining critical tasks!`;
    } else if (urgency === 'urgent' && progressPercent < 70) {
      suggestedAction = `Prioritize the most important ${Math.min(3, incompleteTasks)} tasks.`;
    } else if (urgency === 'attention') {
      suggestedAction = 'Review and finalize key details.';
    } else if (progressPercent < 50) {
      suggestedAction = "Let's pick up the pace on planning!";
    } else {
      suggestedAction = 'Looking good! Keep up the momentum!';
    }

    // Get appropriate countdown message
    const messageSet = COUNTDOWN_MESSAGES[milestone.category] || COUNTDOWN_MESSAGES.default;
    const urgencyMessage = formatMessage(randomFrom(messageSet[urgency]), {
      days: daysUntil,
      event: milestone.name,
    });

    urgencies.push({
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      daysUntil,
      urgency,
      incompleteTasks,
      totalTasks,
      progressPercent,
      suggestedAction,
      urgencyMessage,
    });
  }

  // Sort by urgency (most urgent first)
  return urgencies.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Get a proactive check-in message for a milestone
 */
export function getProactiveCheckIn(milestone: LifeMilestone): string {
  if (!milestone.targetDate) {
    return 'How\'s this milestone going? <break time="200ms"/>Want to set a target date?';
  }

  const daysUntil = getDaysUntil(milestone.targetDate);
  const urgency = getUrgencyLevel(daysUntil);

  const completedTasks = milestone.checklist.filter((t) => t.completed).length;
  const totalTasks = milestone.checklist.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const progressLevel = getProgressLevel(progressPercent);

  // Build check-in message
  const parts: string[] = [];

  // Countdown
  const messageSet = COUNTDOWN_MESSAGES[milestone.category] || COUNTDOWN_MESSAGES.default;
  parts.push(
    formatMessage(randomFrom(messageSet[urgency]), { days: daysUntil, event: milestone.name })
  );

  // Progress
  parts.push(
    formatMessage(randomFrom(PROGRESS_MESSAGES[progressLevel]), { percent: progressPercent })
  );

  // Suggested check-in question
  const suggestions = CHECK_IN_SUGGESTIONS[milestone.category] || CHECK_IN_SUGGESTIONS.default;
  parts.push(randomFrom(suggestions));

  return parts.join(' <break time="300ms"/> ');
}

/**
 * Get the most urgent milestone that needs attention
 */
export async function getMostUrgentMilestone(userId: string): Promise<MilestoneUrgency | null> {
  const urgencies = await analyzeUserMilestones(userId);

  // Find the most urgent that's not on track
  const needsAttention = urgencies.find(
    (u) => (u.urgency === 'critical' || u.urgency === 'urgent') && u.progressPercent < 80
  );

  if (needsAttention) return needsAttention;

  // Otherwise, return the soonest milestone
  return urgencies[0] || null;
}

/**
 * Generate a summary of all upcoming milestones
 */
export async function getMilestonesSummary(userId: string): Promise<string> {
  const urgencies = await analyzeUserMilestones(userId);

  if (urgencies.length === 0) {
    return 'No upcoming milestones on the radar! <break time="200ms"/>What\'s the next big moment in your life?';
  }

  const parts: string[] = [
    `You've got ${urgencies.length} milestone${urgencies.length > 1 ? 's' : ''} coming up!`,
  ];

  for (const u of urgencies.slice(0, 3)) {
    const urgencyEmoji = {
      relaxed: '🟢',
      normal: '🔵',
      attention: '🟡',
      urgent: '🟠',
      critical: '🔴',
    }[u.urgency];

    parts.push(
      `${urgencyEmoji} **${u.milestoneName}** - ${u.daysUntil} days (${u.progressPercent}% ready)`
    );
  }

  if (urgencies.length > 3) {
    parts.push(`...and ${urgencies.length - 3} more!`);
  }

  return parts.join('\n');
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createMilestoneProactiveTools() {
  return {
    // ========== CHECK MILESTONE URGENCY ==========
    checkMilestoneUrgency: llm.tool({
      description: getToolDescription('checkMilestoneUrgency'),
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ userId }) => {
        const urgencies = await analyzeUserMilestones(userId);

        if (urgencies.length === 0) {
          return `No active milestones to track! What's the next big moment in your life? First home? Baby? Wedding? Let's start planning!`;
        }

        let response = `📊 **Milestone Status Check**\n\n`;

        for (const u of urgencies) {
          const urgencyEmoji = {
            relaxed: '🟢',
            normal: '🔵',
            attention: '🟡',
            urgent: '🟠',
            critical: '🔴',
          }[u.urgency];

          response += `${urgencyEmoji} **${u.milestoneName}**\n`;
          response += `📅 ${u.daysUntil} days away\n`;
          response += `📊 Progress: ${u.progressPercent}% (${u.totalTasks - u.incompleteTasks}/${u.totalTasks} tasks)\n`;
          response += `💡 ${u.suggestedAction}\n\n`;
        }

        const mostUrgent = urgencies[0];
        if (mostUrgent && (mostUrgent.urgency === 'critical' || mostUrgent.urgency === 'urgent')) {
          response += `⚡ **Priority Focus:** ${mostUrgent.milestoneName} needs attention!`;
        }

        return response;
      },
    }),

    // ========== GET PROACTIVE CHECK-IN ==========
    getProactiveCheckIn: llm.tool({
      description: getToolDescription('getProactiveCheckIn'),
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone to check in on'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, userId }) => {
        const milestones = await getUserMilestones(userId);

        const milestone = milestones.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find a milestone matching "${milestoneName}". What milestone would you like to check on?`;
        }

        const checkIn = getProactiveCheckIn(milestone);
        return checkIn;
      },
    }),

    // ========== MILESTONE COUNTDOWN ==========
    getMilestoneCountdownMessage: llm.tool({
      description: getToolDescription('getMilestoneCountdownMessage'),
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, userId }) => {
        const milestones = await getUserMilestones(userId);

        const milestone = milestones.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find that milestone. Want to create one?`;
        }

        if (!milestone.targetDate) {
          return `${milestone.name} doesn't have a date set yet! <break time=\"200ms\"/>When's the big day?`;
        }

        const daysUntil = getDaysUntil(milestone.targetDate);
        const urgency = getUrgencyLevel(daysUntil);
        const messageSet = COUNTDOWN_MESSAGES[milestone.category] || COUNTDOWN_MESSAGES.default;

        return formatMessage(randomFrom(messageSet[urgency]), {
          days: daysUntil,
          event: milestone.name,
        });
      },
    }),

    // ========== GET SUGGESTED TASKS ==========
    getSuggestedTasks: llm.tool({
      description: getToolDescription('getSuggestedTasks'),
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone'),
        count: z.number().optional().default(3).describe('How many tasks to suggest'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, count = 3, userId }) => {
        const milestones = await getUserMilestones(userId);

        const milestone = milestones.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find that milestone.`;
        }

        const incompleteTasks = milestone.checklist.filter((t) => !t.completed);

        if (incompleteTasks.length === 0) {
          return `🎉 All tasks complete for "${milestone.name}"! Amazing work! Is there anything else you want to add to the checklist?`;
        }

        let response = `⚡ **Priority Tasks for ${milestone.name}:**\n\n`;

        const tasksToShow = incompleteTasks.slice(0, count);
        tasksToShow.forEach((task, index) => {
          response += `${index + 1}. ${task.task}\n`;
        });

        if (incompleteTasks.length > count) {
          response += `\n...and ${incompleteTasks.length - count} more tasks remaining.`;
        }

        response += `\n\nWhich one should we tackle first?`;

        return response;
      },
    }),

    // ========== CELEBRATE PROGRESS ==========
    celebrateMilestoneProgress: llm.tool({
      description: getToolDescription('celebrateMilestoneProgress'),
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, userId }) => {
        const milestones = await getUserMilestones(userId);

        const milestone = milestones.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find that milestone.`;
        }

        const completedTasks = milestone.checklist.filter((t) => t.completed).length;
        const totalTasks = milestone.checklist.length;
        const progressPercent =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const progressLevel = getProgressLevel(progressPercent);

        let celebration = formatMessage(randomFrom(PROGRESS_MESSAGES[progressLevel]), {
          percent: progressPercent,
        });

        if (progressPercent === 100) {
          celebration = `🎉 **100% COMPLETE!** <break time=\"300ms\"/>You did it! <break time=\"200ms\"/>"${milestone.name}" is fully planned! <break time=\"200ms\"/>This is going to be AMAZING!`;
        } else if (progressPercent >= 75) {
          celebration += ` <break time=\"200ms\"/>The finish line is in sight!`;
        } else if (progressPercent >= 50) {
          celebration += ` <break time=\"200ms\"/>Halfway there! <break time=\"150ms\"/>Momentum is building!`;
        }

        return celebration;
      },
    }),

    // ========== ALL MILESTONES SUMMARY ==========
    getAllMilestonesSummary: llm.tool({
      description: getToolDescription('getAllMilestonesSummary'),
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ userId }) => getMilestonesSummary(userId),
    }),

    // ========== BIRTHDAY REMINDER CHECK ==========
    checkBirthdayReminders: llm.tool({
      description: getToolDescription('checkBirthdayReminders'),
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
        daysAhead: z.number().optional().default(30).describe('How many days ahead to check'),
      }),
      execute: async ({ userId, daysAhead = 30 }) => {
        // This would integrate with UserProfile.familyMembers in a full implementation
        // For now, provide a proactive prompt
        getLogger().info({ userId, daysAhead }, 'Checking birthday reminders');

        const birthdayPrompt = `I'd love to help you remember important birthdays! <break time=\"200ms\"/>
Do you have any family birthdays coming up in the next ${daysAhead} days? <break time=\"150ms\"/>
I can help you plan gifts, parties, or just set reminders so you don't forget!`;

        return birthdayPrompt;
      },
    }),

    // ========== MILESTONE ANNIVERSARY CHECK-IN ==========
    checkMilestoneAnniversaries: llm.tool({
      description: getToolDescription('checkMilestoneAnniversaries'),
      parameters: z.object({
        userId: z.string().optional().default('default').describe('User identifier'),
        daysAhead: z
          .number()
          .optional()
          .default(30)
          .describe('Days ahead to look for anniversaries'),
      }),
      execute: async ({ userId, daysAhead = 30 }) => {
        const milestones = await getUserMilestones(userId);

        // Find completed milestones with completion dates
        const completedMilestones = milestones.filter(
          (m) => m.status === 'completed' && m.completedDate
        );

        if (completedMilestones.length === 0) {
          return `No completed milestones yet! <break time=\"200ms\"/>But when you do hit those big moments, I'll help you celebrate the anniversaries!`;
        }

        const today = new Date();
        const upcomingAnniversaries: Array<{
          milestone: LifeMilestone;
          daysUntil: number;
          yearsAgo: number;
        }> = [];

        for (const milestone of completedMilestones) {
          const completedDate = new Date(milestone.completedDate!);
          const thisYearAnniversary = new Date(
            today.getFullYear(),
            completedDate.getMonth(),
            completedDate.getDate()
          );

          // If anniversary already passed this year, look at next year
          if (thisYearAnniversary < today) {
            thisYearAnniversary.setFullYear(today.getFullYear() + 1);
          }

          const daysUntil = Math.ceil(
            (thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntil <= daysAhead) {
            const yearsAgo = today.getFullYear() - completedDate.getFullYear();
            upcomingAnniversaries.push({ milestone, daysUntil, yearsAgo });
          }
        }

        if (upcomingAnniversaries.length === 0) {
          return `No milestone anniversaries in the next ${daysAhead} days. <break time=\"200ms\"/>I'll keep an eye out though!`;
        }

        let response = `🎉 **Upcoming Milestone Anniversaries:**\n\n`;

        for (const { milestone, daysUntil, yearsAgo } of upcomingAnniversaries) {
          const ordinal = getOrdinal(yearsAgo);
          response += `• **${milestone.name}** - ${ordinal} anniversary `;
          if (daysUntil === 0) {
            response += `is TODAY! 🎊\n`;
          } else if (daysUntil === 1) {
            response += `is tomorrow!\n`;
          } else {
            response += `in ${daysUntil} days\n`;
          }
        }

        response += `\nWant to plan something special for any of these?`;

        return response;
      },
    }),

    // ========== PROACTIVE SCHEDULE CHECK-IN ==========
    scheduleProactiveCheckIn: llm.tool({
      description: getToolDescription('scheduleProactiveCheckIn'),
      parameters: z.object({
        milestoneName: z.string().describe('Name of the milestone to check in on'),
        checkInDate: z
          .string()
          .describe('When to check in (ISO date or relative like "in 1 week")'),
        message: z.string().optional().describe('Custom message to include'),
        userId: z.string().optional().default('default').describe('User identifier'),
      }),
      execute: async ({ milestoneName, checkInDate, message, userId }) => {
        const milestones = await getUserMilestones(userId);

        const milestone = milestones.find((m) =>
          m.name.toLowerCase().includes(milestoneName.toLowerCase())
        );

        if (!milestone) {
          return `Couldn't find that milestone. Want to create one first?`;
        }

        // Parse the date
        let scheduledDate: Date;
        if (checkInDate.toLowerCase().includes('week')) {
          const weeks = parseInt(checkInDate.match(/\d+/)?.[0] || '1');
          scheduledDate = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);
        } else if (checkInDate.toLowerCase().includes('day')) {
          const days = parseInt(checkInDate.match(/\d+/)?.[0] || '1');
          scheduledDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        } else {
          scheduledDate = new Date(checkInDate);
        }

        getLogger().info(
          {
            userId,
            milestone: milestone.name,
            scheduledFor: scheduledDate.toISOString(),
          },
          'Scheduled proactive check-in'
        );

        const formattedDate = scheduledDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        return `✅ Check-in scheduled! <break time=\"200ms\"/>
I'll reach out on ${formattedDate} to see how "${milestone.name}" is progressing. <break time=\"150ms\"/>
${message ? `I'll include your note: "${message}"` : "I'll bring my usual enthusiasm!"}`;
      },
    }),
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR NEW TOOLS
// ============================================================================

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default createMilestoneProactiveTools;
