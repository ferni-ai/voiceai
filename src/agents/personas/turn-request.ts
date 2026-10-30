/**
 * What a persona agent adds to each LLM request and caption stream, beyond the
 * stock LiveKit behaviour: the per-turn reminder (turn style plus the
 * director's notes), the tools (minus handoffs to locked teammates, cut to this
 * turn's pick when tool retrieval is on), and the spoken-text tap the barge-in
 * echo guard reads. Used by PersonaVoiceAgent in ferni-agent.ts.
 */

import type { llm } from '@livekit/agents';
import { contextPacketEnabled } from '../../config/context-packet-flag.js';
import { staticCoreToolsEnabled } from '../../config/tool-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import { onlyPhoneSafeTools } from '../shared/phone-safe-tools.js';
import { ownerWritesBlocked } from '../../services/identity/owner-write-gate.js';
import { withoutQuickShortcuts } from '../shared/quick-shortcuts-real-only.js';
import { heldAfter, lastFerniLine } from '../../utils/minor-care.js';
import {
  hasThirdPartyTools,
  mayReachOthers,
  withoutThirdPartyTools,
} from '../shared/third-party-tools.js';
import {
  phoneOnlyIdentity,
  sessionIsVerifiedOwner,
} from '../voice-agent-entry/caller-recognition.js';
import { TURN_CONTEXT_HEADER, withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import { withoutLockedHandoffs } from '../../tools/handoff/locked-handoffs.js';
import {
  teamStatusNote,
  unlockViewFor,
  withoutLockedTeammateNotes,
  withTeammateAsk,
} from '../../tools/handoff/locked-teammates.js';
import { isAnswerTurn } from './answer-turn.js';
import { packetReminder } from './context-packet/turn-packet.js';
import { retrievedTools, withPinnedTools, withSameTurnTools } from './turn-request-tools.js';
import { correctionNotesFor } from './correction-repair.js';
import { formatNotes, getDirector } from './director-notes.js';
import { noteReminder } from '../shared/turn-receipt-session.js';
import { ferniStateTurn } from './ferni-state.js';
import { listeningNotes } from './listen-first-turn.js';
import {
  worldFactLinesFor,
  worldFactsNoteFor,
} from '../../intelligence/world-model/temporal/in-call-load.js';
import { internalsIntentFor } from './internals-intent.js';
import { internalsTurn, pushesInternals } from './no-invented-internals.js';
import { noteTurn } from './move-log.js';
import { turnStyleReminderEnabled, withTurnStyleReminder } from './turn-style.js';
import { clearBurstOffer } from './vocal-bursts.js';
import { styleFor } from './turn-request-style.js';
import { scriptFreeOn } from './script-free.js';
import { callerOf, sessionIdOf, thoughtFor, turnNotesFor } from './turn-request-notes.js';
import { createNoteGuard, UNVERIFIED_SPEAKER_NOTE, type NoteGuard } from './turn-note-guard.js';

// Moved to turn-request-tools.ts; re-exported for existing importers.
export { spokenCaptions, tapSpokenText, tapToolCalls } from './turn-request-tools.js';

const log = createLogger({ module: 'FerniAgent' });

/** The agent session, as far as these helpers read it. */
interface TurnSession {
  readonly userData: unknown;
}

/** Per-agent state: the locked-handoff removal is logged once per agent. */
export interface TurnToolsState {
  loggedLockedHandoffs: boolean;
  /** The agent, so tools a phone-only caller can't use come off it too (phone-safe-tools.ts). */
  agent?: object;
}

const userIdOf = (userData: unknown): string | undefined =>
  (userData as { userId?: string } | undefined)?.userId;

/**
 * The request with this turn's notes. Never throws: when a note builder does, the turn gets
 * the request as sent rather than no reply at all. gatedReply adds crisis guidance after this,
 * so a guided turn keeps it (2026-10-29: an owner check threw on a crisis turn, #2996).
 *
 * Each note has its own catch (turn-note-guard.ts), so one failure drops that note and no other.
 * A failure outside the notes still keeps the stale-context removal and the unverified-speaker
 * default (#3077): a turn whose owner and privacy notes may be missing is never read as verified.
 */
export function withTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: TurnReminderOptions = {}
): llm.ChatContext {
  const guard = createNoteGuard(log, sessionIdOf((session as { userData?: unknown }).userData));
  try {
    return buildTurnReminder(request, session, options, guard);
  } catch (error) {
    log.warn(
      { errorName: error instanceof Error ? error.name : typeof error },
      "TURN_REMINDER_FAILED: replying with the unverified default, without this turn's other notes"
    );
    return unverifiedRequest(request);
  }
}

