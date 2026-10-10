/**
 * Per-turn memory recall for the live agent.
 *
 * Loads the caller's memory when the call starts (see memory/recall/
 * session-recall.ts). When the user's words are transcribed, what is relevant
 * is added to the agent's chat context straight away, in the same tick as the
 * transcript event.
 *
 * Timing matters: on a preflight or final transcript the SDK emits
 * user_input_transcribed and then starts preemptive generation from a copy of
 * the agent's context. (With Ink's STT turn detection it is the preflight,
 * emitted as an interim, that starts it: 160ms before the final on 2026-09-27.)
 * If the memory were added later (in onUserTurnCompleted), the context would
 * no longer match and the SDK would discard the preemptive reply and start
 * over (observed 2026-09-27: "chat context or tools have changed after
 * onUserTurnCompleted"). Agent.updateChatCtx sets the context synchronously
 * before its first await, so calling it from the listener lands first.
 *
 * Follow-ups from recent sessions are offered once, with the first recall.
 *
 * @module agents/multi-agent/memory-recall-hook
 */

import {
  factId,
  formatRecall,
  loadRecallSnapshot,
  MAX_FOLLOW_UPS,
  recallForTurn,
  type RecallFact,
  type RecallSnapshot,
  type RecallStore,
} from '../../memory/recall/session-recall.js';
import {
  createSemanticIndex,
  estimateTokens,
  RECALL_TOKENS_PER_TURN,
  semanticRecallEnabled,
  withinTokens,
  type RetrievalEmbedder,
  type SemanticIndex,
} from '../../memory/recall/semantic-recall.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  formatLedger,
  loadLedger,
  RECALL_LIMIT,
  type LedgerFact,
  type LedgerStore,
} from '../personas/life-ledger.js';
import {
  formatLifeUpdates,
  loadLifeUpdates,
  type LifeUpdateDeps,
} from '../personas/life-updates.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  formatWorldNote,
  isWorldModelSnapshotOn,
  touchesAvoided,
  withoutWorldDuplicates,
} from '../../intelligence/world-model/recall-note.js';
import { buildWorldModelSnapshot } from '../../intelligence/world-model/snapshot.js';
import type { WorldModelSnapshot } from '../../intelligence/world-model/types.js';

const log = createLogger({ module: 'MemoryRecall' });

export function memoryRecallMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.MEMORY_RECALL !== 'off';
}

/** Reads the collections the live pipeline writes. Plain queries: no composite index needed. */
export const firestoreRecallStore: RecallStore = {
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    // Newest first: an unordered limit loaded an arbitrary 300 of a user's
    // facts (2,024 for one test user). Facts without a date fall back to it.
    const newest = await facts.orderBy('extractedAt', 'desc').limit(300).get();
    const snap = newest.docs.length > 0 ? newest : await facts.limit(300).get();
    return snap.docs.map((d) => d.data());
  },
  async summaries(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    return snap.docs.map((d) => d.data());
  },
};

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  store?: RecallStore;
  /** What Ferni told this caller about himself on earlier calls (life-ledger.ts). */
  ledgerStore?: LedgerStore;
  /** What has happened in his life since (life-updates.ts, LIFE_MOVES_ON). */
  lifeUpdates?: LifeUpdateDeps;
  /** Who is in their life, goals, what to avoid (WORLD_MODEL_SNAPSHOT=on). */
  loadWorldModel?: (userId: string) => Promise<WorldModelSnapshot>;
  env?: Record<string, string | undefined>;
  /** SEMANTIC_RECALL=on; read from the environment when not given. */
  semantic?: boolean;
  embed?: RetrievalEmbedder;
}

export interface MemoryRecall {
  /** Resolves once the snapshot is loaded (for tests and startup logging). */
  ready: Promise<void>;
  /** The recall note for this transcript, or null. Synchronous: never waits on the store. */
  noteFor(transcript: string): string | null;
  /** The agent started replying: the next transcript belongs to a new user turn. */
  newTurn(): void;
}

/**
 * Facts recalled per user turn. Interim transcripts arrive many times a turn;
 * without a turn budget each one pulled in 4 more facts about the same thing
 * (15 notes, ~45 facts for one sentence on 2026-09-27).
 */
