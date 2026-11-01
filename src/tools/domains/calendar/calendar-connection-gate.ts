/**
 * Calendar tools when no calendar is connected (#1547).
 *
 * Ferni's own calendar store always answers, so an empty day read as a clear
 * one, and a create read back as "on your calendar". With no calendar
 * connected, a read says so and quotes nothing; a write says it went to
 * Ferni's own list, not the caller's calendar. The check lives here, not in
 * each tool, so the tool files do not grow.
 *
 * @module tools/domains/calendar/calendar-connection-gate
 */
import { getDayOverview, getWeekOverview } from '../../../services/calendar/index.js';
import { isConnected } from '../../../services/calendar/calendar-service.js';
import { describeFerniList } from '../../../services/calendar/ferni-list.js';
import {
  NOT_CONNECTED_CHANGE,
  NOT_CONNECTED_CHANGE_FAILED,
  NOT_CONNECTED_CREATE_FAILED,
  NOT_CONNECTED_READ,
  notConnectedCreate,
  notConnectedWithList,
  outlookUnavailableLine,
  CALENDAR_MAYBE_INCOMPLETE,
  CALENDAR_UNCHECKED,
  calendarUncheckedWrite,
} from '../../../services/calendar/not-connected-copy.js';
import {
  OutlookUnavailableError,
  outlookLinkUnknown,
} from '../../../services/calendar/providers/outlook-state.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { smartCalendarTools as rawSmartCalendarTools } from './smart-calendar-tools.js';
import { routeWriteToProvider } from './provider-routing.js';

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

/** Schedule views also cover reminders and appointments, so only their "clear" wording is changed. */
const CLEAR_ONLY = new Set(['getUnifiedSchedule', 'checkScheduleConflicts']);
/** A schedule view that found nothing at all, so its "clear" wording must not reach the caller. */
const NOTHING_LISTED = /\bis clear\b|No scheduling conflicts found|\b0 scheduled items\b/i;

/** Writes land in Ferni's own list whatever the connection state, so they say so. */
const WRITE_TOOLS = new Map<string, 'create' | 'change'>([
  ['createCalendarEvent', 'create'],
  ['blockRecoveryTime', 'create'],
  ['updateCalendarEvent', 'change'],
  ['deleteCalendarEvent', 'change'],
]);

/** A write's own refusal, which says nothing was saved (the success text is left alone). */
const FAILED_WRITE = /^(?:I couldn't|Couldn't|I need)/;

/** Today's read with nothing connected: Ferni's own list is named if it has items (#1547). */
async function notConnectedRead(id: string, userId: string): Promise<string> {
  const list =
    id === 'getCalendarToday'
      ? describeFerniList((await getDayOverview(userId, new Date())).events)
      : id === 'getCalendarWeek'
        ? describeFerniList(
            (await getWeekOverview(userId, new Date())).days.flatMap((day) => day.events),
            true
          )
        : '';
  return list
    ? notConnectedWithList(list, id === 'getCalendarWeek' ? 'this week' : 'today')
    : NOT_CONNECTED_READ;
}

/** The title, date and time the caller asked for, for the create line. */
function whatWasAsked(params: unknown): string | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const { title, date, startTime } = params as Record<string, unknown>;
  if (typeof title !== 'string') return undefined;
  return [title, date, startTime]
    .filter((part): part is string => typeof part === 'string')
    .join(', ');
}

/** OUTLOOK_CONNECT: a linked Outlook that can't answer says why (never "clear"); other errors pass. */
async function withOutlookHonesty(write: boolean, run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof OutlookUnavailableError)) throw error;
    return outlookUnavailableLine(error.state, write);
  }
}

/** The other providers answered, but the Outlook link doc couldn't be read: say so, naming none. */
const maybeIncomplete = (out: unknown, unknown: boolean): unknown =>
  unknown && typeof out === 'string' ? `${out}\n${CALENDAR_MAYBE_INCOMPLETE}` : out;

/** No other calendar and the Outlook link doc unread: no "none connected", no Outlook named. */
async function uncheckedReply(mode: string, run: () => Promise<unknown>): Promise<string> {
  if (mode === 'read' || mode === 'clear') return CALENDAR_UNCHECKED;
  const result = await run(); // a write still lands on Ferni's own list
  return calendarUncheckedWrite(typeof result === 'string' && FAILED_WRITE.test(result));
}

function gate(def: ToolDefinition): ToolDefinition {
  const mode = CLEAR_ONLY.has(def.id)
    ? 'clear'
    : READ_TOOLS.has(def.id)
      ? 'read'
      : WRITE_TOOLS.get(def.id);
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
          if (!userId) return original(params, options);
          const unknown = await outlookLinkUnknown(userId); // OUTLOOK_CONNECT: link doc unread
          if (await isConnected(userId)) {
            // A write goes to the connected calendar when the flag is on (#1749); else the Ferni path.
            const out = await withOutlookHonesty(
              mode === 'create' || mode === 'change',
              async () => {
                const routed =
                  mode === 'read' ? null : await routeWriteToProvider(def.id, userId, params, ctx);
                return routed ?? original(params, options);
              }
            );
            return maybeIncomplete(out, unknown && (mode === 'read' || mode === 'clear'));
          }
          if (unknown) return uncheckedReply(mode, () => original(params, options));
          if (mode === 'read') return notConnectedRead(def.id, userId);
          if (mode === 'clear') {
            const result: unknown = await original(params, options);
            if (typeof result !== 'string') return result;
            return NOTHING_LISTED.test(result)
              ? NOT_CONNECTED_READ
              : `No calendar is connected, so this is Ferni's own list, reminders and appointments:\n${result}`;
          }

          // A write still runs: it lands in Ferni's own list. Only the reply changes.
          const result: unknown = await original(params, options);
          const failed = typeof result === 'string' && FAILED_WRITE.test(result);
          if (mode === 'create') {
            return failed ? NOT_CONNECTED_CREATE_FAILED : notConnectedCreate(whatWasAsked(params));
          }
          return failed ? NOT_CONNECTED_CHANGE_FAILED : NOT_CONNECTED_CHANGE;
        },
      };
    },
  };
}

/** Put the not-connected gate on any calendar-backed tools (reads and writes listed above). */
export const gateCalendarTools = (defs: ToolDefinition[]): ToolDefinition[] => defs.map(gate);

/** The smart calendar tools, with the not-connected gate on the reads and writes. */
export const smartCalendarTools: ToolDefinition[] = gateCalendarTools(rawSmartCalendarTools);
