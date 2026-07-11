/**
 * Resolve whether entry should take multi-agent or single-agent path.
 *
 * @module agents/voice-agent-entry/session-path
 */

export type SessionPath = 'multi-agent' | 'single-agent';

export function resolveSessionPath(multiAgentMode: boolean): SessionPath {
  return multiAgentMode ? 'multi-agent' : 'single-agent';
}
