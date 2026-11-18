/**
 * GROUP_CALL: every person's own speech stream on one call, for the STT chain to merge.
 *
 * Each person heard on their own stream is added with that stream's events. While anyone
 * is, the STT chain (personas/stt-chain.ts) feeds its STT silence in place of the mixed
 * input, so the SDK's speech clock keeps running and nobody is heard twice, and it listens
 * here, running what it hears through the floor arbiter (floor-arbiter.ts). One per session,
 * made by whichever side asks first: the SDK may open the STT chain before the call's
 * hearing attaches. A newer listener (a reopened STT chain) finishes the last one. Events
 * said while nobody listens (a person added before the chain opens, or between two chains)
 * wait for the next listener, the newest EARLY_EVENTS only.
 *
 * @module agents/group-conversation/people-speech
 */
import { stt } from '@livekit/agents';
import { errorClass } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { PersonSpeechEvent } from './floor-arbiter.js';

const log = createLogger({ module: 'PeopleSpeech' });

/** How many events said while nobody listens are kept for the next listener. */
const EARLY_EVENTS = 32;
const FINISHED: IteratorReturnResult<undefined> = { done: true, value: undefined };

/** Who hears what is said now, and how to finish them. */
interface Listener {
  hear: (said: PersonSpeechEvent) => void;
  finish: () => void;
}

export class PeopleSpeech {
  /** Each person heard on their own stream, by identity: how to stop relaying them. */
  private readonly people = new Map<string, () => void>();
  private listener: Listener | undefined;
  /** Events said while nobody listens, oldest first (above). */
  private readonly early: PersonSpeechEvent[] = [];

  /** Whether anyone is heard on their own stream; the mixed input is then not transcribed. */
  get live(): boolean {
    return this.people.size > 0;
  }

  /** Relays `identity`'s own speech events to the listener until they end, replacing any they had. */
  add(identity: string, events: AsyncIterable<PersonSpeechEvent>): void {
    this.remove(identity);
    const input = events[Symbol.asyncIterator]();
    let stopped = false;
    /** They are gone: an END lets go of the floor if they held it, and changes nothing if not. */
    const gone = (): void => {
      if (stopped) return;
      stopped = true;
      this.heard({ identity, label: '', event: { type: stt.SpeechEventType.END_OF_SPEECH } });
    };
    const stop = (): void => {
      gone();
      Promise.resolve()
        .then(async () => input.return?.())
        .catch((error: unknown) =>
          log.debug({ error: errorClass(error) }, 'A person stream did not close')
        );
    };
    this.people.set(identity, stop);
    const relay = async (): Promise<void> => {
      // eslint-disable-next-line no-await-in-loop -- a person's events are relayed one at a time, in order
      for (let next = await input.next(); !stopped && !next.done; next = await input.next()) {
        this.heard(next.value);
      }
    };
    relay()
      .catch((error: unknown) => {
        log.warn({ error: errorClass(error) }, 'GROUP_CALL: a person stream failed');
      })
      .finally(() => {
        gone();
        if (this.people.get(identity) === stop) this.people.delete(identity); // their stream ended
      });
  }

  /** Stops hearing `identity` on their own stream. */
  remove(identity: string): void {
    this.people.get(identity)?.();
    this.people.delete(identity);
  }

  private heard(said: PersonSpeechEvent): void {
    if (this.listener) return this.listener.hear(said);
    if (this.early.push(said) > EARLY_EVENTS) this.early.shift();
  }

  /**
   * Everyone's speech events from now on, with any said while nobody listened, for one floor
   * arbiter. One `next()` at a time, as the arbiter reads: a second while one waits throws.
   * `return()`, or a newer listener, finishes it at once, even with a `next()` waiting.
   */
  listen(): AsyncIterableIterator<PersonSpeechEvent> {
    this.listener?.finish();
    const queue = this.early.splice(0);
    let waiting: ((next: IteratorResult<PersonSpeechEvent>) => void) | undefined;
    let done = false;
    const me: Listener = {
      hear: (said) => {
        if (!waiting) return void queue.push(said);
        const resolve = waiting;
        waiting = undefined;
        resolve({ done: false, value: said });
      },
      finish: () => {
        done = true;
        if (this.listener === me) this.listener = undefined;
        queue.length = 0;
        waiting?.(FINISHED);
        waiting = undefined;
      },
    };
    this.listener = me;
    return {
      next: async () => {
        if (waiting) throw new Error('PeopleSpeech: one next() at a time');
        const said = queue.shift();
        if (said) return { done: false, value: said };
        if (done) return FINISHED;
        return new Promise((resolve) => {
          waiting = resolve;
        });
      },
      return: async () => {
        me.finish();
        return Promise.resolve(FINISHED);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}

const bySession = new WeakMap<object, PeopleSpeech>();

/** The people heard apart on `session`'s call. */
export function peopleSpeechFor(session: object): PeopleSpeech {
  const people = bySession.get(session) ?? new PeopleSpeech();
  bySession.set(session, people);
  return people;
}