type TurnReminderOptions = { shape?: boolean; closeLoop?: boolean };

/** Every note lost: the request without earlier turns' context, carrying only the unverified default. */
function unverifiedRequest(request: llm.ChatContext): llm.ChatContext {
  try {
    return withTurnStyleReminder(withoutStaleTurnContext(request), UNVERIFIED_SPEAKER_NOTE);
  } catch (error) {
    log.warn(
      { errorName: error instanceof Error ? error.name : typeof error },
      'TURN_REMINDER_FAILED: not even the unverified default could ride; replying with the request as sent'
    );
    return request;
  }
}

/**
 * A copy of the context with the turn reminder, plus what Ferni has already
 * told on this call, the team line (locked-teammates.ts), and the director's
 * notes for this reply, if any, and without per-turn context built for an
 * earlier turn (turn-intelligence.ts).
 */
function buildTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: TurnReminderOptions,
  guard: NoteGuard
): llm.ChatContext {
  const chatCtx = withoutStaleTurnContext(request);
  const userData = (session as { userData?: unknown }).userData;
  // An invitation to open with a sound is for one request only (vocal-bursts.ts).
  guard.run('burstOffer', () => clearBurstOffer(session), undefined);
  const director = getDirector(session);
  const view = unlockViewFor(userData);
  const words = callerWords(chatCtx);
  // SCRIPT_FREE_REMINDER=on: no shared style or quoted lines; never on a crisis turn (script-free.ts).
  const crisis = options.shape === false;
  const plain = !crisis && scriptFreeOn();
  const sessionId = sessionIdOf(userData);
  // NO_INVENTED_INTERNALS=on: asked how he's built after a tool failed, or he just made it up.
  const internals = guard.run(
    'internalsTurn',
    () =>
      crisis
        ? ''
        : internalsTurn(chatCtx.items, words, process.env, internalsIntentFor(session, words)),
    ''
  );
  // Nothing steers back to a locked teammate the caller didn't just name, or into his internals.
  const keep = (text: string): boolean =>
    withoutLockedTeammateNotes([text], view, words).length > 0 && !pushesInternals(internals, text);
  const offered = director?.current() ?? [];
  // DIRECTOR_ANSWER_TURN_GUARD=on: notes written before they answered Ferni's question are stale.
  const answering = isAnswerTurn(chatCtx.items, words);
  // LISTEN_FIRST=on: a caller low on energy gets no note pushing Ferni to share.
  const notes = answering
    ? ''
    : guard.run(
        'directorNotes',
        () => formatNotes(listeningNotes(offered.filter(keep), chatCtx, session)),
        ''
      );
  // REPAIR_MODE=on: own a correction, and keep earlier ones; none with crisis guidance.
  const corrected = crisis
    ? ''
    : guard.run('corrections', () => correctionNotesFor(chatCtx, session, process.env, plain), '');
  // Never with crisis guidance (shape: false): no thought rides a crisis reply.
  const thought = crisis ? '' : guard.run('thought', () => thoughtFor(session, words), '');
  // How Ferni is doing (FERNI_STATE=on), and if his own story may ride; none in a crisis.
  const state = guard.run(
    'ferniState',
    () => ferniStateTurn(chatCtx, session, { careful: crisis }),
    { note: '', last: '' }
  );
  const style = guard.run(
    'style',
    () =>
      turnStyleReminderEnabled()
        ? styleFor(chatCtx, session, !crisis, state, { answering, plain })
        : undefined,
    undefined
  );
  guard.run('moveLog', () => noteTurn(session, words, style?.turn), undefined); // MOVE_OUTCOMES=on (move-log.ts)
  // WORLD_FACTS_IN_CALL=on: where their life stands (in-call-load.ts); nothing when off. About the
  // caller, so a failure here counts as a dropped identity note (the unverified default rides).
  const caller = callerOf(session);
  const lifeAt = {
    now: Date.now(),
    timeZone: caller?.callerTimezone,
    userName: caller?.userName,
    words,
  };
  const packet = contextPacketEnabled();
  const factLines = guard.run(
    'worldFactLines',
    () => (packet ? worldFactLinesFor(caller, lifeAt) : []),
    [],
    { identity: true }
  );
  const factNote = guard.run(
    'worldFactsNote',
    () => (packet ? '' : worldFactsNoteFor(caller, lifeAt)),
    '',
    { identity: true }
  );
  const turnNotes = turnNotesFor(
    {
      chatCtx,
      session,
      words,
      crisis,
      closeLoop: options.closeLoop !== false,
      plain,
      sessionId,
      view,
      teamStatus: () => teamStatusNote(view, words),
      verifiedOwner: sessionIsVerifiedOwner,
      phoneOnly: phoneOnlyIdentity,
      director,
      keep,
      answering,
      internals,
      notes,
      corrected,
      thought,
      state,
      style,
    },
    guard
  );
  const joined = [factNote, ...turnNotes].filter(Boolean).join(' ');
  const reminder = packet
    ? guard.run('packet', () => packetReminder(session, words, turnNotes, factLines), joined)
    : joined;
  // What this request carries, for its TURN_RECEIPT (turn-receipt.ts): sizes and counts only.
  guard.run(
    'receipt',
    () =>
      noteReminder(session, {
        reminder,
        directorNotes: notes,
        offered: offered.length,
        droppedIdx: offered.flatMap((note, i) => (!answering && keep(note) ? [] : [i])),
      }),
    undefined
  );
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
  if (staticCoreToolsEnabled()) withPinnedTools(toolCtx, state.agent);
  else withSameTurnTools(session, chatCtx, toolCtx, state.agent); // TOOLS_SAME_TURN: topic tools
  const view = unlockViewFor(session.userData);
  const sessionId = sessionIdOf(session.userData);
  // Not a verified owner (an anon: caller included): nothing that reaches other people.
  // MINOR_CARE=on: a caller under 18 who isn't a verified owner gets no tool that stores
  // anything. The phone-safe set holds no tool that reaches others, so it covers both.
  // ONBEHALF_WRITE_GATE: a call placed for a member (onbehalf:) acts on nobody's account either.
  const others = mayReachOthers(userIdOf(session.userData), sessionId, sessionIsVerifiedOwner);
  const held = heldAfter(sessionId, callerWords(chatCtx), {
    asked: lastFerniLine(chatCtx.items),
    userId: userIdOf(session.userData), // userHeld follows
  });
  const allowed =
    phoneOnlyIdentity(sessionId) || held || ownerWritesBlocked(userIdOf(session.userData))
      ? await withoutAccountTools(toolCtx, state)
      : others
        ? toolCtx
        : await withoutReachingOthers(toolCtx, state);
  const unlocked = await withoutLockedHandoffs(allowed, view).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'locked-handoff filter failed; sending tools as is');
    return allowed;
  });
  if (unlocked !== allowed && !state.loggedLockedHandoffs) {
    state.loggedLockedHandoffs = true;
    log.info(
      {
        removed: Object.keys(allowed.functionTools).filter((n) => !(n in unlocked.functionTools)),
      },
      'Handoffs to locked teammates kept out of the request'
    );
  }
  const picked = await retrievedTools(session, chatCtx, withTeammateAsk(unlocked, view));
  // retrieval may pick from the catalog; QUICK_SHORTCUTS_REAL_ONLY: no shortcut that can only refer
  return withoutQuickShortcuts(others ? picked : withoutThirdPartyTools(picked), session);
}

