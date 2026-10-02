/**
 * Mapping documents from the older, disconnected stores into aspiration
 * inputs. Pure functions; legacy-migration.ts does the I/O.
 *
 *   dreams/*                       Dream Keeper            → dream
 *   goals/*                        addGoal (JSON route)    → goal
 *   commitments/* (type 'goal')    Commitment Keeper       → goal
 *   habits/* (+ logs, habit_completions)  JSON-route habits → habit
 *   profile.productivityData       habits / habitLogs / enhancedHabits → habit
 *   profile.lifeData.goals         life-planning manageGoal → goal
 *   profile.goals                  financial goals         → goal (category 'financial')
 *
 * @module services/aspirations/legacy-mappers
 */

import { formatCivil, localToday } from '../important-dates/date-math.js';
import type { AspirationInput, AspirationStatus, CheckInStatus, HabitFrequency } from './types.js';

export type Data = Record<string, unknown>;

export const asData = (v: unknown): Data => (v && typeof v === 'object' ? (v as Data) : {});
export const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Firestore Timestamp, Date, ISO string or epoch ms → Date. */
export function toDate(v: unknown): Date | undefined {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const o = asData(v);
  if (typeof o.toDate === 'function') return toDate((o.toDate as () => unknown)());
  const seconds = num(o._seconds) ?? num(o.seconds);
  return seconds !== undefined ? new Date(seconds * 1000) : undefined;
}

export const toIso = (v: unknown): string | undefined => toDate(v)?.toISOString();

export function toDay(v: unknown, timeZone: string): string | undefined {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = toDate(v);
  return d ? formatCivil(localToday(d, timeZone)) : undefined;
}

export interface LegacyCheckIn {
  date: string;
  status: CheckInStatus;
  note?: string;
}

export interface MigrationCandidate {
  input: AspirationInput;
  /** Extra fields applied after the upsert (status history, streaks, check-ins). */
  checkIns?: LegacyCheckIn[];
  lastMentionedAt?: string;
}

const DREAM_STATUS: Record<string, AspirationStatus> = {
  alive: 'active',
  dormant: 'dormant',
  deferred: 'paused',
  evolved: 'active',
  achieved: 'achieved',
  released: 'let-go',
};

export function fromDream(id: string, d: Data): MigrationCandidate | null {
  const title = str(d.statement) ?? str(d.title);
  if (!title) return null;
  const confidence = Math.max(0, Math.min(1, num(d.confidence) ?? 0.7));
  const notes = [
    ...(Array.isArray(d.progressNotes) ? d.progressNotes : []),
    ...(Array.isArray(d.obstacles) ? d.obstacles.map((o) => `Obstacle: ${String(o)}`) : []),
  ].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  return {
    input: {
      level: 'dream',
      title,
      ...(str(d.whyItMatters) ? { why: str(d.whyItMatters) } : {}),
      status: DREAM_STATUS[String(d.status)] ?? 'active',
      ...(str(d.type) ? { category: str(d.type) } : {}),
      ...(notes[0] ? { note: notes[0] } : {}),
      // recordDream (voice tool) and strong "my dream is" patterns score ≥ 0.85.
      source: confidence >= 0.85 ? 'explicit' : 'inferred',
      confidence,
      ...(str(d.personaId) ? { personaId: str(d.personaId) } : {}),
      legacyId: id,
      ...(toIso(d.firstMentioned) ? { createdAt: toIso(d.firstMentioned) } : {}),
    },
    ...(toIso(d.lastMentioned) ? { lastMentionedAt: toIso(d.lastMentioned) } : {}),
  };
}

function goalStatus(raw: unknown): AspirationStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'completed' || s === 'achieved') return 'achieved';
  if (s === 'abandoned') return 'let-go';
  if (s === 'paused' || s === 'deferred') return 'paused';
  return 'active';
}

export function fromGoalDoc(id: string, d: Data, timeZone: string): MigrationCandidate | null {
  const title = str(d.title) ?? str(d.name);
  if (!title) return null;
  const progress = num(d.progress) ?? num(d.progressPercent);
  const milestones = Array.isArray(d.milestones)
    ? d.milestones
        .map((m) => (typeof m === 'string' ? m : str(asData(m).title)))
        .filter((m): m is string => !!m)
    : [];
  const target =
    d.targetDate !== undefined && d.targetDate !== null ? toDay(d.targetDate, timeZone) : undefined;
  return {
    input: {
      level: 'goal',
      title,
      ...(str(d.description) ? { why: str(d.description) } : {}),
      status: goalStatus(d.status),
      ...(str(d.category) ? { category: str(d.category) } : {}),
      ...(target ? { targetDate: target } : {}),
      ...(progress !== undefined && progress >= 0 && progress <= 100 ? { progress } : {}),
      ...(milestones.length ? { milestones } : {}),
      source: 'explicit',
      confidence: 1,
      legacyId: id,
      ...(toIso(d.createdAt) ? { createdAt: toIso(d.createdAt) } : {}),
    },
  };
}

