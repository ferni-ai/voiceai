import type { FlagSpec } from '../flag-spec.js';

// on: a fact the text chat's rememberAboutUser keeps (memory-executor.ts) is also written to dynamic_facts through the remembered-fact writer, so a later call recalls it by meaning. That writer still needs REMEMBER_TO_RECALL or MEMORY_TOOLS_HONEST. Read in agents/shared/tool-executors/chat-remember-to-recall.ts; off = only the extracted_facts write, as before.

export const CHAT_REMEMBER_TO_RECALL = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-21',
  issue: '#2518',
} as const satisfies FlagSpec;
