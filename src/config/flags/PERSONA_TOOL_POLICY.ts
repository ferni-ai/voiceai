import type { FlagSpec } from '../flag-spec.js';

// on: each persona manifest tools.forbidden list is removed from that persona tool set, in getToolsForAgent (all three paths) and on the multi-agent tool set before the cap; handoff, crisis, privacy and endCall tools are never removed, and a manifest that forbids one gets a warning instead (tools/orchestrator/persona-tool-policy.ts).
export const PERSONA_TOOL_POLICY = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
