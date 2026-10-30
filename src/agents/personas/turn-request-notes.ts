/**
 * The notes one turn's reminder carries, in the order they ride (turn-request.ts). Each is built
 * behind its own catch (turn-note-guard.ts): one builder that throws drops that note only, and a
 * dropped identity, owner or privacy note puts the unverified-speaker default in its place.
 */

import type { llm } from '@livekit/agents';

import { lastFerniLine, minorCareNote } from '../../utils/minor-care.js';
import { worldNowNote } from '../shared/world-now.js';
import { confirmedActionNote } from '../../tools/domains/communication/outreach/outreach-confirm.js';
import { heardTeammateNote } from '../../tools/handoff/teammate-names.js';
import { teammateIdentityNote } from './teammate-identity.js';
import { personaVoiceNote } from './persona-voice.js';
import { agentWordsIn, teamByNeedNote } from '../../tools/handoff/team-by-need-note.js';
import { chiefOfStaffNote, lastAgentWordsIn } from '../../tools/handoff/chief-of-staff-note.js';
import { attunementNote } from './turn-attunement.js';
import { repairNoteFor } from './repair-check.js';
import { type StateTurn } from './ferni-state.js';
import { firstCallNote, isFirstCall } from './first-call-rapport.js';
import {
  inReturningCallerFlow,
  returningCallerTurnNote,
} from '../../services/identity/returning-caller.js';
import {
  accountMayKeepName,
  lastAgentLine,
  nameCorrectionNote,
  statedName,
} from './name-correction.js';
import { callMeNote } from './call-me-note.js';
import { beatNote, priorCallsOf } from './personal-beats.js';
import { porchLightNote } from './porch-light.js';
import { roomGuestsNote } from './room-guests.js';
import { gameTurnNote } from '../../services/games/call-game-state.js';
import { quirkTurnNote } from './quirk-note.js';
import { friendNotes } from './friend-tease.js';
import { tuneTurnNote } from './named-tune-note.js';
import { internalsNote, pushesInternals, type InternalsTurn } from './no-invented-internals.js';
import { getDeliberator } from './deliberation.js';
import { commitmentInviteNote } from './commitment-invite.js';
import { journalAskFor } from './journal-ask.js';
import { callerTurnsOf, goodbyeNoteOn, happyExitNote, questionPaceNote } from './happy-exits.js';
import { callerSetsDepthNote } from './caller-sets-depth.js';
import { goodNewsNote } from './good-news-bigger.js';
import { supportHeld } from './turn-candor.js';
import { regexSignals } from './turn-extras.js';
import { callerMove, rngFor, withLiveData } from './turn-shape.js';
import { understandingFor } from './turn-understanding.js';
import { getWrapUp } from './wrap-up.js';
import { callSeed, signalsFor, type styleFor } from './turn-request-style.js';
import type { getDirector } from './director-notes.js';
import type { NoteGuard } from './turn-note-guard.js';

/** What the turn's notes are built from: the prelude of buildTurnReminder (turn-request.ts). */
export interface TurnNoteInputs {
  chatCtx: llm.ChatContext;
  session: object;
  words: string;
  /** Crisis guidance rides this reply: no shaping, no extras. */
  crisis: boolean;
  closeLoop: boolean;
  plain: boolean;
  sessionId: string | undefined;
  view: { readonly currentAgentId?: string };
  /** The team line (locked-teammates.ts), passed in with the identity checks below: both live in higher layers. */
  teamStatus: () => string;
  verifiedOwner: (sessionId: string) => boolean;
  phoneOnly: (sessionId: string | undefined) => boolean;
  director: ReturnType<typeof getDirector>;
  keep: (text: string) => boolean;
  answering: boolean;
  internals: InternalsTurn;
  /** Director's notes, formatted. */
  notes: string;
  corrected: string;
  thought: string;
  state: StateTurn;
  style: ReturnType<typeof styleFor> | undefined;
}

