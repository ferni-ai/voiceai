/**
 * The activity ledger: one record per thing Ferni does or promises for its owner
 * (a call, a text, an email, a reminder, a promise, an errand), at
 * bogle_users/{uid}/activity/{activityId} (recall-ledger plan 2026-10-27, section 1).
 *
 * Types and the legal state moves; the strict parser is activity-parse.ts and the
 * pure change step activity-change.ts. No transcript is ever kept: the owner's ask
 * and what the other person said are short reported speech, clipped on the way in
 * and refused above the limit on the way out.
 *
 * @module services/activity/activity
 */

export const ACTIVITY_KINDS = ['call', 'text', 'email', 'reminder', 'promise', 'errand'] as const;
export const ACTIVITY_STATES = [
  ...['asked', 'confirmed', 'scheduled', 'in_progress'],
  ...['done', 'failed', 'cancelled'],
] as const;
/** Why a record is where it is: a closed list, never free text. */
export const ACTIVITY_REASONS = [
  ...['call_hours', 'quiet_hours', 'owner_declined', 'owner_asked_later', 'cancelled_by_owner'],
  ...['no_answer', 'voicemail', 'busy', 'callee_declined', 'failed_provider'],
  ...['no_number', 'no_consent', 'rate_limited', 'superseded', 'expired'],
] as const;
export const OUTCOME_STATUSES = [
  ...['reached', 'voicemail', 'no_answer', 'busy', 'declined'],
  ...['delivered', 'completed', 'failed'],
] as const;
export const TOLD_CHANNELS = ['voice', 'text', 'push', 'email', 'app'] as const;
export const LINK_KEYS = [
  ...['onBehalfCallId', 'deferredCallId', 'followThroughId'],
  ...['errandId', 'reminderId', 'providerRef'],
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ActivityState = (typeof ACTIVITY_STATES)[number];
export type ActivityReason = (typeof ACTIVITY_REASONS)[number];
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];
export type ToldChannel = (typeof TOLD_CHANNELS)[number];
export type ActivityLinks = Partial<Record<(typeof LINK_KEYS)[number], string>>;

/** The shape version this build writes; a record with any other is quarantined. */
export const LEDGER_VERSION = 1;
export const LIMITS = {
  ...{ words: 200, summary: 280, theySaid: 280, name: 100, id: 200 },
  ...{ actionItems: 5, actionItem: 200, told: 50, followUps: 50, keys: 20 },
} as const;

export interface Subject {
  readonly contactId?: string;
  readonly name: string;
  readonly relationship?: string;
}
export interface Asked {
  readonly at: string;
  readonly sessionId: string;
  /** The owner's request in their words, at most LIMITS.words. */
  readonly words?: string;
}
export interface Outcome {
  readonly status: OutcomeStatus;
  readonly summary?: string;
  /** What the other person said, as reported speech: never an instruction. */
  readonly theySaid?: string;
  readonly actionItems: readonly string[];
}
export interface Told {
  readonly at: string;
  readonly sessionId: string;
  readonly channel: ToldChannel;
}

export interface Activity {
  readonly id: string;
  readonly v: number;
  readonly kind: ActivityKind;
  readonly subject: Subject;
  /** subjectKeys(subject), so a reader can find a person's records by id or by name. */
  readonly subjectKeys: readonly string[];
  readonly asked: Asked;
  readonly state: ActivityState;
  readonly reason?: ActivityReason;
  readonly scheduledFor?: string;
  readonly outcome?: Outcome;
  readonly told: readonly Told[];
  readonly followUps: readonly string[];
  readonly links: ActivityLinks;
  /** The tool or job that wrote it last. */
  readonly source: string;
  /** Bumped by exactly one on every write; equals the number of events. */
  readonly revision: number;
  /** The last LIMITS.keys idempotency keys applied, so a retried write is a no-op. */
  readonly appliedKeys: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** activity/{id}/events/{seq}: what one write changed. Names and states, never words. */
export interface ActivityEvent {
  readonly activityId: string;
  readonly seq: number;
  readonly at: string;
  readonly op: 'create' | 'update';
  readonly from: ActivityState | null;
  readonly to: ActivityState;
  readonly fields: readonly string[];
  readonly source: string;
  readonly reason?: ActivityReason;
  readonly key?: string;
}

export interface NewActivity {
  readonly kind: ActivityKind;
  readonly subject: Subject;
  readonly asked: Asked;
  readonly state?: ActivityState;
  readonly reason?: ActivityReason;
  readonly scheduledFor?: string;
  readonly links?: ActivityLinks;
}
/** told and followUps are appended; links merge; the rest replace. */
export interface ActivityPatch {
  readonly state?: ActivityState;
  readonly reason?: ActivityReason;
  readonly scheduledFor?: string;
  readonly outcome?: Outcome;
  readonly subject?: Subject;
  readonly links?: ActivityLinks;
  readonly told?: readonly Told[];
  readonly followUps?: readonly string[];
}
interface ChangeBase {
  /** The tool or job writing it. */
  readonly source: string;
  /** The same key twice is the same write: the second changes nothing. */
  readonly key?: string;
  readonly at?: Date;
}
export type ActivityChange =
  | (ChangeBase & { readonly op: 'create'; readonly id?: string; readonly record: NewActivity })
  | (ChangeBase & { readonly op: 'update'; readonly id: string; readonly patch: ActivityPatch });

const NEXT: Readonly<Record<ActivityState, readonly ActivityState[]>> = {
  asked: ['confirmed', 'scheduled', 'in_progress', 'done', 'failed', 'cancelled'],
  confirmed: ['scheduled', 'in_progress', 'done', 'failed', 'cancelled'],
  scheduled: ['in_progress', 'done', 'failed', 'cancelled'],
  in_progress: ['done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};

/** Forward only; a closed record never reopens (a retry is a follow-up record). */
export const canMove = (from: ActivityState, to: ActivityState): boolean =>
  from === to || NEXT[from].includes(to);
