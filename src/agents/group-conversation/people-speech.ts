/**
 * GROUP_CALL: who on one call is heard on their own speech stream.
 *
 * Each person heard on their own stream is added with that stream's events. While anyone
 * is, the STT chain (personas/stt-chain.ts) feeds its STT silence in place of the mixed
 * input, so the SDK's speech clock keeps running and nobody is heard twice. Their own
 * events reach the agent through the floor arbiter, which a later change wires here;
 * until then they are read to the end and let go. Nothing adds a person yet. One per
 * session, made by whichever side asks first: the SDK may open the STT chain before the
 * call's hearing attaches.
 *
 * @module agents/group-conversation/people-speech
 */
import type { stt } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PeopleSpeech' });

export class PeopleSpeech {
  /** Each person heard on their own stream, by identity: how to stop reading them. */
  private readonly people = new Map<string, () => void>();

  /** Whether anyone is heard on their own stream; the mixed input is then not transcribed. */
  get live(): boolean {
    return this.people.size > 0;
  }

  /** Hears `identity` on their own stream until it ends, replacing any they had. */
  add(identity: string, events: AsyncIterable<stt.SpeechEvent>): void {
    this.remove(identity);
    const input = events[Symbol.asyncIterator]();
    let stopped = false;
    const stop = (): void => {
      stopped = true;
      Promise.resolve()
        .then(async () => input.return?.())
        .catch((error: unknown) =>
          log.debug({ error: String(error) }, 'A person stream did not close')
        );
    };
    this.people.set(identity, stop);
    const read = async (): Promise<void> => {
      // eslint-disable-next-line no-await-in-loop -- a person's events are read one at a time, in order
      for (let next = await input.next(); !stopped && !next.done; next = await input.next());
    };
    read()
      .catch((error: unknown) => {
        const kind = error instanceof Error ? error.name : typeof error; // never who
        log.warn({ error: kind }, 'GROUP_CALL: a person stream failed');
      })
      .finally(() => {
        if (this.people.get(identity) === stop) this.people.delete(identity); // their stream ended
      });
  }

  /** Stops hearing `identity` on their own stream. */
  remove(identity: string): void {
    this.people.get(identity)?.();
    this.people.delete(identity);
  }
}

const bySession = new WeakMap<object, PeopleSpeech>();

/** The people heard apart on `session`'s call. */
export function peopleSpeechFor(session: object): PeopleSpeech {
  const people = bySession.get(session) ?? new PeopleSpeech();
  bySession.set(session, people);
  return people;
}
