/**
 * What a persona agent adds to each LLM request and caption stream, beyond the
 * stock LiveKit behaviour: the per-turn reminder (turn style plus the
 * director's notes), the tools (minus handoffs to locked teammates, cut to this
 * turn's pick when tool retrieval is on), and the spoken-text tap the barge-in
 * echo guard reads. Used by PersonaVoiceAgent in ferni-agent.ts.
 */

import type { llm } from '@livekit/agents';
import { TransformStream, type ReadableStream } from 'node:stream/web';

import { createLogger } from '../../utils/safe-logger.js';
import { getBargeInFastPath } from '../multi-agent/barge-in-fastpath.js';
import { TURN_CONTEXT_HEADER, withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import {
  getTurnToolRetrieval,
  latestUserText,
  toolRetrievalMode,
} from '../../tools/retrieval/turn-tool-retrieval.js';
import { withoutLockedHandoffs } from '../../tools/handoff/locked-handoffs.js';
import {
  teamStatusNote,
  unlockViewFor,
  withoutLockedTeammateNotes,
  withTeammateAsk,
} from '../../tools/handoff/locked-teammates.js';
import { signalToolCallRequested } from '../voice-agent/empty-response-watchdog.js';
import type { Caption } from './caption-filter.js';
import { formatNotes, getDirector } from './director-notes.js';
import { rngFor, turnShapeEnabled, turnShapeFor } from './turn-shape.js';
import {
  TURN_STYLE_REMINDER,
  turnStyleReminderEnabled,
  withTurnStyleReminder,
} from './turn-style.js';

/** Live tool retrieval waits this long for the pick before falling back (see toolsForTurn). */
const LIVE_PICK_WAIT_MS = 150;

const log = createLogger({ module: 'FerniAgent' });

/** The agent session, as far as these helpers read it. */
interface TurnSession {
  readonly userData: unknown;
}

/** Per-agent state: the locked-handoff removal is logged once per agent. */
export interface TurnToolsState {
  loggedLockedHandoffs: boolean;
}

/**
 * A copy of the context with the turn reminder, plus what Ferni has already
 * told on this call, the team line (locked-teammates.ts), and the director's
 * notes for this reply, if any, and without per-turn context built for an
 * earlier turn (turn-intelligence.ts).
 */
export function withTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: { shape?: boolean } = {}
): llm.ChatContext {
  const chatCtx = withoutStaleTurnContext(request);
  const director = getDirector(session);
  const view = unlockViewFor((session as { userData?: unknown }).userData);
  const words = callerWords(chatCtx);
  // Nothing steers back to a locked teammate the caller didn't just name.
  const keep = (text: string): boolean =>
    withoutLockedTeammateNotes([text], view, words).length > 0;
  const notes = formatNotes((director?.current() ?? []).filter(keep));
  // The style goes last, nearest the reply: the per-turn shape is followed
  // best there (turn-shape.ts), and live it otherwise sat behind the notes.
  const reminder = [
    director?.told(keep) ?? '',
    teamStatusNote(view, words),
    notes,
    turnStyleReminderEnabled() ? styleFor(chatCtx, session, options.shape !== false) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return reminder ? withTurnStyleReminder(chatCtx, reminder) : chatCtx;
}

/** The caller's words this reply answers: their messages since the agent last spoke, notes aside. */
function callerWords(chatCtx: llm.ChatContext): string {
  const said: string[] = [];
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type !== 'message') continue; // tool calls and outputs of this turn
    if (item.role === 'assistant') break;
    const text = item.textContent ?? '';
    if (item.role === 'user' && !text.startsWith(TURN_CONTEXT_HEADER)) said.unshift(text);
  }
  return said.join(' ');
}

/**
 * This reply's shape (turn-shape.ts) from the caller's latest words, or the
 * single style reminder when shaping is off, there are no words, or the
 * caller asked for none (a crisis reply must not be held to a few words).
 */
function styleFor(chatCtx: llm.ChatContext, session: object, shape: boolean): string {
  const said = shape && turnShapeEnabled() ? latestUserText(chatCtx) : null;
  if (!said) return TURN_STYLE_REMINDER;
  // Seeded per call and words: the preemptive and final requests agree, but
  // the same words on another call (or said again) can get another shape.
  const turn = turnShapeFor(said, rngFor(`${callSeed(session)}:${said}`));
  log.info({ move: turn.move, shape: turn.shape, extras: turn.extras }, 'TURN_SHAPE');
  return turn.reminder;
}

