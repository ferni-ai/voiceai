/**
 * The note builders turn-request.ts calls, each behind its own catch (turn-note-guard.ts): one that
 * throws gives '' (or []) and the turn goes on without that note. Those marked `true` are about
 * who is speaking or what may be shared: when one fails the turn carries the unverified-speaker
 * default (#3077). Same names and signatures as the originals, so call sites read as before.
 */

import { worldNowNote as raw_worldNowNote } from '../shared/world-now.js';
import { confirmedActionNote as raw_confirmedActionNote } from '../../tools/domains/communication/outreach/outreach-confirm.js';
import { tuneTurnNote as raw_tuneTurnNote } from './named-tune-note.js';
import { minorCareNote as raw_minorCareNote } from '../../utils/minor-care.js';
import {
  inReturningCallerFlow as raw_inReturningCallerFlow,
  returningCallerTurnNote as raw_returningCallerTurnNote,
} from '../../services/identity/returning-caller.js';
import { firstCallNote as raw_firstCallNote } from './first-call-rapport.js';
import { roomGuestsNote as raw_roomGuestsNote } from './room-guests.js';
import { nameCorrectionNote as raw_nameCorrectionNote } from './name-correction.js';
import { callMeNote as raw_callMeNote } from './call-me-note.js';
import { teammateIdentityNote as raw_teammateIdentityNote } from './teammate-identity.js';
import {
  aliasNoteFor as raw_aliasNoteFor,
  teamStatusNote as raw_teamStatusNote,
} from '../../tools/handoff/locked-teammates.js';
import { heardTeammateNote as raw_heardTeammateNote } from '../../tools/handoff/teammate-names.js';
import { correctionNotesFor as raw_correctionNotesFor } from './correction-repair.js';
import { gameTurnNote as raw_gameTurnNote } from '../../services/games/call-game-state.js';
import { quirkTurnNote as raw_quirkTurnNote } from './quirk-note.js';
import { porchLightNote as raw_porchLightNote } from './porch-light.js';
import { beatNote as raw_beatNote } from './personal-beats.js';
import { teamByNeedNote as raw_teamByNeedNote } from '../../tools/handoff/team-by-need-note.js';
import { chiefOfStaffNote as raw_chiefOfStaffNote } from '../../tools/handoff/chief-of-staff-note.js';
import { friendNotes as raw_friendNotes } from './friend-tease.js';
import {
  internalsTurn as raw_internalsTurn,
  internalsNote as raw_internalsNote,
} from './no-invented-internals.js';
import { withLiveData as raw_withLiveData } from './turn-shape.js';
import { personaVoiceNote as raw_personaVoiceNote } from './persona-voice.js';
import { attunementNote as raw_attunementNote } from './turn-attunement.js';
import { goodNewsNote as raw_goodNewsNote } from './good-news-bigger.js';
import { callerSetsDepthNote as raw_callerSetsDepthNote } from './caller-sets-depth.js';
import { repairNoteFor as raw_repairNoteFor } from './repair-check.js';
import { formatNotes as raw_formatNotes } from './director-notes.js';
import { listeningNotes as raw_listeningNotes } from './listen-first-turn.js';
import { ferniStateTurn as raw_ferniStateTurn } from './ferni-state.js';
import { styleFor as raw_styleFor } from './turn-request-style.js';
import { noteTurn as raw_noteTurn } from './move-log.js';
import { clearBurstOffer as raw_clearBurstOffer } from './vocal-bursts.js';
import { noteReminder as raw_noteReminder } from '../shared/turn-receipt-session.js';
import { guarded } from './turn-note-guard.js';

export const worldNowNote = guarded('worldNow', raw_worldNowNote, '', true);
export const confirmedActionNote = guarded('confirmedAction', raw_confirmedActionNote, '', true);
export const tuneTurnNote = guarded('namedTune', raw_tuneTurnNote, '', true);
export const minorCareNote = guarded('minorCare', raw_minorCareNote, '', true);
export const inReturningCallerFlow = guarded(
  'returningFlow',
  raw_inReturningCallerFlow,
  true,
  true
);
export const returningCallerTurnNote = guarded(
  'returningCaller',
  raw_returningCallerTurnNote,
  '',
  true
);
export const firstCallNote = guarded('firstCall', raw_firstCallNote, '', true);
export const roomGuestsNote = guarded('roomGuests', raw_roomGuestsNote, '', true);
export const nameCorrectionNote = guarded('nameCorrection', raw_nameCorrectionNote, '', true);
export const callMeNote = guarded('callMe', raw_callMeNote, '', true);
export const teammateIdentityNote = guarded('teammateIdentity', raw_teammateIdentityNote, '');
export const aliasNoteFor = guarded('aliasNote', raw_aliasNoteFor, false);
export const teamStatusNote = guarded('teamStatus', raw_teamStatusNote, '');
export const heardTeammateNote = guarded('heardTeammate', raw_heardTeammateNote, '');
export const correctionNotesFor = guarded('corrections', raw_correctionNotesFor, '');
export const gameTurnNote = guarded('gameTurn', raw_gameTurnNote, '');
export const quirkTurnNote = guarded('quirk', raw_quirkTurnNote, '');
export const porchLightNote = guarded('porchLight', raw_porchLightNote, '');
export const beatNote = guarded('beat', raw_beatNote, '');
export const teamByNeedNote = guarded('teamByNeed', raw_teamByNeedNote, '');
export const chiefOfStaffNote = guarded('chiefOfStaff', raw_chiefOfStaffNote, '');
export const friendNotes = guarded('friends', raw_friendNotes, [] as string[]);
export const internalsTurn = guarded('internalsTurn', raw_internalsTurn, '' as const);
export const internalsNote = guarded('internals', raw_internalsNote, '');
export const withLiveData = guarded('liveData', raw_withLiveData, ['', '']);
export const personaVoiceNote = guarded('personaVoice', raw_personaVoiceNote, '');
export const attunementNote = guarded('attunement', raw_attunementNote, '');
export const goodNewsNote = guarded('goodNews', raw_goodNewsNote, '');
export const callerSetsDepthNote = guarded('callerSetsDepth', raw_callerSetsDepthNote, '');
export const repairNoteFor = guarded('repair', raw_repairNoteFor, '');
export const formatNotes = guarded('directorNotes', raw_formatNotes, '');
export const listeningNotes = guarded('listening', raw_listeningNotes, [] as string[]);
export const ferniStateTurn = guarded('ferniState', raw_ferniStateTurn, { note: '', last: '' });
export const styleFor = guarded('style', raw_styleFor, { text: '' });
export const noteTurn = guarded('moveLog', raw_noteTurn, undefined);
export const clearBurstOffer = guarded('burstOffer', raw_clearBurstOffer, undefined);
export const noteReminder = guarded('receipt', raw_noteReminder, undefined);
