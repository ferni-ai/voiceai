/**
 * Hard news in the caller's last two turns rides with the turn signals, so
 * nothing in the reply's shape laughs at it (turn-extras.ts LAUGH_ALONG and
 * the spontaneous laugh, vocal-bursts.ts) and the reply stays careful.
 *
 * The signals read one turn: "my dad died last week", then "haha anyway",
 * read as laughed and light, so LAUGH_ALONG (live on prod) asked the model to
 * open with [laughter]. isHeavyMoment (speech/adaptive-ssml/heavy-moment.ts)
 * reads both turns. An unflagged harm fix: when nothing is heavy, the
 * signals pass through unchanged.
 *
 * @module agents/personas/heavy-turn
 */

import type { llm } from '@livekit/agents';

import { isHeavyMoment } from '../../speech/adaptive-ssml/heavy-moment.js';
import { latestUserText } from '../../tools/retrieval/turn-tool-retrieval.js';
import { callerTurnsOf } from './happy-exits.js';
import { regexSignals, type TurnSignals } from './turn-extras.js';
import { callerMove } from './turn-shape.js';

/** The signals for a heavy moment: careful, and no laugh of any kind. */
export function asHeavy(signals: TurnSignals): TurnSignals {
  return {
    ...signals,
    heavy: true,
    careful: true,
    laughed: false,
    laughFits: false,
    bright: false,
  };
}

/** `signals` (or the regexes', when undefined) marked heavy when the caller's last two turns are. */
export function withHeavyMoment(
  signals: TurnSignals | undefined,
  chatCtx: llm.ChatContext
): TurnSignals | undefined {
  if (!isHeavyMoment(callerTurnsOf(chatCtx))) return signals;
  const said = latestUserText(chatCtx) ?? '';
  return asHeavy(signals ?? regexSignals(said, callerMove(said)));
}
