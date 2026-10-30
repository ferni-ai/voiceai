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
  unlockViewFor,
  withoutLockedTeammateNotes,
  withTeammateAsk,
} from '../../tools/handoff/locked-teammates.js';
import { agentWordsIn } from '../../tools/handoff/team-by-need-note.js';
import { lastAgentWordsIn } from '../../tools/handoff/chief-of-staff-note.js';
import { isAnswerTurn } from './answer-turn.js';
import { packetReminder } from './context-packet/turn-packet.js';
import { retrievedTools, withPinnedTools, withSameTurnTools } from './turn-request-tools.js';
import { getDirector } from './director-notes.js';
import { isFirstCall } from './first-call-rapport.js';
import { accountMayKeepName, lastAgentLine, statedName } from './name-correction.js';
import { priorCallsOf } from './personal-beats.js';
import {
  worldFactLinesFor,
  worldFactsNoteFor,
} from '../../intelligence/world-model/temporal/in-call-load.js';
import { internalsIntentFor } from './internals-intent.js';
import { pushesInternals, type InternalsTurn } from './no-invented-internals.js';
import { getDeliberator } from './deliberation.js';
import { commitmentInviteNote } from './commitment-invite.js';
import { journalAskFor } from './journal-ask.js';
import { callerTurnsOf, goodbyeNoteOn, happyExitNote, questionPaceNote } from './happy-exits.js';
import { supportHeld } from './turn-candor.js';
import { regexSignals } from './turn-extras.js';
import { callerMove, rngFor } from './turn-shape.js';
import { understandingFor } from './turn-understanding.js';
import { getWrapUp } from './wrap-up.js';
import { turnStyleReminderEnabled, withTurnStyleReminder } from './turn-style.js';
import { callSeed, signalsFor } from './turn-request-style.js';
import { scriptFreeOn } from './script-free.js';
import * as safe from './turn-notes-guarded.js';
import { attempt, fallbackNote, guardedTurn } from './turn-note-guard.js';

/**
 * The verified owner is on the line: rememberName may rename the account (remember-name.ts).
 * Never on a crisis turn, and a check that throws is "not the owner": it must never cost the
 * turn its reply (crisis-event-record.test.ts, every dependency throwing).
 */
const nameOwner = (session: object, crisis: boolean): boolean => {
  if (crisis) return false;
  try {
    return accountMayKeepName(session, sessionIsVerifiedOwner);
  } catch {
    return false;
  }
};

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
const userIdOf = (userData: unknown): string | undefined =>
  (userData as { userId?: string } | undefined)?.userId;

/**
 * The request with this turn's notes. Never throws: when a note builder does, the turn gets
 * the request without that note (turn-notes-guarded.ts) rather than no reply at all. gatedReply
 * adds crisis guidance after this, so a guided turn keeps it (2026-10-29: an owner check threw
 * on a crisis turn, #2996). A dropped identity, owner or privacy note puts the unverified-speaker
 * default in its place, so a failure never reads as a verified caller (#3077).
 */
export function withTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: TurnReminderOptions = {}
): llm.ChatContext {
  const sessionId = sessionIdOf((session as { userData?: unknown }).userData);
  return guardedTurn(log, sessionId, request, () => buildTurnReminder(request, session, options));
}

type TurnReminderOptions = { shape?: boolean; closeLoop?: boolean };

/**
 * A copy of the context with the turn reminder, plus what Ferni has already
 * told on this call, the team line (locked-teammates.ts), and the director's
 * notes for this reply, if any, and without per-turn context built for an
 * earlier turn (turn-intelligence.ts).
 */