const FACTS_PER_TURN = 4;
/** One person or thing can't take the whole turn ("sister" brought 4 pregnancy rows, 2026-10-04). */
const FACTS_PER_ENTITY = 2;
/** With semantic recall: open threads and Ferni's own stories kept for later in the call. */
const FOLLOW_UPS_KEPT = 12;
const TOLD_KEPT = 40;

/** A fact as one line to embed: "Biscuit breed: golden retriever". */
function factText(f: RecallFact, userName?: string): string {
  const subject = /^(speaker|user|me)$/i.test(f.entity) ? userName || 'they' : f.entity;
  return `${subject} ${f.key.replace(/_/g, ' ')}: ${f.value}`;
}

export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecall {
  const started = Date.now();
  let snapshot: RecallSnapshot | undefined;
  const surfaced = new Set<string>();
  let followUpsOffered = false;
  let factsThisTurn = 0;
  let tokensLeft = RECALL_TOKENS_PER_TURN;
  const entitiesThisTurn = new Map<string, number>();

  let ledgerNote: string | null = null;
  let sinceNote: string | null = null;
  const semanticOn = deps.semantic ?? semanticRecallEnabled();
  let index: SemanticIndex | undefined;
  // Semantic recall only: threads and stories past the first note, by id.
  const laterFollowUps = new Map<string, string>();
  const laterTold = new Map<string, LedgerFact>();
  const ledger = loadLedger(
    deps.userId,
    'ferni',
    deps.ledgerStore,
    semanticOn ? TOLD_KEPT : RECALL_LIMIT
  );
  const loaded = Promise.all([
    loadRecallSnapshot(
      deps.store ?? firestoreRecallStore,
      deps.userId,
      semanticOn ? FOLLOW_UPS_KEPT : MAX_FOLLOW_UPS
    ),
    ledger,
  ]).then(([s, told]) => {
    snapshot = { ...s, followUps: s.followUps.slice(0, MAX_FOLLOW_UPS) };
    ledgerNote = formatLedger(told.slice(0, RECALL_LIMIT), deps.userName);
    log.info(
      {
        facts: s.facts.length,
        followUps: s.followUps.length,
        told: told.length,
        ms: Date.now() - started,
      },
      'Recall snapshot loaded'
    );
    if (!semanticOn) return;
    for (const t of s.followUps.slice(MAX_FOLLOW_UPS)) laterFollowUps.set(`thread:${t}`, t);
    for (const f of told.slice(RECALL_LIMIT)) laterTold.set(`told:${f.fact}`, f);
    const items = [
      ...s.facts.map((f) => ({ id: factId(f), text: factText(f, deps.userName) })),
      ...[...laterFollowUps].map(([id, text]) => ({ id, text })),
      ...[...laterTold].map(([id, f]) => ({ id, text: f.fact })),
    ];
    // The snapshot is usable at once; the index joins when it is embedded.
    const idx = (index = createSemanticIndex(items, deps.embed));
    void idx.ready.then(() =>
      log.info({ items: items.length, ms: Date.now() - started }, 'Recall index ready')
    );
  });
  // Written by a model, so it never holds up the snapshot; it joins the first
  // note only if it is ready by then. Never rejects.
  const since = ledger
    .then((told) =>
      loadLifeUpdates(deps.userId, told.slice(0, RECALL_LIMIT), 'ferni', deps.lifeUpdates)
    )
    .then((updates) => {
      sinceNote = formatLifeUpdates(updates);
    });
  // The world model is the single source for people, goals and what to avoid:
  // its note comes once, and recall then leaves out facts it already covers.
  let world: { snapshot: WorldModelSnapshot; note: string; counts: object } | null = null;
  let worldOffered = false;
  let pool: RecallSnapshot | undefined;
  const worldLoaded = isWorldModelSnapshotOn(deps.env)
    ? (deps.loadWorldModel ?? ((userId: string) => buildWorldModelSnapshot({ userId })))(
        deps.userId
      )
        .then((snap) => {
          const formatted = formatWorldNote(snap);
          if (formatted) world = { snapshot: snap, ...formatted };
          else log.info({ userId: deps.userId }, 'WORLD_MODEL_EMPTY');
        })
        .catch((error: unknown) => {
          log.warn({ error: String(error) }, 'World model not loaded');
        })
    : Promise.resolve();
  const ready = Promise.all([loaded, since, worldLoaded]).then(() => undefined);

  return {
    ready,
    noteFor(transcript) {
      const text = transcript.trim();
      if (!snapshot || !text) return null;
      if (world && !pool) {
        pool = { ...snapshot, facts: withoutWorldDuplicates(snapshot.facts, world.snapshot) };
      }
      index?.observe(text);
      const semantic = index?.matches() ?? new Map<string, number>();
      const blend = index ? { semantic, now: Date.now() } : undefined;
      const budget = FACTS_PER_TURN - factsThisTurn;
      const ranked =
        budget > 0
          ? recallForTurn(
              pool ?? snapshot,
              text,
              surfaced,
              budget,
              FACTS_PER_ENTITY,
              entitiesThisTurn,
              blend
            )
          : [];
      const worldNote = world && !worldOffered ? world.note : null;
      // Older threads and stories come back only when the turn is about them.
      const later = [...semantic.keys()].filter(
        (id) => !surfaced.has(id) && (laterFollowUps.has(id) || laterTold.has(id))
      );
      // Semantic recall finds more, so it also keeps each turn's recall small.
      const laterText = (id: string) => laterFollowUps.get(id) ?? laterTold.get(id)?.fact ?? '';
      const facts = blend ? withinTokens(ranked, (f) => factText(f), tokensLeft) : ranked;
      const factTokens = estimateTokens(facts.map((f) => factText(f)));
      const extras = blend ? withinTokens(later, laterText, tokensLeft - factTokens) : later;
      const extraTold = extras.flatMap((id) => laterTold.get(id) ?? []);
      // Nothing about a topic they asked to avoid comes back as a thread either.
      const followUps = [
        ...(followUpsOffered ? [] : snapshot.followUps),
        ...extras.flatMap((id) => laterFollowUps.get(id) ?? []),
      ].filter((item) => !world || !touchesAvoided(item, world.snapshot));
      // The ledger, like the follow-ups, comes once, with the first note.
      const told = followUpsOffered
        ? null
        : [ledgerNote, sinceNote].filter(Boolean).join('\n') || null;
      const note =
        [
          worldNote,
          formatRecall(facts, followUps, deps.userName),
          told,
          extraTold.length > 0 ? formatLedger(extraTold, deps.userName) : null,
        ]
          .filter(Boolean)
          .join('\n\n') || null;
      if (!note) return null;
      followUpsOffered = true;
      if (world && worldNote) {
        worldOffered = true;
        log.info({ ...world.counts, chars: worldNote.length }, 'WORLD_MODEL_INJECTED');
      }
      tokensLeft -= factTokens + estimateTokens(extras.map(laterText));
      for (const id of extras) surfaced.add(id);
      factsThisTurn += facts.length;
      for (const f of facts) {
        surfaced.add(factId(f));
        const key = f.entity.toLowerCase();
        entitiesThisTurn.set(key, (entitiesThisTurn.get(key) ?? 0) + 1);
      }
      log.info(
        {
          facts: facts.length,
          followUps: followUps.length,
          semantic: semantic.size,
          extras: extras.length,
        },
        'Recall added'
      );
      return note;
    },
    newTurn() {
      factsThisTurn = 0;
      tokensLeft = RECALL_TOKENS_PER_TURN;
      entitiesThisTurn.clear();
      index?.newTurn();
    },
  };
}

/** The slice of the SDK Agent this needs. */
export interface RecallAgent {
  readonly chatCtx: {
    copy(): { addMessage(msg: { role: 'system'; content: string }): unknown };
  };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/**
 * Add a recall note to the agent's context now. updateChatCtx assigns the
 * context before its first await, so the note is in place for the preemptive
 * generation the SDK starts right after the transcript event.
 */
export function addRecallNote(agent: RecallAgent, note: string): void {
  const ctx = agent.chatCtx.copy();
  ctx.addMessage({ role: 'system', content: note });
  agent.updateChatCtx(ctx).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Recall note not added');
  });
}
