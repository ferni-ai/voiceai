/**
 * One compact line per session state event, instead of a pretty-printed dump.
 *
 * Every user_state_changed, agent_state_changed and speech_created event used
 * to be written to stderr as JSON.stringify(event, null, 2): 6-40 lines each,
 * the speech_created one a whole SpeechHandle. Logs are written synchronously
 * on the event loop the call shares with the VAD and the reply's audio pump,
 * and log writes were the largest CPU owner left on a worker's first call
 * (2.6 s of 18.7 s busy, dev 2026-10-12, CALL_CPU_PROFILE).
 *
 * The caller's state stays at info as `👤 [USER STATE] <old> -> <new>`: the
 * call reviewer (ferni-call-reviewer, ferni_logs.py) tags "[after away]" lines
 * from it. Agent state and speech creation have no log reader (REPLY_GAP and
 * TURN_RECEIPT carry the timing) and drop to debug.
 *
 * @module agents/multi-agent/session-event-log
 */
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

type Handler = (...args: unknown[]) => void;

interface StateEvent {
  oldState?: string;
  newState?: string;
}

interface SpeechCreatedEvent {
  source?: string;
  userInitiated?: boolean;
  speechHandle?: { id?: string; _id?: string };
}

/** `👤 [USER STATE] listening -> away` */
export function userStateLine(event: unknown): string {
  const { oldState, newState } = (event ?? {}) as StateEvent;
  return `👤 [USER STATE] ${oldState ?? '?'} -> ${newState ?? '?'}\n`;
}

/** Subscribes the three loggers; each is pushed to `handlers` for cleanup. */
export function attachSessionEventLog(
  session: { on: (event: string, handler: Handler) => void },
  handlers: Array<{ event: string; handler: Handler }>,
  write: (line: string) => void = (line) => process.stderr.write(line)
): void {
  const add = (event: string, handler: Handler): void => {
    session.on(event, handler);
    handlers.push({ event, handler });
  };
  add('user_state_changed', (event) => write(userStateLine(event)));
  add('agent_state_changed', (event) => {
    const { oldState, newState } = (event ?? {}) as StateEvent;
    log.debug({ oldState, newState }, 'AGENT_STATE');
  });
  add('speech_created', (event) => {
    const { source, userInitiated, speechHandle } = (event ?? {}) as SpeechCreatedEvent;
    log.debug(
      { source, userInitiated, speechId: speechHandle?.id ?? speechHandle?._id },
      'SPEECH_CREATED'
    );
  });
}
