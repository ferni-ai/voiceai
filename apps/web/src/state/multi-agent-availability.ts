/**
 * Whether team (multi-agent) mode is available on the current call.
 *
 * The voice agent sends `multi_agent_unavailable` when team mode fails to start
 * and it falls back to a single agent. The flag lives here, with no imports, so
 * the handoff service can read it without pulling in any UI. It is per call:
 * a disconnect clears it.
 */

let unavailable = false;

/** Marks team mode unavailable. Returns true the first time on a call. */
export function markMultiAgentUnavailable(): boolean {
  if (unavailable) return false;
  unavailable = true;
  document.documentElement.dataset['multiAgent'] = 'unavailable';
  return true;
}

export function isMultiAgentUnavailable(): boolean {
  return unavailable;
}

export function resetMultiAgentAvailability(): void {
  unavailable = false;
  delete document.documentElement.dataset['multiAgent'];
}

document.addEventListener('ferni:disconnected', resetMultiAgentAvailability);