function buildTurnReminder(
  request: llm.ChatContext,
  session: object,
  options: TurnReminderOptions
): llm.ChatContext {
  const chatCtx = withoutStaleTurnContext(request);
  // An invitation to open with a sound is for one request only (vocal-bursts.ts).
  safe.clearBurstOffer(session);
  const director = getDirector(session);
  const view = unlockViewFor((session as { userData?: unknown }).userData);
  const words = callerWords(chatCtx);
  // SCRIPT_FREE_REMINDER=on: no shared style or quoted lines; never on a crisis turn (script-free.ts).
  const crisis = options.shape === false;
  const plain = !crisis && scriptFreeOn();
  const sessionId = sessionIdOf((session as { userData?: unknown }).userData);
  // NO_INVENTED_INTERNALS=on: asked how he's built after a tool failed, or he just made it up.
  const internals = crisis
    ? ''
    : safe.internalsTurn(chatCtx.items, words, process.env, internalsIntentFor(session, words));
  // Nothing steers back to a locked teammate the caller didn't just name, or into his internals.
  const keep = (text: string): boolean =>
    withoutLockedTeammateNotes([text], view, words).length > 0 && !pushesInternals(internals, text);
  const offered = director?.current() ?? [];
  // DIRECTOR_ANSWER_TURN_GUARD=on: notes written before they answered Ferni's question are stale.
  const answering = isAnswerTurn(chatCtx.items, words);
  // LISTEN_FIRST=on: a caller low on energy gets no note pushing Ferni to share.
  const notes = answering
    ? ''
    : safe.formatNotes(safe.listeningNotes(offered.filter(keep), chatCtx, session));
  // REPAIR_MODE=on: own a correction, and keep earlier ones; none with crisis guidance.
  const corrected = crisis ? '' : safe.correctionNotesFor(chatCtx, session, process.env, plain);
  // Never with crisis guidance (shape: false): no thought rides a crisis reply.
  const thought =
    options.shape !== false ? attempt('thought', () => thoughtFor(session, words), '') : '';
  // How Ferni is doing (FERNI_STATE=on), and if his own story may ride; none in a crisis.
  const state = safe.ferniStateTurn(chatCtx, session, { careful: options.shape === false });
  const style = turnStyleReminderEnabled()
    ? safe.styleFor(chatCtx, session, options.shape !== false, state, { answering, plain })
    : undefined;
  safe.noteTurn(session, words, style?.turn); // MOVE_OUTCOMES=on (move-log.ts)
  // The style goes last, nearest the reply, where the turn shape is followed best (turn-shape.ts).
  // CONTEXT_PACKET=on carries these same notes, in this order (turn-packet.ts).
  const turnNotes = [
    // Who is speaking (teammate-identity.ts); WORLD_NOW=on: the caller's time now (world-now.ts).
    safe.teammateIdentityNote(view.currentAgentId, process.env, plain),
    safe.worldNowNote(session, new Date(), { items: chatCtx.items, words }), // HOUR_ONCE: hour-once.ts
    attempt('director', () => director?.told(keep) ?? '', ''),
    safe.teamStatusNote(view, words),
    // "Naya" is Nayan; "9" may be (never near a crisis, or for a locked teammate): teammate-names.ts
    safe.heardTeammateNote(
      words,
      safe.aliasNoteFor(view, session, chatCtx, options.shape === false)
    ),
    notes,
    corrected,
    // The caller said yes to a read-back: the call or text goes only when the tool is called now.
    safe.confirmedActionNote(session),
    options.closeLoop === false
      ? ''
      : attempt('closeLoop', () => closeLoopNote(session, words), ''),
    thought,
    // The game on this call, if any (GAME_STATE=on): turn, score, what's been used.
    safe.gameTurnNote(session, process.env, words),
    // A snore, whistle or laugh he did that isn't in his words (QUIRK_AWARENESS=on).
    safe.quirkTurnNote(sessionId, chatCtx, words, {
      mood: callerOf(session)?.voiceEmotion?.primary,
      careful: crisis,
    }),
    // NAMED_TUNE=on: they noticed the whistle (name it?), or asked him to stop (named-tune-note.ts).
    safe.tuneTurnNote(session, words, options.shape === false, sessionIsVerifiedOwner),
    state.note,
    // PORCH_LIGHT=on: softer and simpler on a call started in the caller's small hours.
    safe.porchLightNote(chatCtx, session, { careful: options.shape === false }),
    // MINOR_CARE=on: a caller who sounds under 18 (minor-care.ts), never with crisis guidance; shadow only logs.
    safe.minorCareNote(sessionIdOf((session as { userData?: unknown }).userData), words, {
      careful: options.shape === false,
      asked: lastFerniLine(chatCtx.items),
    }),
    // PERSONA_BEATS=on: his life as written, light on a first call, heavy only with history.
    safe.beatNote({
      said: words,
      priorCalls: priorCallsOf((session as { userData?: unknown }).userData),
      careful: options.shape === false,
    }),
    // FIRST_CALL_RAPPORT=on: a new caller's first call; RETURNING_CALLER=on: not for one who may
    // have called before; "forget me", or the topic hint once they confirm (returning-caller.ts)
    safe.inReturningCallerFlow(sessionId)
      ? ''
      : safe.firstCallNote(chatCtx, session, words, process.env, plain),
    safe.returningCallerTurnNote(sessionId, words, lastAgentLine(chatCtx), (w, a) =>
      statedName(w, undefined, a)
    ),
    // ROOM_GUESTS=on: someone else is in the room on the same mic (room-guests.ts)
    safe.roomGuestsNote(session, words, process.env, plain),
    // NAME_CORRECTION=on: the name they gave for themselves wins over the account's
    safe.nameCorrectionNote(chatCtx, session, words, process.env, {
      verifiedOwner: sessionIsVerifiedOwner,
      plain,
    }),
    // CALL_ME_VOCATIVE=on: "call me, Ferni" rings; "call me Fern" is asked about (call-me-note.ts)
    safe.callMeNote(chatCtx, session, words, {
      plain,
      careful: crisis,
      owner: nameOwner(session, crisis),
    }),
    // TEAM_BY_NEED=on: who helps with what, and the teammate this turn calls for, if any
    safe.teamByNeedNote(view.currentAgentId ?? 'ferni', words, agentWordsIn(chatCtx.items)),
    // ALEX_CHIEF_OF_STAFF=on: todos, goals, calendar and agenda go to Alex (chief-of-staff-note.ts)
    safe.chiefOfStaffNote(
      view.currentAgentId ?? 'ferni',
      words,
      lastAgentWordsIn(chatCtx.items),
      plain
    ),
    // HONEST_FRIEND=on (no caving or flattery), FRIEND_TEASE=on (teasing earned); not in crisis.
    ...safe.friendNotes(chatCtx, session, words, options.shape === false),
    // NO_INVENTED_INTERNALS=on: "I don't know how that part works" is the whole answer.
    safe.internalsNote(internals),
    // With it, if they asked for live data a turn ago ("which city?"): still no made-up answer.
    ...safe.withLiveData(style?.text ?? '', callerTurnsOf(chatCtx)),
    // PERSONA_VOICE=on: how this persona sounds, after the shared style so it wins (persona-voice.ts).
    safe.personaVoiceNote(view.currentAgentId, { careful: options.shape === false }),
    // HAPPY_EXITS=on: after the style, so "no question" beats its question allowance.
    options.shape !== false
      ? attempt('exit', () => exitFor(chatCtx, session, words, plain), '')
      : '',
    // His self-share line after the shape, nearest the reply (ferni-state.ts).
    state.last,
    // ATTUNE=on: how to meet the caller's state (questions, advice, own stories), after the
    // self-share so "no stories of your own" wins for a tired caller. No length (TURN_LENGTH's).
    safe.attunementNote(chatCtx, session, { careful: options.shape === false }),
    // COMMITMENT_INVITE=on: one small step, once a call; after the self-share, so it wins.
    attempt('invite', () => inviteFor(chatCtx, session, words, options.shape === false), ''),
    // GOOD_NEWS_BIGGER=on: own words, no echo, one question about the moment; after the pace note.
    safe.goodNewsNote(words, callerTurnsOf(chatCtx), { crisis: options.shape === false, session }),
    // CALLER_SETS_DEPTH=on: they played heavy news down; take their lead (caller-sets-depth.ts).
    safe.callerSetsDepthNote(words, callerTurnsOf(chatCtx), { crisis: options.shape === false }),
    // DIRECTOR_ESCALATE=on: a note given twice becomes a rule, last but repair; never in crisis.
    options.shape !== false
      ? attempt('hardRule', () => hardRuleFor(director?.hardRule?.() ?? '', internals), '')
      : '',
    // REPAIR_MODE=on: a light check on words that look misheard, last so no "no question"
    // note above cancels it; none with crisis guidance or when they answered Ferni's question.
    !crisis && !answering ? safe.repairNoteFor(chatCtx, session, process.env, plain) : '',
  ].filter(Boolean);
  // WORLD_FACTS_IN_CALL=on: where their life stands (in-call-load.ts); nothing when off. About the
  // caller, so a failure counts as a dropped identity note.
  const caller = callerOf(session);
  const lifeAt = {
    now: Date.now(),
    timeZone: caller?.callerTimezone,
    userName: caller?.userName,
    words,
  };
  const packet = contextPacketEnabled();
  const facts = attempt(
    'worldFacts',
    () => (packet ? worldFactLinesFor(caller, lifeAt) : [worldFactsNoteFor(caller, lifeAt)]),
    [] as string[],
    true
  );
  // A dropped identity, owner or privacy note: until it can be built, the speaker is unverified.
  const unverified = fallbackNote();
  if (unverified) turnNotes.unshift(unverified);
  const joined = [...facts, ...turnNotes].filter(Boolean).join(' ');
  const reminder = packet
    ? attempt('packet', () => packetReminder(session, words, turnNotes, facts), joined)
    : joined;
  // What this request carries, for its TURN_RECEIPT (turn-receipt.ts): sizes and counts only.
  safe.noteReminder(session, {
    reminder,
    directorNotes: notes,
    offered: offered.length,
    droppedIdx: offered.flatMap((note, i) => (!answering && keep(note) ? [] : [i])),
  });
  return reminder ? withTurnStyleReminder(chatCtx, reminder) : chatCtx;
}

/** A note given twice, unless it pushes him into his internals (no-invented-internals.ts). */
const hardRuleFor = (rule: string, internals: InternalsTurn): string =>
  pushesInternals(internals, rule) ? '' : rule;

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
  voiceEmotion?: { primary?: string };
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
function exitFor(chatCtx: llm.ChatContext, session: object, said: string, plain = false): string {
  if (!goodbyeNoteOn() || !said) return '';
  const { signals } = signalsFor(session, said);
  return happyExitNote(session, {
    said,
    callerTurns: callerTurnsOf(chatCtx),
    careful: (signals ?? regexSignals(said, callerMove(said))).careful,
    wantsToEnd: understandingFor(session, said)?.wantsToEnd,
    rng: rngFor(`${callSeed(session)}:exit:${said}`),
    scriptFree: plain,
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
  const sessionId = sessionIdOf((session as { userData?: unknown }).userData);
  return [invite, ask].join(' ').trim() || questionPaceNote(turn.ferniLines, { crisis, sessionId });
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
