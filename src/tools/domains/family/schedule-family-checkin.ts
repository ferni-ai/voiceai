/**
 * Schedule Family Check-in Tool
 *
 * Enables users to schedule proactive check-in calls to their family members.
 * Ferni will call the family member at the scheduled time and have a natural
 * conversation to check on their wellbeing.
 *
 * Example invocations:
 * - "Call my mom every Sunday at 2pm"
 * - "Check in with dad twice a week"
 * - "Schedule a call to grandma tomorrow morning"
 *
 * @module tools/domains/family/schedule-family-checkin
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import type { DayOfWeek } from '../../../services/family/proactive-family-checkin.js';

const log = getLogger().child({ module: 'schedule-family-checkin' });

// ============================================================================
// TOOL RESULTS
// ============================================================================

interface ScheduleCheckinResult {
  success: boolean;
  message: string;
  scheduleId?: string;
  nextCallTime?: string;
}

interface ListSchedulesResult {
  success: boolean;
  message: string;
  schedules?: Array<{
    id: string;
    name: string;
    frequency: string;
    nextCall: string;
    isActive: boolean;
  }>;
}

interface CheckinStatusResult {
  success: boolean;
  message: string;
  recentCalls?: Array<{
    date: string;
    duration: string;
    mood: string;
    summary: string;
  }>;
}

// ============================================================================
// SCHEDULE FAMILY CHECK-IN TOOL
// ============================================================================

function createScheduleFamilyCheckinTool(ctx: ToolContext): Tool {
  return {
    description: `Schedule proactive check-in calls to a family member.
Ferni will call them at the scheduled time and have a natural conversation to check on their wellbeing.
After each call, Ferni will brief you on how they're doing.

Parameters:
- familyMemberName (string): Name of the family member (must be a sponsored identity)
- frequency (string): How often to call - "daily", "weekly", "biweekly", "monthly", or "once"
- preferredTime (string): Time to call (e.g., "2pm", "10:00 AM", "14:00")
- dayOfWeek (string, optional): For weekly calls, which day (e.g., "Sunday", "Monday")
- timezone (string, optional): Family member's timezone (default: sponsor's timezone)
- topicsOfInterest (array, optional): Topics they enjoy discussing
- healthConcerns (array, optional): Health conditions to gently check on
- maxDurationMinutes (number, optional): Maximum call length (default: 15)

Examples:
- "Call mom every Sunday at 2pm" → frequency: weekly, dayOfWeek: Sunday, preferredTime: 14:00
- "Check in with dad daily in the morning" → frequency: daily, preferredTime: 09:00
- "Schedule a one-time call to grandma tomorrow at 3pm" → frequency: once, preferredTime: 15:00`,
    parameters: {
      type: 'object',
      properties: {
        familyMemberName: {
          type: 'string',
          description: 'Name of the family member to call',
        },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'biweekly', 'monthly', 'once'],
          description: 'How often to call',
        },
        preferredTime: {
          type: 'string',
          description: 'Time to call (e.g., "2pm", "14:00")',
        },
        dayOfWeek: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          description: 'Day of week for weekly/biweekly calls',
        },
        timezone: {
          type: 'string',
          description: 'Family member timezone (e.g., "America/New_York")',
        },
        topicsOfInterest: {
          type: 'array',
          items: { type: 'string' },
          description: 'Topics they enjoy discussing',
        },
        healthConcerns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Health conditions to gently check on',
        },
        maxDurationMinutes: {
          type: 'number',
          description: 'Maximum call length in minutes (default: 15)',
        },
      },
      required: ['familyMemberName', 'frequency', 'preferredTime'],
    },
    execute: async (args: {
      familyMemberName: string;
      frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'once';
      preferredTime: string;
      dayOfWeek?: string;
      timezone?: string;
      topicsOfInterest?: string[];
      healthConcerns?: string[];
      maxDurationMinutes?: number;
    }): Promise<ScheduleCheckinResult> => {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          message: 'I need to know who you are to schedule family check-ins.',
        };
      }

      try {
        // Find the sponsored identity by name
        const { getSponsoredIdentities } =
          await import('../../../services/identity/sponsored-identity.js');
        const identities = await getSponsoredIdentities(userId);

        // Find by name (case-insensitive)
        const identity = identities.find(
          (id) =>
            id.displayName.toLowerCase() === args.familyMemberName.toLowerCase() ||
            (id.preferredName &&
              id.preferredName.toLowerCase() === args.familyMemberName.toLowerCase())
        );

        if (!identity) {
          return {
            success: false,
            message: `I don't have ${args.familyMemberName} set up as a family member yet. Would you like to add them first? I'll need their phone number.`,
          };
        }

        // Parse preferred time
        const preferredTime = parseTimeString(args.preferredTime);
        if (!preferredTime) {
          return {
            success: false,
            message: `I couldn't understand the time "${args.preferredTime}". Could you say it like "2pm" or "14:00"?`,
          };
        }

        // Get user's timezone if not specified
        const timezone = args.timezone || (await getUserTimezone(userId)) || 'America/New_York';

        // Create the schedule
        const { createCheckinSchedule } =
          await import('../../../services/family/proactive-family-checkin.js');

        const schedule = await createCheckinSchedule({
          sponsorUserId: userId,
          sponsoredIdentityId: identity.id,
          familyMemberName: identity.displayName,
          relationship: identity.relationship,
          phoneNumber: identity.phoneNumber,
          frequency: args.frequency === 'once' ? 'custom' : args.frequency,
          daysOfWeek: args.dayOfWeek ? [args.dayOfWeek.toLowerCase() as DayOfWeek] : undefined,
          preferredTime,
          timezone,
          isActive: true,
          customIntervalDays: args.frequency === 'once' ? 1 : undefined,
          topicsOfInterest: args.topicsOfInterest,
          healthConcerns: args.healthConcerns,
          maxDurationMinutes: args.maxDurationMinutes || 15,
          leaveVoicemailIfNoAnswer: true,
        });

        log.info(
          {
            userId,
            scheduleId: schedule.id,
            familyMemberName: identity.displayName,
            frequency: args.frequency,
          },
          'Created family check-in schedule'
        );

        // Format the confirmation message
        const frequencyText = formatFrequency(args.frequency, args.dayOfWeek);
        const timeText = formatTimeForDisplay(preferredTime);
        const nextCallDate = new Date(schedule.nextScheduledCall);
        const nextCallText = formatNextCall(nextCallDate);

        return {
          success: true,
          message: `Got it! I'll call ${identity.displayName} ${frequencyText} around ${timeText}. My first call will be ${nextCallText}. After each call, I'll let you know how they're doing.`,
          scheduleId: schedule.id,
          nextCallTime: schedule.nextScheduledCall,
        };
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to schedule family check-in');
        return {
          success: false,
          message: 'I had trouble setting that up. Could you try again?',
        };
      }
    },
  };
}

// ============================================================================
// LIST FAMILY CHECK-IN SCHEDULES TOOL
// ============================================================================

function createListFamilyCheckinsTool(ctx: ToolContext): Tool {
  return {
    description: `List all scheduled family check-in calls.
Shows who you have scheduled for check-ins, how often, and when the next call is.

Use when the user asks:
- "What family check-ins do I have scheduled?"
- "When am I calling mom next?"
- "Show me my family call schedule"`,
    parameters: {
      type: 'object',
      properties: {
        includeInactive: {
          type: 'boolean',
          description: 'Include paused schedules (default: false)',
        },
      },
      required: [],
    },
    execute: async (args: { includeInactive?: boolean }): Promise<ListSchedulesResult> => {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          message: 'I need to know who you are to show your schedules.',
        };
      }

      try {
        const { getCheckinSchedules } =
          await import('../../../services/family/proactive-family-checkin.js');

        const schedules = await getCheckinSchedules(userId, !args.includeInactive);

        if (schedules.length === 0) {
          return {
            success: true,
            message:
              "You don't have any family check-ins scheduled yet. Would you like me to set some up? Just tell me who to call and when.",
          };
        }

        const scheduleList = schedules.map((s) => ({
          id: s.id,
          name: s.familyMemberName,
          frequency: formatFrequency(s.frequency, s.daysOfWeek?.[0]),
          nextCall: formatNextCall(new Date(s.nextScheduledCall)),
          isActive: s.isActive,
        }));

        const activeCount = scheduleList.filter((s) => s.isActive).length;
        const summaryLines = scheduleList.map(
          (s) =>
            `• ${s.name}: ${s.frequency}, next call ${s.nextCall}${s.isActive ? '' : ' (paused)'}`
        );

        return {
          success: true,
          message: `You have ${activeCount} active family check-in${activeCount !== 1 ? 's' : ''} scheduled:\n\n${summaryLines.join('\n')}`,
          schedules: scheduleList,
        };
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to list family check-ins');
        return {
          success: false,
          message: 'I had trouble getting your schedules. Could you try again?',
        };
      }
    },
  };
}

// ============================================================================
// GET FAMILY CHECK-IN STATUS TOOL
// ============================================================================

function createGetCheckinStatusTool(ctx: ToolContext): Tool {
  return {
    description: `Get the status of recent check-in calls to a family member.
Shows when you last called, how they were doing, and what you talked about.

Use when the user asks:
- "How was my call with mom?"
- "What did grandma say when you called her?"
- "How is dad doing based on our calls?"`,
    parameters: {
      type: 'object',
      properties: {
        familyMemberName: {
          type: 'string',
          description: 'Name of the family member to check on',
        },
        limit: {
          type: 'number',
          description: 'Number of recent calls to show (default: 3)',
        },
      },
      required: ['familyMemberName'],
    },
    execute: async (args: {
      familyMemberName: string;
      limit?: number;
    }): Promise<CheckinStatusResult> => {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          message: 'I need to know who you are to show call status.',
        };
      }

      try {
        // Find the schedule for this family member
        const { getCheckinSchedules, getRecentCallRecords, generateBriefingSummary } =
          await import('../../../services/family/proactive-family-checkin.js');

        const schedules = await getCheckinSchedules(userId, false);
        const schedule = schedules.find((s) =>
          s.familyMemberName.toLowerCase().includes(args.familyMemberName.toLowerCase())
        );

        if (!schedule) {
          return {
            success: false,
            message: `I don't have any check-in calls scheduled with ${args.familyMemberName}. Would you like to set that up?`,
          };
        }

        const records = await getRecentCallRecords(userId, schedule.id, args.limit || 3);

        if (records.length === 0) {
          return {
            success: true,
            message: `I haven't called ${schedule.familyMemberName} yet. The first call is scheduled for ${formatNextCall(new Date(schedule.nextScheduledCall))}.`,
          };
        }

        const recentCalls = records.map((r) => ({
          date: formatCallDate(new Date(r.callStartedAt)),
          duration: r.durationSeconds ? `${Math.round(r.durationSeconds / 60)} minutes` : 'N/A',
          mood: r.detectedMood || 'unknown',
          summary: r.conversationSummary || 'No summary available',
        }));

        // Generate a natural summary
        const latestCall = records[0];
        const briefing = generateBriefingSummary(latestCall);

        return {
          success: true,
          message: briefing,
          recentCalls,
        };
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get check-in status');
        return {
          success: false,
          message: 'I had trouble getting that information. Could you try again?',
        };
      }
    },
  };
}

// ============================================================================
// PAUSE/RESUME CHECK-IN TOOL
// ============================================================================

function createToggleCheckinTool(ctx: ToolContext): Tool {
  return {
    description: `Pause or resume family check-in calls.
Use when the user wants to temporarily stop calls without deleting the schedule.

Examples:
- "Pause calls to mom for now"
- "Resume calling grandma"
- "Stop the check-ins with dad temporarily"`,
    parameters: {
      type: 'object',
      properties: {
        familyMemberName: {
          type: 'string',
          description: 'Name of the family member',
        },
        action: {
          type: 'string',
          enum: ['pause', 'resume'],
          description: 'Whether to pause or resume calls',
        },
      },
      required: ['familyMemberName', 'action'],
    },
    execute: async (args: {
      familyMemberName: string;
      action: 'pause' | 'resume';
    }): Promise<{ success: boolean; message: string }> => {
      const userId = ctx.userId;
      if (!userId) {
        return {
          success: false,
          message: 'I need to know who you are to manage schedules.',
        };
      }

      try {
        const { getCheckinSchedules, toggleCheckinSchedule } =
          await import('../../../services/family/proactive-family-checkin.js');

        const schedules = await getCheckinSchedules(userId, false);
        const schedule = schedules.find((s) =>
          s.familyMemberName.toLowerCase().includes(args.familyMemberName.toLowerCase())
        );

        if (!schedule) {
          return {
            success: false,
            message: `I don't have any check-in calls scheduled with ${args.familyMemberName}.`,
          };
        }

        const isActive = args.action === 'resume';
        await toggleCheckinSchedule(userId, schedule.id, isActive);

        if (isActive) {
          return {
            success: true,
            message: `Got it! I'll resume calling ${schedule.familyMemberName}. The next call will be ${formatNextCall(new Date(schedule.nextScheduledCall))}.`,
          };
        } else {
          return {
            success: true,
            message: `Okay, I'll pause the calls to ${schedule.familyMemberName} for now. Just let me know when you'd like me to resume.`,
          };
        }
      } catch (error) {
        log.error({ error: String(error), userId }, 'Failed to toggle check-in');
        return {
          success: false,
          message: 'I had trouble with that. Could you try again?',
        };
      }
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse a time string like "2pm" or "14:00" to 24h format
 */
