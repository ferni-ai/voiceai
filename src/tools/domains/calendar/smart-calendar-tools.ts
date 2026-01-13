/**
 * Smart Calendar Tools
 *
 * LLM-callable tools for advanced calendar management.
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
import {
  detectRecoveryNeeds,
  findRecoveryOpportunities,
  autoBlockRecoveryTime,
  buildRecoveryContext,
} from '../../../services/calendar/recovery-protection.js';
import { getCalendarLoadFactors } from '../../../services/calendar/calendar-load-service.js';
import {
  enrichPreMeetingBriefing,
  recordMeetingInteraction,
  type EnrichedBriefing,
} from '../../../services/calendar/meeting-memory-service.js';

const log = getLogger();

// ============================================================================
// GET CALENDAR TODAY
// ============================================================================

const getCalendarTodayDef: ToolDefinition = {
  id: 'getCalendarToday',
  name: 'Get Calendar Today',
  description: "View today's calendar events and schedule",
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'today', 'events'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Get today\'s calendar events. Use when user asks "What\'s on my calendar today?" or "What do I have today?"',
      parameters: z.object({}),
      execute: async () => {
        const { userId } = ctx;
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
          response += "Heads up, it's a packed day. ";
        }

        if (overview.hasBackToBack) {
          response += 'You have some back-to-back meetings. ';
        }

        response += `Here's the rundown: ${eventDescriptions.join('. ')}`;

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
  description: "View the week's calendar events and schedule overview",
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'week', 'overview'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Get this week\'s calendar overview. Use when user asks "What\'s my week look like?" or "Am I busy this week?"',
      parameters: z.object({}),
      execute: async () => {
        const { userId } = ctx;
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
            response += `${formatDayOverviewForSpeech(day)} `;
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
      description:
        'Create a new calendar event. Use when user wants to schedule a meeting or add something to their calendar.',
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
        const { userId } = ctx;
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
          return "Couldn't create the event. There might be an issue with your calendar connection.";
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
      description:
        'Update an existing calendar event. Use when user wants to change time, title, or other details of a meeting.',
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
        const { userId } = ctx;
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
          updates.endTime = new Date(
            updates.startTime.getTime() + params.durationMinutes * 60 * 1000
          );
        }

        const updated = await updateEvent(userId, params.eventId, updates);

        if (!updated) {
          return "Couldn't update that event. It may have been deleted or there's a calendar connection issue.";
        }

        log.info({ userId, eventId: params.eventId }, 'Updated calendar event');
        return `Updated. ${updated.title} is now scheduled for ${updated.startTime.toLocaleString(
          'en-US',
          {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }
        )}.`;
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
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to modify your calendar.';
        }

        const deleted = await deleteEvent(userId, params.eventId);

        if (!deleted) {
          return "Couldn't delete that event. It may already be gone or there's a connection issue.";
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
      description:
        'Find free time slots. Use when user asks "When am I free?" or "What time slots are available?"',
      parameters: z.object({
        date: z
          .string()
          .optional()
          .describe('Date to check in YYYY-MM-DD format, defaults to today'),
        minDurationMinutes: z
          .number()
          .optional()
          .describe('Minimum slot duration needed, defaults to 30'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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

        const dayName = checkDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        let response = `On ${dayName}, you have ${slots.length} free slot${slots.length !== 1 ? 's' : ''}: `;

        const slotDescriptions = slots.map((slot) => {
          const start = slot.start.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          const end = slot.end.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
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
      description:
        'Check if a specific time is free. Use when user asks "Am I free at 2pm?" or "Is Thursday morning available?"',
      parameters: z.object({
        date: z.string().describe('Date in YYYY-MM-DD format'),
        startTime: z.string().describe('Start time in HH:MM format'),
        durationMinutes: z.number().optional().describe('Duration to check, defaults to 60'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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
      description:
        'Generate a daily briefing with alerts and suggestions. Use for morning check-ins or "brief me on today".',
      parameters: z.object({
        date: z.string().optional().describe('Date in YYYY-MM-DD format, defaults to today'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to brief you on your day.';
        }

        let date = new Date();
        if (params.date) {
          const [year, month, day] = params.date.split('-').map(Number);
          date = new Date(year, month - 1, day);
        }

        const briefing = await generateDailyBriefing(userId, date);

        let response = `${briefing.summary} `;

        if (briefing.firstMeeting) {
          const time = briefing.firstMeeting.startTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          response += `First up: ${briefing.firstMeeting.title} at ${time}. `;
        }

        if (briefing.alerts.length > 0) {
          const concerns = briefing.alerts.filter(
            (a) => a.severity === 'concern' || a.severity === 'warning'
          );
          if (concerns.length > 0) {
            response += 'Heads up: ';
            response += concerns.map((a) => a.message).join(' ');
          }
        }

        if (briefing.suggestions.length > 0) {
          response += ` ${briefing.suggestions.join(' ')}`;
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
      description:
        'Suggest optimal times for a meeting. Use when user asks "When should I schedule this?" or needs help finding a good time.',
      parameters: z.object({
        durationMinutes: z.number().describe('How long the meeting needs to be'),
        preferMorning: z.boolean().optional().describe('Prefer morning times'),
        preferAfternoon: z.boolean().optional().describe('Prefer afternoon times'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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
          response += `. Note: ${suggestions[0].considerations.join(', ')}`;
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
      description:
        'Analyze calendar for problems. Use when user asks "Am I overbooked?" or "Any scheduling issues?"',
      parameters: z.object({
        daysToCheck: z.number().optional().describe('Number of days ahead to check, defaults to 7'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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
          response += ` Suggestions: ${Array.from(suggestionsSet).join(' ')}`;
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
  description:
    'Schedule an event using natural language like "tomorrow at 3pm" or "next Tuesday morning"',
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
        const { userId } = ctx;
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
  description: 'Get preparation tips and context for upcoming meetings with relationship history',
  domain: 'calendar',
  tags: ['calendar', 'meeting', 'briefing', 'prep', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Get enriched briefings for upcoming meetings including prep tips, relationship history, past topics, and open commitments. Use when user asks "What should I know before my next meeting?" or is about to join a meeting.',
      parameters: z.object({
        windowMinutes: z.number().optional().describe('How far ahead to look (default 60 minutes)'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to get your briefings.';
        }

        // Get basic briefings first
        const briefings = await getUpcomingBriefings(userId, params.windowMinutes || 60);

        if (briefings.length === 0) {
          return "No meetings coming up in the next hour. You're all clear.";
        }

        // Get the most imminent briefing
        const nextBriefing = briefings[0];

        // Try to get the full event for enrichment
        let enrichedBriefing: EnrichedBriefing | null = null;
        try {
          const events = await getEventsForDay(userId, new Date());
          const fullEvent = events.find((e) => e.id === nextBriefing.eventId);
          if (fullEvent) {
            enrichedBriefing = await enrichPreMeetingBriefing(userId, fullEvent);
          }
        } catch (e) {
          log.warn({ error: String(e), userId }, 'Failed to enrich briefing with memory');
        }

        let response = `**${nextBriefing.eventTitle}** in ${enrichedBriefing?.minutesUntil || nextBriefing.minutesUntil} minutes\n\n`;

        // Priority indicator
        if (enrichedBriefing?.priority === 'high') {
          response += `⚠️ **High priority:** ${enrichedBriefing.priorityReason}\n\n`;
        }

        // Basic prep tips
        if (nextBriefing.briefing.prepTips.length > 0) {
          response += '**Quick prep:**\n';
          response += nextBriefing.briefing.prepTips.map((tip) => `- ${tip}`).join('\n');
          response += '\n\n';
        }

        // Better Than Human: Relationship context
        if (
          enrichedBriefing?.relationshipContext &&
          enrichedBriefing.relationshipContext.length > 0
        ) {
          response += "**Who you're meeting:**\n";
          for (const ctx of enrichedBriefing.relationshipContext.slice(0, 3)) {
            const name = ctx.displayName || ctx.attendeeEmail.split('@')[0];
            let personNote = `- **${name}**`;

            if (ctx.lastInteraction) {
              const daysAgo = ctx.patterns.lastMeetingDaysAgo;
              personNote += ` (last met ${daysAgo} days ago)`;
            } else {
              personNote += ' (first meeting!)';
            }

            if (ctx.relationship.sentiment !== 'unknown') {
              personNote += ` — ${ctx.relationship.sentiment} relationship`;
            }

            response += personNote + '\n';
          }
          response += '\n';
        }

        // Better Than Human: Past topics to reference
        if (enrichedBriefing?.pastTopics && enrichedBriefing.pastTopics.length > 0) {
          response += '**Topics from last time:**\n';
          response += enrichedBriefing.pastTopics
            .slice(0, 3)
            .map((t) => `- ${t}`)
            .join('\n');
          response += '\n\n';
        }

        // Better Than Human: Open commitments
        if (enrichedBriefing?.openCommitments && enrichedBriefing.openCommitments.length > 0) {
          response += '**Open items to follow up:**\n';
          response += enrichedBriefing.openCommitments
            .slice(0, 3)
            .map((c) => `- ${c}`)
            .join('\n');
          response += '\n\n';
        }

        // Suggested agenda items
        if (
          enrichedBriefing?.suggestedAgendaItems &&
          enrichedBriefing.suggestedAgendaItems.length > 0
        ) {
          response += '**Suggested talking points:**\n';
          response += enrichedBriefing.suggestedAgendaItems
            .slice(0, 3)
            .map((i) => `- ${i}`)
            .join('\n');
          response += '\n';
        }

        if (briefings.length > 1) {
          response += `\n📅 You also have ${briefings.length - 1} more meeting${briefings.length > 2 ? 's' : ''} coming up.`;
        }

        log.info(
          { userId, briefingCount: briefings.length, enriched: !!enrichedBriefing },
          'Delivered enriched pre-meeting briefing'
        );
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
        windowMinutes: z
          .number()
          .optional()
          .describe('How far back to look for ended meetings (default 30)'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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
// RECORD MEETING OUTCOME (Better Than Human)
// ============================================================================

const recordMeetingOutcomeDef: ToolDefinition = {
  id: 'recordMeetingOutcome',
  name: 'Record Meeting Outcome',
  description: 'Store meeting outcomes for future reference - topics, decisions, action items',
  domain: 'calendar',
  tags: ['calendar', 'meeting', 'memory', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Record the outcome of a meeting including topics discussed, commitments made, and action items. This information will be used to enrich future pre-meeting briefings. Use after user shares meeting details.',
      parameters: z.object({
        meetingTitle: z.string().describe('Title or description of the meeting'),
        attendeeEmail: z.string().describe('Email of the main person they met with'),
        attendeeName: z.string().optional().describe('Name of the person if known'),
        topics: z.array(z.string()).describe('Topics or subjects discussed in the meeting'),
        commitmentsMade: z
          .array(z.string())
          .optional()
          .describe('Commitments the user made to the other person'),
        commitmentsByThem: z
          .array(z.string())
          .optional()
          .describe('Commitments the other person made to the user'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to record this.';
        }

        try {
          await recordMeetingInteraction(userId, {
            personEmail: params.attendeeEmail,
            personName: params.attendeeName,
            topics: params.topics,
            commitmentsMade: params.commitmentsMade || [],
            commitmentsByThem: params.commitmentsByThem,
            meetingTitle: params.meetingTitle,
          });

          let response = `Got it! I've recorded your meeting with ${params.attendeeName || params.attendeeEmail}.\n\n`;
          response += `**Topics:** ${params.topics.join(', ')}\n`;

          if (params.commitmentsMade && params.commitmentsMade.length > 0) {
            response += `\n**You committed to:**\n`;
            response += params.commitmentsMade.map((c) => `- ${c}`).join('\n');
          }

          if (params.commitmentsByThem && params.commitmentsByThem.length > 0) {
            response += `\n**They committed to:**\n`;
            response += params.commitmentsByThem.map((c) => `- ${c}`).join('\n');
          }

          response += `\n\n💡 I'll remember this for next time you meet with them!`;

          log.info(
            { userId, attendee: params.attendeeEmail, topicCount: params.topics.length },
            'Recorded meeting outcome'
          );
          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Failed to record meeting outcome');
          return "I wasn't able to save that, but I heard what you said. Could you try again?";
        }
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
        time: z
          .string()
          .describe('The proposed time in natural language (e.g., "tomorrow at 3pm")'),
        duration: z.number().optional().describe('Duration in minutes (default 60)'),
        eventTitle: z.string().optional().describe('What the event is for'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
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
          const time = parsed.date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          return `${time} looks good. No conflicts there.`;
        }

        let response = `${analysis.description}. `;

        if (analysis.suggestions.length > 0) {
          response += 'Here are some alternatives: ';
          response += analysis.suggestions
            .map((s) => s.description)
            .slice(0, 3)
            .join(', ');
        }

        log.info({ userId, hasConflict: true }, 'Checked for conflicts');
        return response;
      },
    }),
};

// ============================================================================
// SMART RESCHEDULING (Better Than Human)
// ============================================================================

const smartRescheduleDef: ToolDefinition = {
  id: 'smartReschedule',
  name: 'Smart Reschedule',
  description: 'Intelligently reschedule an event to a better time based on calendar patterns',
  domain: 'calendar',
  tags: ['calendar', 'reschedule', 'conflict', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Intelligently reschedule an event by finding the optimal new time based on calendar patterns, energy levels, and meeting context. Use when user wants to move a meeting or when a conflict is detected.',
      parameters: z.object({
        eventIdOrTitle: z.string().describe('Event ID or title to reschedule'),
        reason: z.string().optional().describe('Why they want to reschedule'),
        preferredTimeOfDay: z
          .enum(['morning', 'afternoon', 'evening', 'any'])
          .optional()
          .describe('Preferred time of day for the new slot'),
        preferSameWeek: z.boolean().optional().describe('Keep it in the same week if possible'),
        avoidDays: z
          .array(z.string())
          .optional()
          .describe('Days to avoid (e.g., ["Monday", "Friday"])'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to reschedule events.';
        }

        try {
          // Find the event
          const weekEvents = await getEventsForWeek(userId, new Date());
          const event = weekEvents.find(
            (e) =>
              e.id === params.eventIdOrTitle ||
              e.title.toLowerCase().includes(params.eventIdOrTitle.toLowerCase())
          );

          if (!event) {
            return `I couldn't find an event matching "${params.eventIdOrTitle}". Could you be more specific about which meeting you want to reschedule?`;
          }

          // Calculate duration
          const duration = Math.round(
            (event.endTime.getTime() - event.startTime.getTime()) / 60000
          );

          // Get calendar load to find optimal times
          const loadFactors = await getCalendarLoadFactors(userId);

          // Find free slots considering preferences
          const now = new Date();
          const searchEnd = new Date(now);
          searchEnd.setDate(searchEnd.getDate() + (params.preferSameWeek ? 5 : 14));

          // Find free slots across multiple days
          const freeSlots: Array<{ start: Date; end: Date }> = [];
          const daysToSearch = params.preferSameWeek ? 5 : 14;

          for (let dayOffset = 0; dayOffset < daysToSearch && freeSlots.length < 10; dayOffset++) {
            const checkDate = new Date(now);
            checkDate.setDate(checkDate.getDate() + dayOffset);

            const daySlots = await findFreeTimeSlots(userId, checkDate, {
              minDurationMinutes: duration,
              workDayOnly: true,
            });

            for (const slot of daySlots) {
              if (slot.durationMinutes >= duration) {
                freeSlots.push({ start: slot.start, end: slot.end });
              }
            }
          }

          if (freeSlots.length === 0) {
            return `Your calendar is quite full. I couldn't find a ${duration}-minute slot in the next ${params.preferSameWeek ? 'week' : 'two weeks'}. Would you like me to look further out, or should we consider shortening the meeting?`;
          }

          // Score each slot based on preferences and patterns
          const scoredSlots = freeSlots
            .map((slot) => {
              let score = 50; // Base score

              const slotDay = slot.start.toLocaleDateString('en-US', { weekday: 'long' });
              const slotHour = slot.start.getHours();

              // Avoid specified days
              if (params.avoidDays?.includes(slotDay)) {
                score -= 100; // Heavy penalty
              }

              // Time of day preference
              if (params.preferredTimeOfDay === 'morning' && slotHour >= 9 && slotHour < 12) {
                score += 20;
              } else if (
                params.preferredTimeOfDay === 'afternoon' &&
                slotHour >= 12 &&
                slotHour < 17
              ) {
                score += 20;
              } else if (params.preferredTimeOfDay === 'evening' && slotHour >= 17) {
                score += 20;
              }

              // Prefer the lightest day of the week
              if (loadFactors.lightestDayThisWeek === slotDay) {
                score += 15;
              }

              // Avoid the heaviest day
              if (loadFactors.heaviestDayThisWeek === slotDay) {
                score -= 10;
              }

              // Prefer slots not right after or before other meetings
              // (assuming freeSlots already exclude conflicts)
              const slotDuration = (slot.end.getTime() - slot.start.getTime()) / 60000;
              if (slotDuration > duration + 30) {
                score += 10; // Buffer time available
              }

              // Prefer sooner rather than later (slight bias)
              const daysOut = Math.floor(
                (slot.start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );
              score -= daysOut * 2;

              return { slot, score };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score);

          if (scoredSlots.length === 0) {
            return `With your preferences, I couldn't find a good slot. Would you like me to suggest times without those constraints?`;
          }

          // Get top 3 suggestions
          const topSlots = scoredSlots.slice(0, 3);
          const originalTime = event.startTime.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });

          let response = `**Reschedule options for "${event.title}"** (currently ${originalTime}):\n\n`;

          topSlots.forEach((scored, i) => {
            const slot = scored.slot;
            const dayName = slot.start.toLocaleDateString('en-US', { weekday: 'long' });
            const date = slot.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const time = slot.start.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            let reason = '';
            if (loadFactors.lightestDayThisWeek === dayName) {
              reason = ' (your lightest day)';
            } else if (dayName === 'Friday' && params.preferSameWeek) {
              reason = ' (end of week)';
            }

            response += `${i + 1}. **${dayName}, ${date} at ${time}**${reason}\n`;
          });

          response += `\nJust say which option you'd like, or tell me a different preference!`;

          log.info(
            { userId, eventId: event.id, optionsFound: topSlots.length },
            'Smart reschedule options generated'
          );
          return response;
        } catch (error) {
          log.error({ error: String(error), userId }, 'Smart reschedule failed');
          return "I had trouble finding reschedule options. Could you tell me which meeting and when you'd prefer?";
        }
      },
    }),
};

// ============================================================================
// FIND BEST TIME
// ============================================================================

const findBestTimeDef: ToolDefinition = {
  id: 'findBestTime',
  name: 'Find Best Time',
  description: 'Find the optimal time for a new event based on preferences and learned patterns',
  domain: 'calendar',
  tags: ['calendar', 'schedule', 'suggest', 'optimal', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Find the best time for a new event based on user preferences, learned patterns, and energy levels. Uses "Better Than Human" energy-aware scheduling to suggest times when the user is typically most productive. Use when user asks "when should I schedule this?" or needs help finding a good time.',
      parameters: z.object({
        duration: z.number().describe('Duration in minutes'),
        preferMorning: z.boolean().optional().describe('Prefer morning slots'),
        preferAfternoon: z.boolean().optional().describe('Prefer afternoon slots'),
        meetingType: z.enum(['oneOnOne', 'teamMeeting', 'clientCall', 'standup', 'general'])
          .optional()
          .describe('Type of meeting for better time optimization'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to find times for you.';
        }

        const suggestions = await findBestTimeFor(userId, params.duration, {
          preferMorning: params.preferMorning,
          preferAfternoon: params.preferAfternoon,
          meetingType: params.meetingType,
        });

        if (suggestions.length === 0) {
          return "I couldn't find any good times in the next few days. Your calendar looks pretty full.";
        }

        let response = 'Here are the best times I found based on your patterns:\n';

        for (const suggestion of suggestions.slice(0, 3)) {
          const time = suggestion.time.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          const date = suggestion.time.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          });
          response += `- ${date} at ${time} (${suggestion.reasoning})\n`;
        }

        response += '\nWould any of these work for you?';

        log.info({ userId, suggestionCount: suggestions.length }, 'Found best times with energy awareness');
        return response;
      },
    }),
};

// ============================================================================
// DETECT RECOVERY NEEDS (Better Than Human)
// ============================================================================

const detectRecoveryNeedsDef: ToolDefinition = {
  id: 'detectRecoveryNeeds',
  name: 'Detect Recovery Needs',
  description: 'Proactively identify when user needs rest based on calendar load',
  domain: 'calendar',
  tags: ['calendar', 'recovery', 'wellbeing', 'burnout', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Detect if the user needs recovery time based on their calendar load and patterns. Use this proactively when you sense the user might be overwhelmed or when discussing workload.',
      parameters: z.object({}),
      execute: async () => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to assess your schedule.';
        }

        const [needs, load] = await Promise.all([
          detectRecoveryNeeds(userId),
          getCalendarLoadFactors(userId),
        ]);

        if (needs.length === 0) {
          return `Your calendar looks manageable right now. You've had about ${Math.round(load.weeklyMeetingHours)} hours of meetings this week with ${Math.round(load.weeklyFocusTimeRatio * 100)}% focus time available.`;
        }

        let response =
          "I've been looking at your calendar, and I want to share some observations:\n\n";

        // Group by urgency
        const immediateUrgency = needs.filter((n) => n.urgency === 'immediate');
        const otherUrgency = needs.filter((n) => n.urgency !== 'immediate');

        if (immediateUrgency.length > 0) {
          response += '⚠️ **Needs attention:**\n';
          immediateUrgency.forEach((need) => {
            response += `• ${need.reason}\n  → ${need.suggestedAction.description}\n`;
          });
        }

        if (otherUrgency.length > 0) {
          response += '\n💡 **Worth considering:**\n';
          otherUrgency.forEach((need) => {
            response += `• ${need.reason}: ${need.suggestedAction.description}\n`;
          });
        }

        response +=
          '\n\nWould you like me to find some time slots for recovery, or help you decline any non-essential meetings?';

        log.info(
          { userId, needsCount: needs.length, immediateUrgency: immediateUrgency.length },
          'Recovery needs detected'
        );
        return response;
      },
    }),
};

// ============================================================================
// FIND RECOVERY OPPORTUNITIES (Better Than Human)
// ============================================================================

const findRecoveryOpportunitiesDef: ToolDefinition = {
  id: 'findRecoveryOpportunities',
  name: 'Find Recovery Opportunities',
  description: 'Find the best time slots for rest and recovery',
  domain: 'calendar',
  tags: ['calendar', 'recovery', 'rest', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Find optimal time slots for recovery, breaks, or deep rest. Use when user needs to find time to recharge or when proactively suggesting rest.',
      parameters: z.object({
        minDurationMinutes: z
          .number()
          .optional()
          .describe('Minimum slot duration in minutes (default 60)'),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to find recovery time for you.';
        }

        const opportunities = await findRecoveryOpportunities(
          userId,
          params.minDurationMinutes || 60
        );

        if (opportunities.length === 0) {
          return "Your calendar is quite packed. I couldn't find significant open slots in the next few days. Would you like me to help you reschedule some meetings to create space?";
        }

        let response = 'Here are the best opportunities for recovery time:\n\n';

        // Group by quality
        const excellent = opportunities.filter((o) => o.quality === 'excellent').slice(0, 2);
        const good = opportunities.filter((o) => o.quality === 'good').slice(0, 2);

        if (excellent.length > 0) {
          response += '🌟 **Excellent slots:**\n';
          excellent.forEach((opp) => {
            const startTime = opp.slot.start.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            const endTime = opp.slot.end.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            response += `• ${opp.day}: ${startTime} - ${endTime} (${opp.slot.durationMinutes} min)\n`;
          });
        }

        if (good.length > 0) {
          response += '\n✨ **Good slots:**\n';
          good.forEach((opp) => {
            const startTime = opp.slot.start.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            const endTime = opp.slot.end.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            response += `• ${opp.day}: ${startTime} - ${endTime} (${opp.slot.durationMinutes} min)\n`;
          });
        }

        response += '\nWould you like me to block any of these for you?';

        log.info(
          { userId, opportunityCount: opportunities.length },
          'Recovery opportunities found'
        );
        return response;
      },
    }),
};

// ============================================================================
// BLOCK RECOVERY TIME (Better Than Human)
// ============================================================================

const blockRecoveryTimeDef: ToolDefinition = {
  id: 'blockRecoveryTime',
  name: 'Block Recovery Time',
  description: 'Proactively block time for rest and recovery on the calendar',
  domain: 'calendar',
  tags: ['calendar', 'recovery', 'block', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        'Block time on the calendar for rest, deep work, or personal recovery. Use when user agrees to take a break or when proactively protecting their energy.',
      parameters: z.object({
        durationMinutes: z
          .number()
          .describe('How long the recovery block should be (in minutes, e.g. 60 for 1 hour)'),
        title: z
          .string()
          .optional()
          .describe('Custom title for the block (default: "🧘 Recovery Time")'),
        startTime: z
          .string()
          .optional()
          .describe(
            'When to start the recovery block (ISO format or natural time like "2pm tomorrow"). If not specified, will find the next available slot.'
          ),
      }),
      execute: async (params) => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to block time for you.';
        }

        const title = params.title || '🧘 Recovery Time';
        let blockStart: Date;

        if (params.startTime) {
          // Parse the provided start time
          blockStart = new Date(params.startTime);
          if (isNaN(blockStart.getTime())) {
            return "I couldn't understand that time. Could you give me a specific time like '2pm tomorrow' or a date?";
          }
        } else {
          // Find the next available slot
          const opportunities = await findRecoveryOpportunities(userId, params.durationMinutes);
          if (opportunities.length === 0) {
            return "I couldn't find a suitable slot to block recovery time. Your calendar is quite full. Would you like me to help you reschedule something to make space?";
          }
          // Use the best available slot
          blockStart = opportunities[0].slot.start;
        }

        const eventInput: CreateEventInput = {
          title,
          description:
            'Time blocked for rest, deep work, or personal recovery. Protected by Ferni.',
          startTime: blockStart,
          durationMinutes: params.durationMinutes,
        };

        const createdEvent = await createEvent(userId, eventInput);

        if (!createdEvent) {
          return "I couldn't create the recovery block. Would you like me to try a different time?";
        }

        const date = createdEvent.startTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const startTimeStr = createdEvent.startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const endTimeStr = createdEvent.endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        log.info({ userId, eventId: createdEvent.id, title }, 'Recovery time blocked');

        return `Done! I've blocked "${title}" on ${date} from ${startTimeStr} to ${endTimeStr}.\n\nThis time is now protected on your calendar. Take care of yourself! 💚`;
      },
    }),
};

// ============================================================================
// GET CALENDAR LOAD SUMMARY (Better Than Human)
// ============================================================================

const getCalendarLoadSummaryDef: ToolDefinition = {
  id: 'getCalendarLoadSummary',
  name: 'Get Calendar Load Summary',
  description: 'Get a summary of calendar load and work patterns',
  domain: 'calendar',
  tags: ['calendar', 'load', 'analysis', 'better-than-human'],

  create: (ctx: ToolContext) =>
    llm.tool({
      description:
        "Get an analysis of the user's calendar load, including meeting hours, focus time, and patterns. Use when discussing workload, productivity, or when the user mentions feeling overwhelmed.",
      parameters: z.object({}),
      execute: async () => {
        const { userId } = ctx;
        if (!userId) {
          return 'I need to know who you are to analyze your calendar.';
        }

        const load = await getCalendarLoadFactors(userId);

        let response = "Here's a look at your calendar patterns this week:\n\n";

        // Meeting hours
        response += `📊 **Meeting Load:** ${Math.round(load.weeklyMeetingHours)} hours of meetings\n`;

        // Focus time
        const focusPercent = Math.round(load.weeklyFocusTimeRatio * 100);
        if (focusPercent < 20) {
          response += `⚠️ **Focus Time:** Only ${focusPercent}% available (that's quite low)\n`;
        } else if (focusPercent < 40) {
          response += `💡 **Focus Time:** ${focusPercent}% available (could use more)\n`;
        } else {
          response += `✅ **Focus Time:** ${focusPercent}% available (healthy amount)\n`;
        }

        // Back-to-back meetings
        const backToBackPercent = Math.round(load.weeklyBackToBackPercentage);
        if (backToBackPercent > 50) {
          response += `⚠️ **Back-to-Back:** ${backToBackPercent}% of meetings are consecutive\n`;
        } else if (backToBackPercent > 30) {
          response += `💡 **Back-to-Back:** ${backToBackPercent}% of meetings are consecutive\n`;
        } else {
          response += `✅ **Back-to-Back:** Only ${backToBackPercent}% back-to-back meetings\n`;
        }

        // Pattern insights
        if (load.heaviestDayThisWeek) {
          response += `\n📅 **Busiest Day:** ${load.heaviestDayThisWeek}`;
        }
        if (load.lightestDayThisWeek) {
          response += `\n📅 **Lightest Day:** ${load.lightestDayThisWeek}`;
        }

        // Meeting streak
        if (load.consecutiveMeetingStreak >= 180) {
          // 3+ hours
          const streakHours = Math.round(load.consecutiveMeetingStreak / 60);
          response += `\n⚠️ **Meeting Marathon Alert:** ${streakHours}+ hours of back-to-back meetings today`;
        }

        // Consecutive overloaded days
        if (load.consecutiveOverloadedDays >= 2) {
          response += `\n⚠️ **Overload Alert:** ${load.consecutiveOverloadedDays} consecutive heavy days`;
        }

        // Week over week trend
        if (load.meetingHoursTrend === 'increasing' && load.weekOverWeekChange > 20) {
          response += `\n📈 **Trend:** Meeting hours up ${Math.round(load.weekOverWeekChange)}% vs last week`;
        } else if (load.meetingHoursTrend === 'decreasing' && load.weekOverWeekChange < -20) {
          response += `\n📉 **Trend:** Meeting hours down ${Math.abs(Math.round(load.weekOverWeekChange))}% vs last week (nice!)`;
        }

        log.info(
          { userId, weeklyMeetingHours: load.weeklyMeetingHours },
          'Calendar load summary generated'
        );
        return response;
      },
    }),
};

// ============================================================================
// EXPORTS
// ============================================================================

export const smartCalendarTools: ToolDefinition[] = [
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
  // Enhanced tools
  scheduleEventNaturalDef,
  getPreMeetingBriefingDef,
  getPostMeetingFollowUpDef,
  recordMeetingOutcomeDef,
  checkConflictsDef,
  smartRescheduleDef,
  findBestTimeDef,
  // Better Than Human - Recovery & Wellbeing
  detectRecoveryNeedsDef,
  findRecoveryOpportunitiesDef,
  blockRecoveryTimeDef,
  getCalendarLoadSummaryDef,
];

export default smartCalendarTools;