const callSeeds = new WeakMap<object, string>();
function callSeed(session: object): string {
  let seed = callSeeds.get(session);
  if (!seed) {
    seed = Math.random().toString(36).slice(2);
    callSeeds.set(session, seed);
  }
  return seed;
}

// Re-exported for callers that read the unlock view from a session.
export { unlockViewFor, withTeammateTool } from '../../tools/handoff/locked-teammates.js';

/**
 * The tools this turn's request carries: no locked handoffs, the agent's
 * askForTeammate while some teammates are locked (locked-teammates.ts), then
 * the retrieval pick.
 */
export async function toolsForTurn(
  session: TurnSession,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext,
  state: TurnToolsState
): Promise<llm.ToolContext> {
  const view = unlockViewFor(session.userData);
  const unlocked = await withoutLockedHandoffs(toolCtx, view).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'locked-handoff filter failed; sending tools as is');
    return toolCtx;
  });
  if (unlocked !== toolCtx && !state.loggedLockedHandoffs) {
    state.loggedLockedHandoffs = true;
    log.info(
      {
        removed: Object.keys(toolCtx.functionTools).filter((n) => !(n in unlocked.functionTools)),
      },
      'Handoffs to locked teammates kept out of the request'
    );
  }
  return retrievedTools(session, chatCtx, withTeammateAsk(unlocked, view));
}

/**
 * Shadow mode only logs what would be picked (nothing awaited); live mode sends
 * core + recent + retrieved tools, waiting at most LIVE_PICK_WAIT_MS for the
 * pick, then using a close pick from this turn, and otherwise sending them all.
 * See tools/retrieval/turn-tool-retrieval.ts.
 */
async function retrievedTools(
  session: object,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext
): Promise<llm.ToolContext> {
  const mode = toolRetrievalMode();
  if (mode === 'off') return toolCtx;
  const retrieval = getTurnToolRetrieval(session);
  if (!retrieval) return toolCtx; // the full catalog is only loaded with retrieval
  const text = latestUserText(chatCtx);
  if (!text) {
    // Greetings, check-ins, recovered turns: no words to retrieve for. In
    // live mode the agent may hold the whole catalog; don't send all of it.
    return mode === 'live' ? retrieval.withoutPick(toolCtx) : toolCtx;
  }
  if (mode === 'shadow') {
    retrieval.observe(text, toolCtx);
    return toolCtx;
  }
  return retrieval.selectLive(text, toolCtx, LIVE_PICK_WAIT_MS);
}

/** Captions, reporting what Ferni is saying to the barge-in echo guard (barge-in-fastpath.ts). */
export function tapSpokenText(
  captions: ReadableStream<Caption>,
  session: object
): ReadableStream<Caption> {
  const fastPath = getBargeInFastPath(session);
  if (!fastPath) return captions;
  return captions.pipeThrough(
    new TransformStream<Caption, Caption>({
      transform(chunk, controller) {
        fastPath.onSpokenText(typeof chunk === 'string' ? chunk : chunk.text);
        controller.enqueue(chunk);
      },
    })
  );
}

/**
 * The LLM reply, reporting its first tool call to the empty-response watchdog
 * so a tool lookup isn't mistaken for a turn with no reply (empty-response-watchdog.ts).
 */
export function tapToolCalls<T>(
  reply: ReadableStream<T> | null,
  session: object
): ReadableStream<T> | null {
  if (!reply) return reply;
  let signalled = false;
  return reply.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        if (!signalled && hasToolCalls(chunk)) {
          signalled = true;
          signalToolCallRequested(session);
        }
        controller.enqueue(chunk);
      },
    })
  );
}

/** LiveKit runs only `function_call` entries (generation.js), so only those count. */
function hasToolCalls(chunk: unknown): boolean {
  if (typeof chunk !== 'object') return false;
  const delta = (chunk as { delta?: { toolCalls?: Array<{ type?: string }> } } | null)?.delta;
  return delta?.toolCalls?.some((call) => call.type === 'function_call') ?? false;
}
