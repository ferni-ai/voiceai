/**
 * Aspirations: one model for the spectrum someday-dream → goal → habit.
 *
 * Stored at `bogle_users/{uid}/aspirations/{id}` where `id` is derived from
 * the level and the normalised title (identity.ts), so the same dream, goal
 * or habit learned twice lands on the same document. Levels link upwards
 * through `parentId` (habit → goal → dream). Deleted items leave a tombstone
 * in `memory_tombstones/{id}` (`kind: 'aspiration'`) so inferred capture
 * can't bring them back. Items are kept until the user deletes them.
 *
 * @module services/aspirations/types
 */

export type AspirationLevel = 'dream' | 'goal' | 'habit';
export type AspirationStatus = 'active' | 'paused' | 'achieved' | 'let-go' | 'dormant';
/** explicit = the user said it / set it up; inferred = read from a summary or turn. */
export type AspirationSource = 'explicit' | 'inferred';

export const ASPIRATION_LEVELS: readonly AspirationLevel[] = ['dream', 'goal', 'habit'];
export const ASPIRATION_STATUSES: readonly AspirationStatus[] = [
  'active',
  'paused',
  'achieved',
  'let-go',
  'dormant',
];

/** A parent must sit higher on the spectrum than its child. */
export const LEVEL_RANK: Readonly<Record<AspirationLevel, number>> = {
  habit: 0,
  goal: 1,
  dream: 2,
};

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  doneAt?: string;
  /** YYYY-MM-DD */
  targetDate?: string;
}

export type CheckInStatus = 'done' | 'missed';

export interface CheckIn {
  /** The user's local calendar day, YYYY-MM-DD. */
  date: string;
  status: CheckInStatus;
  note?: string;
  /** ISO instant it was recorded. */
  recordedAt: string;
  conversationId?: string;
}

export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
export const HABIT_FREQUENCIES: readonly HabitFrequency[] = [
  'daily',
  'weekdays',
  'weekends',
  'weekly',
  'custom',
];

export interface HabitSchedule {
  frequency: HabitFrequency;
  /** Weekdays 0 (Sunday) – 6 for `custom` (and optionally `weekly`). */
  days?: number[];
  timesPerDay: number;
  /** 'HH:MM' local time for a nudge, when the user asked for one. */
  reminderTime?: string;
}

export interface HabitLoop {
  cue?: string;
  routine?: string;
  reward?: string;
}

export interface HabitDetails {
  schedule: HabitSchedule;
  /** Tiny Habits glidepath, 1 (tiny) – 5 (full lifestyle). */
  glidepathLevel?: number;
  loop?: HabitLoop;
  /** "After [anchor], I will [habit]". */
  stackAnchor?: string;
  streak: number;
  longestStreak: number;
  /** Newest last, one per local day, bounded (MAX_CHECK_INS). */
  checkIns: CheckIn[];
  /** ISO instant of the next check-in nudge (habit-reminder rule), null when none. */
  nextNudgeAt?: string | null;
}

export const MAX_CHECK_INS = 400;
export const MAX_TITLE = 160;
export const MAX_WHY = 600;
export const MAX_NOTE = 280;

export interface AspirationRecord {
  id: string;
  level: AspirationLevel;
  title: string;
  /** Why it matters / what it means to them. */
  why?: string;
  status: AspirationStatus;
  /** habit → goal → dream link. */
  parentId: string | null;
  category?: string;
  milestones: Milestone[];
  /** YYYY-MM-DD */
  targetDate?: string;
  /** 0-100, for goals. */
  progress?: number;
  notes: string[];
  habit?: HabitDetails;

  source: AspirationSource;
  confidence: number;
  /** How many separate times we've heard it (drives the inferred threshold). */
  evidenceCount: number;
  sourceConversationIds: string[];
  userEdited: boolean;
  editedAt?: string;
  personaId?: string;
  /** Ids the item had in older stores (dreams, habits, goals), for resolution. */
  legacyIds: string[];
  /** Important-date id of the goal's deadline, when one was scheduled. */
  deadlineDateId?: string;

  createdAt: string;
  updatedAt: string;
  lastMentionedAt: string;
  statusChangedAt?: string;
  lastResurfacedAt?: string;
}

/** Input to upsertAspiration (capture, tools and migration code against this). */
export interface AspirationInput {
  level: AspirationLevel;
  title: string;
  why?: string;
  status?: AspirationStatus;
  parentId?: string | null;
  category?: string;
  targetDate?: string;
  progress?: number;
  milestones?: string[];
  note?: string;
  habit?: Partial<Omit<HabitDetails, 'streak' | 'longestStreak' | 'checkIns' | 'schedule'>> & {
    schedule?: Partial<HabitSchedule>;
  };
  source: AspirationSource;
  confidence: number;
  sourceConversationIds?: string[];
  personaId?: string;
  legacyId?: string;
  /** Migration only: keep the original creation time. */
  createdAt?: string;
}

/** Fields the user can change from the web page. */
export interface AspirationPatch {
  title?: string;
  why?: string | null;
  status?: AspirationStatus;
  parentId?: string | null;
  category?: string | null;
  targetDate?: string | null;
  progress?: number | null;
  milestones?: Array<{ id?: string; title: string; done?: boolean; targetDate?: string }>;
  schedule?: Partial<HabitSchedule>;
  glidepathLevel?: number | null;
  loop?: HabitLoop | null;
  stackAnchor?: string | null;
}

export interface CheckInInput {
  status: CheckInStatus;
  /** YYYY-MM-DD local day; defaults to the user's today. */
  date?: string;
  note?: string;
  conversationId?: string;
}

export type UpsertStatus = 'created' | 'updated' | 'provenance_merged' | 'skipped_tombstoned';

export interface UpsertOutcome {
  id: string;
  status: UpsertStatus;
  record?: AspirationRecord;
}

export type AspirationErrorCode = 'invalid_input' | 'not_found' | 'storage_unavailable';

export class AspirationError extends Error {
  constructor(
    readonly code: AspirationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AspirationError';
  }
}

/** Inferred items become commitments only with repeated or strong evidence. */
export const INFERRED_MIN_EVIDENCE = 2;
export const INFERRED_MIN_CONFIDENCE = 0.7;
export const INFERRED_STRONG_CONFIDENCE = 0.9;

/** Whether Ferni should treat the item as something the user is committed to. */
export function isConfirmed(
  r: Pick<AspirationRecord, 'source' | 'userEdited' | 'evidenceCount' | 'confidence'>
): boolean {
  if (r.source === 'explicit' || r.userEdited) return true;
  if (r.confidence >= INFERRED_STRONG_CONFIDENCE) return true;
  return r.evidenceCount >= INFERRED_MIN_EVIDENCE && r.confidence >= INFERRED_MIN_CONFIDENCE;
}
