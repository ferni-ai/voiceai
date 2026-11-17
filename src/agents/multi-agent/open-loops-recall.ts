/**
 * What was left unfinished, in the call's recall note once a call
 * (OPEN_LOOPS_IN_CONTEXT=on, default off).
 *
 * The caller's open loops ("I'll talk to my boss Friday") and Ferni's own
 * promises were built every turn by the semantic-intelligence context
 * (semantic-intelligence/index.ts), but no live call read that text. Its
 * runners are the registered context builders (superhuman-session-priming,
 * semantic-intelligence-integration), which nothing runs on a call
 * (buildConversationContext has no caller outside tests); web routes; and
 * getUnifiedIntelligence on every turn, whose superhumanContext no prompt
 * reads (formatIntelligenceForLLM has no caller). So one user's 24 open loops
 * sat at followUpCount 0 (loops scorecard, 2026-10-18), and building the
 * promise text marked missed promises offered without Ferni seeing them.
 *
 * Loaded at call start, the note joins the first recall note after it loads
 * (memory-recall-hook.ts), where it stays in the chat for the call. Only when
 * it is given are missed promises marked offered and OPEN_LOOPS_INJECTED
 * logged, with counts and ages, never the words. A persona handed the same
 * call doesn't give it again.
 *
 * @module agents/multi-agent/open-loops-recall
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { OpenLoop } from '../../services/superhuman/semantic-intelligence/open-loops.js';
import type { FerniCommitment } from '../../services/superhuman/semantic-intelligence/ferni-commitments.js';

const log = createLogger({ module: 'open-loops-recall' });

const DAY_MS = 24 * 60 * 60 * 1000;
/** Calls remembered at once; the oldest is forgotten first. */
const MAX_CALLS = 500;

export function openLoopsInContextEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.OPEN_LOOPS_IN_CONTEXT === 'on';
}

export interface CallLoopsSources {
  /** Open loops due a follow-up, highest priority first. */
  loops: (userId: string) => Promise<OpenLoop[]>;
  /** What the caller asked Ferni to forget, as a filter; null when it can't be read. */
  forgotten: (userId: string) => Promise<((text: string) => boolean) | null>;
  /** Ferni's promises for the prompt, and the misses in it. Only reads. */
  promises: (userId: string) => Promise<{ text: string; misses: FerniCommitment[] }>;
  /** Ferni was shown these misses: no later call offers them. */
  markOffered: (userId: string, misses: readonly FerniCommitment[]) => Promise<void>;
}

const realSources: CallLoopsSources = {
  async loops(userId) {
    const { getLoopsReadyForFollowUp } =
      await import('../../services/superhuman/semantic-intelligence/open-loops.js');
    return getLoopsReadyForFollowUp(userId);
  },
  async forgotten(userId) {
    const { forgottenFilter } = await import('./forgotten-filter.js');
    return forgottenFilter(userId);
  },
  async promises(userId) {
    const { promiseContextFor } =
      await import('../../services/superhuman/semantic-intelligence/promise-keeper.js');
    return promiseContextFor(userId);
  },
  async markOffered(userId, misses) {
    const { markMissesOffered } =
      await import('../../services/superhuman/semantic-intelligence/promise-keeper.js');
    return markMissesOffered(userId, misses);
  },
};

/** A loop's words, folded, so one stored twice ("Whether to take it." / "whether to take it") is one. */
const loopKey = (loop: OpenLoop): string =>
  `${loop.type}:${loop.content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()}`;

/**
 * The due loops the caller may hear about (#3995): none about a topic they asked Ferni to
 * forget (its words, context or description), and each stored wording once, first kept.
 */
