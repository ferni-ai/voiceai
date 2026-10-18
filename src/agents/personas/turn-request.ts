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
import {
  phoneOnlyIdentity,
  sessionIsVerifiedOwner,
} from '../voice-agent-entry/caller-recognition.js';
import { worldNowNote } from '../shared/world-now.js';
import { TURN_CONTEXT_HEADER, withoutStaleTurnContext } from '../multi-agent/turn-intelligence.js';
import { latestUserText } from '../../tools/retrieval/turn-tool-retrieval.js';
import { withoutLockedHandoffs } from '../../tools/handoff/locked-handoffs.js';
import {
  teamStatusNote,
  unlockViewFor,
  withoutLockedTeammateNotes,
  withTeammateAsk,
} from '../../tools/handoff/locked-teammates.js';
import { heardTeammateNote } from '../../tools/handoff/teammate-names.js';
import { teammateIdentityNote } from './teammate-identity.js';
import { agentWordsIn, teamByNeedNote } from '../../tools/handoff/team-by-need-note.js';
import { asAnswer, isAnswerTurn } from './answer-turn.js';
import { packetReminder } from './context-packet/turn-packet.js';
import { retrievedTools, withSameTurnTools } from './turn-request-tools.js';
import { correctionNotesFor } from './correction-repair.js';
import { formatNotes, getDirector } from './director-notes.js';
import { noteReminder } from '../shared/turn-receipt-session.js';
import { repairNoteFor } from './repair-check.js';
import { ferniStateTurn } from './ferni-state.js';
import { listeningNotes, listeningReply } from './listen-first-turn.js';
import { firstCallNote, isFirstCall } from './first-call-rapport.js';
import { nameCorrectionNote } from './name-correction.js';
import { beatNote, priorCallsOf } from './personal-beats.js';
import { porchLightNote } from './porch-light.js';
import { roomGuestsNote } from './room-guests.js';
import {
  worldFactLinesFor,
  worldFactsNoteFor,
} from '../../intelligence/world-model/temporal/in-call-load.js';
import { gameTurnNote } from '../../services/games/call-game-state.js';
import { quirkTurnNote } from './quirk-note.js';
import { honestFriendNote } from './honest-friend.js';
import { attunementNote } from './turn-attunement.js';
import { getDeliberator } from './deliberation.js';
import { commitmentInviteNote } from './commitment-invite.js';
import { journalAskFor } from './journal-ask.js';
import { callerTurnsOf, goodbyeNoteOn, happyExitNote, questionPaceNote } from './happy-exits.js';
import { noteTurn } from './move-log.js';
import { withPlayful } from './ferni-playful-turn.js';
import { supportHeld } from './turn-candor.js';
import { withCallTrouble, withSupportHold } from './turn-holds.js';
import { isQuietCaller, presentAck, quietCallerEnabled } from './quiet-caller.js';
import { modelSignals, PLAIN_SIGNALS, regexSignals, type TurnSignals } from './turn-extras.js';
import { lengthLearned, recentTurns, textureLearned } from './turn-length.js';
import { callerMove, rngFor, turnShapeEnabled, turnShapeFor, withLiveData } from './turn-shape.js';
import type { TurnShape } from './turn-shape.js';
import {
  understandingFor,
  understandingMode,
  understandingStatusFor,
} from './turn-understanding.js';
import { getWrapUp } from './wrap-up.js';
import {
  TURN_STYLE_REMINDER,
  turnStyleReminderEnabled,
  withTurnStyleReminder,
} from './turn-style.js';
import { burstLine, clearBurstOffer } from './vocal-bursts.js';
import { withHeavyMoment } from './heavy-turn.js';

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

const sessionIdOf = (userData: unknown): string | undefined =>
  (userData as { services?: { sessionId?: string } } | undefined)?.services?.sessionId;

/**
 * A copy of the context with the turn reminder, plus what Ferni has already
 * told on this call, the team line (locked-teammates.ts), and the director's
 * notes for this reply, if any, and without per-turn context built for an
 * earlier turn (turn-intelligence.ts).
 */
