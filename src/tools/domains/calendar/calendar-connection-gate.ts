/**
 * Calendar tools when no calendar provider is connected (#1547).
 *
 * Ferni's own calendar store always answers, so an empty day read as a clear
 * one, and a create read back as "on your calendar". With no provider
 * connected, a read says so and quotes nothing; a create says the event went
 * to Ferni's own list, not the caller's calendar. The check lives here, not in
 * each tool, so the tool files do not grow.
 *
 * @module tools/domains/calendar/calendar-connection-gate
 */
import { hasAnyProviderConnected } from '../../../services/calendar/index.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { smartCalendarTools as rawSmartCalendarTools } from './smart-calendar-tools.js';

export const NOT_CONNECTED_READ =
  "No calendar is connected yet, so I can't see your calendar. Want me to help you connect one?";
export const NOT_CONNECTED_CREATE =
  "Nothing was added to a calendar, because none is connected. I saved it to Ferni's own list instead, not your calendar. Want me to help you connect one?";

/** Reads describe a calendar, so with none connected they quote nothing. */
const READ_TOOLS = new Set([
  'getCalendarToday',
  'getCalendarWeek',
  'findFreeTime',
  'checkAvailability',
  'getDailyBriefing',
  'suggestMeetingTime',
  'detectCalendarIssues',
  'getPreMeetingBriefing',
  'getPostMeetingFollowUp',
  'checkConflicts',
  'findBestTime',
  'detectRecoveryNeeds',
  'findRecoveryOpportunities',
  'getCalendarLoadSummary',
]);

/** Creates land in Ferni's own list whatever the connection state. */
const CREATE_TOOLS = new Set(['createCalendarEvent', 'blockRecoveryTime']);

/** A create's own refusal, which says nothing was saved (the success text is left alone). */
const FAILED_CREATE = /^(?:I couldn't|Couldn't|I need)/;

function gate(def: ToolDefinition): ToolDefinition {
  const mode = READ_TOOLS.has(def.id) ? 'read' : CREATE_TOOLS.has(def.id) ? 'create' : null;
  if (mode === null) return def;

  return {
    ...def,
    create: (ctx: ToolContext) => {
      const tool = def.create(ctx);
      const original = tool.execute;
      return {
        ...tool,
        execute: async (params: unknown, options: unknown) => {
          const { userId } = ctx;
          if (!userId || (await hasAnyProviderConnected(userId))) return original(params, options);
          if (mode === 'read') return NOT_CONNECTED_READ;

          const result: unknown = await original(params, options);
          return typeof result === 'string' && FAILED_CREATE.test(result)
            ? result
            : NOT_CONNECTED_CREATE;
        },
      };
    },
  };
}

/** The smart calendar tools, with the not-connected gate on the reads and creates. */
export const smartCalendarTools: ToolDefinition[] = rawSmartCalendarTools.map(gate);
