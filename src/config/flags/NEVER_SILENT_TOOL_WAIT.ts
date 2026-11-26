import type { FlagSpec } from '../flag-spec.js';

// on (with NEVER_SILENT on): a running tool keeps its own wait, outside the turn, so the agent's spoken lead-in no longer drops it. When the wait (the never-silent hang time) runs out with the tool still running and nothing playing or being generated, Ferni says once "Still on it, one sec." instead of the "say that again?" fallback, which invited a repeat of a request whose tool may still finish. The caller speaking or taking a new turn ends the wait, and the line never interrupts a reply (multi-agent/never-silent-tool-wait.ts). Off: as on main.
export const NEVER_SILENT_TOOL_WAIT = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4220',
  context:
    'Turn on in dev with NEVER_SILENT on; promote after a dev night with no tool_wait line over a reply and no repeated writes after a slow tool.',
} as const satisfies FlagSpec;
