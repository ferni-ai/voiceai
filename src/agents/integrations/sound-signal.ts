/**
 * Tell the client which non-speech sound just started, so the app can show
 * "[laughs]" or animate a hum. Clips play on side tracks the client can't
 * tell apart from speech or music, and `[laughter]` never reaches captions
 * (personas/caption-filter.ts strips it): this message is how the client knows.
 *
 * Message: `sound_played { kind, wireDelayMs }`, sent when a clip's play() is
 * accepted, the same moment `backchannel_played` is (backchannel-signal.ts).
 * `wireDelayMs` is that clip's play()-to-wire delay: measured on the direct
 * track (its last clip), estimated on the mixer track.
 *
 * CLIENT_SIGNALS_V2=on only; independent of AVATAR_LISTEN_SIGNALS, and
 * `backchannel_played` keeps working for existing clients. Contract:
 * docs/api/client-signals.md.
 *
 * @module agents/integrations/sound-signal
 */

import { flagOn } from '../../config/env-flag.js';
import type { DataMessageSender } from '../shared/data-message-envelope.js';
import { LAUGH_CLIP } from './backchannel-policy.js';
import type { PlayClipFn } from './backchannel-signal.js';

export const SOUND_PLAYED = 'sound_played';

/** 'breath' covers the snore and the morning yawn; 'sigh' is reserved (the sigh takes have no trigger yet). */
export type SoundKind = 'laugh' | 'mm-hmm' | 'hum' | 'opener' | 'breath' | 'sigh';

/** Report that a clip of `kind` started; `wireDelayMs` is read at that moment. */
export type SoundPlayed = (kind: SoundKind, wireDelayMs: number) => void;

export function clientSignalsV2Enabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('CLIENT_SIGNALS_V2', env);
}

/** A live reaction's kind: the laugh clip (and its takes) is 'laugh', every other one 'mm-hmm'. */
export function liveReactionKind(text: string): SoundKind {
  return text === LAUGH_CLIP ? 'laugh' : 'mm-hmm';
}

/** The sender for one call's sounds, or null when CLIENT_SIGNALS_V2 is off. */
export function createSoundSignal(
  send: DataMessageSender,
  env: Record<string, string | undefined> = process.env
): SoundPlayed | null {
  if (!clientSignalsV2Enabled(env)) return null;
  return (kind, wireDelayMs) => {
    void send(SOUND_PLAYED, { kind, wireDelayMs: Math.round(wireDelayMs) });
  };
}

/** Wrap a clip player's playClip so each clip it plays also reports `sound_played`. */
export function withSoundSignal(
  playClip: PlayClipFn,
  sound: SoundPlayed | null,
  kindOf: (text: string) => SoundKind,
  wireDelayMs: () => number
): PlayClipFn {
  if (!sound) return playClip;
  return (text, opts) => {
    const played = playClip(text, opts);
    if (played) sound(kindOf(text), wireDelayMs());
    return played;
  };
}
