/**
 * Alex Calendar Tools
 *
 * LLM-callable tools for calendar management.
 * Alex is the Communication Specialist and Chief of Staff.
 *
 * Tools:
 * - getCalendarToday: View today's schedule
 * - getCalendarWeek: View the week ahead
 * - createCalendarEvent: Schedule a new event
 * - updateCalendarEvent: Modify an existing event
 * - deleteCalendarEvent: Cancel an event
 * - findFreeTime: Find available time slots
 * - checkAvailability: Check if a specific time is free
 * - getDailyBriefing: Get a summary of the day
 * - suggestMeetingTime: Get optimal meeting time suggestions
 * - detectCalendarIssues: Find scheduling problems
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';
// Use the new unified calendar system (Ferni-native, provider-agnostic)
import {
  getEventsForDay,
  getEventsForWeek,
  createEvent,
  updateEvent,
  deleteEvent,
  findFreeTimeSlots,
  isTimeSlotAvailable,
  getDayOverview,
  getWeekOverview,
  type CreateEventInput,
} from '../../../services/calendar/index.js';
// Keep formatting helpers from old service for now
import {
  formatEventForSpeech,
  formatDayOverviewForSpeech,
} from '../../../services/calendar/calendar-service.js';
import {
  generateDailyBriefing,
  suggestMeetingTimes,
  detectCalendarAlerts,
  analyzeCalendarPatterns,
} from '../../../services/calendar/calendar-intelligence.js';
import {
  parseNaturalDate,
  suggestClarification,
  isValidForScheduling,
  suggestTimes,
} from '../../../services/calendar/natural-date-parser.js';
import {
  parseEventRequest,
  clarifyEventTime,
  confirmEvent,
  cancelPendingEvent,
  getPendingEvent,
} from '../../../services/calendar/event-confirmation.js';
import {
  getUpcomingBriefings,
  getPostMeetingFollowUps,
  analyzeConflicts,
  findBestTimeFor,
} from '../../../services/calendar/proactive-calendar.js';

const log = getLogger();

// ============================================================================
// GET CALENDAR TODAY
// ============================================================================

const getCalendarTodayDef: ToolDefinition = {
  id: 'getCalendarToday',
  name: 'Get Calendar Today',
  description: 'View today\'s calendar events and schedule',
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'today', 'events'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Get today\'s calendar events. Use when user asks "What\'s on my calendar today?" or "What do I have today?"',
      parameters: z.object({}),
      execute: async () => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your calendar. Could you help me with that?';
        }

        // Calendar is always available - it's native to Ferni
        const overview = await getDayOverview(userId, new Date());

        if (overview.totalMeetings === 0) {
          return 'Your calendar is clear today. No meetings scheduled.';
        }

        const events = overview.events.filter((e) => !e.isAllDay);
        const eventDescriptions = events.map((e) => formatEventForSpeech(e));

        let response = `You have ${overview.totalMeetings} meeting${overview.totalMeetings !== 1 ? 's' : ''} today. `;

        if (overview.firstEvent) {
          const firstTime = overview.firstEvent.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          response += `First up at ${firstTime}: ${overview.firstEvent.title}. `;
        }

        if (overview.isOverloaded) {
          response += 'Heads up, it\'s a packed day. ';
        }

        if (overview.hasBackToBack) {
          response += 'You have some back-to-back meetings. ';
        }

        response += 'Here\'s the rundown: ' + eventDescriptions.join('. ');

        log.info({ userId, eventCount: overview.totalMeetings }, 'Retrieved today calendar');
        return response;
      },
    }),
};

// ============================================================================
// GET CALENDAR WEEK
// ============================================================================

const getCalendarWeekDef: ToolDefinition = {
  id: 'getCalendarWeek',
  name: 'Get Calendar Week',
  description: 'View the week\'s calendar events and schedule overview',
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'week', 'overview'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Get this week\'s calendar overview. Use when user asks "What\'s my week look like?" or "Am I busy this week?"',
      parameters: z.object({}),
      execute: async () => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your calendar.';
        }

        const overview = await getWeekOverview(userId);

        if (overview.totalMeetings === 0) {
          return 'Your week is completely clear. No meetings scheduled.';
        }

        let response = `This week you have ${overview.totalMeetings} meetings total. `;
        response += `That\'s about ${overview.averageMeetingsPerDay.toFixed(1)} per day on average. `;

        if (overview.busiestDay) {
          response += `${overview.busiestDay.day} is your busiest with ${overview.busiestDay.meetings} meetings. `;
        }

        if (overview.lightestDay && overview.lightestDay.meetings === 0) {
          response += `${overview.lightestDay.day} is clear. `;
        }

        if (overview.backToBackDays.length > 0) {
          response += `Watch out for back-to-back meetings on ${overview.backToBackDays.join(' and ')}. `;
        }

        // Daily breakdown
        response += 'Day by day: ';
        for (const day of overview.days) {
          const dayOfWeek = day.date.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            response += formatDayOverviewForSpeech(day) + ' ';
          }
        }

        log.info({ userId, totalMeetings: overview.totalMeetings }, 'Retrieved week calendar');
        return response;
      },
    }),
};

// ============================================================================
// CREATE CALENDAR EVENT
// ============================================================================

const createCalendarEventDef: ToolDefinition = {
  id: 'createCalendarEvent',
  name: 'Create Calendar Event',
  description: 'Schedule a new event on the calendar',
  domain: 'calendar',
  tags: ['calendar', 'create', 'schedule', 'event', 'meeting'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Create a new calendar event. Use when user wants to schedule a meeting or add something to their calendar.',
      parameters: z.object({
        title: z.string().describe('Title of the event'),
        date: z.string().describe('Date in YYYY-MM-DD format'),
        startTime: z.string().describe('Start time in HH:MM format (24-hour)'),
        durationMinutes: z.number().optional().describe('Duration in minutes, defaults to 60'),
        description: z.string().optional().describe('Event description'),
        location: z.string().optional().describe('Event location'),
        attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to add to your calendar.';
        }

        // Parse date and time
        const [year, month, day] = params.date.split('-').map(Number);
        const [hour, minute] = params.startTime.split(':').map(Number);

        const startTime = new Date(year, month - 1, day, hour, minute);
        const durationMinutes = params.durationMinutes || 60;

        const eventInput: CreateEventInput = {
          title: params.title,
          startTime,
          durationMinutes,
          description: params.description,
          location: params.location,
          attendees: params.attendees,
        };

        const created = await createEvent(userId, eventInput);

        if (!created) {
          return 'Couldn\'t create the event. There might be an issue with your calendar connection.';
        }

        const formattedTime = startTime.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        log.info({ userId, eventTitle: params.title }, 'Created calendar event');
        return `Done. "${params.title}" is now on your calendar for ${formattedTime}. Duration: ${durationMinutes} minutes.`;
      },
    }),
};

// ============================================================================
// UPDATE CALENDAR EVENT
// ============================================================================

const updateCalendarEventDef: ToolDefinition = {
  id: 'updateCalendarEvent',
  name: 'Update Calendar Event',
  description: 'Modify an existing calendar event',
  domain: 'calendar',
  tags: ['calendar', 'update', 'modify', 'reschedule'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Update an existing calendar event. Use when user wants to change time, title, or other details of a meeting.',
      parameters: z.object({
        eventId: z.string().describe('ID of the event to update'),
        title: z.string().optional().describe('New title'),
        date: z.string().optional().describe('New date in YYYY-MM-DD format'),
        startTime: z.string().optional().describe('New start time in HH:MM format'),
        durationMinutes: z.number().optional().describe('New duration in minutes'),
        description: z.string().optional().describe('New description'),
        location: z.string().optional().describe('New location'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to update your calendar.';
        }

        const updates: Partial<CreateEventInput> = {};

        if (params.title) updates.title = params.title;
        if (params.description) updates.description = params.description;
        if (params.location) updates.location = params.location;

        if (params.date && params.startTime) {
          const [year, month, day] = params.date.split('-').map(Number);
          const [hour, minute] = params.startTime.split(':').map(Number);
          updates.startTime = new Date(year, month - 1, day, hour, minute);
        }

        if (params.durationMinutes && updates.startTime) {
          updates.endTime = new Date(updates.startTime.getTime() + params.durationMinutes * 60 * 1000);
        }

        const updated = await updateEvent(userId, params.eventId, updates);

        if (!updated) {
          return 'Couldn\'t update that event. It may have been deleted or there\'s a calendar connection issue.';
        }

        log.info({ userId, eventId: params.eventId }, 'Updated calendar event');
        return `Updated. ${updated.title} is now scheduled for ${updated.startTime.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}.`;
      },
    }),
};

// ============================================================================
// DELETE CALENDAR EVENT
// ============================================================================

const deleteCalendarEventDef: ToolDefinition = {
  id: 'deleteCalendarEvent',
  name: 'Delete Calendar Event',
  description: 'Cancel and remove a calendar event',
  domain: 'calendar',
  tags: ['calendar', 'delete', 'cancel', 'remove'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Delete a calendar event. Use when user wants to cancel a meeting.',
      parameters: z.object({
        eventId: z.string().describe('ID of the event to delete'),
        eventTitle: z.string().optional().describe('Title for confirmation'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to modify your calendar.';
        }

        const deleted = await deleteEvent(userId, params.eventId);

        if (!deleted) {
          return 'Couldn\'t delete that event. It may already be gone or there\'s a connection issue.';
        }

        const title = params.eventTitle || 'The event';
        log.info({ userId, eventId: params.eventId }, 'Deleted calendar event');
        return `${title} has been removed from your calendar.`;
      },
    }),
};

// ============================================================================
// FIND FREE TIME
// ============================================================================

const findFreeTimeDef: ToolDefinition = {
  id: 'findFreeTime',
  name: 'Find Free Time',
  description: 'Find available time slots on a given day',
  domain: 'calendar',
  tags: ['calendar', 'availability', 'free', 'slots'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Find free time slots. Use when user asks "When am I free?" or "What time slots are available?"',
      parameters: z.object({
        date: z.string().optional().describe('Date to check in YYYY-MM-DD format, defaults to today'),
        minDurationMinutes: z.number().optional().describe('Minimum slot duration needed, defaults to 30'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your availability.';
        }

        let checkDate = new Date();
        if (params.date) {
          const [year, month, day] = params.date.split('-').map(Number);
          checkDate = new Date(year, month - 1, day);
        }

        const slots = await findFreeTimeSlots(userId, checkDate, {
          minDurationMinutes: params.minDurationMinutes || 30,
          workDayOnly: true,
        });

        if (slots.length === 0) {
          const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' });
          return `${dayName} is fully booked. No gaps long enough for what you need.`;
        }

        const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        let response = `On ${dayName}, you have ${slots.length} free slot${slots.length !== 1 ? 's' : ''}: `;

        const slotDescriptions = slots.map((slot) => {
          const start = slot.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const end = slot.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          return `${start} to ${end} (${slot.durationMinutes} minutes)`;
        });

        response += slotDescriptions.join(', ');

        log.info({ userId, slotsFound: slots.length }, 'Found free time slots');
        return response;
      },
    }),
};

// ============================================================================
// CHECK AVAILABILITY
// ============================================================================

const checkAvailabilityDef: ToolDefinition = {
  id: 'checkAvailability',
  name: 'Check Availability',
  description: 'Check if a specific time slot is available',
  domain: 'calendar',
  tags: ['calendar', 'availability', 'check', 'time'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Check if a specific time is free. Use when user asks "Am I free at 2pm?" or "Is Thursday morning available?"',
      parameters: z.object({
        date: z.string().describe('Date in YYYY-MM-DD format'),
        startTime: z.string().describe('Start time in HH:MM format'),
        durationMinutes: z.number().optional().describe('Duration to check, defaults to 60'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your availability.';
        }

        const [year, month, day] = params.date.split('-').map(Number);
        const [hour, minute] = params.startTime.split(':').map(Number);
        const durationMinutes = params.durationMinutes || 60;

        const startTime = new Date(year, month - 1, day, hour, minute);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        const available = await isTimeSlotAvailable(userId, startTime, endTime);

        const formattedTime = startTime.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        if (available) {
          return `Yes, ${formattedTime} is free. Want me to schedule something?`;
        } else {
          return `No, you have something at ${formattedTime}. Want me to find the next available slot?`;
        }
      },
    }),
};

// ============================================================================
// GET DAILY BRIEFING
// ============================================================================

const getDailyBriefingDef: ToolDefinition = {
  id: 'getDailyBriefing',
  name: 'Get Daily Briefing',
  description: 'Get a summary and briefing for the day',
  domain: 'calendar',
  tags: ['calendar', 'briefing', 'summary', 'overview'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Generate a daily briefing with alerts and suggestions. Use for morning check-ins or "brief me on today".',
      parameters: z.object({
        date: z.string().optional().describe('Date in YYYY-MM-DD format, defaults to today'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to brief you on your day.';
        }

        let date = new Date();
        if (params.date) {
          const [year, month, day] = params.date.split('-').map(Number);
          date = new Date(year, month - 1, day);
        }

        const briefing = await generateDailyBriefing(userId, date);

        let response = briefing.summary + ' ';

        if (briefing.firstMeeting) {
          const time = briefing.firstMeeting.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          response += `First up: ${briefing.firstMeeting.title} at ${time}. `;
        }

        if (briefing.alerts.length > 0) {
          const concerns = briefing.alerts.filter((a) => a.severity === 'concern' || a.severity === 'warning');
          if (concerns.length > 0) {
            response += 'Heads up: ';
            response += concerns.map((a) => a.message).join(' ');
          }
        }

        if (briefing.suggestions.length > 0) {
          response += ' ' + briefing.suggestions.join(' ');
        }

        log.info({ userId, alertCount: briefing.alerts.length }, 'Generated daily briefing');
        return response;
      },
    }),
};

// ============================================================================
// SUGGEST MEETING TIME
// ============================================================================

const suggestMeetingTimeDef: ToolDefinition = {
  id: 'suggestMeetingTime',
  name: 'Suggest Meeting Time',
  description: 'Get optimal meeting time suggestions',
  domain: 'calendar',
  tags: ['calendar', 'suggest', 'optimal', 'schedule'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Suggest optimal times for a meeting. Use when user asks "When should I schedule this?" or needs help finding a good time.',
      parameters: z.object({
        durationMinutes: z.number().describe('How long the meeting needs to be'),
        preferMorning: z.boolean().optional().describe('Prefer morning times'),
        preferAfternoon: z.boolean().optional().describe('Prefer afternoon times'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to suggest meeting times.';
        }

        const suggestions = await suggestMeetingTimes(userId, {
          durationMinutes: params.durationMinutes,
          preferMorning: params.preferMorning,
          preferAfternoon: params.preferAfternoon,
          withinDays: 7,
        });

        if (suggestions.length === 0) {
          return `Couldn\'t find a ${params.durationMinutes}-minute slot in the next week. Your calendar is quite full.`;
        }

        let response = `Here are my top suggestions for a ${params.durationMinutes}-minute meeting: `;

        const topSuggestions = suggestions.slice(0, 3);
        response += topSuggestions
          .map((s, i) => {
            const time = s.slot.start.toLocaleString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            const reason = s.reason ? ` (${s.reason})` : '';
            return `${i + 1}. ${time}${reason}`;
          })
          .join('. ');

        if (suggestions[0].considerations.length > 0) {
          response += '. Note: ' + suggestions[0].considerations.join(', ');
        }

        log.info({ userId, suggestionsCount: suggestions.length }, 'Generated meeting suggestions');
        return response;
      },
    }),
};

// ============================================================================
// DETECT CALENDAR ISSUES
// ============================================================================

const detectCalendarIssuesDef: ToolDefinition = {
  id: 'detectCalendarIssues',
  name: 'Detect Calendar Issues',
  description: 'Find scheduling problems, overload, and back-to-back issues',
  domain: 'calendar',
  tags: ['calendar', 'issues', 'problems', 'overload'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description: 'Analyze calendar for problems. Use when user asks "Am I overbooked?" or "Any scheduling issues?"',
      parameters: z.object({
        daysToCheck: z.number().optional().describe('Number of days ahead to check, defaults to 7'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your calendar.';
        }

        const daysToCheck = params.daysToCheck || 7;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + daysToCheck);

        const alerts = await detectCalendarAlerts(userId, {
          start: new Date(),
          end: endDate,
        });

        if (alerts.length === 0) {
          return `Looking good. No scheduling issues in the next ${daysToCheck} days.`;
        }

        const concerns = alerts.filter((a) => a.severity === 'concern');
        const warnings = alerts.filter((a) => a.severity === 'warning');

        let response = '';

        if (concerns.length > 0) {
          response += `I spotted ${concerns.length} concern${concerns.length !== 1 ? 's' : ''}: `;
          response += concerns.map((c) => c.message).join(' ');
        }

        if (warnings.length > 0) {
          if (response) response += ' Also, ';
          response += `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}: `;
          response += warnings.map((w) => w.message).join(' ');
        }

        // Add suggestions
        const suggestionsSet = new Set(alerts.filter((a) => a.suggestion).map((a) => a.suggestion));
        if (suggestionsSet.size > 0) {
          response += ' Suggestions: ' + Array.from(suggestionsSet).join(' ');
        }

        log.info({ userId, alertCount: alerts.length }, 'Detected calendar issues');
        return response;
      },
    }),
};

// ============================================================================
// NATURAL LANGUAGE SCHEDULING
// ============================================================================

const scheduleEventNaturalDef: ToolDefinition = {
  id: 'scheduleEventNatural',
  name: 'Schedule Event (Natural Language)',
  description: 'Schedule an event using natural language like "tomorrow at 3pm" or "next Tuesday morning"',
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'natural', 'voice'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Schedule an event using natural language time expressions. Use when user says things like "schedule a meeting tomorrow at 3" or "add dentist appointment next Tuesday". Returns confirmation or asks for clarification.',
      parameters: z.object({
        request: z.string().describe('The full scheduling request in natural language'),
        duration: z.number().optional().describe('Duration in minutes (default 60)'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to schedule events.';
        }

        const result = await parseEventRequest(userId, params.request, params.duration);

        if (!result.success) {
          return result.clarificationPrompt || "I couldn't understand that. Could you try again?";
        }

        if (result.needsClarification) {
          // Store pending ID for follow-up
          log.info({ userId, pendingId: result.pendingEvent?.id }, 'Event needs clarification');
          return result.clarificationPrompt || 'Could you clarify the details?';
        }

        if (result.hasConflict) {
          log.info({ userId, conflict: result.conflictDescription }, 'Event has conflict');
          return result.clarificationPrompt || 'That time has a conflict. When else would work?';
        }

        if (result.readyToConfirm) {
          return result.confirmationPrompt || 'Ready to schedule. Should I go ahead?';
        }

        return 'Something went wrong. Could you try again?';
      },
    }),
};

// ============================================================================
// PRE-MEETING BRIEFING
// ============================================================================

const getPreMeetingBriefingDef: ToolDefinition = {
  id: 'getPreMeetingBriefing',
  name: 'Get Pre-Meeting Briefing',
  description: 'Get preparation tips and context for upcoming meetings',
  domain: 'calendar',
  tags: ['calendar', 'meeting', 'briefing', 'prep'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Get briefings for upcoming meetings including prep tips and context. Use when user asks "What should I know before my next meeting?" or is about to join a meeting.',
      parameters: z.object({
        windowMinutes: z.number().optional().describe('How far ahead to look (default 60 minutes)'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to get your briefings.';
        }

        const briefings = await getUpcomingBriefings(userId, params.windowMinutes || 60);

        if (briefings.length === 0) {
          return "No meetings coming up in the next hour. You're all clear.";
        }

        const briefing = briefings[0]; // Focus on the most imminent
        let response = briefing.briefing.summary + '\n\n';

        if (briefing.briefing.prepTips.length > 0) {
          response += 'Quick tips:\n';
          response += briefing.briefing.prepTips.map((tip) => `- ${tip}`).join('\n');
        }

        if (briefings.length > 1) {
          response += `\n\nYou also have ${briefings.length - 1} more meeting${briefings.length > 2 ? 's' : ''} coming up.`;
        }

        log.info({ userId, briefingCount: briefings.length }, 'Delivered pre-meeting briefing');
        return response;
      },
    }),
};

// ============================================================================
// POST-MEETING FOLLOW-UP
// ============================================================================

const getPostMeetingFollowUpDef: ToolDefinition = {
  id: 'getPostMeetingFollowUp',
  name: 'Get Post-Meeting Follow-Up',
  description: 'Prompt for action items and notes after a meeting',
  domain: 'calendar',
  tags: ['calendar', 'meeting', 'follow-up', 'actions'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Get follow-up prompts after a recent meeting to capture action items. Use when user just finished a meeting or says "my meeting just ended".',
      parameters: z.object({
        windowMinutes: z.number().optional().describe('How far back to look for ended meetings (default 30)'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to help with follow-ups.';
        }

        const followUps = await getPostMeetingFollowUps(userId, params.windowMinutes || 30);

        if (followUps.length === 0) {
          return "I don't see any meetings that just ended. Did you have one I should know about?";
        }

        const followUp = followUps[0]; // Most recent
        let response = `How did "${followUp.eventTitle}" go?\n\n`;

        if (followUp.prompts.length > 0) {
          response += followUp.prompts.join('\n');
        }

        if (followUp.suggestedActions.length > 0) {
          response += '\n\nYou might want to:\n';
          response += followUp.suggestedActions.map((a) => `- ${a}`).join('\n');
        }

        log.info({ userId, eventTitle: followUp.eventTitle }, 'Delivered post-meeting follow-up');
        return response;
      },
    }),
};

// ============================================================================
// CONFLICT CHECK
// ============================================================================

const checkConflictsDef: ToolDefinition = {
  id: 'checkConflicts',
  name: 'Check for Conflicts',
  description: 'Check if a proposed time conflicts with existing events',
  domain: 'calendar',
  tags: ['calendar', 'conflict', 'availability'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Check if a proposed time conflicts with existing events and get alternatives. Use when user proposes a time and you want to verify availability.',
      parameters: z.object({
        time: z.string().describe('The proposed time in natural language (e.g., "tomorrow at 3pm")'),
        duration: z.number().optional().describe('Duration in minutes (default 60)'),
        eventTitle: z.string().optional().describe('What the event is for'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to check your calendar.';
        }

        // Parse the natural language time
        const parsed = parseNaturalDate(params.time);
        if (!parsed) {
          return `I couldn't understand "${params.time}". Could you try something like "tomorrow at 2pm"?`;
        }

        const duration = params.duration || 60;
        const endTime = new Date(parsed.date.getTime() + duration * 60 * 1000);

        const analysis = await analyzeConflicts(userId, parsed.date, endTime, params.eventTitle);

        if (!analysis.hasConflict) {
          const time = parsed.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          return `${time} looks good. No conflicts there.`;
        }

        let response = analysis.description + '. ';

        if (analysis.suggestions.length > 0) {
          response += 'Here are some alternatives: ';
          response += analysis.suggestions.map((s) => s.description).slice(0, 3).join(', ');
        }

        log.info({ userId, hasConflict: true }, 'Checked for conflicts');
        return response;
      },
    }),
};

// ============================================================================
// FIND BEST TIME
// ============================================================================

const findBestTimeDef: ToolDefinition = {
  id: 'findBestTime',
  name: 'Find Best Time',
  description: 'Find the optimal time for a new event based on preferences',
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'suggest', 'optimal'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Find the best time for a new event based on user preferences and patterns. Use when user asks "when should I schedule this?" or needs help finding a good time.',
      parameters: z.object({
        duration: z.number().describe('Duration in minutes'),
        preferMorning: z.boolean().optional().describe('Prefer morning slots'),
        preferAfternoon: z.boolean().optional().describe('Prefer afternoon slots'),
      }),
      execute: async (params) => {
        const userId = ctx.userId;
        if (!userId) {
          return 'I need to know who you are to find times for you.';
        }

        const suggestions = await findBestTimeFor(userId, params.duration, {
          preferMorning: params.preferMorning,
          preferAfternoon: params.preferAfternoon,
        });

        if (suggestions.length === 0) {
          return "I couldn't find any good times in the next few days. Your calendar looks pretty full.";
        }

        let response = 'Here are the best times I found:\n';

        for (const suggestion of suggestions.slice(0, 3)) {
          const time = suggestion.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const date = suggestion.time.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
          response += `- ${date} at ${time} (${suggestion.reasoning})\n`;
        }

        response += '\nWould any of these work for you?';

        log.info({ userId, suggestionCount: suggestions.length }, 'Found best times');
        return response;
      },
    }),
};

// ============================================================================
// EXPORTS
// ============================================================================

export const alexCalendarTools: ToolDefinition[] = [
  // Core calendar tools
  getCalendarTodayDef,
  getCalendarWeekDef,
  createCalendarEventDef,
  updateCalendarEventDef,
  deleteCalendarEventDef,
  findFreeTimeDef,
  checkAvailabilityDef,
  getDailyBriefingDef,
  suggestMeetingTimeDef,
  detectCalendarIssuesDef,
  // New enhanced tools
  scheduleEventNaturalDef,
  getPreMeetingBriefingDef,
  getPostMeetingFollowUpDef,
  checkConflictsDef,
  findBestTimeDef,
];

export default alexCalendarTools;

