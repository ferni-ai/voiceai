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
 * With RECALL_BRIDGE=on they wait for a turn they fit (threadsForTurn) instead,
 * and so does Ferni's own life unless they ask about him; each still comes once.
 *
 * @module agents/multi-agent/memory-recall-hook
 */

import {
  factId,
  formatRecall,
  loadRecallSnapshot,
  MAX_FOLLOW_UPS,
  recallBridgeEnabled,
  recallForTurn,
  threadsForTurn,
  type RecallFact,
  type RecallSnapshot,
} from '../../memory/recall/session-recall.js';
import {
  createStoredVectors,
  factItems,
  factText,
  recallVectorIndexEnabled,
  type VectorRecallStore,
} from '../../memory/recall/stored-fact-vectors.js';
import { jokesForTurn } from '../../memory/recall/inside-jokes-recall.js';
import {
  createSemanticIndex,
  estimateTokens,
  RECALL_TOKENS_PER_TURN,
  semanticRecallEnabled,
  withinTokens,
  type RetrievalEmbedder,
  type SemanticIndex,
} from '../../memory/recall/semantic-recall.js';
import { firestoreRecallStore } from './recall-firestore-store.js';
import {
  formatLedger,
  loadLedger,
  personaDisplayName,
  RECALL_LIMIT,
  type LedgerFact,
  type LedgerStore,
} from '../personas/life-ledger.js';
import { quietLedger } from '../personas/quiet-ledger.js';
import { loadCanon, selfRecallEnabled, selfRecallNote } from '../personas/self-recall.js';
import { datesRecallFor, type DatesRecall } from '../../intelligence/world-model/dates/recall.js';
import {
  formatLifeUpdates,
  loadLifeUpdates,
  type LifeUpdateDeps,
} from '../personas/life-updates.js';
import { commonGroundEnabled, formatCommonGround } from '../personas/common-ground.js';
import { firestoreGroundStore, type GroundStore } from '../personas/common-ground-after-call.js';
import { loadRepairRecall, type RepairStore } from '../personas/friend-repair.js';
import { growthRecallFor, withGrowth } from '../personas/persona-growth-recall.js';
import { checkInsWithCalls } from '../../services/outreach/call-status.js';
import {
  coachFollowThroughMode,
  formatCheckIn,
  type OpenCommitment,
} from '../../services/superhuman/commitment-follow-up.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createWorldRecall, type WorldRecallDeps } from './world-recall.js';
import { callLoopsRecallFor, type CallLoopsRecall } from './open-loops-recall.js';
import { predictionCheckInFor, type PredictionCheckIn } from './prediction-check-in.js';
import { OPENER_FOLLOW_UP_LINE, openerFollowUpEnabled } from '../../memory/recall/opener.js';
import { takeOpenerClaim } from '../../memory/recall/opener-claim.js';
import { followThroughOpenerFor, type FollowThroughOpener } from './follow-through-opener.js';
import {
  createEpisodeRecall,
  recallEpisodesEnabled,
  type EpisodeStore,
} from '../../memory/recall/episodes.js';
import { firestoreEpisodeStore } from '../../memory/storage/episode-store.js';
import { createSummaryRecall, summaryRecallEnabled } from '../../memory/recall/call-summaries.js';
import type { RecallPick } from '../personas/context-packet/turn-packet.js';

const log = createLogger({ module: 'MemoryRecall' });

