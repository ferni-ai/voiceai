/**
 * Building, merging and reading aspiration records. Pure functions, no I/O.
 *
 * Merge rules (upsert of an existing record):
 * - `userEdited` records only gain provenance (sourceConversationIds); the
 *   user's word wins over anything captured later.
 * - Otherwise: explicit beats inferred (once explicit, stays explicit);
 *   evidenceCount goes up once per new conversation (or per call when no
 *   conversation id is given); confidence takes the max (+0.05 for repeat
 *   inferred evidence); a mention revives a dormant item.
 *
 * @module services/aspirations/record
 */

import { parseClock } from '../important-dates/date-math.js';
import { milestoneIdFor } from './identity.js';
import { parseCivil } from './habit-math.js';
import {
  ASPIRATION_LEVELS,
  ASPIRATION_STATUSES,
  HABIT_FREQUENCIES,
  LEVEL_RANK,
  MAX_NOTE,
  MAX_TITLE,
  MAX_WHY,
  type AspirationInput,
  type AspirationLevel,
  type AspirationRecord,
  type AspirationStatus,
  type CheckIn,
  type HabitDetails,
  type HabitFrequency,
  type HabitLoop,
  type HabitSchedule,
  type Milestone,
} from './types.js';

const MAX_NOTES = 30;
const MAX_MILESTONES = 30;
const MAX_PROVENANCE = 200;

export const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

export function unionIds(a: readonly string[], b: readonly string[] = []): string[] {
  return [...new Set([...a, ...b.filter((x) => typeof x === 'string' && x)])].slice(
    -MAX_PROVENANCE
  );
}

export function isValidDay(value: unknown): value is string {
  return typeof value === 'string' && parseCivil(value) !== null;
}

export function validLevelLink(child: AspirationLevel, parent: AspirationLevel): boolean {
  return LEVEL_RANK[parent] > LEVEL_RANK[child];
}

export function validateInput(input: AspirationInput): string | null {
  if (!ASPIRATION_LEVELS.includes(input.level)) return 'invalid level';
  if (!clean(input.title, MAX_TITLE)) return 'title is required';
  if (input.status && !ASPIRATION_STATUSES.includes(input.status)) return 'invalid status';
  if (input.source !== 'explicit' && input.source !== 'inferred') return 'invalid source';
  if (!(input.confidence >= 0 && input.confidence <= 1)) return 'confidence must be 0-1';
  if (input.targetDate !== undefined && !isValidDay(input.targetDate)) {
    return 'targetDate must be YYYY-MM-DD';
  }
  if (input.progress !== undefined && !(input.progress >= 0 && input.progress <= 100)) {
    return 'progress must be 0-100';
  }
  if (input.level !== 'habit' && input.habit) return 'only habits have a schedule';
  return null;
}

function normDays(days: unknown): number[] | undefined {
  if (!Array.isArray(days)) return undefined;
  const out = [
    ...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)),
  ];
  return out.length > 0 ? out.sort() : undefined;
}

export function normalizeSchedule(
  s: Partial<HabitSchedule> | undefined,
  base?: HabitSchedule
): HabitSchedule {
  const frequency: HabitFrequency =
    s?.frequency && HABIT_FREQUENCIES.includes(s.frequency)
      ? s.frequency
      : (base?.frequency ?? 'daily');
  const days = s?.days !== undefined ? normDays(s.days) : base?.days;
  const times = Number(s?.timesPerDay ?? base?.timesPerDay ?? 1);
  const reminder = s?.reminderTime !== undefined ? s.reminderTime : base?.reminderTime;
  return {
    frequency: frequency === 'custom' && !days ? 'daily' : frequency,
    ...(days ? { days } : {}),
    timesPerDay: Number.isInteger(times) && times >= 1 && times <= 20 ? times : 1,
    ...(typeof reminder === 'string' && parseClock(reminder) !== null
      ? { reminderTime: reminder.trim() }
      : {}),
  };
}

