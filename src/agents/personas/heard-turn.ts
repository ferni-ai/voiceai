/**
 * What the caller has said this turn beyond the words a request was built on.
 *
 * LiveKit commits a user turn from its STT finals. A segment still in flight
 * at the commit (an interim or preflight transcript) becomes the next user
 * message, after the reply to the first half was already requested. Dev A/B
 * 2026-10-25, good-news-mixed: the turn was committed as "I got promoted
 * today." although "but my mom is sick" had been heard 350 ms earlier as a
 * preflight transcript, so the request read only the good half.
 *
 * The turn as heard is its finals plus the current interim since the last
 * assistant message joined the history (the boundary turn-request.ts's
 * callerWords uses). Listeners attach on the first read; nothing is awaited.
 *
 * @module agents/personas/heard-turn
 */

interface Heard {
  finals: string[];
  interim: string;
}

interface SessionEvents {
  on?: (event: string, fn: (ev: never) => void) => unknown;
}

/** Enough finals for one long turn; older ones are long since in the history. */
const MAX_FINALS = 8;

const heard = new WeakMap<object, Heard>();

const normalized = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();

function watch(session: object): Heard | undefined {
  const known = heard.get(session);
  if (known) return known;
  const events = session as SessionEvents;
  if (typeof events.on !== 'function') return undefined;
  const turn: Heard = { finals: [], interim: '' };
  events.on('user_input_transcribed', (ev: { transcript?: string; isFinal?: boolean }) => {
    const text = ev?.transcript?.trim() ?? '';
    if (!ev?.isFinal) {
      turn.interim = text;
      return;
    }
    turn.interim = '';
    if (text) turn.finals = [...turn.finals, text].slice(-MAX_FINALS);
  });
  events.on('conversation_item_added', (ev: { item?: { role?: string } }) => {
    if (ev?.item?.role !== 'assistant') return;
    turn.finals = [];
    turn.interim = '';
  });
  heard.set(session, turn);
  return turn;
}

/**
 * The words heard this turn that `said` does not contain, or '' (also before
 * the first read, which starts listening, and for a session without events).
 */
export function heardBeyond(session: object, said: string): string {
  const turn = watch(session);
  if (!turn) return '';
  const known = normalized(said);
  return [...turn.finals, turn.interim]
    .filter((text) => normalized(text) !== '' && !known.includes(normalized(text)))
    .join(' ');
}
