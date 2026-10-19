/**
 * The turn style half of the per-turn reminder (turn-request.ts): this reply's
 * shape from the caller's words and the signals that steer it (support holds,
 * own story, quiet caller, learned length), plus the per-call seed its draws use.
 */

import type { llm } from '@livekit/agents';

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import { latestUserText } from '../../tools/retrieval/turn-tool-retrieval.js';
import { asAnswer } from './answer-turn.js';
import { listeningReply } from './listen-first-turn.js';
import { callerTurnsOf } from './happy-exits.js';
import { withPlayful } from './ferni-playful-turn.js';
import { withCallTrouble, withSupportHold } from './turn-holds.js';
import { isQuietCaller, presentAck, quietCallerEnabled } from './quiet-caller.js';
import { modelSignals, PLAIN_SIGNALS, regexSignals, type TurnSignals } from './turn-extras.js';
import { lengthLearned, recentTurns, textureLearned } from './turn-length.js';
import { callerMove, rngFor, turnShapeEnabled, turnShapeFor } from './turn-shape.js';
import type { TurnShape } from './turn-shape.js';
import {
  understandingFor,
  understandingMode,
  understandingStatusFor,
} from './turn-understanding.js';
import { TURN_STYLE_REMINDER } from './turn-style.js';
import { burstLine } from './vocal-bursts.js';
import { withHeavyMoment } from './heavy-turn.js';

const log = createLogger({ module: 'FerniAgent' });

/**
 * This reply's shape (turn-shape.ts) from the caller's latest words, or the
 * single style reminder when shaping is off, there are no words, or the
 * caller asked for none (a crisis reply must not be held to a few words).
 */
export function styleFor(
  chatCtx: llm.ChatContext,
  session: object,
  shape: boolean,
  state: { ownStory?: boolean; brief?: boolean } = {},
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
  const told = withRecent(withOwnStory(sig, said, state), said, chatCtx);
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
  { ownStory, brief }: { ownStory?: boolean; brief?: boolean }
): TurnSignals | undefined {
  if (ownStory === undefined) return signals;
  // SELF_SHARE_WHEN_ASKED=on: asked about him, a short answer and no story (self-share-asked.ts).
  const selfBrief = brief === true ? { selfBrief: true } : {};
  return { ...(signals ?? regexSignals(said, callerMove(said))), ownStory, ...selfBrief };
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
export function callSeed(session: object): string {
  let seed = callSeeds.get(session);
  if (!seed) {
    seed = Math.random().toString(36).slice(2);
    callSeeds.set(session, seed);
  }
  return seed;
}
