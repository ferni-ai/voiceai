/**
 * The persona's STT events, in order: the turn-1 gate (first-turn-fast.ts), Ferni's
 * name put right (name-mishear.ts), then a guest's turns labelled with her name.
 *
 * GROUP_CALL (group-hearing.ts): on a call with a guest, a finished turn whose audio
 * was mostly hers comes out as `[Sarah] see you at six`, so the model knows who said
 * it. The window is from the end of the previous final transcript to now, on the room
 * mix's clock. The owner's turns, and every turn on a solo call, are unchanged.
 *
 * @module agents/personas/stt-chain
 */
import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { groupHearing } from '../group-conversation/group-hearing.js';
import { mixClock } from '../group-conversation/room-mix-input.js';
import { sttWithFirstTurnFast } from './first-turn-fast.js';
import { sttWithNameFix } from './name-mishear.js';

type Event = stt.SpeechEvent | string;
type Session = Parameters<typeof sttWithFirstTurnFast>[0];

/** A final transcript with `[name] ` in front of its first alternative when a guest said it. */
function labelled(
  event: stt.SpeechEvent,
  fromMs: number,
  toMs: number,
  sessionId: string
): stt.SpeechEvent {
  const hearing = groupHearing(sessionId);
  if (!hearing) return event;
  const who = hearing.ledger.dominant(fromMs, toMs);
  const name = who && who !== hearing.ledger.owner ? hearing.guestName(who) : undefined;
  const [first, ...rest] = event.alternatives ?? [];
  if (!name || !first) return event;
  return { ...event, alternatives: [{ ...first, text: `[${name}] ${first.text}` }, ...rest] };
}

/** `events` with each guest turn labelled with the guest's name (above). */
function labelGuestTurns<E extends Event>(
  events: ReadableStream<E>,
  sessionId: string
): ReadableStream<E> {
  const reader = events.getReader();
  let windowStart = mixClock();
  return new ReadableStream<E>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      if (typeof value === 'string' || value.type !== stt.SpeechEventType.FINAL_TRANSCRIPT) {
        return controller.enqueue(value);
      }
      const now = mixClock();
      controller.enqueue(labelled(value, windowStart, now, sessionId) as E);
      windowStart = now;
    },
    async cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** The persona's STT events for `audio` from the SDK's `base` node, through every step above. */
export async function sttChain(
  session: Session,
  audio: ReadableStream<AudioFrame>,
  base: (audio: ReadableStream<AudioFrame>) => Promise<ReadableStream<Event> | null>
): Promise<ReadableStream<Event> | null> {
  const services = (session?.userData as { services?: { sessionId?: string } } | undefined)
    ?.services;
  const events = await sttWithNameFix(session, sttWithFirstTurnFast(session, audio, base));
  return events && labelGuestTurns(events, services?.sessionId ?? '');
}
