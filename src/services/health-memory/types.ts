/**
 * Health memory: what the user has told Ferni about their health, and a mood
 * timeline per conversation. Stored only when the user has switched the
 * Health category on (services/memory-consent).
 *
 *   bogle_users/{uid}/health_memory/{healthId}
 *   bogle_users/{uid}/mood_timeline/{conversationId}
 *   bogle_users/{uid}/memory_tombstones/{healthId}   (kind: 'health')
 *
 * @module services/health-memory/types
 */

export const USERS_COLLECTION = 'bogle_users';
export const HEALTH_COLLECTION = 'health_memory';
export const MOOD_COLLECTION = 'mood_timeline';
export const TOMBSTONE_COLLECTION = 'memory_tombstones';

export const HEALTH_KINDS = [
  'condition',
  'medication',
  'injury',
  'appointment',
  'symptom',
  'sleep',
  'exercise',
  'energy',
] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

/**
 * Kinds that describe a moment (one item per day) rather than something
 * ongoing (one item per subject).
 */
export const EPISODIC_KINDS: ReadonlySet<HealthKind> = new Set([
  'symptom',
  'sleep',
  'exercise',
  'energy',
]);

export type HealthStatus = 'current' | 'past' | 'upcoming';
/** user = typed on the page; explicit = the user said it; tool = a logging tool; inferred = from extracted facts. */
export type HealthSource = 'user' | 'explicit' | 'tool' | 'inferred';
export type HealthTombstoneReason =
  | 'user_deleted'
  | 'voice_forget'
  | 'conversation_deleted'
  | 'fact_deleted';

export interface HealthItem {
  readonly id: string;
  readonly kind: HealthKind;
  /** Normalised subject: "migraines", "metformin", "sleep", "knee". */
  readonly subject: string;
  /** Human-readable: "Gets migraines", "Takes metformin 500mg". */
  readonly text: string;
  readonly status: HealthStatus;
  /** For appointments: when it is, as said ("next Tuesday", "2026-10-14"). */
  readonly when?: string;
  /** Day (YYYY-MM-DD) this is about, for episodic kinds. */
  readonly day?: string;
  readonly confidence: number;
  readonly source: HealthSource;
  readonly sourceConversationIds: readonly string[];
  readonly sourceFactIds: readonly string[];
  readonly mentions: number;
  readonly userEdited: boolean;
  readonly firstMentionedAt: string;
  readonly lastMentionedAt: string;
  readonly updatedAt: string;
  readonly editedAt?: string;
}

export interface HealthInput {
  readonly kind: HealthKind;
  readonly subject: string;
  readonly text: string;
  readonly status?: HealthStatus;
  readonly when?: string;
  readonly confidence: number;
  readonly source: HealthSource;
  readonly conversationId?: string;
  readonly factId?: string;
  /** When it was said (defaults to now); sets `day` for episodic kinds. */
  readonly at?: Date;
}

export type HealthUpsertOutcome =
  | 'created'
  | 'updated'
  | 'provenance_only'
  | 'tombstoned'
  | 'not_consented'
  | 'invalid'
  | 'failed';

/** One reading of how the user seemed at a moment in a conversation. */
export interface MoodSample {
  readonly at: string;
  readonly mood: string;
  /** -1 (heavy) … 1 (light). */
  readonly valence: number;
  readonly intensity: number;
}

export type MoodArc = 'lifting' | 'steady' | 'heavier' | 'mixed';

export interface MoodConversation {
  readonly id: string;
  readonly conversationIds: readonly string[];
  readonly personaId?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly samples: readonly MoodSample[];
  readonly dominantMood: string;
  readonly averageValence: number;
  readonly arc: MoodArc;
  readonly updatedAt: string;
}
