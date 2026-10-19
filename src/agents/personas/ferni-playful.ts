/**
 * FERNI_PLAYFUL (off by default): Ferni allowed to be fun on easy turns.
 *
 * Seth (2026-10-17): Ferni "sounds a little too calm and boring". Over 163 of
 * his prod lines in 3 days, 17% had humour, an opinion or a story of his own,
 * 2% a reaction word, and 20% were stock presence lines ("I'm right here" x13).
 * The turn reminder says "Start with the substance, not a stock reaction word"
 * on every turn, against his own sheet ("First word should be a reaction",
 * core-identity.md), and nothing on an easy turn invites a take or a joke.
 *
 * With the flag on, for Ferni only, on a turn that is not careful (venting,
 * bad news, tender), not held for support (CANDOR) and not a look-up:
 *   - the reminder allows one natural reaction word to open (playfulOpen);
 *     a bright turn says so in its own words, which is how the opener gate
 *     knows to let that word through (brightOpenerInvited, opener-gate.ts);
 *   - an easy, neutral turn (not bright) gets a short playfulness and opinion
 *     line, described as shapes and never quotable lines, at most once in
 *     three turns (playfulLine).
 * Never on, or within three turns after, a heavy or careful turn
 * (ferni-playful-turn.ts).
 * The turn is marked playful in turn-request.ts (withPlayful, ferni-playful-turn.ts).
 * Crisis replies never get a turn shape (crisis-gate.ts), so none of this
 * rides one. PERSONA_SPARK (#1698) still owns the "!" on bright turns.
 *
 * @module agents/personas/ferni-playful
 */

import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import type { TurnSignals } from './turn-extras.js';

/** The reminder's opening rule, which this replaces on a playful turn (turn-shape.ts REGISTER). */
export const SUBSTANCE_FIRST =
  'Start with the substance, not a stock reaction word like Oh, Ugh, Yeah or Hmm. ';

export const PLAYFUL_OPEN =
  'If you really react to what they said, you may open with one natural reaction word, then the substance; never a stock filler out of habit. ';
/** A bright turn's opening rule; its words are what the opener gate looks for. */
export const PLAYFUL_BRIGHT_OPEN =
  'This is a bright moment: if you really react, open with one natural reaction word, then the substance; never a stock filler out of habit. ';

/**
 * What play looks like, as shapes, never lines: the model repeated quoted
 * examples word for word, and the snake-plant one gave Ferni a life fact
 * nobody had decided. Only what he already knows of his own life counts.
 */
export const PLAYFUL_LINE =
  'The moment is easy, so be a little playful: a light tease, a small opinion of your own you will stand by, or a bit of your own life told with a grin. ' +
  'The shapes, in your own words: tease about the thing itself, never about them; ' +
  'an opinion said plainly as yours, small enough to laugh off; ' +
  'or mock surprise at what they just said, then play it straight. ' +
  'Only what you already know of your own life, never a new fact about yourself, and never joke about something that matters to them.';

/** Easy turns: something shared, a quick reply, or a question about him. */
const EASY_MOVES = new Set<TurnSignals['move']>(['share', 'ack', 'about_ferni']);

export function ferniPlayfulOn(env: Env = process.env): boolean {
  return flagOn('FERNI_PLAYFUL', env);
}

/** Whether Ferni (not a teammate) is speaking, from the session's persona. */
export function ferniSpeaking(session: object): boolean {
  const userData = (session as { userData?: { personaId?: unknown } }).userData;
  return (userData?.personaId ?? 'ferni') === 'ferni';
}

/** A turn where play fits: playful, and nothing careful, held or looked up. */
function playable(sig: TurnSignals): boolean {
  return sig.playful === true && !sig.careful && !sig.supportFirst && sig.move !== 'lookup';
}

/** An easy, neutral turn: where the playful line goes, if it is due. */
export function playfulLineFits(sig: TurnSignals): boolean {
  return sig.bright !== true && EASY_MOVES.has(sig.move);
}

/** The opening rule for a playful turn, or undefined to keep the reminder's own. */
export function playfulOpen(sig: TurnSignals): string | undefined {
  if (!playable(sig)) return undefined;
  return sig.bright === true ? PLAYFUL_BRIGHT_OPEN : PLAYFUL_OPEN;
}

/** The playfulness and opinion line, on an easy, neutral, playful turn when it is due; else ''. */
export function playfulLine(sig: TurnSignals): string {
  return playable(sig) && sig.playfulLine !== false && playfulLineFits(sig) ? PLAYFUL_LINE : '';
}

/** Whether this request's turn reminder invited a bright opener (the opener gate lets one through). */
export function brightOpenerInvited(request: llm.ChatContext): boolean {
  const marker = PLAYFUL_BRIGHT_OPEN.trim();
  for (let i = request.items.length - 1; i >= 0; i--) {
    const item = request.items[i] as { type?: string; role?: string; textContent?: string };
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') return false;
    if (item.role === 'user' && (item.textContent ?? '').includes(marker)) return true;
  }
  return false;
}
