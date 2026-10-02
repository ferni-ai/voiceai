/**
 * User edits from the web page (and voice): create, patch, validate.
 *
 * Anything the user creates or edits is marked `userEdited`, so automated
 * capture can only add provenance to it afterwards.
 *
 * @module services/aspirations/edits
 */

import { failure, success, type Result } from '../../types/result.js';
import { localToday } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { aspirationIdFor, milestoneIdFor } from './identity.js';
import { withStreaks } from './habit-math.js';
import {
  clean,
  glidepath,
  isValidDay,
  normalizeLoop,
  normalizeSchedule,
  validLevelLink,
} from './record.js';
import { getAspiration, saveAspiration, upsertAspiration, type StoreResult } from './store.js';
import {
  ASPIRATION_LEVELS,
  ASPIRATION_STATUSES,
  AspirationError,
  HABIT_FREQUENCIES,
  MAX_NOTE,
  MAX_TITLE,
  MAX_WHY,
  type AspirationLevel,
  type AspirationPatch,
  type AspirationRecord,
  type AspirationStatus,
  type HabitFrequency,
  type Milestone,
} from './types.js';

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const nullableString = (
  v: unknown,
  max: number,
  field: string
): string | null | undefined | Error => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return new Error(`${field} must be a string`);
  return clean(v, max) ?? null;
};

/** Validate a patch body from the API. Unknown fields are ignored. */
export function parsePatch(input: unknown): Result<AspirationPatch, string> {
  const b = asObj(input);
  const patch: AspirationPatch = {};
  if (b.title !== undefined) {
    const t = typeof b.title === 'string' ? clean(b.title, MAX_TITLE) : undefined;
    if (!t) return failure('title must be a non-empty string');
    patch.title = t;
  }
  for (const [field, max] of [
    ['why', MAX_WHY],
    ['category', 60],
    ['stackAnchor', MAX_NOTE],
  ] as const) {
    const v = nullableString(b[field], max, field);
    if (v instanceof Error) return failure(v.message);
    if (v !== undefined) patch[field] = v;
  }
  if (b.status !== undefined) {
    if (!ASPIRATION_STATUSES.includes(b.status as AspirationStatus))
      return failure('invalid status');
    patch.status = b.status as AspirationStatus;
  }
  if (b.parentId !== undefined) {
    if (b.parentId !== null && (typeof b.parentId !== 'string' || !b.parentId)) {
      return failure('parentId must be an id or null');
    }
    patch.parentId = b.parentId as string | null;
  }
  if (b.targetDate !== undefined) {
    if (b.targetDate !== null && !isValidDay(b.targetDate))
      return failure('targetDate must be YYYY-MM-DD');
    patch.targetDate = b.targetDate as string | null;
  }
  if (b.progress !== undefined) {
    const p = b.progress;
    if (p !== null && !(typeof p === 'number' && p >= 0 && p <= 100))
      return failure('progress must be 0-100');
    patch.progress = p === null ? null : Math.round(p as number);
  }
  if (b.glidepathLevel !== undefined) {
    if (b.glidepathLevel !== null && !glidepath(b.glidepathLevel))
      return failure('glidepathLevel must be 1-5');
    patch.glidepathLevel = b.glidepathLevel === null ? null : glidepath(b.glidepathLevel);
  }
  if (b.loop !== undefined) patch.loop = b.loop === null ? null : (normalizeLoop(b.loop) ?? null);
  if (b.schedule !== undefined) {
    const s = asObj(b.schedule);
    if (s.frequency !== undefined && !HABIT_FREQUENCIES.includes(s.frequency as HabitFrequency)) {
      return failure('invalid frequency');
    }
    patch.schedule = s as AspirationPatch['schedule'];
  }
  if (b.milestones !== undefined) {
    if (!Array.isArray(b.milestones)) return failure('milestones must be a list');
    const out: NonNullable<AspirationPatch['milestones']> = [];
    for (const raw of b.milestones.slice(0, 30)) {
      const m = asObj(raw);
      const title = typeof m.title === 'string' ? clean(m.title, MAX_TITLE) : undefined;
      if (!title) return failure('each milestone needs a title');
      if (m.targetDate !== undefined && !isValidDay(m.targetDate))
        return failure('milestone targetDate must be YYYY-MM-DD');
      out.push({
        ...(typeof m.id === 'string' ? { id: m.id } : {}),
        title,
        done: m.done === true,
        ...(typeof m.targetDate === 'string' ? { targetDate: m.targetDate } : {}),
      });
    }
    patch.milestones = out;
  }
  return success(patch);
}

function patchedMilestones(
  existing: Milestone[],
  next: NonNullable<AspirationPatch['milestones']>,
  now: string
): Milestone[] {
  return next.map((m) => {
    const id = m.id ?? milestoneIdFor(m.title);
    const prev = existing.find((e) => e.id === id);
    const done = m.done === true;
    return {
      id,
      title: m.title,
      done,
      ...(done ? { doneAt: prev?.doneAt ?? now } : {}),
      ...(m.targetDate ? { targetDate: m.targetDate } : {}),
    };
  });
}

