import type { FlagSpec } from '../flag-spec.js';

// on: Alex writes the morning brief in his own words from the facts the brief already checked (services/outreach/morning-brief/brief-writer.ts), and a deterministic check (brief-check.ts) passes it before it goes; any failure, a crisis read in the last 24 h, or a keep-ask item sends the template instead. Off: the template, as before.
export const MORNING_BRIEF_WRITER = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-03-01',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4412',
  context:
    'Keep if the nightly brief check holds grounded and complete with a low fallback rate; else delete.',
} as const satisfies FlagSpec;
