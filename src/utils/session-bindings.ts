/**
 * Session Bindings
 *
 * Values bound to a live session, such as the room a call publishes to or the
 * callback that reaches its client. One worker process serves several calls at
 * once, so a module-level "current" value would hand one caller's data to
 * another.
 *
 * @module utils/session-bindings
 */

/** A map from session ID to the value that session registered. */
export interface SessionBindings<T> {
  /** Bind `value` to `sessionId`, replacing any earlier value for that session. */
  bind: (sessionId: string, value: T) => void;
  /**
   * Remove the session's value. When `value` is given, only removes it if it is
   * still the bound one, so a late cleanup can't remove a newer binding.
   */
  release: (sessionId: string, value?: T) => void;
  /**
   * The value for `sessionId`. Without a session ID, the value is returned only
   * when exactly one session is bound; with several live calls an unkeyed
   * lookup can't tell which caller it belongs to and returns undefined.
   */
  resolve: (sessionId?: string) => T | undefined;
  size: () => number;
  clear: () => void;
}

/** Create a {@link SessionBindings} map. */
export function createSessionBindings<T>(): SessionBindings<T> {
  const values = new Map<string, T>();
  return {
    bind(sessionId, value) {
      values.set(sessionId, value);
    },
    release(sessionId, value) {
      if (value !== undefined && values.get(sessionId) !== value) return;
      values.delete(sessionId);
    },
    resolve(sessionId) {
      if (sessionId) return values.get(sessionId);
      if (values.size !== 1) return undefined;
      return values.values().next().value;
    },
    size: () => values.size,
    clear: () => values.clear(),
  };
}