export function withTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: { shape?: boolean; closeLoop?: boolean } = {}
): llm.ChatContext {
  const chatCtx = withoutStaleTurnContext(request);
  // An invitation to open with a sound is for one request only (vocal-bursts.ts).
  clearBurstOffer(session);
  const director = getDirector(session);
  const view = unlockViewFor((session as { userData?: unknown }).userData);
  const words = callerWords(chatCtx);
  // Nothing steers back to a locked teammate the caller didn't just name.
  const keep = (text: string): boolean =>
    withoutLockedTeammateNotes([text], view, words).length > 0;
  const offered = director?.current() ?? [];
  // DIRECTOR_ANSWER_TURN_GUARD=on: notes written before they answered Ferni's question are stale.
  const answering = isAnswerTurn(chatCtx.items, words);
  // LISTEN_FIRST=on: a caller low on energy gets no note pushing Ferni to share.
  const notes = answering
    ? ''
    : formatNotes(listeningNotes(offered.filter(keep), chatCtx, session));
  // REPAIR_MODE=on: own a correction, and keep earlier ones; none with crisis guidance.
  const corrected = options.shape !== false ? correctionNotesFor(chatCtx, session) : '';
  // Never with crisis guidance (shape: false): no thought rides a crisis reply.
  const thought = options.shape !== false ? thoughtFor(session, words) : '';
  // How Ferni is doing (FERNI_STATE=on), and if his own story may ride; none in a crisis.
  const state = ferniStateTurn(chatCtx, session, { careful: options.shape === false });
  const style = turnStyleReminderEnabled()
    ? styleFor(chatCtx, session, options.shape !== false, state.ownStory, answering)
    : undefined;
  noteTurn(session, words, style?.turn); // MOVE_OUTCOMES=on (move-log.ts)
  // The style goes last, nearest the reply, where the turn shape is followed best (turn-shape.ts).
  // CONTEXT_PACKET=on carries these same notes, in this order (turn-packet.ts).
  const turnNotes = [
    // Who is speaking (teammate-identity.ts); WORLD_NOW=on: the caller's time now (world-now.ts).
    teammateIdentityNote(view.currentAgentId),
    worldNowNote(session),
    director?.told(keep) ?? '',
    teamStatusNote(view, words),
    // "Naya" in the transcript is Nayan (teammate-names.ts); no "9 may be Nayan" with crisis guidance
    heardTeammateNote(words, options.shape !== false),
    notes,
    corrected,
    options.closeLoop === false ? '' : closeLoopNote(session, words),
    thought,
    // The game on this call, if any (GAME_STATE=on): turn, score, what's been used.
    gameTurnNote(session),
    // A snore, whistle or laugh he did that isn't in his words (QUIRK_AWARENESS=on).
    quirkTurnNote(sessionIdOf((session as { userData?: unknown }).userData), chatCtx, words),
    state.note,
    // PORCH_LIGHT=on: softer and simpler on a call started in the caller's small hours.
    porchLightNote(chatCtx, session, { careful: options.shape === false }),
    // PERSONA_BEATS=on: his life as written, light on a first call, heavy only with history.
    beatNote({
      said: words,
      priorCalls: priorCallsOf((session as { userData?: unknown }).userData),
      careful: options.shape === false,
    }),
    // FIRST_CALL_RAPPORT=on: a new caller's first call (names, a reason to come back)
    firstCallNote(chatCtx, session, words),
    // ROOM_GUESTS=on: someone else is in the room on the same mic (room-guests.ts)
    roomGuestsNote(session, words),
    // NAME_CORRECTION=on: the name they gave for themselves wins over the account's
    nameCorrectionNote(chatCtx, session, words, process.env, {
      verifiedOwner: sessionIsVerifiedOwner,
    }),
    // TEAM_BY_NEED=on: who helps with what, and the teammate this turn calls for, if any
    teamByNeedNote(view.currentAgentId ?? 'ferni', words, agentWordsIn(chatCtx.items)),
    // HONEST_FRIEND=on: no caving, no flattery, glad they have people; none with crisis guidance.
    honestFriendNote(chatCtx, words, { careful: options.shape === false }),
    // With it, if they asked for live data a turn ago ("which city?"): still no made-up answer.
    ...withLiveData(style?.text ?? '', callerTurnsOf(chatCtx)),
    // HAPPY_EXITS=on: after the style, so "no question" beats its question allowance.
    options.shape !== false ? exitFor(chatCtx, session, words) : '',
    // His self-share line after the shape, nearest the reply (ferni-state.ts).
    state.last,
    // ATTUNE=on: how to meet the caller's state (questions, advice, own stories), after the
    // self-share so "no stories of your own" wins for a tired caller. No length (TURN_LENGTH's).
    attunementNote(chatCtx, session, { careful: options.shape === false }),
    // COMMITMENT_INVITE=on: one small step, once a call; after the self-share, so it wins.
    inviteFor(chatCtx, session, words, options.shape === false),
    // DIRECTOR_ESCALATE=on: a note given twice becomes a rule, last but repair; never in crisis.
    options.shape !== false ? (director?.hardRule?.() ?? '') : '',
    // REPAIR_MODE=on: a light check on words that look misheard, last so no "no question"
    // note above cancels it; none with crisis guidance or when they answered Ferni's question.
    options.shape !== false && !answering ? repairNoteFor(chatCtx, session) : '',
  ].filter(Boolean);
  // WORLD_FACTS_IN_CALL=on: where their life stands (in-call-load.ts); nothing when off.
  const caller = callerOf(session);
  const lifeAt = {
    now: Date.now(),
    timeZone: caller?.callerTimezone,
    userName: caller?.userName,
    words,
  };
  const reminder = contextPacketEnabled()
    ? packetReminder(session, words, turnNotes, worldFactLinesFor(caller, lifeAt))
    : [worldFactsNoteFor(caller, lifeAt), ...turnNotes].filter(Boolean).join(' ');
  // What this request carries, for its TURN_RECEIPT (turn-receipt.ts): sizes and counts only.
  noteReminder(session, {
    reminder,
    directorNotes: notes,
    offered: offered.length,
    droppedIdx: offered.flatMap((note, i) => (!answering && keep(note) ? [] : [i])),
  });
  return reminder ? withTurnStyleReminder(chatCtx, reminder) : chatCtx;
}

