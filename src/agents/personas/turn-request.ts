/**
 * What a persona agent adds to each LLM request and caption stream, beyond the
 * stock LiveKit behaviour: the per-turn reminder (turn style plus the
 * director's notes), the tools (minus handoffs to locked teammates, cut to this
 * turn's pick when tool retrieval is on), and the spoken-text tap the barge-in
 * echo guard reads. Used by PersonaVoiceAgent in ferni-agent.ts.
 */

import type { llm } from '@livekit/agents';
import { TransformStream, type ReadableStream } from 'node:stream/web';

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getBargeInFastPath } from '../multi-agent/barge-in-fastpath.js';
import { withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import {
  getTurnToolRetrieval,
  latestUserText,
  toolRetrievalMode,
} from '../../tools/retrieval/turn-tool-retrieval.js';
import { withoutLockedHandoffs, type UnlockView } from '../../tools/handoff/locked-handoffs.js';
import { teamStatusNote, withTeammateAsk } from '../../tools/handoff/locked-teammates.js';
import type { Caption } from './caption-filter.js';
import { formatNotes, getDirector } from './director-notes.js';
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
 * told on this call, who isn't on the caller's team yet, and the director's
 * notes for this reply, if any, and without per-turn context built for an
 * earlier turn (turn-intelligence.ts).
 */
export function withTurnReminder(request: llm.ChatContext, session: object): llm.ChatContext {
  const chatCtx = withoutStaleTurnContext(request);
  const director = getDirector(session);
  const notes = formatNotes(director?.current() ?? []);
  const reminder = [
    turnStyleReminderEnabled() ? TURN_STYLE_REMINDER : '',
    director?.told() ?? '',
    teamStatusNote(unlockViewFor((session as { userData?: unknown }).userData)),
    notes,
  ]
    .filter(Boolean)
    .join(' ');
  return reminder ? withTurnStyleReminder(chatCtx, reminder) : chatCtx;
}

/** Who this user has unlocked, read the way the handoff tool's runtime check reads it. */
export function unlockViewFor(sessionUserData: unknown): UnlockView {
  const userData = sessionUserData as
    | { userProfile?: UserProfile | null; personaId?: unknown; services?: unknown }
    | undefined;
  const services = userData?.services as
    | {
        userProfile?: UserProfile | null;
        devMode?: { enabled?: boolean; bypassUnlocks?: boolean };
      }
    | undefined;
  const userProfile = services?.userProfile ?? userData?.userProfile ?? null;
  const tier = (userProfile?.subscription?.tier as UnlockView['tier'] | undefined) ?? 'free';
  return {
    userProfile,
    tier,
    bypass: Boolean(services?.devMode?.enabled && services.devMode.bypassUnlocks),
    currentAgentId: (userData?.personaId as string | undefined) ?? 'ferni',
  };
}

/**
 * The tools this turn's request carries: no locked handoffs, askForTeammate in
 * their place (locked-teammates.ts), then the retrieval pick.
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
