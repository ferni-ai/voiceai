/**
 * One broken feature listener must not end hearing for the rest of a call.
 *
 * The SDK delivers each final transcript from its STT loop
 * (`AudioRecognition.consumeSttEvents`, no try) through a plain
 * `EventEmitter.emit('user_input_transcribed')`. A synchronous throw in any
 * listener skips every later listener and rejects the STT task, which the SDK
 * only logs: no further turn is heard (#3991). About 100 feature listeners in
 * ~40 files watch the session, so guarding each call site would never stay
 * complete. Instead every listener registered after this runs in its own
 * try/catch, and an async listener's rejection is caught; both are logged as
 * SESSION_LISTENER_THREW with the event and the listener's name.
 *
 * `off(event, fn)` keeps working with the original function: each wrapper
 * carries `.listener = fn`, which Node's removeListener already matches (the
 * same way it finds `once` wrappers). Listeners the SDK registers in its own
 * constructor run before this is installed and stay unguarded.
 *
 * Every place that builds an AgentSession must call this; a test checks.
 *
 * @module agents/shared/session-listener-guard
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'session-listener-guard' });

type Listener = (...args: unknown[]) => unknown;
type Register = (event: string | symbol, fn: Listener) => unknown;
type Wrapper = Listener & { listener: Listener };

interface SessionEmitter {
  on: Register;
  addListener: Register;
  prependListener: Register;
  once: Register;
  prependOnceListener: Register;
  removeListener: Register;
}

const METHODS = [
  'on',
  'addListener',
  'prependListener',
  'once',
  'prependOnceListener',
  'removeListener',
] as const;

/** Sessions already guarded, so a second call doesn't wrap listeners twice. */
const guardedSessions = new WeakSet<object>();

function isSessionEmitter(value: object): value is SessionEmitter {
  return METHODS.every((name) => typeof Reflect.get(value, name) === 'function');
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function';
}

/** Runs `fn` so that neither a throw nor a rejection escapes; logs at 1, 2, 4, 8... failures. */
function guarded(event: string | symbol, fn: Listener): Listener {
  let failures = 0;
  const report = (error: unknown): void => {
    failures += 1;
    if ((failures & (failures - 1)) !== 0) return; // a listener throwing on every interim stays quiet
    log.error(
      {
        event: String(event),
        listener: fn.name || 'anonymous',
        failures,
        // The thrown value itself: the logger redacts it (error-text.ts), cutting any caller
        // words the message quotes from both the message and the stack.
        error,
      },
      'SESSION_LISTENER_THREW'
    );
  };
  return function (this: unknown, ...args: unknown[]): unknown {
    try {
      const result = fn.apply(this, args);
      if (isThenable(result)) result.then(undefined, report);
      return result;
    } catch (error) {
      report(error);
      return undefined;
    }
  };
}

export function isolateSessionListeners<T extends object>(session: T): T {
  if (!isSessionEmitter(session) || guardedSessions.has(session)) return session;
  guardedSessions.add(session);
  const emitter: SessionEmitter = session;

  const on = emitter.on.bind(emitter);
  const prepend = emitter.prependListener.bind(emitter);

  const always =
    (register: Register): Register =>
    (event, fn) => {
      register(event, Object.assign(guarded(event, fn), { listener: fn }));
      return session;
    };

  const once =
    (register: Register): Register =>
    (event, fn) => {
      const run = guarded(event, fn);
      let fired = false; // a stale copy of the listener list in an outer emit must not fire it twice
      const wrapper: Wrapper = Object.assign(
        function (this: unknown, ...args: unknown[]): unknown {
          if (fired) return undefined;
          fired = true;
          emitter.removeListener(event, wrapper);
          return run.apply(this, args);
        },
        { listener: fn }
      );
      register(event, wrapper);
      return session;
    };

  emitter.on = emitter.addListener = always(on);
  emitter.prependListener = always(prepend);
  emitter.once = once(on);
  emitter.prependOnceListener = once(prepend);
  return session;
}
