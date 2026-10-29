import type { FlagSpec } from '../flag-spec.js';

// on: the prompt lists what a caller can change in the app and nothing else, so Ferni never offers a voice switch that does not exist (agents/personas/app-settings-honesty.ts, #2460)
export const APP_SETTINGS_HONESTY = {
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
} as const satisfies FlagSpec;