export function memoryRecallMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.MEMORY_RECALL !== 'off';
}

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  /**
   * The persona speaking on this call (default 'ferni'). Its own told-life
   * facts and updates are loaded, never another persona's: the note tells
   * whoever is speaking "this is your life".
   */
  personaId?: string;
  store?: VectorRecallStore;
  /** What Ferni told this caller about himself on earlier calls (life-ledger.ts). */
  ledgerStore?: LedgerStore;
  /** What has happened in his life since (life-updates.ts, LIFE_MOVES_ON). */
  lifeUpdates?: LifeUpdateDeps;
  /** What they said they'd do, asked about early (COACH_FOLLOW_THROUGH). */
  checkIns?: () => Promise<OpenCommitment[]>;
  /** What the two of them both know (common-ground.ts, COMMON_GROUND). */
  groundStore?: GroundStore;
  repairStore?: Pick<RepairStore, 'recent'>; // Corrections from earlier calls (FRIEND_REPAIR)
  /** A date they told Ferni about, asked once (dates/recall.ts, FRIEND_FOLLOWUPS). */
  dates?: DatesRecall;
  /** Peter's weekly prediction, a week on (prediction-check-in.ts, WEEKLY_PREDICTION). */
  week?: PredictionCheckIn;
  loops?: CallLoopsRecall; // open loops + Ferni's promises, once a call (OPEN_LOOPS_IN_CONTEXT)
  /** The call's session id: with no `loops` given, its loops come from callLoopsRecallFor. */
  sessionId?: string;
  /** FERNI_SELF_RECALL=on; read from the environment when not given. */
  selfRecall?: boolean;
  /** SEMANTIC_RECALL=on; read from the environment when not given. */
  semantic?: boolean;
  /** RECALL_PEOPLE=on (people.ts; env when not given); WORLD_MODEL_SNAPSHOT turns it off. */
  people?: boolean;
  embed?: RetrievalEmbedder;
  /** RECALL_VECTOR_INDEX=on (needs semantic; env when not given), and the model of stored vectors. */
  vectorIndex?: boolean;
  embeddingModel?: Promise<string>;
  /** OPENER_FOLLOW_UP=on (opener.ts); read from the environment when not given. */
  opener?: boolean;
  /** RECALL_BRIDGE=on; read from the environment when not given. */
  bridge?: boolean;
  /** FOLLOW_THROUGH_OPENER=on: the opener's thread comes from follow_through instead. */
  followThrough?: FollowThroughOpener;
  /** RECALL_EPISODES=on (episodes.ts, needs semantic); read from the environment when not given. */
  episodes?: boolean;
  episodeStore?: EpisodeStore;
  /** RECALL_SUMMARIES=on (call-summaries.ts); read from the environment when not given. */
  summaries?: boolean;
  world?: WorldRecallDeps;
}

export interface MemoryRecall {
  /** Resolves once the snapshot is loaded (for tests and startup logging). */
  ready: Promise<void>;
  /**
   * The recall note for this transcript, or null. Synchronous: never waits on
   * the store. `final: false` marks an interim transcript.
   */
  noteFor(transcript: string, opts?: { final?: boolean }): string | null;
  /** The agent started replying: the next transcript belongs to a new user turn. */
  newTurn(): void;
  /** The last note split for the context packet (CONTEXT_PACKET); null before any. */
  lastPick(): RecallPick | null;
  /** What was loaded at call start, once it is (for the name lift); undefined before. */
  snapshot(): RecallSnapshot | undefined;
}

/**
 * Facts recalled per user turn. Interim transcripts arrive many times a turn;
 * without a turn budget each one pulled in 4 more facts about the same thing
 * (15 notes, ~45 facts for one sentence on 2026-09-27).
 */
