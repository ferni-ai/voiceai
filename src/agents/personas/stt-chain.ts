/**
 * The persona's STT events, in order: the turn-1 gate (first-turn-fast.ts), Ferni's
 * name put right (name-mishear.ts), then a guest's turns labelled with her name.
 *
 * GROUP_CALL (group-hearing.ts): while a guest is on the call, every finished turn is
 * labelled from who was voiced in its window (TalkerLedger.attribute): `[Seth] `,
 * `[Sarah] see you at six`, or `[unclear] ` when no one clearly held it. Fail closed:
 * an unsure turn never passes as the owner's. A guest who just left still gets her
 * last words labelled. The window is from the end of the previous final transcript to
 * now, on the room mix's clock. With no guest, or the flag off, events are untouched.
 *
 * @module agents/personas/stt-chain
 */
import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { groupHearing } from '../group-conversation/group-hearing.js';
import { mixClock } from '../group-conversation/room-mix-input.js';
import { sttWithFirstTurnFast } from './first-turn-fast.js';
import { sttWithNameFix } from './name-mishear.js';

type Event = stt.SpeechEvent | string;
type Session = Parameters<typeof sttWithFirstTurnFast>[0];

/** A final transcript with its speaker's label in front of its first alternative (above). */
function labelled(
  event: stt.SpeechEvent,
  fromMs: number,
  toMs: number,
  sessionId: string
): stt.SpeechEvent {
  const hearing = groupHearing(sessionId);
  if (!hearing) return event;
  const { identity, confident } = hearing.ledger.attribute(fromMs, toMs);
  const guest = identity ? hearing.guestName(identity) : undefined;
  const [first, ...rest] = event.alternatives ?? [];
  if (!first || (!hearing.guestOn() && !guest)) return event;
  let label = '[unclear] ';
  if (confident && identity === hearing.ledger.owner) label = hearing.ownerLabel();
  else if (confident && guest) label = `[${guest}] `;
  return { ...event, alternatives: [{ ...first, text: label + first.text }, ...rest] };
}

/** `events` with each final transcript labelled while a guest is on the call (above). */
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
  if (!events || !flagOn('GROUP_CALL')) return events;
  return labelGuestTurns(events, services?.sessionId ?? '');
}