/** The notes, oldest first, the style nearest the reply (turn-shape.ts); CONTEXT_PACKET=on carries these same notes. */
export function turnNotesFor(t: TurnNoteInputs, guard: NoteGuard): string[] {
  const { chatCtx, session, words, crisis, plain, sessionId, view, director, answering } = t;
  const userData = (session as { userData?: unknown }).userData;
  // One catch per note; `id` marks a note about who is speaking or what may be shared.
  const n = (name: string, build: () => string): string => guard.run(name, build, '');
  const id = (name: string, build: () => string): string =>
    guard.run(name, build, '', { identity: true });
  const many = (name: string, build: () => string[]): string[] => guard.run(name, build, []);
  const list = [
    // Who is speaking (teammate-identity.ts); WORLD_NOW=on: the caller's time now (world-now.ts).
    n('teammateIdentity', () => teammateIdentityNote(view.currentAgentId, process.env, plain)),
    id('worldNow', () => worldNowNote(session, new Date(), { items: chatCtx.items, words })),
    n('director', () => director?.told(t.keep) ?? ''),
    n('teamStatus', t.teamStatus),
    // "Naya" in the transcript is Nayan (teammate-names.ts)
    n('heardTeammate', () => heardTeammateNote(words)),
    t.notes,
    t.corrected,
    // The caller said yes to a read-back: the call or text goes only when the tool is called now.
    id('confirmedAction', () => confirmedActionNote(session)),
    n('closeLoop', () => (t.closeLoop ? closeLoopNote(session, words) : '')),
    t.thought,
    // The game on this call, if any (GAME_STATE=on): turn, score, what's been used.
    n('gameTurn', () => gameTurnNote(session, process.env, words)),
    // A snore, whistle or laugh he did that isn't in his words (QUIRK_AWARENESS=on).
    n('quirk', () =>
      quirkTurnNote(sessionId, chatCtx, words, {
        mood: callerOf(session)?.voiceEmotion?.primary,
        careful: crisis,
      })
    ),
    // NAMED_TUNE=on: they noticed the whistle (name it?), or asked him to stop (named-tune-note.ts).
    id('namedTune', () => tuneTurnNote(session, words, crisis, t.verifiedOwner)),
    t.state.note,
    // PORCH_LIGHT=on: softer and simpler on a call started in the caller's small hours.
    n('porchLight', () => porchLightNote(chatCtx, session, { careful: crisis })),
    // MINOR_CARE=on: a caller who sounds under 18 (minor-care.ts), never with crisis guidance; shadow only logs.
    id('minorCare', () =>
      minorCareNote(sessionId, words, { careful: crisis, asked: lastFerniLine(chatCtx.items) })
    ),
    // PERSONA_BEATS=on: his life as written, light on a first call, heavy only with history.
    n('beat', () => beatNote({ said: words, priorCalls: priorCallsOf(userData), careful: crisis })),
    // FIRST_CALL_RAPPORT=on: a new caller's first call; RETURNING_CALLER=on: not for one who may
    // have called before; "forget me", or the topic hint once they confirm (returning-caller.ts)
    id('firstCall', () =>
      inReturningCallerFlow(sessionId)
        ? ''
        : firstCallNote(chatCtx, session, words, process.env, plain)
    ),
    id('returningCaller', () =>
      returningCallerTurnNote(sessionId, words, lastAgentLine(chatCtx), (w, a) =>
        statedName(w, undefined, a)
      )
    ),
    // ROOM_GUESTS=on: someone else is in the room on the same mic (room-guests.ts)
    id('roomGuests', () => roomGuestsNote(session, words, process.env, plain)),
    // NAME_CORRECTION=on: the name they gave for themselves wins over the account's
    id('nameCorrection', () =>
      nameCorrectionNote(chatCtx, session, words, process.env, {
        verifiedOwner: t.verifiedOwner,
        plain,
      })
    ),
    // CALL_ME_VOCATIVE=on: "call me, Ferni" rings; "call me Fern" is asked about (call-me-note.ts)
    id('callMe', () =>
      callMeNote(chatCtx, session, words, {
        plain,
        careful: crisis,
        owner: nameOwner(session, crisis, t.verifiedOwner),
      })
    ),
    // TEAM_BY_NEED=on: who helps with what, and the teammate this turn calls for, if any
    n('teamByNeed', () =>
      teamByNeedNote(view.currentAgentId ?? 'ferni', words, agentWordsIn(chatCtx.items))
    ),
    // ALEX_CHIEF_OF_STAFF=on: todos, goals, calendar and agenda go to Alex (chief-of-staff-note.ts)
    n('chiefOfStaff', () =>
      chiefOfStaffNote(
        view.currentAgentId ?? 'ferni',
        words,
        lastAgentWordsIn(chatCtx.items),
        plain
      )
    ),
    // HONEST_FRIEND=on (no caving or flattery), FRIEND_TEASE=on (teasing earned); not in crisis.
    ...many('friends', () => friendNotes(chatCtx, session, words, crisis)),
    // NO_INVENTED_INTERNALS=on: "I don't know how that part works" is the whole answer.
    n('internals', () => internalsNote(t.internals)),
    // With it, if they asked for live data a turn ago ("which city?"): still no made-up answer.
    ...many('liveData', () => withLiveData(t.style?.text ?? '', callerTurnsOf(chatCtx))),
    // PERSONA_VOICE=on: how this persona sounds, after the shared style so it wins (persona-voice.ts).
    n('personaVoice', () => personaVoiceNote(view.currentAgentId, { careful: crisis })),
    // HAPPY_EXITS=on: after the style, so "no question" beats its question allowance.
    n('exit', () => (crisis ? '' : exitFor(chatCtx, session, words, plain))),
    // His self-share line after the shape, nearest the reply (ferni-state.ts).
    t.state.last,
    // ATTUNE=on: how to meet the caller's state (questions, advice, own stories), after the
    // self-share so "no stories of your own" wins for a tired caller. No length (TURN_LENGTH's).
    n('attunement', () => attunementNote(chatCtx, session, { careful: crisis })),
    // COMMITMENT_INVITE=on: one small step, once a call; after the self-share, so it wins.
    n('invite', () => inviteFor(chatCtx, session, words, crisis, t.phoneOnly)),
    // GOOD_NEWS_BIGGER=on: own words, no echo, one question about the moment; after the pace note.
    n('goodNews', () => goodNewsNote(words, callerTurnsOf(chatCtx), { crisis, session })),
    // CALLER_SETS_DEPTH=on: they played heavy news down; take their lead (caller-sets-depth.ts).
    n('callerSetsDepth', () => callerSetsDepthNote(words, callerTurnsOf(chatCtx), { crisis })),
    // DIRECTOR_ESCALATE=on: a note given twice becomes a rule, last but repair; never in crisis.
    n('hardRule', () => (crisis ? '' : hardRuleFor(director?.hardRule?.() ?? '', t.internals))),
    // REPAIR_MODE=on: a light check on words that look misheard, last so no "no question"
    // note above cancels it; none with crisis guidance or when they answered Ferni's question.
    n('repair', () =>
      !crisis && !answering ? repairNoteFor(chatCtx, session, process.env, plain) : ''
    ),
  ];
  return [guard.fallbackNote(), ...list].filter(Boolean);
}