export function normalizeLoop(loop: unknown): HabitLoop | undefined {
  if (!loop || typeof loop !== 'object') return undefined;
  const l = loop as Record<string, unknown>;
  const out: HabitLoop = {};
  const cue = clean(l.cue, MAX_NOTE);
  const routine = clean(l.routine, MAX_NOTE);
  const reward = clean(l.reward, MAX_NOTE);
  if (cue) out.cue = cue;
  if (routine) out.routine = routine;
  if (reward) out.reward = reward;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function glidepath(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

function newHabitDetails(input: AspirationInput): HabitDetails {
  const h = input.habit ?? {};
  const loop = normalizeLoop(h.loop);
  const level = glidepath(h.glidepathLevel);
  const anchor = clean(h.stackAnchor, MAX_NOTE);
  return {
    schedule: normalizeSchedule(h.schedule),
    ...(level ? { glidepathLevel: level } : {}),
    ...(loop ? { loop } : {}),
    ...(anchor ? { stackAnchor: anchor } : {}),
    streak: 0,
    longestStreak: 0,
    checkIns: [],
    nextNudgeAt: null,
  };
}

function mergeHabitDetails(existing: HabitDetails, input: AspirationInput): HabitDetails {
  const h = input.habit;
  if (!h) return existing;
  const loop = normalizeLoop(h.loop);
  const level = glidepath(h.glidepathLevel);
  const anchor = clean(h.stackAnchor, MAX_NOTE);
  return {
    ...existing,
    schedule: h.schedule ? normalizeSchedule(h.schedule, existing.schedule) : existing.schedule,
    ...(level ? { glidepathLevel: level } : {}),
    ...(loop ? { loop: { ...existing.loop, ...loop } } : {}),
    ...(anchor ? { stackAnchor: anchor } : {}),
  };
}

export function milestonesFrom(
  titles: readonly string[] = [],
  existing: Milestone[] = []
): Milestone[] {
  const out = [...existing];
  for (const raw of titles) {
    const title = clean(raw, MAX_TITLE);
    if (!title) continue;
    const id = milestoneIdFor(title);
    if (!out.some((m) => m.id === id)) out.push({ id, title, done: false });
  }
  return out.slice(0, MAX_MILESTONES);
}

function addNote(notes: readonly string[], note: string | undefined): string[] {
  const n = clean(note, MAX_NOTE);
  if (!n || notes.includes(n)) return [...notes];
  return [...notes, n].slice(-MAX_NOTES);
}

export function newRecord(id: string, input: AspirationInput, now: string): AspirationRecord {
  const title = clean(input.title, MAX_TITLE) as string;
  const why = clean(input.why, MAX_WHY);
  const category = clean(input.category, 60);
  const personaId = clean(input.personaId, 60);
  const status = input.status ?? 'active';
  return {
    id,
    level: input.level,
    title,
    ...(why ? { why } : {}),
    status,
    parentId: input.parentId ?? null,
    ...(category ? { category } : {}),
    milestones: milestonesFrom(input.milestones),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    ...(input.progress !== undefined ? { progress: Math.round(input.progress) } : {}),
    notes: addNote([], input.note),
    ...(input.level === 'habit' ? { habit: newHabitDetails(input) } : {}),
    source: input.source,
    confidence: input.confidence,
    evidenceCount: 1,
    sourceConversationIds: unionIds([], input.sourceConversationIds),
    userEdited: false,
    ...(personaId ? { personaId } : {}),
    legacyIds: input.legacyId ? [input.legacyId] : [],
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    lastMentionedAt: now,
    statusChangedAt: now,
  };
}

function isNewEvidence(existing: AspirationRecord, input: AspirationInput): boolean {
  const ids = input.sourceConversationIds ?? [];
  if (ids.length === 0) return true;
  return ids.some((c) => !existing.sourceConversationIds.includes(c));
}

/** Merge new evidence into an existing, not user-edited record. */
export function mergeRecord(
  existing: AspirationRecord,
  input: AspirationInput,
  now: string
): AspirationRecord {
  const fresh = isNewEvidence(existing, input);
  const why = clean(input.why, MAX_WHY);
  const category = clean(input.category, 60);
  const explicit = existing.source === 'explicit' || input.source === 'explicit';
  let status: AspirationStatus = existing.status;
  if (input.status) status = input.status;
  else if (existing.status === 'dormant') status = 'active';
  const confidence = Math.min(
    1,
    Math.max(existing.confidence, input.confidence) +
      (fresh && input.source === 'inferred' && existing.source === 'inferred' ? 0.05 : 0)
  );
  return {
    ...existing,
    ...(why ? { why } : {}),
    ...(category ? { category } : {}),
    status,
    ...(status !== existing.status ? { statusChangedAt: now } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    ...(input.progress !== undefined ? { progress: Math.round(input.progress) } : {}),
    milestones: milestonesFrom(input.milestones, existing.milestones),
    notes: addNote(existing.notes, input.note),
    ...(existing.habit ? { habit: mergeHabitDetails(existing.habit, input) } : {}),
    source: explicit ? 'explicit' : 'inferred',
    confidence: Number(confidence.toFixed(3)),
    evidenceCount: existing.evidenceCount + (fresh ? 1 : 0),
    sourceConversationIds: unionIds(existing.sourceConversationIds, input.sourceConversationIds),
    legacyIds: input.legacyId ? unionIds(existing.legacyIds, [input.legacyId]) : existing.legacyIds,
    ...(input.personaId && !existing.personaId ? { personaId: input.personaId } : {}),
    updatedAt: now,
    lastMentionedAt: now,
  };
}

// ============================================================================
// READING STORED DOCUMENTS (defensive: old or hand-edited docs degrade safely)
// ============================================================================

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const iso = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);

function checkInsFrom(v: unknown): CheckIn[] {
  if (!Array.isArray(v)) return [];
  const out: CheckIn[] = [];
  for (const raw of v) {
    const c = asRecord(raw);
    if (!isValidDay(c.date) || (c.status !== 'done' && c.status !== 'missed')) continue;
    const note = clean(c.note, MAX_NOTE);
    out.push({
      date: c.date,
      status: c.status,
      ...(note ? { note } : {}),
      recordedAt: iso(c.recordedAt, `${c.date}T12:00:00.000Z`),
      ...(typeof c.conversationId === 'string' ? { conversationId: c.conversationId } : {}),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function habitFrom(v: unknown): HabitDetails {
  const h = asRecord(v);
  const loop = normalizeLoop(h.loop);
  const level = glidepath(h.glidepathLevel);
  const anchor = clean(h.stackAnchor, MAX_NOTE);
  const n = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 ? (x as number) : 0);
  return {
    schedule: normalizeSchedule(asRecord(h.schedule) as Partial<HabitSchedule>),
    ...(level ? { glidepathLevel: level } : {}),
    ...(loop ? { loop } : {}),
    ...(anchor ? { stackAnchor: anchor } : {}),
    streak: n(h.streak),
    longestStreak: n(h.longestStreak),
    checkIns: checkInsFrom(h.checkIns),
    nextNudgeAt: typeof h.nextNudgeAt === 'string' ? h.nextNudgeAt : null,
  };
}

function milestonesFromDoc(v: unknown): Milestone[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw): Milestone | null => {
      const m = asRecord(raw);
      const title = clean(m.title, MAX_TITLE);
      if (!title) return null;
      return {
        id: typeof m.id === 'string' && m.id ? m.id : milestoneIdFor(title),
        title,
        done: m.done === true,
        ...(typeof m.doneAt === 'string' ? { doneAt: m.doneAt } : {}),
        ...(isValidDay(m.targetDate) ? { targetDate: m.targetDate } : {}),
      };
    })
    .filter((m): m is Milestone => m !== null);
}

export function recordFromDoc(id: string, data: Record<string, unknown>): AspirationRecord | null {
  const level = data.level as AspirationLevel;
  const title = clean(data.title, MAX_TITLE);
  if (!ASPIRATION_LEVELS.includes(level) || !title) return null;
  const status = ASPIRATION_STATUSES.includes(data.status as AspirationStatus)
    ? (data.status as AspirationStatus)
    : 'active';
  const now = new Date().toISOString();
  const createdAt = iso(data.createdAt, now);
  const why = clean(data.why, MAX_WHY);
  const category = clean(data.category, 60);
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5;
  const evidence = Number.isInteger(data.evidenceCount) ? (data.evidenceCount as number) : 1;
  return {
    id,
    level,
    title,
    ...(why ? { why } : {}),
    status,
    parentId: typeof data.parentId === 'string' && data.parentId ? data.parentId : null,
    ...(category ? { category } : {}),
    milestones: milestonesFromDoc(data.milestones),
    ...(isValidDay(data.targetDate) ? { targetDate: data.targetDate } : {}),
    ...(typeof data.progress === 'number' ? { progress: data.progress } : {}),
    notes: strings(data.notes),
    ...(level === 'habit' ? { habit: habitFrom(data.habit) } : {}),
    source: data.source === 'explicit' ? 'explicit' : 'inferred',
    confidence,
    evidenceCount: Math.max(1, evidence),
    sourceConversationIds: strings(data.sourceConversationIds),
    userEdited: data.userEdited === true,
    ...(typeof data.editedAt === 'string' ? { editedAt: data.editedAt } : {}),
    ...(typeof data.personaId === 'string' ? { personaId: data.personaId } : {}),
    legacyIds: strings(data.legacyIds),
    ...(typeof data.deadlineDateId === 'string' ? { deadlineDateId: data.deadlineDateId } : {}),
    createdAt,
    updatedAt: iso(data.updatedAt, createdAt),
    lastMentionedAt: iso(data.lastMentionedAt, createdAt),
    ...(typeof data.statusChangedAt === 'string' ? { statusChangedAt: data.statusChangedAt } : {}),
    ...(typeof data.lastResurfacedAt === 'string'
      ? { lastResurfacedAt: data.lastResurfacedAt }
      : {}),
  };
}

/** Firestore rejects undefined values; records never carry them, but be safe. */
export function toDoc(record: AspirationRecord): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}
