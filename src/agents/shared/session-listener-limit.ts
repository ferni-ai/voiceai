/**
 * The listener limit for an agent session.
 *
 * About 16 features (backchannels, turn sounds, the director, tool hum, the
 * reply gateway's per-reply listener, ...) each watch agent_state_changed on
 * one AgentSession. That is by design, but it is over Node's default limit of
 * 10, so every call logged MaxListenersExceededWarning (which CrashAnalytics
 * reports as a crash precursor) and a real leak would have looked the same.
 * 32 leaves room for the designed watchers and still flags growth.
 *
 * Every place that builds an AgentSession must call this; a test checks.
 *
 * @module agents/shared/session-listener-limit
 */

export const AGENT_SESSION_MAX_LISTENERS = 32;

export function limitSessionListeners<T extends { setMaxListeners(n: number): unknown }>(session: T): T {
  session.setMaxListeners(AGENT_SESSION_MAX_LISTENERS);
  return session;
}