/** Apply a validated patch (pure). Returns an error string for invalid combinations. */
export function applyPatch(
  record: AspirationRecord,
  patch: AspirationPatch,
  now: string
): AspirationRecord | string {
  const next: AspirationRecord = { ...record, userEdited: true, editedAt: now, updatedAt: now };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.why !== undefined) {
    if (patch.why) next.why = patch.why;
    else delete next.why;
  }
  if (patch.category !== undefined) {
    if (patch.category) next.category = patch.category;
    else delete next.category;
  }
  if (patch.status !== undefined && patch.status !== record.status) {
    next.status = patch.status;
    next.statusChangedAt = now;
  }
  if (patch.parentId !== undefined) next.parentId = patch.parentId;
  if (patch.targetDate !== undefined) {
    if (patch.targetDate) next.targetDate = patch.targetDate;
    else delete next.targetDate;
  }
  if (patch.progress !== undefined) {
    if (patch.progress === null) delete next.progress;
    else next.progress = patch.progress;
  }
  if (patch.milestones)
    next.milestones = patchedMilestones(record.milestones, patch.milestones, now);
  const habitFields =
    patch.schedule ||
    patch.glidepathLevel !== undefined ||
    patch.loop !== undefined ||
    patch.stackAnchor !== undefined;
  if (habitFields) {
    if (!record.habit) return 'only habits have a schedule';
    const h = { ...record.habit };
    if (patch.schedule) h.schedule = normalizeSchedule(patch.schedule, h.schedule);
    if (patch.glidepathLevel !== undefined) {
      if (patch.glidepathLevel) h.glidepathLevel = patch.glidepathLevel;
      else delete h.glidepathLevel;
    }
    if (patch.loop !== undefined) {
      if (patch.loop) h.loop = patch.loop;
      else delete h.loop;
    }
    if (patch.stackAnchor !== undefined) {
      if (patch.stackAnchor) h.stackAnchor = patch.stackAnchor;
      else delete h.stackAnchor;
    }
    next.habit = h;
  }
  return next;
}

export async function editAspiration(
  userId: string,
  id: string,
  patch: AspirationPatch
): StoreResult<AspirationRecord> {
  const got = await getAspiration(userId, id);
  if (!got.success) return got;
  if (patch.parentId) {
    if (patch.parentId === id)
      return failure(new AspirationError('invalid_input', 'cannot link to itself'));
    const parent = await getAspiration(userId, patch.parentId);
    if (!parent.success) {
      return parent.error.code === 'not_found'
        ? failure(new AspirationError('invalid_input', 'parent not found'))
        : parent;
    }
    if (!validLevelLink(got.data.level, parent.data.level)) {
      return failure(
        new AspirationError(
          'invalid_input',
          `a ${got.data.level} can't sit under a ${parent.data.level}`
        )
      );
    }
  }
  const next = applyPatch(got.data, patch, new Date().toISOString());
  if (typeof next === 'string') return failure(new AspirationError('invalid_input', next));
  if (patch.schedule && next.habit) {
    next.habit = withStreaks(next.habit, localToday(new Date(), await resolveTimeZone(userId)));
  }
  return saveAspiration(userId, next);
}

export interface NewUserAspiration {
  level: AspirationLevel;
  title: string;
  why?: string;
  parentId?: string | null;
  targetDate?: string;
  category?: string;
  milestones?: string[];
  schedule?: AspirationPatch['schedule'];
  glidepathLevel?: number;
  loop?: AspirationPatch['loop'];
  stackAnchor?: string;
}

export function parseCreate(input: unknown): Result<NewUserAspiration, string> {
  const b = asObj(input);
  if (!ASPIRATION_LEVELS.includes(b.level as AspirationLevel))
    return failure("level must be 'dream', 'goal' or 'habit'");
  const patch = parsePatch(b);
  if (!patch.success) return patch;
  const p = patch.data;
  if (!p.title) return failure('title is required');
  const level = b.level as AspirationLevel;
  if (level !== 'habit' && (p.schedule || p.glidepathLevel || p.loop || p.stackAnchor)) {
    return failure('only habits have a schedule');
  }
  return success({
    level,
    title: p.title,
    ...(p.why ? { why: p.why } : {}),
    ...(p.parentId !== undefined ? { parentId: p.parentId } : {}),
    ...(p.targetDate ? { targetDate: p.targetDate } : {}),
    ...(p.category ? { category: p.category } : {}),
    ...(p.milestones ? { milestones: p.milestones.map((m) => m.title) } : {}),
    ...(p.schedule ? { schedule: p.schedule } : {}),
    ...(p.glidepathLevel ? { glidepathLevel: p.glidepathLevel } : {}),
    ...(p.loop ? { loop: p.loop } : {}),
    ...(p.stackAnchor ? { stackAnchor: p.stackAnchor } : {}),
  });
}

/** Create (or re-add) an item the user typed on the page. */
export async function createUserAspiration(
  userId: string,
  input: NewUserAspiration
): StoreResult<AspirationRecord> {
  const outcome = await upsertAspiration(userId, {
    level: input.level,
    title: input.title,
    ...(input.why ? { why: input.why } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    ...(input.category ? { category: input.category } : {}),
    ...(input.milestones ? { milestones: input.milestones } : {}),
    ...(input.level === 'habit'
      ? {
          habit: {
            ...(input.schedule ? { schedule: input.schedule } : {}),
            ...(input.glidepathLevel ? { glidepathLevel: input.glidepathLevel } : {}),
            ...(input.loop ? { loop: input.loop } : {}),
            ...(input.stackAnchor ? { stackAnchor: input.stackAnchor } : {}),
          },
        }
      : {}),
    source: 'explicit',
    confidence: 1,
  });
  if (!outcome.success) return outcome;
  const id = aspirationIdFor(input.level, input.title);
  const got = await getAspiration(userId, id);
  if (!got.success) return got;
  if (got.data.userEdited) return got;
  return saveAspiration(
    userId,
    { ...got.data, userEdited: true, editedAt: new Date().toISOString() },
    { skipHooks: true }
  );
}