/**
 * The verified owner is on the line: rememberName may rename the account (remember-name.ts).
 * Never on a crisis turn, and a check that throws is "not the owner": it must never cost the
 * turn its reply (crisis-event-record.test.ts, every dependency throwing).
 */
const nameOwner = (
  session: object,
  crisis: boolean,
  verifiedOwner: (sessionId: string) => boolean
): boolean => {
  if (crisis) return false;
  try {
    return accountMayKeepName(session, verifiedOwner);
  } catch {
    return false;
  }
};

export const sessionIdOf = (userData: unknown): string | undefined =>
  (userData as { services?: { sessionId?: string } } | undefined)?.services?.sessionId;

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
export const callerOf = (session: object): CallerData | undefined =>
  (session as { userData?: unknown }).userData as CallerData | undefined;

/**
 * DELIBERATION=on: a thought from the background deliberator, if one is ready
 * (deliberation.ts). Never while they are venting or hurting, or while support
 * still comes first after hard news (turn-candor.ts).
 */
export function thoughtFor(session: object, said: string): string {
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
  crisis: boolean,
  phoneOnly: (sessionId: string | undefined) => boolean
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
  const ask = journalAskFor(session, turn, { crisis, invite, phoneOnlyIdentity: phoneOnly });
  const sessionId = sessionIdOf((session as { userData?: unknown }).userData);
  return [invite, ask].join(' ').trim() || questionPaceNote(turn.ferniLines, { crisis, sessionId });
}
