import type { FlagSpec } from '../flag-spec.js';

// on: a registered tool that returns { success: false, ... } reaches the model as an error result (isError true) with the same JSON text it read before, instead of as a success. Crisis, human-transfer, presence and trauma-support tools and sendSupportCall are exempt and pass through unchanged (tools/registry/result-errors.ts). Off: as on main.
export const TOOL_RESULT_ERRORS = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  expires: '2027-02-19',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4236',
  context:
    'Turn on in dev; promote after a dev night where failed tool calls are said as failures and no crisis-domain result changed.',
} as const satisfies FlagSpec;
