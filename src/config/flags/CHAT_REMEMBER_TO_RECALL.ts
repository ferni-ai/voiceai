import type { FlagSpec } from '../flag-spec.js';

// on: a fact the text chat's rememberAboutUser keeps, or updateMemory corrects (memory-executor.ts), is also written to dynamic_facts through the remembered-fact writer, so a later call recalls it by meaning. That writer still needs REMEMBER_TO_RECALL or MEMORY_TOOLS_HONEST. Read per person (a cohort may set it) in agents/shared/tool-executors/chat-remember-to-recall.ts; off = only the extracted_facts writes, as before.
// Rollout: chat runs in the UI server (Cloud Run john-bogle-ui), not the LiveKit agent, so on means the UI server env (deploy/ui-server/env.yaml plus the apps/cli/src/commands/deploy/deploy.ts path) or a cohort. Cloud Run has no dev service: on there is on in prod. The UI server needs REMEMBER_TO_RECALL or MEMORY_TOOLS_HONEST too (also cohort flags); the agent's dev secrets don't reach it.

export const CHAT_REMEMBER_TO_RECALL = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#2518',
} as const satisfies FlagSpec;
