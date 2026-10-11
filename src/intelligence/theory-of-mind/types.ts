/**
 * What Ferni understands about a person, as opposed to facts about their life:
 * what they have already told Ferni, how they tend to feel and cope, what they
 * care about, how they like to be supported, and what to go gently around.
 *
 * Every pattern is a tentative reading held with evidence. It needs two or
 * more moments before Ferni acts on it, and it loses confidence when a later
 * call contradicts it. Nothing here is a label or a diagnosis, and no raw
 * transcript is stored: moments are short paraphrases.
 *
 * Stored at bogle_users/{userId}/mind_model/current, so account erasure
 * (services/platform/erase-user-record.ts) removes it with the rest.
 *
 * @module intelligence/theory-of-mind/types
 */

/** coping: how they handle stress. feeling: how they tend to feel about something. support: what helps them. care: what matters to them. */
export type PatternKind = 'coping' | 'feeling' | 'support' | 'care';

export const PATTERN_KINDS: readonly PatternKind[] = ['coping', 'feeling', 'support', 'care'];

/** One moment that supports a pattern: a paraphrase, never a quote. */
export interface Moment {
  sessionId: string;
  at: string;
  cue: string;
}

export interface Pattern {
  /** Stable kebab-case id, so later calls add to the same pattern. */
  key: string;
  kind: PatternKind;
  /** Plain words, e.g. "jokes when anxious, then wants practical help". */
  statement: string;
  moments: Moment[];
  /** Times a later call showed the opposite. */
  contradictions: number;
  confidence: number;
  lastSeen: string;
}

/** A topic or fact they have already shared, so Ferni never asks as if it were new. */
export interface ToldItem {
  topic: string;
  at: string;
}

/** How they are right now; expires. */
export interface CurrentContext {
  state: string;
  at: string;
  until: string;
}

export interface Sensitivity {
  topic: string;
  /** How to handle it, e.g. "doesn't want to talk about it". */
  how: string;
  at: string;
}

export interface MindModel {
  userId: string;
  version: 1;
  calls: number;
  toldFerni: ToldItem[];
  patterns: Pattern[];
  current?: CurrentContext;
  sensitivities: Sensitivity[];
  updatedAt: string;
}

/** What one call adds, as read from its transcript and summary. */
export interface CallReading {
  told: string[];
  observations: Array<{ key: string; kind: PatternKind; statement: string; cue: string }>;
  /** Keys of existing patterns this call clearly went against. */
  contradicted: string[];
  current?: { state: string; days: number };
  sensitivities: Array<{ topic: string; how: string }>;
}

export function emptyMindModel(userId: string, now: Date): MindModel {
  return {
    userId,
    version: 1,
    calls: 0,
    toldFerni: [],
    patterns: [],
    sensitivities: [],
    updatedAt: now.toISOString(),
  };
}
