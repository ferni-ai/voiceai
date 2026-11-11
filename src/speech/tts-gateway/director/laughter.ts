/**
 * The laughter lever (follows SPEECH_DIRECTOR): `[laughter]` is the
 * one nonverbal Cartesia documents, so the Director may add it to the text.
 *
 * It does not invent a policy. The decision is the existing one in
 * speech/adaptive-ssml/contextual-laughter.ts (`decideLaughter`: no laughter
 * on a heavy topic, with a distressed user or in a supportive reply; persona
 * base probabilities and minimum turns between laughs; at most 4 a session),
 * which was not reached from the live gateway path before. That module only
 * imports the logger, so it is reused as is; only its laugh variants ("haha",
 * "<break/>heh") are not: the Director adds Cartesia's `[laughter]` and
 * nothing else.
 *
 * Asked once per reply, on its first phrase (one roll per reply, the rate the
 * rules are tuned for), and only when the reply is not heavy and no laughter
 * cue is already in it. The laugh goes before the phrase when the rules say
 * so (the user just laughed or was playful), else right after it: always at
 * a phrase boundary, never inside one.
 *
 * @module speech/tts-gateway/director/laughter
 */

import { decideLaughter } from '../../adaptive-ssml/contextual-laughter.js';
import {
  isHeavyMoment,
  noteCallerTurn,
  recentCallerTurns,
} from '../../adaptive-ssml/heavy-moment.js';
import type { Valence } from './emotion.js';
import type { LaughGate } from './types.js';
import {
  decideTeamLaughter,
  ferniLightStyle,
  noteWrittenLaughter,
  teamLaughStyle,
} from './team-laughter.js';

export type LaughPlacement = 'before' | 'after';

export interface LaughterInput {
  /** The reply's first phrase, as it will be spoken. */
  phrase: string;
  replyValence: Valence;
  /** A laughter cue is already in the reply (raw-cues.ts). */
  alreadyLaughing: boolean;
  sessionId?: string;
  personaId?: string;
  turn?: number;
  userText?: string;
  userEmotion?: string;
  /** Rapport 0-1; contextual-laughter's default (0.5) when unknown. */
  comfortLevel?: number;
  /** TEAM_VOICES=on: teammates and legends laugh by their own style (team-laughter.ts). */
  teamVoices?: boolean;
  /** FERNI_LIGHT_TOUCH=on: Ferni laughs by the team rules with a reachable floor (team-laughter.ts). */
  lightTouch?: boolean;
  laughGate?: LaughGate; // LAUGH_CAP (types.ts)
}

const TOPIC_WEIGHT: Record<Valence, 'light' | 'medium' | 'heavy'> = {
  heavy: 'heavy',
  bright: 'light',
  inquisitive: 'medium',
  neutral: 'medium',
};

const LAUGHTER_TAG = /\[laughter\]/i;

/** Who and which turn: what the engine knows before the reply's first phrase. */
export type LaughterWho = Pick<
  LaughterInput,
  'sessionId' | 'personaId' | 'turn' | 'userEmotion' | 'comfortLevel' | 'teamVoices' | 'lightTouch'
> &
  Pick<LaughterInput, 'laughGate'>;

/** Where to add `[laughter]` for this reply, or undefined for none. */
export function decideReplyLaughter(input: LaughterInput): LaughPlacement | undefined {
  // Noted before any early return: the sympathetic (heavy) reply to "my dad
  // died" is the turn the next reply, to "haha anyway", must look back on.
  if (input.sessionId) noteCallerTurn(input.sessionId, input.userText, input.turn);
  if (!input.sessionId || input.replyValence === 'heavy') return undefined;
  // Never on a heavy moment, by any rules: the team's, Ferni's light touch or the old ones.
  if (isHeavyMoment(recentCallerTurns(input.sessionId))) return undefined;
  const team =
    (input.teamVoices ? teamLaughStyle(input.personaId) : undefined) ??
    (input.lightTouch ? ferniLightStyle(input.personaId) : undefined);
  if (input.alreadyLaughing || LAUGHTER_TAG.test(input.phrase)) {
    if (team) noteWrittenLaughter(input.sessionId, input.turn, input.userText);
    return undefined;
  }
  // LAUGH_CAP: the call's laugh ledger has the last word, whichever rules ask.
  if (input.laughGate && !input.laughGate.mayLaugh()) return undefined;
  if (team) return decideTeamLaughter(input, team);
  const decision = decideLaughter(
    {
      responseText: input.phrase,
      userMessage: input.userText,
      userEmotion: input.userEmotion,
      topicWeight: TOPIC_WEIGHT[input.replyValence],
      turnCount: input.turn,
      personaId: input.personaId,
      comfortLevel: input.comfortLevel,
    },
    input.sessionId
  );
  if (!decision.shouldLaugh) return undefined;
  return decision.placement === 'before' ? 'before' : 'after';
}

/** The phrase with `[laughter]` at its boundary. */
export function placeLaughter(phrase: string, placement: LaughPlacement): string {
  return placement === 'before' ? `[laughter] ${phrase}` : `${phrase} [laughter]`;
}
