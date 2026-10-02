/**
 * Voice-facing operations shared by the tool domains (dreams, dream-tracking,
 * habits, goals) and the Gemini JSON-workaround executors. Each returns a
 * short, warm line Ferni can say; persona voice comes from the LLM.
 *
 * @module services/aspirations/voice
 */

import { localToday } from '../important-dates/date-math.js';
import { parseSpokenDate, toStoredDate } from '../important-dates/date-parsing.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { recordCheckIn } from './check-ins.js';
import { matchItems } from './detection.js';
import { computeStreak, isDueOn } from './habit-math.js';
import { titlesOverlap } from './identity.js';
import { getAspiration, listAspirations, saveAspiration, upsertAspiration } from './store.js';
import {
  isConfirmed,
  type AspirationLevel,
  type AspirationRecord,
  type AspirationStatus,
  type HabitFrequency,
} from './types.js';

export interface VoiceCtx {
  userId: string;
  conversationId?: string;
  personaId?: string;
}

const RETRY = "I couldn't reach that just now. Try again in a moment?";
const provenance = (ctx: VoiceCtx) => ({
  ...(ctx.conversationId ? { sourceConversationIds: [ctx.conversationId] } : {}),
  ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
});

async function open(ctx: VoiceCtx, level?: AspirationLevel): Promise<AspirationRecord[] | null> {
  const listed = await listAspirations(ctx.userId, level ? { level } : {});
  if (!listed.success) return null;
  return listed.data.filter(
    (r) => r.status !== 'let-go' && r.status !== 'achieved' && isConfirmed(r)
  );
}

function existingTitle(
  items: readonly AspirationRecord[],
  level: AspirationLevel,
  title: string
): string {
  return items.find((r) => r.level === level && titlesOverlap(r.title, title))?.title ?? title;
}

export async function parseTargetDate(
  userId: string,
  spoken: string | undefined
): Promise<string | undefined> {
  if (!spoken) return undefined;
  const today = localToday(new Date(), await resolveTimeZone(userId));
  const parsed = parseSpokenDate(spoken, today);
  return parsed ? toStoredDate(parsed, false, today) : undefined;
}

// ── Habits ──────────────────────────────────────────────────────────────────

export async function voiceCreateHabit(
  ctx: VoiceCtx,
  args: {
    name: string;
    frequency?: HabitFrequency;
    cue?: string;
    reminderTime?: string;
    goal?: string;
  }
): Promise<string> {
  const items = (await open(ctx)) ?? [];
  const parent = args.goal ? matchItems(args.goal, items, 'goal')[0] : undefined;
  const out = await upsertAspiration(ctx.userId, {
    level: 'habit',
    title: existingTitle(items, 'habit', args.name),
    habit: {
      schedule: {
        frequency: args.frequency ?? 'daily',
        ...(args.reminderTime ? { reminderTime: args.reminderTime } : {}),
      },
      glidepathLevel: 1,
      ...(args.cue ? { loop: { cue: args.cue } } : {}),
    },
    ...(parent ? { parentId: parent.id } : {}),
    source: 'explicit',
    confidence: 1,
    ...provenance(ctx),
  });
  if (!out.success) return RETRY;
  return args.cue
    ? `Got it. "${args.name}" right after ${args.cue}. Start tiny; two minutes counts.`
    : `Got it, I'll keep track of "${args.name}". Want to tie it to something you already do?`;
}

