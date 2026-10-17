/**
 * Calendar tools when no calendar provider is connected (#1547).
 *
 * Ferni's own calendar store always answers, so an empty day read as a clear
 * one, and a create read back as "on your calendar". With no provider
 * connected, a read says so and quotes nothing; a write says it went to
 * Ferni's own list, not the caller's calendar. The check lives here, not in
 * each tool, so the tool files do not grow.
 *
 * @module tools/domains/calendar/calendar-connection-gate
 */
import {
  NOT_CONNECTED_CHANGE,
  NOT_CONNECTED_CREATE,
  NOT_CONNECTED_READ,
} from '../../../services/calendar/not-connected-copy.js';
import { hasAnyProviderConnected } from '../../../services/calendar/index.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { smartCalendarTools as rawSmartCalendarTools } from './smart-calendar-tools.js';

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
  'smartReschedule',
]);

/** Writes land in Ferni's own list whatever the connection state, so they say so. */
const WRITE_TOOLS = new Map<string, 'create' | 'change'>([
  ['createCalendarEvent', 'create'],
  ['blockRecoveryTime', 'create'],
  ['updateCalendarEvent', 'change'],
  ['deleteCalendarEvent', 'change'],
]);

/** A write's own refusal, which says nothing was saved (the success text is left alone). */
const FAILED_WRITE = /^(?:I couldn't|Couldn't|I need)/;

function gate(def: ToolDefinition): ToolDefinition {
  const mode = READ_TOOLS.has(def.id) ? 'read' : WRITE_TOOLS.get(def.id);
  if (mode === undefined) return def;

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
          if (typeof result === 'string' && FAILED_WRITE.test(result)) return result;
          return mode === 'create' ? NOT_CONNECTED_CREATE : NOT_CONNECTED_CHANGE;
        },
      };
    },
  };
}

/** The smart calendar tools, with the not-connected gate on the reads and writes. */
export const smartCalendarTools: ToolDefinition[] = rawSmartCalendarTools.map(gate);