const FACTS_PER_TURN = 4;
/** One person or thing can't take the whole turn ("sister" brought 4 pregnancy rows, 2026-10-04). */
const FACTS_PER_ENTITY = 2;
/** "How are you?", "what about you": they asked about him, so his own life is fair game. */
const ASKS_ABOUT_YOU = /\byou(?:'re|r|rself)?\b/i;
/** With semantic recall: open threads and Ferni's own stories kept for later in the call. */
const FOLLOW_UPS_KEPT = 12;
const TOLD_KEPT = 40;

export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecall {
  const loops =
    deps.loops ?? (deps.sessionId ? callLoopsRecallFor(deps.userId, deps.sessionId) : undefined);
  const started = Date.now();
  let snapshot: RecallSnapshot | undefined;
  const surfaced = new Set<string>();
  let followUpsOffered = false;
  // A shared bit comes once a call (INSIDE_JOKES), on a turn that touches its line.
  let jokeOffered = false;
  const bridge = deps.bridge ?? recallBridgeEnabled();
  // RECALL_BRIDGE: open threads not yet offered, and which caller turn this is.
  let threadsLeft: string[] = [];
  let callerTurn = 0;
  let turnCounted = false;
  // RECALL_BRIDGE: his own life waits too, and is offered once.
  let ledgerFacts = '';
  let toldOffered = false;
  let factsThisTurn = 0;
  let tokensLeft = RECALL_TOKENS_PER_TURN;
  const entitiesThisTurn = new Map<string, number>();

  let ledgerNote: string | null = null;
  let sinceNote: string | null = null;
  let groundNote: string | null = null;
  let checkInNote: string | null = null;
  let checkInOffered = false;
  let lastPick: RecallPick | null = null;
  const semanticOn = deps.semantic ?? semanticRecallEnabled();
  // RECALL_VECTOR_INDEX: stored fact vectors, and older facts found by meaning.
  const stored =
    semanticOn && (deps.vectorIndex ?? recallVectorIndexEnabled())
      ? createStoredVectors(deps.store ?? firestoreRecallStore, deps.userId, deps.embeddingModel)
      : undefined;
  // Key points of earlier calls' summaries; loaded apart so the snapshot never waits.
  const summaryRecall =
    (deps.summaries ?? summaryRecallEnabled())
      ? createSummaryRecall({
          userId: deps.userId,
          store: deps.store ?? firestoreRecallStore,
          ...(semanticOn && { embed: deps.embed }),
        })
      : undefined;
  let index: SemanticIndex | undefined;
  // Semantic recall only: threads and stories past the first note, by id.
  const laterFollowUps = new Map<string, string>();
  const laterTold = new Map<string, LedgerFact>();
  // The caller's own words from earlier calls; indexed apart so the snapshot never waits.
  const episodes =
    semanticOn && (deps.episodes ?? recallEpisodesEnabled())
      ? createEpisodeRecall({
          userId: deps.userId,
          before: new Date(started),
          store: deps.episodeStore ?? firestoreEpisodeStore,
          embed: deps.embed,
        })
      : undefined;
  const personaId = deps.personaId ?? 'ferni';
  const world = createWorldRecall(deps.userId, deps.world);
  // FERNI_SELF_RECALL=on: asked about himself, what he told about it (self-recall.ts).
  const selfRecall = deps.selfRecall ?? selfRecallEnabled();
  let allTold: LedgerFact[] = [];
  let canon: Record<string, string> = {};
  let selfNoteGiven = false;
  const ledger = loadLedger(
    deps.userId,
    personaId,
    deps.ledgerStore,
    semanticOn || selfRecall ? TOLD_KEPT : RECALL_LIMIT
  );
  const followThrough = deps.followThrough ?? followThroughOpenerFor(deps.userId);
  const loaded = Promise.all([
    loadRecallSnapshot(
      stored?.store ?? deps.store ?? firestoreRecallStore,
      deps.userId,
      semanticOn ? FOLLOW_UPS_KEPT : MAX_FOLLOW_UPS
    ),
    ledger,
    followThrough.ready,
  ]).then(([s, told]) => {
    const threads = followThrough.threads() ?? s.followUps;
    snapshot = { ...s, followUps: threads.slice(0, MAX_FOLLOW_UPS) };
    threadsLeft = snapshot.followUps;
    allTold = told;
    ledgerFacts = told
      .slice(0, RECALL_LIMIT)
      .map((f) => f.fact)
      .join(' ');
    ledgerNote = formatLedger(told.slice(0, RECALL_LIMIT), deps.userName, Date.now(), { bridge });
    log.info(
      {
        facts: s.facts.length,
        followUps: s.followUps.length,
        insideJokes: s.insideJokes?.length ?? 0,
        told: told.length,
        ms: Date.now() - started,
      },
      'Recall snapshot loaded'
    );
    if (!semanticOn) return;
    for (const t of s.followUps.slice(MAX_FOLLOW_UPS)) laterFollowUps.set(`thread:${t}`, t);
    for (const f of told.slice(RECALL_LIMIT)) laterTold.set(`told:${f.fact}`, f);
    const items = [
      ...factItems(s.facts, deps.userName, stored),
      ...[...laterFollowUps].map(([id, text]) => ({ id, text })),
      ...[...laterTold].map(([id, f]) => ({ id, text: f.fact })),
    ];
    // The snapshot is usable at once; the index joins when it is embedded.
    const idx = (index = createSemanticIndex(items, deps.embed, stored?.nearest));
    void idx.ready.then(() =>
      log.info({ items: items.length, ms: Date.now() - started }, 'Recall index ready')
    );
  });
  // Written by a model, so it never holds up the snapshot; it joins the first
  // note only if it is ready by then. Never rejects.
  const since = ledger
    .then((told) =>
      loadLifeUpdates(deps.userId, told.slice(0, RECALL_LIMIT), personaId, deps.lifeUpdates)
    )
    .then((updates) => {
      sinceNote = formatLifeUpdates(updates);
    });
  // Also never holds up the snapshot; joins the first note once it is ready.
  const checkIns =
    deps.checkIns ?? (coachFollowThroughMode() ? () => checkInsWithCalls(deps.userId) : undefined);
  const checkedIn = (checkIns ? checkIns() : Promise.resolve([]))
    .then((open) => {
      checkInNote = formatCheckIn(open, Date.now());
    })
    .catch((error: unknown) => log.warn({ error: String(error) }, 'Check-ins not loaded'));
  // Like the life updates: joins the first note only if loaded by then.
  const ground = commonGroundEnabled()
    ? (deps.groundStore ?? firestoreGroundStore)
        .load(deps.userId)
        .then((g) => {
          groundNote = formatCommonGround(g, deps.userName);
        })
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Common ground not loaded'))
    : Promise.resolve();
  const canonLoaded = selfRecall
    ? loadCanon(personaId).then((c) => {
        canon = c;
      })
    : Promise.resolve();
  const dates = deps.dates ?? datesRecallFor(deps.userId, deps.sessionId);
  const week = deps.week ?? predictionCheckInFor(deps.userId, personaId);
  const loading = [loaded, since, checkedIn, ground, canonLoaded, dates.ready, world.ready];
  const repairs = loadRepairRecall(deps.userId, deps.repairStore); // FRIEND_REPAIR, first note
  const growth = growthRecallFor(deps.userId, personaId, deps.sessionId); // PERSONA_GROWTH
  const ready = Promise.all([...loading, repairs.ready, loops?.ready]).then(() => undefined);

  return withGrowth(growth, {
    ready,
    noteFor(transcript, opts = {}) {
      const text = transcript.trim();
      if (text && !turnCounted) {
        turnCounted = true;
        callerTurn++;
      }
      week.heard(text);
      if (!snapshot || !text || world.loading) return null;
      index?.observe(text);
      episodes?.observe(text);
      summaryRecall?.observe(text);
      const semantic = index?.matches() ?? new Map<string, number>();
      // The first interim of a turn comes before its embedding. Word matches
      // alone then spent the turn's four facts ("work" -> "works long
      // shifts"), and the final transcript's meaning-matched facts found no
      // room ("employer = St. Mary's", benchmark 2026-10-11). Interims wait
      // for the meaning unless they name someone; a final transcript never waits.
      const namedOnly = opts.final === false && (index?.awaitingTurn() ?? false);
      const blend = index ? { semantic, now: Date.now(), namedOnly } : undefined;
      const budget = FACTS_PER_TURN - factsThisTurn;
      const ranked =
        budget > 0
          ? recallForTurn(
              world.pool(stored?.pool(snapshot) ?? snapshot),
              text,
              surfaced,
              budget,
              FACTS_PER_ENTITY,
              entitiesThisTurn,
              blend
            )
          : [];
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
      const threadsNow = bridge
        ? threadsForTurn(threadsLeft.filter(world.keep), text, callerTurn)
        : followUpsOffered
          ? []
          : snapshot.followUps.filter(world.keep);
      const followUps = [...threadsNow, ...extras.flatMap((id) => laterFollowUps.get(id) ?? [])];
      // Shared bits come once a call, and only on a turn that touches the line they came from.
      const insideJokes = jokeOffered ? [] : jokesForTurn(snapshot.insideJokes ?? [], text);
      // The ledger, like the follow-ups, comes once, with the first note. With
      // RECALL_BRIDGE it waits like the threads, unless they ask about him: on
      // "Still on there." alone it was read as his mail pile (6/8 replies).
      const tellNow = bridge
        ? !toldOffered &&
          (ASKS_ABOUT_YOU.test(text) || threadsForTurn([ledgerFacts], text, callerTurn).length > 0)
        : !followUpsOffered;
      const told = tellNow
        ? [quietLedger(ledgerNote, text), sinceNote].filter(Boolean).join('\n') || null
        : null;
      // Who is who (RECALL_PEOPLE, or the world note's), once, with the first note.
      const people = world.whoIsWho(snapshot.facts, deps.people);
      // What the two of them both know (COMMON_GROUND), once, with the first note.
      const groundNow = followUpsOffered ? null : groundNote;
      const checkIn = checkInOffered ? null : checkInNote;
      const dateNow = followUpsOffered || checkIn ? null : dates.note();
      // One follow-up per call opener (opener-claim.ts): a check-in or a date
      // in this note, or one the greeting already asked, leaves the thread line out.
      const greetingAsked = followUpsOffered ? undefined : takeOpenerClaim(deps.userId);
      // The week's predictions come alone: never beside a check-in, a date or the greeting's ask.
      const weekNow = checkIn || dateNow || greetingAsked ? null : week.note(opts.final);
      const opener =
        !followUpsOffered &&
        !checkIn &&
        !dateNow &&
        !weekNow &&
        !greetingAsked &&
        threadsNow.length > 0 &&
        (followThrough.threads() !== null || (deps.opener ?? openerFollowUpEnabled()))
          ? OPENER_FOLLOW_UP_LINE
          : null;
      // Once a turn, when they ask about him and something answers it.
      const self =
        selfRecall && !selfNoteGiven
          ? selfRecallNote(text, allTold, canon, { name: personaDisplayName(personaId) })
          : null;
      if (self) selfNoteGiven = true;
      const [summary, episode] = [summaryRecall?.take(text) ?? null, episodes?.take() ?? null];
      const [worldNote, loopsNow] = [world.note(), loops?.note() ?? null];
      // The same note with or without the facts: CONTEXT_PACKET labels those in the packet.
      const noteWith = (shown: RecallFact[]): string | null =>
        world.screen(
          [
            checkIn,
            worldNote,
            dateNow,
            loopsNow,
            weekNow,
            formatRecall(shown, followUps, deps.userName, Date.now(), { insideJokes, bridge }),
            opener,
            summary,
            people,
            told,
            groundNow,
            followUpsOffered ? null : repairs.note(),
            extraTold.length > 0
              ? quietLedger(formatLedger(extraTold, deps.userName, Date.now(), { bridge }), text)
              : null,
            episode,
            self,
          ]
            .filter(Boolean)
            .join('\n\n')
        );
      const note = noteWith(facts);
      if (!note) return null;
      lastPick = { facts, userName: deps.userName, rest: noteWith([]) };
      followUpsOffered = true;
      if (insideJokes.length > 0) jokeOffered = true;
      if (told) toldOffered = true;
      threadsLeft = threadsLeft.filter((t) => !threadsNow.includes(t));
      if (checkIn) checkInOffered = true;
      if (opener) followThrough.raised(threadsNow);
      if (dateNow) dates.raised();
      if (loopsNow) loops?.raised();
      if (checkIn || dateNow || greetingAsked || weekNow) week.raised(weekNow !== null);
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
          self: self !== null,
          // Which lines came along (ids are in dates-recall's 'Date raised'), never words.
          dates: dateNow ? 1 : 0,
          world: worldNote ? 1 : 0,
        },
        'Recall added'
      );
      return note;
    },
    lastPick: () => lastPick,
    newTurn() {
      turnCounted = false;
      episodes?.newTurn();
      selfNoteGiven = false;
      factsThisTurn = 0;
      tokensLeft = RECALL_TOKENS_PER_TURN;
      entitiesThisTurn.clear();
      index?.newTurn();
      summaryRecall?.newTurn();
    },
    snapshot: () => snapshot,
  });
}

export { addRecallNote, type RecallAgent } from './recall-note.js';
export { firestoreRecallStore };
