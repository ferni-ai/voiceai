/**
 * The laughter lever (SPEECH_DIRECTOR_LAUGHTER, opt-in): `[laughter]` is the
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
import type { Valence } from './emotion.js';

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
}

const TOPIC_WEIGHT: Record<Valence, 'light' | 'medium' | 'heavy'> = {
  heavy: 'heavy',
  bright: 'light',
  inquisitive: 'medium',
  neutral: 'medium',
};

const LAUGHTER_TAG = /\[laughter\]/i;

/** Where to add `[laughter]` for this reply, or undefined for none. */
export function decideReplyLaughter(input: LaughterInput): LaughPlacement | undefined {
  if (!input.sessionId || input.replyValence === 'heavy') return undefined;
  if (input.alreadyLaughing || LAUGHTER_TAG.test(input.phrase)) return undefined;
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
