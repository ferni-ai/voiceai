import type { FlagSpec } from '../flag-spec.js';

export const TASK_TOOLS_ALWAYS_ON = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-14',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3958',
} as const satisfies FlagSpec;
