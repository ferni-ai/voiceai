/**
 * The persona's STT events, in order: the turn-1 gate (first-turn-fast.ts), Ferni's
 * name put right (name-mishear.ts), then GROUP_CALL's fail-closed label.
 *
 * On a group call one STT stream hears the room mix, so who spoke is not known: a final
 * transcript is labelled `[unclear] ` if a guest was on (group-hearing.ts guestLastOnAt)
 * at any point from STT_LAG_MS before its turn started (the previous final, or the start
 * of the stream) until now. A guest who joined and left inside one turn, or whose words
 * come back from STT after she left, is still covered. The hearing is found by the
 * session object; the room mix with no hearing labels every final. With no guest ever,
 * or the flag off, events are untouched.
 *
 * GROUP_CALL: while anyone on the call is heard on their own stream (people-speech.ts),
 * STT hears silence of the same length in place of the mixed input: the SDK times speech
 * by the audio it was fed, so dropping frames would put every later turn early.
 *
 * @module agents/personas/stt-chain
 */
import { stt } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream, TransformStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { groupHearingFor } from '../group-conversation/group-hearing.js';
import { peopleSpeechFor } from '../group-conversation/people-speech.js';
import { mixClock, RoomMixInput } from '../group-conversation/room-mix-input.js';
import { labelTurn } from '../group-conversation/turn-label.js';
import { sttWithFirstTurnFast } from './first-turn-fast.js';
import { sttWithNameFix } from './name-mishear.js';

type Event = stt.SpeechEvent | string;
type Session = Parameters<typeof sttWithFirstTurnFast>[0];

/** How late a final can come back from STT after the audio it holds was spoken. */
const STT_LAG_MS = 2000;

/** Whether a guest may be in a turn that started at `windowStartMs` (above). */
function guestInTurn(session: object, windowStartMs: number): boolean {
  const hearing = groupHearingFor(session);
  if (!hearing) {
    const { input } = session as { input?: { audio?: unknown } };
    return input?.audio instanceof RoomMixInput;
  }
  const lastOnAt = hearing.guestLastOnAt();
  return lastOnAt !== undefined && lastOnAt >= windowStartMs - STT_LAG_MS;
}

/**
 * A final transcript with `[unclear] ` in front of its first alternative. An empty or
 * blank final stays as it is, so the SDK still drops it rather than taking a turn of
 * just the label.
 */
function unclear(event: stt.SpeechEvent, session: object): stt.SpeechEvent {
  const [first, ...rest] = event.alternatives ?? [];
  if (!first?.text.trim()) return event;
  const text = labelTurn(session, 'unclear', first.text);
  return { ...event, alternatives: [{ ...first, text }, ...rest] };
}

/** `events` with each final transcript labelled while a guest is on the call (above). */
function labelGuestTurns<E extends Event>(
  events: ReadableStream<E>,
  session: object
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
      const labelled = guestInTurn(session, windowStart) ? unclear(value, session) : value;
      windowStart = mixClock();
      controller.enqueue(labelled as E);
    },
    async cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** `audio`, with silence of the same length in place of each frame while `apart()`. */
function silentWhile(
  audio: ReadableStream<AudioFrame>,
  apart: () => boolean
): ReadableStream<AudioFrame> {
  return audio.pipeThrough(
    new TransformStream<AudioFrame, AudioFrame>({
      transform(frame, controller) {
        if (!apart()) return controller.enqueue(frame);
        const { sampleRate, channels, samplesPerChannel } = frame;
        controller.enqueue(AudioFrame.create(sampleRate, channels, samplesPerChannel)); // silence
      },
    })
  );
}

/** The persona's STT events for `audio` from the SDK's `base` node, through every step above. */
export async function sttChain(
  session: Session,
  audio: ReadableStream<AudioFrame>,
  base: (audio: ReadableStream<AudioFrame>) => Promise<ReadableStream<Event> | null>
): Promise<ReadableStream<Event> | null> {
  const people = session && flagOn('GROUP_CALL') ? peopleSpeechFor(session) : undefined;
  const heard = people ? silentWhile(audio, () => people.live) : audio;
  const events = await sttWithNameFix(session, sttWithFirstTurnFast(session, heard, base));
  if (!events || !session || !people) return events;
  return labelGuestTurns(events, session);
}
