import type { FlagSpec } from '../flag-spec.js';

// on: a proactive call never rings, and its hold never ends, inside the callee's 21:00-08:00 on the member and own-number paths (services/outreach/call-hours-recipient.ts). A call to the member keeps the default night in their zone even with no quiet hours saved, unless it is their own "call me" asked for in a live call; each hold's end is asked again until every check allows, so a London owner's own 212 number waits for New York's morning. Unknown, toll-free and no-zone numbers, opt-outs and grants are unchanged. Off: today's holds.
export const NIGHT_WINDOW_ALL_PATHS = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-05',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3599',
  context:
    'Turn on after the callee-hours grid shows 0 night rings on dev; then make it the default.',
} as const satisfies FlagSpec;
