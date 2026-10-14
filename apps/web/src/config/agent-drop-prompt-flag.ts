/**
 * Agent-drop prompt flag. Off by default.
 *
 * When on, the call offers "Reconnect" / "End call" if Ferni's side of the call
 * ends while the caller is still here (services/agent-drop-watch.ts). Prod
 * 2026-10-13: the agent session closed on an error and the caller sat alone on
 * a silent line for 15+ minutes with nothing on screen.
 *
 * Turn it on for one browser with
 * `localStorage.setItem('ferni:agent-drop-prompt', 'true')`, or for a build
 * with `VITE_AGENT_DROP_PROMPT=true`.
 */
export const AGENT_DROP_PROMPT_FLAG_KEY = 'ferni:agent-drop-prompt';

export function isAgentDropPromptOn(): boolean {
  if (import.meta.env.VITE_AGENT_DROP_PROMPT === 'true') return true;
  try {
    return localStorage.getItem(AGENT_DROP_PROMPT_FLAG_KEY) === 'true';
  } catch {
    // Storage blocked (private mode, sandboxed frame): the flag stays off.
    return false;
  }
}
