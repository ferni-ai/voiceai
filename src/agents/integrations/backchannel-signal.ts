/**
 * Tell the client when a backchannel or laugh clip plays, so the avatar can
 * nod (or smile) with its own "mm-hmm" instead of staying still while it is
 * heard. Clips play on a side track the client can't tell apart from music.
 *
 * Message: `backchannel_played { kind, wireDelayMs }`. `kind` is 'laugh' for
 * the laugh clip and 'backchannel' for everything else; `wireDelayMs` is the
 * player's play()-to-wire delay (measured on the last direct-track clip,
 * estimated on the mixer track), so the client can time the nod to the sound.
 *
 * Only with AVATAR_LISTEN_SIGNALS=on (listen-turn-signals.ts).
 *
 * @module agents/integrations/backchannel-signal
 */

import type { DataMessageSender } from '../shared/data-message-envelope.js';
import { LAUGH_CLIP } from './backchannel-policy.js';

export const BACKCHANNEL_PLAYED = 'backchannel_played';

export type BackchannelKind = 'backchannel' | 'laugh';

export type PlayClipFn = (text: string, opts?: { pauseStartedAt?: number }) => boolean;

export function backchannelKind(text: string): BackchannelKind {
  return text === LAUGH_CLIP ? 'laugh' : 'backchannel';
}

/** Wrap a clip player's playClip so each clip that plays also sends `backchannel_played`. */
export function withBackchannelSignal(
  playClip: PlayClipFn,
  send: DataMessageSender,
  wireDelayMs: () => number
): PlayClipFn {
  return (text, opts) => {
    const played = playClip(text, opts);
    if (played) {
      void send(BACKCHANNEL_PLAYED, {
        kind: backchannelKind(text),
        wireDelayMs: Math.round(wireDelayMs()),
      });
    }
    return played;
  };
}