function parseTimeString(time: string): string | null {
  const cleanTime = time.toLowerCase().trim();

  // Try 24h format (14:00)
  const match24 = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
  }

  // Try 12h format (2pm, 2:30 pm, 2 pm)
  const match12 = cleanTime.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2] || '00';
    const period = match12[3];

    if (hours >= 1 && hours <= 12) {
      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }
      return `${hours.toString().padStart(2, '0')}:${minutes}`;
    }
  }

  return null;
}

/**
 * Format frequency for display
 */
function formatFrequency(frequency: string, dayOfWeek?: string): string {
  switch (frequency) {
    case 'daily':
      return 'every day';
    case 'weekly':
      return dayOfWeek ? `every ${dayOfWeek}` : 'every week';
    case 'biweekly':
      return dayOfWeek ? `every other ${dayOfWeek}` : 'every two weeks';
    case 'monthly':
      return 'once a month';
    case 'once':
    case 'custom':
      return 'one time';
    default:
      return frequency;
  }
}

/**
 * Format time for display
 */
function formatTimeForDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return minutes === 0
    ? `${displayHours}${period}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')}${period}`;
}

/**
 * Format next call date
 */
function formatNextCall(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `today at ${formatTimeForDisplay(date.toTimeString().slice(0, 5))}`;
  } else if (diffDays === 1) {
    return `tomorrow at ${formatTimeForDisplay(date.toTimeString().slice(0, 5))}`;
  } else if (diffDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `this ${dayName}`;
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

/**
 * Format call date for display
 */
function formatCallDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Get user's timezone from profile
 */
async function getUserTimezone(userId: string): Promise<string | null> {
  try {
    const { getUserContactInfo } = await import('../../../services/outreach/user-contact.js');
    const contact = await getUserContactInfo(userId);
    return contact?.timezone || null;
  } catch {
    return null;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const scheduleFamilyCheckinToolDef: ToolDefinition = {
  id: 'scheduleFamilyCheckin',
  name: 'Schedule Family Check-in',
  description: `Schedule proactive check-in calls to family members.
Ferni will call them and have a natural conversation to check on their wellbeing.`,
  domain: 'family',
  tags: ['family', 'scheduling', 'calls', 'checkin', 'proactive'],
  create: createScheduleFamilyCheckinTool,
};

export const listFamilyCheckinsToolDef: ToolDefinition = {
  id: 'listFamilyCheckins',
  name: 'List Family Check-ins',
  description: `List all scheduled family check-in calls.`,
  domain: 'family',
  tags: ['family', 'scheduling', 'calls', 'list'],
  create: createListFamilyCheckinsTool,
};

export const getCheckinStatusToolDef: ToolDefinition = {
  id: 'getFamilyCheckinStatus',
  name: 'Get Family Check-in Status',
  description: `Get the status of recent check-in calls to a family member.`,
  domain: 'family',
  tags: ['family', 'calls', 'status', 'summary'],
  create: createGetCheckinStatusTool,
};

export const toggleCheckinToolDef: ToolDefinition = {
  id: 'toggleFamilyCheckin',
  name: 'Pause/Resume Family Check-in',
  description: `Pause or resume family check-in calls.`,
  domain: 'family',
  tags: ['family', 'scheduling', 'calls', 'pause', 'resume'],
  create: createToggleCheckinTool,
};

// ============================================================================
// EXPORTS
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return [
    scheduleFamilyCheckinToolDef,
    listFamilyCheckinsToolDef,
    getCheckinStatusToolDef,
    toggleCheckinToolDef,
  ];
}