const FIN_STATUS: Record<string, AspirationStatus> = {
  achieved: 'achieved',
  abandoned: 'let-go',
};

export function fromFinancialGoal(d: Data, timeZone: string): MigrationCandidate | null {
  const title = str(d.name) ?? str(d.title);
  if (!title) return null;
  const target = d.targetDate ? toDay(d.targetDate, timeZone) : undefined;
  const progress = num(d.progressPercent);
  return {
    input: {
      level: 'goal',
      title,
      status: FIN_STATUS[String(d.status)] ?? 'active',
      category: 'financial',
      ...(target ? { targetDate: target } : {}),
      ...(progress !== undefined && progress >= 0 && progress <= 100 ? { progress } : {}),
      source: 'explicit',
      confidence: 1,
      ...(str(d.id) ? { legacyId: str(d.id) } : {}),
    },
  };
}

export function fromCommitmentGoal(id: string, d: Data): MigrationCandidate | null {
  if (d.type !== 'goal') return null;
  const title = str(d.summary) ?? str(d.statement);
  if (!title) return null;
  const status: AspirationStatus =
    d.status === 'completed'
      ? 'achieved'
      : d.status === 'abandoned'
        ? 'let-go'
        : d.status === 'deferred'
          ? 'paused'
          : 'active';
  return {
    input: {
      level: 'goal',
      title,
      status,
      source: 'explicit',
      confidence: 0.8,
      ...(str(d.personaId) ? { personaId: str(d.personaId) } : {}),
      legacyId: id,
      ...(toIso(d.createdAt) ? { createdAt: toIso(d.createdAt) } : {}),
    },
  };
}

const FREQS: readonly HabitFrequency[] = ['daily', 'weekdays', 'weekends', 'weekly', 'custom'];

function habitStatus(d: Data): AspirationStatus {
  if (d.isPaused === true || d.status === 'paused') return 'paused';
  if (d.isActive === false || d.status === 'deleted' || d.status === 'inactive') return 'let-go';
  return 'active';
}

/** A habit document from any older habit store. */
export function fromHabitDoc(id: string, d: Data): MigrationCandidate | null {
  const title = str(d.name) ?? str(d.title);
  if (!title) return null;
  const loopData = asData(d.habitLoop);
  const cue = str(d.cue) ?? str(asData(loopData.cue).description);
  const routine = str(asData(loopData.routine).behavior);
  const reward = str(asData(loopData.reward).intrinsic);
  const frequency = FREQS.includes(d.frequency as HabitFrequency)
    ? (d.frequency as HabitFrequency)
    : 'daily';
  const days = Array.isArray(d.customDays) ? (d.customDays as number[]) : undefined;
  const level = num(d.currentLevel) ?? num(d.glidepathLevel);
  return {
    input: {
      level: 'habit',
      title,
      ...(str(d.description) ? { why: str(d.description) } : {}),
      status: habitStatus(d),
      ...((str(d.category) ?? str(d.domain)) ? { category: str(d.category) ?? str(d.domain) } : {}),
      habit: {
        schedule: {
          frequency,
          ...(days ? { days } : {}),
          ...(num(d.targetPerDay) ? { timesPerDay: num(d.targetPerDay) } : {}),
          ...(str(d.reminderTime) ? { reminderTime: str(d.reminderTime) } : {}),
        },
        ...(level ? { glidepathLevel: level } : {}),
        ...(cue || routine || reward
          ? {
              loop: {
                ...(cue ? { cue } : {}),
                ...(routine ? { routine } : {}),
                ...(reward ? { reward } : {}),
              },
            }
          : {}),
        ...(str(d.stackedOnto) ? { stackAnchor: str(d.stackedOnto) } : {}),
      },
      ...(str(d.notes) ? { note: str(d.notes) } : {}),
      source: 'explicit',
      confidence: 1,
      legacyId: id,
      ...(toIso(d.createdAt) ? { createdAt: toIso(d.createdAt) } : {}),
    },
  };
}

/** productivityData.habitLogs entries for one habit → check-ins. */
export function checkInsFromLogs(
  logs: readonly Data[],
  timeZone: string,
  dateField = 'date'
): LegacyCheckIn[] {
  const out: LegacyCheckIn[] = [];
  for (const l of logs) {
    const date = toDay(l[dateField], timeZone);
    if (!date) continue;
    const completed = l.completed !== false;
    const note = str(l.notes);
    out.push({ date, status: completed ? 'done' : 'missed', ...(note ? { note } : {}) });
  }
  return out;
}