export async function voiceLogHabit(
  ctx: VoiceCtx,
  args: { name: string; note?: string; missed?: boolean; date?: string }
): Promise<string> {
  const items = await open(ctx, 'habit');
  if (!items) return RETRY;
  const [habit] = matchItems(args.name, items);
  if (!habit) {
    return items.length
      ? `I don't have "${args.name}" yet. Your habits: ${items.map((h) => h.title).join(', ')}. Want me to add it?`
      : `I don't have "${args.name}" as a habit yet. Want me to start tracking it?`;
  }
  const saved = await recordCheckIn(ctx.userId, habit.id, {
    status: args.missed ? 'missed' : 'done',
    ...(args.date ? { date: args.date } : {}),
    ...(args.note ? { note: args.note } : {}),
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  });
  if (!saved.success) return saved.error.code === 'invalid_input' ? saved.error.message : RETRY;
  if (args.missed) return `Noted. One missed day doesn't undo anything. Tomorrow's a fresh start.`;
  const streak = saved.data.habit?.streak ?? 0;
  return streak > 1
    ? `Nice! "${habit.title}" done. That's ${streak} in a row.`
    : `Nice! "${habit.title}" done.`;
}

export async function voiceListHabits(ctx: VoiceCtx): Promise<string> {
  const items = await open(ctx, 'habit');
  if (!items) return RETRY;
  const active = items.filter((h) => h.status === 'active');
  if (active.length === 0) return "You're not tracking any habits yet. Want to start one?";
  const today = localToday(new Date(), await resolveTimeZone(ctx.userId));
  const due = active.filter((h) => h.habit && isDueOn(h.habit, today));
  const parts = active.map((h) => {
    const s = h.habit ? computeStreak(h.habit.schedule, h.habit.checkIns, today) : 0;
    return s > 0 ? `${h.title} (${s} in a row)` : h.title;
  });
  const paused = items.filter((h) => h.status === 'paused').map((h) => h.title);
  return (
    `Your habits: ${parts.join(', ')}.` +
    (due.length
      ? ` Still to do today: ${due.map((h) => h.title).join(', ')}.`
      : ' All done for today!') +
    (paused.length ? ` Paused: ${paused.join(', ')}.` : '')
  );
}

export async function voiceHabitStreak(ctx: VoiceCtx, name?: string): Promise<string> {
  const items = await open(ctx, 'habit');
  if (!items) return RETRY;
  const habit = name ? matchItems(name, items)[0] : undefined;
  if (!habit?.habit) return name ? `I don't have streak data for "${name}" yet.` : 'Which habit?';
  const today = localToday(new Date(), await resolveTimeZone(ctx.userId));
  const s = computeStreak(habit.habit.schedule, habit.habit.checkIns, today);
  return s === 0
    ? `No current streak on "${habit.title}". Today's a good day to start.`
    : `${s} in a row on "${habit.title}". Best so far: ${Math.max(s, habit.habit.longestStreak)}.`;
}

export async function voiceSetStatus(
  ctx: VoiceCtx,
  args: { name: string; status: AspirationStatus; level?: AspirationLevel }
): Promise<string> {
  const listed = await listAspirations(ctx.userId, args.level ? { level: args.level } : {});
  if (!listed.success) return RETRY;
  const [target] = matchItems(args.name, listed.data, args.level);
  if (!target) return `I couldn't find "${args.name}".`;
  const now = new Date().toISOString();
  const saved = await saveAspiration(ctx.userId, {
    ...target,
    status: args.status,
    statusChangedAt: now,
    updatedAt: now,
    lastMentionedAt: now,
  });
  if (!saved.success) return RETRY;
  const lines: Record<AspirationStatus, string> = {
    active: `"${target.title}" is back on. Let's go.`,
    paused: `"${target.title}" is paused. It'll be here when you're ready.`,
    achieved: `You did it: "${target.title}". That deserves a moment.`,
    'let-go': `Okay. Letting "${target.title}" go. It still meant something.`,
    dormant: `"${target.title}" can rest for now.`,
  };
  return lines[args.status];
}

// ── Goals ───────────────────────────────────────────────────────────────────