/**
 * Third-party tools leave the request and the agent itself (third-party-tools.ts),
 * unless changing the agent's tools would restart a realtime session: then the
 * tools refuse the call themselves (outbound-gate.ts).
 */
async function withoutReachingOthers(
  toolCtx: llm.ToolContext,
  state: TurnToolsState
): Promise<llm.ToolContext> {
  const agent = state.agent as ToolHolder | undefined;
  if (agent && hasThirdPartyTools(agent.toolCtx)) {
    const { isMidSessionToolUpdateSafe } = await import('../shared/tool-updater.js');
    if (isMidSessionToolUpdateSafe()) {
      await agent.updateTools(Object.values(withoutThirdPartyTools(agent.toolCtx).functionTools));
      log.info({}, 'Tools that reach other people closed for a caller who is not a verified owner');
    }
  }
  return withoutThirdPartyTools(toolCtx);
}

/**
 * A caller known only by their phone number, or a session on no account (the
 * person on a call placed for a member): every tool not on the phone-safe
 * allowlist leaves the request and the agent itself, so a call to one can't
 * run (phone-safe-tools.ts). endCall, support and handoffs stay.
 */
interface ToolHolder {
  readonly toolCtx: llm.ToolContext;
  updateTools(
    tools: llm.ToolContext | Parameters<llm.ToolContext['updateTools']>[0]
  ): Promise<void>;
}

async function withoutAccountTools(
  toolCtx: llm.ToolContext,
  state: TurnToolsState
): Promise<llm.ToolContext> {
  const agent = state.agent as ToolHolder | undefined;
  if (agent && onlyPhoneSafeTools(agent.toolCtx) !== agent.toolCtx) {
    await agent.updateTools(onlyPhoneSafeTools(agent.toolCtx));
    log.info({}, 'Only phone-safe tools open for a phone-recognised caller');
  }
  return onlyPhoneSafeTools(toolCtx);
}
