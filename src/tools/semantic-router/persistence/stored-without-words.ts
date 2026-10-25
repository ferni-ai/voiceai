/**
 * What the router's stores write, without the caller's words (Seth, 2026-10-24: stop
 * storing words, purge). Each builder copies named fields only, so a field a caller adds
 * (the input, its args, what a tool heard) is never written; the input is kept as its
 * length, and a learned phrase as a hash of the utterance. Each document expires 30 days
 * after its own time: Firestore TTL policies on `expireAt` delete it. Old documents are
 * stripped by scripts/migrations/strip-router-store-words.ts.
 *
 * @module semantic-router/persistence/stored-without-words
 */

import { createHash } from 'node:crypto';
import type { PersistedCorrection } from './firestore-persistence.js';
import type { RoutingEvent as BanditEvent } from '../advanced/intelligent/bandit-persistence.js';
import type {
  RoutingFeedback,
  UserCorrection,
  UserVocabulary,
} from '../advanced/feedback-store.js';

/** How long a stored routing event, correction, feedback or vocabulary is kept */
export const ROUTING_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Data = Record<string, unknown>;
/** The writer's Firestore cleaner (cleanForFirestore: drops undefined, Dates to strings) */
export type Clean = <T>(value: T) => T;

/** `at` + 30 d, as a Date: stored as the Timestamp a TTL policy reads */
export const expiry = (at: Date): Date => new Date(at.getTime() + ROUTING_EVENT_RETENTION_MS);

export function pick<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[]
): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, value[k]])) as Pick<T, K>;
}

/** Cleaned, then expireAt, which stays a Date */
const withExpiry = (data: Data, at: Date, clean: Clean): Data => ({
  ...clean(data),
  expireAt: expiry(at),
});

/**
 * The key a learned phrase is kept under: the utterance, lower-cased with its punctuation
 * and spacing evened out, hashed with the person's id, so the same words said again match
 * and the store holds none of them.
 */
export function phraseHash(userId: string, utterance: string): string {
  const normalized = utterance
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return createHash('sha256').update(`${userId}\n${normalized}`).digest('hex');
}

/** semantic_router_corrections: which tool was picked and which was wanted */
export const CORRECTION_FIELDS = [
  'id',
  'userId',
  'sessionId',
  'queryLength',
  'predictedTool',
  'predictedConfidence',
  'actualTool',
  'correctionSource',
  'personaId',
  'feedbackType',
] as const satisfies ReadonlyArray<keyof PersistedCorrection>;

export const storedCorrection = (c: PersistedCorrection, clean: Clean): Data =>
  withExpiry(
    { ...pick(c, CORRECTION_FIELDS), timestamp: c.timestamp, _createdAt: new Date() },
    c.timestamp,
    clean
  );

/** routing_events (the bandit's): the decision and its reward */
export function storedBanditEvent(e: BanditEvent, clean: Clean): Data {
  const at = e.timestamp || new Date();
  // prettier-ignore
  const fields = ['userId', 'sessionId', 'personaId', 'inputLength', 'selectedTool', 'confidence', 'decidedBy', 'success', 'reward'] as const;
  return withExpiry({ ...pick(e, fields), timestamp: at }, at, clean);
}

/** semantic_routing_feedback */
export const storedFeedback = (f: RoutingFeedback, clean: Clean): Data =>
  withExpiry(
    {
      ...pick(f, ['id', 'userId', 'sessionId', 'personaId', 'inputLocale']),
      timestamp: f.timestamp.toISOString(),
      inputLength: f.inputText.length,
      routingResult: pick(f.routingResult, [
        'predictedTool',
        'confidence',
        'action',
        'alternativeTools',
      ]),
      outcome: pick(f.outcome, ['actualToolUsed', 'userCorrection', 'success', 'userSatisfaction']),
      context: pick(f.context, ['conversationLength', 'recentTools', 'timeOfDay']),
    },
    f.timestamp,
    clean
  );

/** semantic_routing_corrections/{uid}/corrections */
export const storedUserCorrection = (c: UserCorrection, clean: Clean): Data =>
  withExpiry(
    {
      ...pick(c, [
        'id',
        'userId',
        'predictedTool',
        'predictedConfidence',
        'correctTool',
        'signalStrength',
      ]),
      timestamp: c.timestamp.toISOString(),
      inputLength: c.inputText.length,
    },
    c.timestamp,
    clean
  );

/** semantic_routing_vocabulary/{uid}: learned phrases by hash */
export const storedVocabulary = (v: UserVocabulary, clean: Clean): Data =>
  withExpiry(
    {
      ...pick(v, ['userId', 'toolPreferences', 'timePatterns']),
      updatedAt: v.updatedAt.toISOString(),
      phrases: v.phrases.map((p) => ({
        ...pick(p, ['phraseHash', 'toolId', 'confidence', 'usageCount', 'source']),
        lastUsed: p.lastUsed.toISOString(),
      })),
    },
    v.updatedAt,
    clean
  );