function loopsToRaise(
  loops: readonly OpenLoop[],
  forgotten: (text: string) => boolean
): OpenLoop[] {
  const seen = new Set<string>();
  return loops.filter((loop) => {
    if (forgotten([loop.content, loop.context, loop.description].filter(Boolean).join(' ')))
      return false;
    const key = loopKey(loop);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The loops formatOpenLoopsContext shows: at most three of each type. */
function loopsShown(loops: readonly OpenLoop[]): OpenLoop[] {
  const perType = new Map<string, number>();
  return loops.filter((loop) => {
    const seen = perType.get(loop.type) ?? 0;
    perType.set(loop.type, seen + 1);
    return seen < 3;
  });
}

export interface LoopAges {
  today: number;
  week: number;
  month: number;
  older: number;
}

/** How old the loops are, bucketed by when they were opened. */
export function bucketLoopAges(loops: readonly OpenLoop[], now: Date): LoopAges {
  const ages: LoopAges = { today: 0, week: 0, month: 0, older: 0 };
  for (const loop of loops) {
    const days = (now.getTime() - new Date(loop.created).getTime()) / DAY_MS;
    if (days < 1) ages.today++;
    else if (days < 7) ages.week++;
    else if (days < 30) ages.month++;
    else ages.older++;
  }
  return ages;
}

export interface CallLoopsRecall {
  /** Resolves once loaded. Never rejects. */
  ready: Promise<void>;
  /** The note for the recall note, or null. No side effects. */
  note: () => string | null;
  /** The note was given: mark its misses offered, log it, never give it again this call. */
  raised: () => void;
}

const NO_CALL_LOOPS: CallLoopsRecall = {
  ready: Promise.resolve(),
  note: () => null,
  raised: () => undefined,
};

const raisedCalls = new Set<string>();
let injectedTotal = 0;

/** Notes given by this process (the counter in each OPEN_LOOPS_INJECTED line). */
export function openLoopsInjectedTotal(): number {
  return injectedTotal;
}

/** Test seam: forget every call and reset the counter. */
export function resetCallLoopsNotes(): void {
  raisedCalls.clear();
  injectedTotal = 0;
}

export interface CallLoopsDeps {
  userId: string;
  /** The call (its session id): every persona on it shares one note. */
  callId: string;
  sources?: CallLoopsSources;
  now?: () => Date;
}

/** Loads the call's open loops and Ferni's promises at call start. */
export function createCallLoopsRecall(deps: CallLoopsDeps): CallLoopsRecall {
  const sources = deps.sources ?? realSources;
  const now = deps.now ?? (() => new Date());
  let text = '';
  let shown: OpenLoop[] = [];
  let loopsDue = 0;
  let misses: FerniCommitment[] = [];
  let hasPromises = false;

  const ready = (async () => {
    const [loops, promises, forgottenRead] = await Promise.allSettled([
      sources.loops(deps.userId),
      sources.promises(deps.userId),
      sources.forgotten(deps.userId),
    ]);
    for (const failed of [loops, promises, forgottenRead]) {
      if (failed.status === 'rejected') {
        log.warn({ error: String(failed.reason) }, 'Call loops: a source failed');
      }
    }
    // Raw words from the caller's past: with no readable forget list, say nothing (fails closed).
    const forgotten = forgottenRead.status === 'fulfilled' ? forgottenRead.value : null;
    if (!forgotten) {
      log.info({ reason: 'forgotten-unreadable' }, 'Call loops: no note');
      return;
    }
    const { formatOpenLoopsContext } =
      await import('../../services/superhuman/semantic-intelligence/open-loops.js');
    const due = loopsToRaise(loops.status === 'fulfilled' ? loops.value : [], forgotten);
    loopsDue = due.length;
    shown = loopsShown(due);
    // The promise block is one text; any forgotten topic in it leaves the whole block out.
    const promiseText =
      promises.status === 'fulfilled' && !forgotten(promises.value.text) ? promises.value.text : '';
    if (promiseText && promises.status === 'fulfilled') {
      misses = promises.value.misses;
      hasPromises = true;
    }
    const loopsText = await formatOpenLoopsContext(deps.userId, due);
    text = [loopsText, promiseText].filter(Boolean).join('\n\n');
  })().catch((error: unknown) => log.warn({ error: String(error) }, 'Call loops not loaded'));

  return {
    ready,
    note: () => (text && !raisedCalls.has(deps.callId) ? text : null),
    raised() {
      if (!text || raisedCalls.has(deps.callId)) return;
      raisedCalls.add(deps.callId);
      if (raisedCalls.size > MAX_CALLS) {
        const oldest = raisedCalls.values().next().value;
        if (oldest !== undefined) raisedCalls.delete(oldest);
      }
      injectedTotal++;
      log.info(
        {
          loops: shown.length,
          loopsDue,
          ages: bucketLoopAges(shown, now()),
          promises: hasPromises,
          missesOwned: misses.length,
          injectedTotal,
        },
        'OPEN_LOOPS_INJECTED'
      );
      sources
        .markOffered(deps.userId, misses)
        .catch((error: unknown) => log.warn({ error: String(error) }, 'Misses not marked'));
    },
  };
}

/** The call's open-loops recall with OPEN_LOOPS_IN_CONTEXT=on; one with nothing when off. */
export function callLoopsRecallFor(userId: string, callId: string): CallLoopsRecall {
  if (!openLoopsInContextEnabled()) return NO_CALL_LOOPS;
  return createCallLoopsRecall({ userId, callId });
}