export async function voiceAddGoal(
  ctx: VoiceCtx,
  args: { title: string; why?: string; targetDate?: string; category?: string; dream?: string }
): Promise<string> {
  const items = (await open(ctx)) ?? [];
  const parent = args.dream ? matchItems(args.dream, items, 'dream')[0] : undefined;
  const targetDate = await parseTargetDate(ctx.userId, args.targetDate);
  const out = await upsertAspiration(ctx.userId, {
    level: 'goal',
    title: existingTitle(items, 'goal', args.title),
    ...(args.why ? { why: args.why } : {}),
    ...(args.category ? { category: args.category } : {}),
    ...(targetDate ? { targetDate } : {}),
    ...(parent ? { parentId: parent.id } : {}),
    source: 'explicit',
    confidence: 1,
    ...provenance(ctx),
  });
  if (!out.success) return RETRY;
  return targetDate
    ? `Goal set: "${args.title}" by ${targetDate}. I'll remind you as it gets close. What's a first small step?`
    : `Goal set: "${args.title}". What's a first small step?`;
}

export async function voiceListGoals(ctx: VoiceCtx, category?: string): Promise<string> {
  const items = await open(ctx, 'goal');
  if (!items) return RETRY;
  const goals = items.filter((g) => !category || g.category === category);
  if (goals.length === 0)
    return "You haven't set any goals yet. What would you like to work toward?";
  return `Your goals: ${goals
    .map(
      (g) =>
        `${g.title}${g.progress !== undefined ? ` (${g.progress}%)` : ''}${g.targetDate ? `, by ${g.targetDate}` : ''}`
    )
    .join('; ')}.`;
}

export async function voiceUpdateGoal(
  ctx: VoiceCtx,
  args: { name: string; progress?: number; status?: AspirationStatus; milestone?: string }
): Promise<string> {
  const items = await open(ctx, 'goal');
  if (!items) return RETRY;
  const [goal] = matchItems(args.name, items);
  if (!goal) return `I couldn't find a goal like "${args.name}".`;
  if (args.status)
    return voiceSetStatus(ctx, { name: goal.title, status: args.status, level: 'goal' });
  const out = await upsertAspiration(ctx.userId, {
    level: 'goal',
    title: goal.title,
    ...(args.progress !== undefined && args.progress >= 0 && args.progress <= 100
      ? { progress: args.progress }
      : {}),
    ...(args.milestone ? { milestones: [args.milestone] } : {}),
    source: 'explicit',
    confidence: 1,
    ...provenance(ctx),
  });
  if (!out.success) return RETRY;
  if (out.data.status === 'provenance_merged')
    return `You've edited "${goal.title}" yourself, so I left it as you set it.`;
  return args.progress !== undefined
    ? `"${goal.title}" is at ${args.progress}% now. Nice.`
    : `Updated "${goal.title}".`;
}

// ── Dreams ──────────────────────────────────────────────────────────────────

export async function voiceRecordDream(
  ctx: VoiceCtx,
  args: { statement: string; type?: string; why?: string }
): Promise<string> {
  const items = (await open(ctx, 'dream')) ?? [];
  const out = await upsertAspiration(ctx.userId, {
    level: 'dream',
    title: existingTitle(items, 'dream', args.statement),
    ...(args.type ? { category: args.type } : {}),
    ...(args.why ? { why: args.why } : {}),
    source: 'explicit',
    confidence: 1,
    ...provenance(ctx),
  });
  if (!out.success) return RETRY;
  return `I'll hold onto that dream for you: "${args.statement}".`;
}

export async function voiceListDreams(ctx: VoiceCtx): Promise<string> {
  const listed = await listAspirations(ctx.userId, { level: 'dream' });
  if (!listed.success) return RETRY;
  const dreams = listed.data.filter((d) => isConfirmed(d) && d.status !== 'let-go');
  if (dreams.length === 0)
    return "You haven't shared a dream with me yet. I'd love to hear one, big or small.";
  return `Dreams you've shared: ${dreams.map((d) => `${d.title}${d.status === 'achieved' ? ' (you did it!)' : ''}`).join('; ')}.`;
}

/** Re-read helper for tools that need the record after a voice op. */
export async function getById(userId: string, id: string): Promise<AspirationRecord | null> {
  const got = await getAspiration(userId, id);
  return got.success ? got.data : null;
}