/**
 * WRAP_UP=on: the caller is signing off after something was settled, so the
 * goodbye closes the loop (wrap-up.ts). Read in code, nothing awaited.
 */
function closeLoopNote(session: object, words: string): string {
  const wrapUp = getWrapUp(session);
  if (!wrapUp || !words) return '';
  return wrapUp.noteFor(words, understandingFor(session, words)?.wantsToEnd === true);
}

interface CallerData {
  personaId?: string;
  userName?: string;
  callerTimezone?: string;
}
const callerOf = (session: object): CallerData | undefined =>
  (session as { userData?: unknown }).userData as CallerData | undefined;

/**
 * DELIBERATION=on: a thought from the background deliberator, if one is ready
 * (deliberation.ts). Never while they are venting or hurting, or while support
 * still comes first after hard news (turn-candor.ts).
 */
function thoughtFor(session: object, said: string): string {
  const deliberator = getDeliberator(session);
  if (!deliberator || !said) return '';
  const { signals, source } = signalsFor(session, said);
  const sig = signals ?? regexSignals(said, callerMove(said));
  // supportHeld first: it records hard news (and counts the turns since) even with CANDOR off.
  const held = supportHeld(session, said, source === 'model' && sig.careful) || sig.careful;
  return deliberator.noteFor(said, held);
}

/** HAPPY_EXITS or SHORT_GOODBYE: the goodbye note when they are wrapping up (happy-exits.ts). */
function exitFor(chatCtx: llm.ChatContext, session: object, said: string): string {
  if (!goodbyeNoteOn() || !said) return '';
  const { signals } = signalsFor(session, said);
  return happyExitNote(session, {
    said,
    callerTurns: callerTurnsOf(chatCtx),
    careful: (signals ?? regexSignals(said, callerMove(said))).careful,
    wantsToEnd: understandingFor(session, said)?.wantsToEnd,
    rng: rngFor(`${callSeed(session)}:exit:${said}`),
  });
}

/** COMMITMENT_INVITE=on: the once-a-call invite or its say-back; then the journal ask (journal-ask.ts). */
function inviteFor(
  chatCtx: llm.ChatContext,
  session: object,
  said: string,
  crisis: boolean
): string {
  if (!said) return '';
  const { signals } = signalsFor(session, said);
  const turn = {
    said,
    callerTurns: callerTurnsOf(chatCtx),
    ferniLines: chatCtx.items.flatMap((i) =>
      i.type === 'message' && i.role === 'assistant' ? [i.textContent ?? ''] : []
    ),
    careful: (signals ?? regexSignals(said, callerMove(said))).careful,
    wantsToEnd: understandingFor(session, said)?.wantsToEnd,
    firstCall: isFirstCall((session as { userData?: unknown }).userData),
  };
  const invite = commitmentInviteNote(session, turn, { crisis });
  const ask = journalAskFor(session, turn, { crisis, invite, phoneOnlyIdentity });
  return [invite, ask].join(' ').trim() || questionPaceNote(turn.ferniLines, { crisis });
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
function styleFor(
  chatCtx: llm.ChatContext,
  session: object,
  shape: boolean,
  ownStory?: boolean,
  answering = false
): { text: string; turn?: TurnShape } {
  const said = shape && turnShapeEnabled() ? latestUserText(chatCtx) : null;
  if (!said) return { text: TURN_STYLE_REMINDER };
  const listening = listeningReply(said, chatCtx, session);
  if (listening) return { text: listening };
  // Seeded per call and words: preemptive and final requests agree; another call may differ.
  const { signals, source } = signalsFor(session, said);
  const held = withSupportHold(session, said, signals, source);
  const sig = answering ? asAnswer(held ?? regexSignals(said, callerMove(said))) : held;
  const told = withRecent(withOwnStory(sig, said, ownStory), said, chatCtx);
  const quiet = withQuiet(told, said, chatCtx);
  const shaped = withHeavyMoment(withPlayful(session, said, quiet), chatCtx);
  const troubled = withCallTrouble(session, said, shaped, source);
  const turn = turnShapeFor(said, rngFor(`${callSeed(session)}:${said}`), undefined, troubled);
  // VOCAL_BURSTS=on: its own draw, so the shape drawn above is unchanged.
  const burst = burstLine(
    session,
    shaped ?? regexSignals(said, callerMove(said)),
    rngFor(`${callSeed(session)}:${said}:burst`)
  );
  // At the moment the reply is asked for: what live mode would have had (shadow too).
  const understood = understandingStatusFor(session, said);
  log.info(
    {
      move: turn.move,
      shape: turn.shape,
      extras: burst ? [...turn.extras, 'vocal_burst'] : turn.extras,
      source,
      understood,
      answering,
    },
    'TURN_SHAPE'
  );
  return { text: burst ? `${turn.reminder} ${burst}` : turn.reminder, turn };
}

/**
 * TURN_LENGTH / TURN_TEXTURE=learned: the turns before this reply, which set its length
 * (turn-length.ts). Spoken words only: per-turn notes ride after a blank line or as a header.
 */
function withRecent(
  signals: TurnSignals | undefined,
  said: string,
  chatCtx: llm.ChatContext
): TurnSignals | undefined {
  if (!lengthLearned() && !textureLearned()) return signals;
  const turns = chatCtx.items.flatMap((item) => {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) return [];
    const text = (item.textContent ?? '').split('\n')[0].trim();
    return text && !text.startsWith(TURN_CONTEXT_HEADER)
      ? [{ ferni: item.role === 'assistant', text }]
      : [];
  });
  return { ...(signals ?? regexSignals(said, callerMove(said))), recent: recentTurns(turns) };
}

