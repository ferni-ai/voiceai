/**
 * Important-date voice tools.
 *
 *   rememberSpecialDate — "Remember my anniversary is June 12",
 *                         "Remind me about Sam's birthday a week before"
 *   listSpecialDates    — "What's coming up?"
 *   stopDateReminders   — "Stop reminding me about the tax deadline"
 *
 * All three use the canonical important-dates store, so the web memory page,
 * detection and reminders see the same dates. The persona says the result in
 * their own voice; these strings stay short and warm.
 *
 * @module tools/domains/family/special-dates-tool
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import {
  createUserDate,
  deleteImportantDate,
  editImportantDate,
  findImportantDates,
  getUpcomingDates,
  parseSpokenDate,
  resolveTimeZone,
  toStoredDate,
  type ImportantDateRecord,
} from '../../../services/important-dates/index.js';
import { localToday, parseStoredDate } from '../../../services/important-dates/date-math.js';
import { whenPhrase } from '../../../services/important-dates/copy.js';
import {
  kindFrom,
  parseLeadTimes,
  spokenDate,
  spokenLeadTimes,
  titleFor,
} from './special-dates-helpers.js';

const log = createLogger({ module: 'special-dates-tool' });

const SORRY = "I couldn't get to your dates just now. Try again in a moment?";
const NEED_USER = 'I need to know who you are before I can keep dates for you.';

// ============================================================================
// SCHEMAS
// ============================================================================

export const rememberSpecialDateSchema = z.object({
  person: z
    .string()
    .optional()
    .describe('Whose date it is ("Sam", "mom"). Leave empty for the user\'s own date.'),
  kind: z
    .enum(['birthday', 'anniversary', 'event', 'deadline', 'memorial', 'other'])
    .describe('What kind of date this is'),
  date: z
    .string()
    .optional()
    .describe(
      'The date as the user said it ("June 12", "June 12 2015", "next Friday"). Omit when only changing reminders for a date already saved.'
    ),
  label: z
    .string()
    .optional()
    .describe('A name for events/deadlines ("Tax return", "Mom\'s retirement party")'),
  recurring: z
    .boolean()
    .optional()
    .describe('Repeats every year. Defaults to yes for birthdays/anniversaries, no otherwise.'),
  remindBefore: z
    .union([z.number(), z.array(z.number()), z.string()])
    .optional()
    .describe(
      'When to remind: days before (7, [7,1]) or words ("a week before", "the day before")'
    ),
});

export const listSpecialDatesSchema = z.object({
  withinDays: z.number().optional().describe('How many days ahead to look (default 30)'),
  person: z.string().optional().describe('Only dates for this person'),
});

export const stopDateRemindersSchema = z.object({
  which: z.string().describe('Which date ("Sam\'s birthday", "the tax deadline")'),
  forget: z
    .boolean()
    .optional()
    .describe('True to forget the date entirely, not just stop the reminders'),
});

type RememberArgs = z.infer<typeof rememberSpecialDateSchema>;
type ListArgs = z.infer<typeof listSpecialDatesSchema>;
type StopArgs = z.infer<typeof stopDateRemindersSchema>;

// ============================================================================
// IMPLEMENTATIONS
// ============================================================================

async function findOne(
  userId: string,
  query: string
): Promise<{ record?: ImportantDateRecord; many?: ImportantDateRecord[]; error?: true }> {
  const found = await findImportantDates(userId, query);
  if (!found.success) return { error: true };
  if (found.data.length === 1) return { record: found.data[0] };
  if (found.data.length > 1) return { many: found.data };
  return {};
}

export async function rememberSpecialDate(
  args: RememberArgs,
  ctx: { userId: string; personaId?: string; sessionId?: string }
): Promise<string> {
  if (!ctx.userId || ctx.userId === 'anonymous') return NEED_USER;
  const { kind, subtype } = kindFrom(args.kind);
  const title = titleFor(kind, args.person, args.label);
  const offsets = parseLeadTimes(args.remindBefore);

  // No date: change reminders on a date we already have.
  if (!args.date) {
    const { record, many, error } = await findOne(ctx.userId, title);
    if (error) return SORRY;
    if (many)
      return `I have a few dates like that: ${many.map((r) => r.title).join(', ')}. Which one?`;
    if (!record) return `When is ${title.startsWith('Your ') ? title.toLowerCase() : title}?`;
    if (!offsets) return `I've got ${record.title} on ${spokenDate(record.date)}.`;
    const edited = await editImportantDate(ctx.userId, record.id, {
      reminderOffsets: offsets,
      remindersEnabled: true,
    });
    if (!edited.success) return SORRY;
    return `Done. I'll remind you about ${record.title} ${spokenLeadTimes(offsets)}.`;
  }

  const tz = await resolveTimeZone(ctx.userId);
  const today = localToday(new Date(), tz);
  const parsed = parseSpokenDate(args.date, today);
  if (!parsed) return `I didn't catch the date. Could you say it like "June 12"?`;
  const recurring =
    args.recurring ?? (kind === 'birthday' || kind === 'anniversary' || subtype === 'memorial');
  const stored = toStoredDate(parsed, recurring, today);

  const saved = await createUserDate(ctx.userId, {
    title,
    date: stored,
    recurring,
    kind,
    ...(args.person ? { person: args.person } : {}),
    ...(offsets ? { reminderOffsets: offsets } : {}),
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
    ...(ctx.sessionId ? { conversationId: ctx.sessionId } : {}),
  });
  if (!saved.success) {
    log.warn({ error: saved.error.message, userId: ctx.userId }, 'Could not save date');
    return saved.error.code === 'invalid_input'
      ? `I didn't catch the date. Could you say it like "June 12"?`
      : SORRY;
  }
  const r = saved.data;
  const lead = r.reminders.enabled
    ? ` I'll remind you ${spokenLeadTimes(r.reminders.offsets)}.`
    : '';
  return `Got it. ${r.title} is ${spokenDate(r.date)}.${lead}`;
}

export async function listSpecialDates(args: ListArgs, ctx: { userId: string }): Promise<string> {
  if (!ctx.userId || ctx.userId === 'anonymous') return NEED_USER;
  const days = Math.max(0, Math.min(366, Math.round(args.withinDays ?? 30)));
  const upcoming = await getUpcomingDates(ctx.userId, days);
  if (!upcoming.success) return SORRY;
  let items = upcoming.data;
  if (args.person) {
    const p = args.person.toLowerCase();
    items = items.filter((u) => `${u.record.title} ${u.record.key}`.toLowerCase().includes(p));
  }
  if (items.length === 0) {
    return days >= 30
      ? `Nothing in the next ${days} days. Want to tell me a birthday or anniversary to keep track of?`
      : `Nothing coming up in the next ${days} days.`;
  }
  const lines = items.slice(0, 8).map((u) => {
    const occ = parseStoredDate(u.occursOn);
    const civil =
      occ && occ.year !== undefined ? { year: occ.year, month: occ.month, day: occ.day } : null;
    const when = civil ? whenPhrase(u.daysUntil, civil) : u.occursOn;
    const years =
      u.yearsSince && u.record.kind === 'birthday'
        ? ` (turning ${u.yearsSince})`
        : u.yearsSince && u.record.kind === 'anniversary'
          ? ` (${u.yearsSince} years)`
          : '';
    return `${u.record.title}${years}: ${when}`;
  });
  const more = items.length > 8 ? ` And ${items.length - 8} more.` : '';
  return `Coming up: ${lines.join('; ')}.${more}`;
}

export async function stopDateReminders(args: StopArgs, ctx: { userId: string }): Promise<string> {
  if (!ctx.userId || ctx.userId === 'anonymous') return NEED_USER;
  const { record, many, error } = await findOne(ctx.userId, args.which);
  if (error) return SORRY;
  if (many) return `I have a few like that: ${many.map((r) => r.title).join(', ')}. Which one?`;
  if (!record) return `I don't have a date called "${args.which}".`;
  if (args.forget) {
    const deleted = await deleteImportantDate(ctx.userId, record.id, 'voice_forget');
    return deleted.success ? `Okay, I've forgotten ${record.title}.` : SORRY;
  }
  const edited = await editImportantDate(ctx.userId, record.id, { remindersEnabled: false });
  return edited.success
    ? `Okay, no more reminders for ${record.title}. I'll still remember it.`
    : SORRY;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

function toolCtx(ctx: ToolContext): { userId: string; personaId?: string; sessionId?: string } {
  return {
    userId: ctx.userId,
    ...(ctx.agentId ? { personaId: ctx.agentId } : {}),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
}

async function safely(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (error) {
    log.error({ error: String(error) }, 'Important date tool failed');
    return SORRY;
  }
}

export const rememberSpecialDateToolDef: ToolDefinition = {
  id: 'rememberSpecialDate',
  name: 'Remember Important Date',
  description: 'Remember a birthday, anniversary, event or deadline, and when to remind',
  domain: 'family',
  tags: ['dates', 'birthday', 'anniversary', 'reminder', 'memory'],
  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description:
        'Remember an important date (birthday, anniversary, event, deadline) and remind the user about it. Also use to change when to remind for a date already saved. Examples: "Remember my anniversary is June 12", "Mom\'s birthday is March 3rd", "Remind me about Sam\'s birthday a week before".',
      parameters: rememberSpecialDateSchema,
      execute: async (args: RememberArgs) => safely(() => rememberSpecialDate(args, toolCtx(ctx))),
    }),
};

export const listSpecialDatesToolDef: ToolDefinition = {
  id: 'listSpecialDates',
  name: 'Upcoming Important Dates',
  description: "List upcoming birthdays, anniversaries and deadlines ('what's coming up?')",
  domain: 'family',
  tags: ['dates', 'birthday', 'anniversary', 'upcoming'],
  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description:
        'List the user\'s upcoming important dates. Examples: "What\'s coming up?", "Any birthdays this month?", "When is Sam\'s birthday?"',
      parameters: listSpecialDatesSchema,
      execute: async (args: ListArgs) => safely(() => listSpecialDates(args, toolCtx(ctx))),
    }),
};

export const stopDateRemindersToolDef: ToolDefinition = {
  id: 'stopDateReminders',
  name: 'Stop Date Reminders',
  description: 'Stop reminders for an important date, or forget the date',
  domain: 'family',
  tags: ['dates', 'reminder', 'stop', 'forget'],
  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description:
        'Stop reminding the user about an important date (keeps the date), or forget it entirely with forget=true. Examples: "Stop reminding me about the tax deadline", "Forget Sam\'s birthday".',
      parameters: stopDateRemindersSchema,
      execute: async (args: StopArgs) => safely(() => stopDateReminders(args, toolCtx(ctx))),
    }),
};

export const specialDateToolDefs: ToolDefinition[] = [
  rememberSpecialDateToolDef,
  listSpecialDatesToolDef,
  stopDateRemindersToolDef,
];

export default specialDateToolDefs;
