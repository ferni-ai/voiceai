/**
 * The between-calls mind: one canonical model of each caller's world, built after
 * calls and nightly, read once at call start (design: between-calls mind,
 * 2026-10-25, section 1).
 *
 * Three layers under bogle_users/{uid}/: claims (world_facts, unchanged), entities
 * (world_entities, below) and threads (follow_through, extended below), plus the
 * brief the call reads (mind/brief) and the job's own record (mind/state).
 *
 * MIND_BUILD (off) gates the build. Nothing writes or reads these docs yet: this
 * file is types only, and intelligence/mind/entity-resolve.ts is the first pure
 * step (names from many stores into one entity each).
 *
 * @module intelligence/mind/types
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { FollowUp } from '../../services/follow-through/index.js';
import type { PersonModel } from '../person-model/types.js';

export function isMindBuildOn(env: Env = process.env): boolean {
  return flagOn('MIND_BUILD', env);
}

export const MIND_VERSION = 1;

type Valence = NonNullable<NonNullable<FollowUp['asks']>[number]['valence']>;

// ─── Entities: world_entities/{entityId} ────────────────────────────────────

export type EntityKind = 'person' | 'place' | 'org' | 'pet' | 'self';

/** How an alias joined: a relation word ("mom"), a heard variant, a nickname, another store's copy. */
export type AliasKind = 'relation-word' | 'stt-variant' | 'nickname' | 'store-dup';

export interface EntityAlias {
  /** Normalized form (entity-resolve.ts normalizeName). */
  readonly norm: string;
  readonly kind: AliasKind;
  /** The first claim that used it, when one did. */
  readonly firstFactId: string | null;
}

/** The caller's own words for who this is to them, and the claim they came from. */
export interface EntityRelation {
  /** As said: "mum", "my older sister". */
  readonly text: string;
  /** Relation-lexicon key: "mother", "sister". */
  readonly key: string;
  readonly factId: string | null;
}

/** One reversible step: what was folded into this entity and by which rule. */
export interface MergeLogEntry {
  readonly rule: 'same-name' | 'relation-word' | 'self-token' | 'store-dup' | 'proposal-accepted';
  /** The normalized name (or token) that was folded in. */
  readonly from: string;
  /** Raw records it covered. */
  readonly records: number;
  readonly stores: readonly string[];
  readonly factIds: readonly string[];
  readonly by: 'code' | 'llm';
}

export interface EntityCurrent {
  /** One line: what's going on with them. */
  readonly text: string;
  readonly factIds: readonly string[];
}

export interface WorldEntity {
  /** Stable: the same inputs always give the same id ("self" for the caller). */
  readonly id: string;
  readonly kind: EntityKind;
  readonly canonicalName: string;
  readonly aliases: readonly EntityAlias[];
  readonly relation: EntityRelation | null;
  /** Tombstone: this id was merged into another; old ids still resolve. */
  readonly mergedInto: string | null;
  readonly mergeLog: readonly MergeLogEntry[];
  readonly mentions90d: number;
  readonly lastMentionedAt: string | null;
  readonly sensitive: boolean;
  readonly forgottenAt: string | null;
  /** 0..1, halves every 30 days unmentioned (nightly pass). */
  readonly salience: number;
  /** At most 3. */
  readonly current: readonly EntityCurrent[];
}

/** Two entities code could not settle: Claude (nightly) confirms or rejects; never auto-merged. */
export interface MergeProposal {
  readonly a: string;
  readonly b: string;
  readonly reason: 'stt-variant' | 'relation-ambiguous';
  /** Human-readable evidence without caller words, e.g. "same first sound, edit distance 2". */
  readonly evidence: string;
}

// ─── Threads: follow_through/{id}, extended ─────────────────────────────────

/** Events, plans, worries and goals: upcoming → today → happened → outcome-known | dropped. */
export type EventStatus = 'upcoming' | 'today' | 'happened' | 'outcome-known' | 'dropped';
/** Caller commitments and Ferni's promises and errands. */
export type CommitmentStatus = 'open' | 'done' | 'slipped' | 'released';

export interface ThreadOutcome {
  readonly text: string;
  readonly valence: Valence | null;
  readonly factIds: readonly string[];
}

/**
 * A thread is a follow_through row with the mind's fields. Its id is
 * hash(sorted entityIds + attribute + eventDate), so asks survive a claim being
 * superseded. A caller's answer to Ferni's ask becomes the outcome, never a new event.
 */
export interface MindThread extends FollowUp {
  readonly entityIds: readonly string[];
  /** The claim attribute it is about ("event", "health", "job"). */
  readonly attribute: string;
  readonly eventStatus?: EventStatus;
  readonly commitmentStatus?: CommitmentStatus;
  readonly outcome?: ThreadOutcome;
  /** Times the caller brought it up unprompted. */
  readonly mentions: ReadonlyArray<{ readonly sessionId: string; readonly by: 'caller' | 'ferni' }>;
  readonly factIds: readonly string[];
}

// ─── The brief: mind/brief ──────────────────────────────────────────────────

export type BriefSection =
  'who' | 'people' | 'threads' | 'worth-raising' | 'dont-raise' | 'promises' | 'tone' | 'since';

export interface BriefItem {
  readonly section: BriefSection;
  /** Lower ranks first within a section. */
  readonly rank: number;
  /** A paraphrase: caller words stay in world_facts. */
  readonly text: string;
  readonly factIds: readonly string[];
  readonly entityIds?: readonly string[];
  readonly threadId?: string;
  /** Worth raising: why now and how. */
  readonly why?: string;
  /** Below the 0.6 floor: shown as unsure, never raised. */
  readonly unsure?: boolean;
}

export interface DiscussedEntry {
  readonly lastAt: string;
  readonly by: 'ferni' | 'caller';
  readonly answer?: string;
}

export interface MindBrief {
  /** What the call reads, at most 6,000 characters. */
  readonly rendered: string;
  readonly items: readonly BriefItem[];
  /** topicKey → when it was last discussed, by whom, and the answer. */
  readonly discussed: Readonly<Record<string, DiscussedEntry>>;
  /** The last call folded in. */
  readonly throughSessionId: string | null;
  /** Behind the live forget counter: the reader drops the whole brief (fail closed). */
  readonly forgetGeneration: number;
  readonly builtAt: string;
  readonly v: number;
  /** Person-model sections (person-model/build.ts). */
  readonly profile?: PersonModel;
}

// ─── The job's own record: mind/state ───────────────────────────────────────

export interface MindDecision {
  readonly at: string;
  readonly kind: 'merge' | 'reject-merge' | 'contradiction' | 'outcome' | 'decay' | 'raise';
  readonly subject: string;
  readonly by: 'code' | 'llm';
  readonly factIds: readonly string[];
}

export interface MindState {
  /** Set by the after-call task; the consolidate job drains it. */
  readonly dirtySession: string | null;
  readonly cursor: { readonly throughSessionId: string | null; readonly builtAt: string | null };
  /** Build key part: same inputs, same build, no write. */
  readonly inputsHash: string | null;
  readonly decisions: readonly MindDecision[];
  readonly cost: {
    readonly model: string | null;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly usd: number;
  };
  /** LLM claims dropped for citing no input factIds. */
  readonly unsupported: number;
  readonly v: number;
}