/**
 * TURN_UNDERSTANDING=live: the model's reading of the caller decides (plain
 * when it has nothing for these words yet); otherwise the regexes, as before.
 */
export function signalsFor(
  session: object,
  said: string
): { signals: TurnSignals | undefined; source: 'model' | 'plain' | 'regex' } {
  if (understandingMode() !== 'live') return { signals: undefined, source: 'regex' };
  const understood = understandingFor(session, said);
  return understood
    ? { signals: modelSignals(understood), source: 'model' }
    : { signals: PLAIN_SIGNALS, source: 'plain' };
}

/** FERNI_STATE=on: his state's say on a story of his own rides with the signals (ferni-state.ts). */
function withOwnStory(
  signals: TurnSignals | undefined,
  said: string,
  ownStory: boolean | undefined
): TurnSignals | undefined {
  if (ownStory === undefined) return signals;
  return { ...(signals ?? regexSignals(said, callerMove(said))), ownStory };
}

/**
 * QUIET_CALLER=on: a caller saying very little gets room, not advice
 * (quiet-caller.ts); "I'm still here" reads as an ack.
 */
function withQuiet(
  signals: TurnSignals | undefined,
  said: string,
  chatCtx: llm.ChatContext
): TurnSignals | undefined {
  if (!quietCallerEnabled()) return signals;
  const sig = signals ?? regexSignals(said, callerMove(said));
  const quiet = isQuietCaller(callerTurnsOf(chatCtx));
  const move = presentAck(said) ? 'ack' : sig.move;
  return quiet || move !== sig.move ? { ...sig, move, quiet } : sig;
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
  if (staticCoreToolsEnabled()) withPinnedTools(toolCtx, state.agent);
  else withSameTurnTools(session, chatCtx, toolCtx); // TOOLS_SAME_TURN: this turn's topic tools
  const view = unlockViewFor(session.userData);
  const allowed = phoneOnlyIdentity(sessionIdOf(session.userData))
    ? await withoutAccountTools(toolCtx, state)
    : toolCtx;
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
  return retrievedTools(session, chatCtx, withTeammateAsk(unlocked, view));
}

/**
 * A caller known only by their phone number: every tool not on the phone-safe
 * allowlist leaves the request and the agent itself, so a call to one can't
 * run (phone-safe-tools.ts).
 */
interface ToolHolder {
  readonly toolCtx: llm.ToolContext;
  updateTools(tools: llm.ToolContext): Promise<void>;
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

/**
 * TOOL_CORE_STATIC: tools findTools added to the agent mid-reply go into the
 * reply's own tool context, which the SDK runs the reply's next step against.
 */
export function withPinnedTools(toolCtx: llm.ToolContext, agent: object | undefined): void {
  const own = (agent as Partial<ToolHolder> | undefined)?.toolCtx?.functionTools;
  if (!own) return;
  const added = Object.entries(own)
    .filter(([name]) => !(name in toolCtx.functionTools))
    .map(([, tool]) => tool);
  if (added.length > 0) toolCtx.updateTools([...toolCtx.tools, ...added]);
}
