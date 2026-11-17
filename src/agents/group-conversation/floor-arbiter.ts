/**
 * GROUP_CALL: the floor arbiter, one speech stream for the agent built from one per person.
 *
 * The agent session reads one stream of speech events; this merges each person's into it
 * and decides, for the whole room, when the user's turn starts and ends:
 *
 * - START_OF_SPEECH passes only when the floor goes from empty to busy.
 * - END_OF_SPEECH passes only when the last person speaking stops.
 * - FINAL_TRANSCRIPT and PREFLIGHT_TRANSCRIPT say who spoke, `[Sarah (guest)] text`
 *   (turn-label.ts). A preflight passes only while nobody else is speaking.
 * - INTERIM_TRANSCRIPT passes only for the most recent speaker, with its text unchanged.
 * - FINAL, PREFLIGHT and INTERIM all carry the person's identity as `speakerId`.
 * - Empty text stays empty and unlabelled, so the SDK still ignores an empty final.
 * - Times, and anything else (usage, metrics), pass through unchanged.
 *
 * @module agents/group-conversation/floor-arbiter
 */
import { stt } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { errorClass } from '../../utils/error-class.js';
import { createLogger } from '../../utils/safe-logger.js';
import { labelTurn, safeLabel } from './turn-label.js';

const log = createLogger({ module: 'FloorArbiter' });

const {
  START_OF_SPEECH,
  INTERIM_TRANSCRIPT,
  FINAL_TRANSCRIPT,
  END_OF_SPEECH,
  PREFLIGHT_TRANSCRIPT,
} = stt.SpeechEventType;

/** Every open and close punctuation mark, in any script. */
const OPEN_OR_CLOSE = /[\p{Ps}\p{Pe}]/gu;

/** One speech event from one person's own speech-to-text stream. */
export interface PersonSpeechEvent {
  /** The person's room identity. */
  identity: string;
  /** Their bare display name, e.g. `Alex` or `Sarah (guest)`. */
  label: string;
  event: stt.SpeechEvent;
}

type Alternatives = NonNullable<stt.SpeechEvent['alternatives']>;
/** Puts a turn's label on its spoken text, on this call. */
type Label = (spoken: string) => string;

/**
 * Spoken text with every bracket removed, so speech can't forge a `[name]` label. Not
 * NFKC-normalised: that changes the words ("2½") and so what echo checks compare.
 */
function withoutBrackets(text: string): string {
  return text.replace(OPEN_OR_CLOSE, ' ').replace(/\s+/g, ' ').trim();
}

/** A copy of the event with `speakerId` set, and the text labelled when `label` is given. */
function attributed(event: stt.SpeechEvent, identity: string, label?: Label): stt.SpeechEvent {
  if (!event.alternatives) return { ...event };
  const [first, ...rest] = event.alternatives;
  const mark = (alt: stt.SpeechData): stt.SpeechData => {
    const out: stt.SpeechData = { ...alt, speakerId: identity };
    if (label === undefined || alt.text.trim() === '') return out;
    const spoken = withoutBrackets(alt.text);
    out.text = spoken === '' ? '' : label(spoken);
    return out;
  };
  const alternatives: Alternatives = [mark(first), ...rest.map(mark)];
  return { ...event, alternatives };
}

/** Who holds the floor: the identities speaking now, in the order their START was accepted. */
class Floor {
  private readonly speaking: string[] = [];

  constructor(private readonly session: object) {}

  /** The event to emit for this input, or undefined to drop it. */
  accept({ identity, label, event }: PersonSpeechEvent): stt.SpeechEvent | undefined {
    const labelled: Label = (spoken) => labelTurn(this.session, safeLabel(label), spoken);
    switch (event.type) {
      case START_OF_SPEECH:
        return this.start(identity) ? { ...event } : undefined;
      case END_OF_SPEECH:
        return this.end(identity) ? { ...event } : undefined;
      case FINAL_TRANSCRIPT:
        return attributed(event, identity, labelled);
      case INTERIM_TRANSCRIPT:
        return this.mostRecent() === identity ? attributed(event, identity) : undefined;
      case PREFLIGHT_TRANSCRIPT:
        return this.othersSpeaking(identity) ? undefined : attributed(event, identity, labelled);
      default:
        return event;
    }
  }

  /** True when this START took the floor from empty to busy. */
  private start(identity: string): boolean {
    if (this.speaking.includes(identity)) return false;
    this.speaking.push(identity);
    return this.speaking.length === 1;
  }

  /** True when this END left the floor empty. */
  private end(identity: string): boolean {
    const at = this.speaking.indexOf(identity);
    if (at === -1) return false;
    this.speaking.splice(at, 1);
    return this.speaking.length === 0;
  }

  private mostRecent(): string | undefined {
    return this.speaking[this.speaking.length - 1];
  }

  private othersSpeaking(identity: string): boolean {
    return this.speaking.some((other) => other !== identity);
  }
}

/**
 * Merges every person's speech events on `session`'s call into the single stream the
 * agent's `sttNode` returns. The output closes when the input ends and errors when the
 * input throws; its reader logs that, once. Cancelling never waits on the input: a read
 * still pending then settles into nothing.
 */
export function floorArbiter(
  session: object,
  streams: AsyncIterable<PersonSpeechEvent>
): ReadableStream<stt.SpeechEvent> {
  const input = streams[Symbol.asyncIterator]();
  const floor = new Floor(session);
  let cancelled = false;

  return new ReadableStream<stt.SpeechEvent>({
    async pull(controller) {
      for (;;) {
        let next: IteratorResult<PersonSpeechEvent>;
        try {
          // eslint-disable-next-line no-await-in-loop -- events are read one at a time, in order, until one passes
          next = await input.next();
        } catch (error) {
          if (!cancelled) throw error; // errors the output; its reader logs it, once
          log.debug(
            { error: errorClass(error) },
            'Speech input failed after the floor was cancelled'
          );
          return;
        }
        if (cancelled) return;
        if (next.done) return controller.close();
        const out = floor.accept(next.value); // a throw errors the output too
        if (out) return controller.enqueue(out);
      }
    },
    cancel(reason) {
      cancelled = true;
      try {
        void input.return?.(reason)?.catch((error: unknown) => {
          log.debug({ error: errorClass(error) }, 'Speech input did not close cleanly on cancel');
        });
      } catch (error) {
        log.debug({ error: errorClass(error) }, 'Speech input did not close cleanly on cancel');
      }
    },
  });
}
