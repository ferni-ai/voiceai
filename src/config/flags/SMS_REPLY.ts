import type { FlagSpec } from '../flag-spec.js';

// on: a verified member's text gets a reply from their routed persona (services/outreach/sms-reply). The text's crisis read comes first ('replace' sends SMS_CRISIS_REPLY; 'guide' puts the guidance last and the sent text always carries 988), then opt-out, pause and the reply rate; the 14 days after a crisis get one fixed warm reply, never a model's. A held minor gets the care note and the AI reminder, no recall read, nothing kept. Needs SMS_CRISIS_SCREEN=on and MINOR_CARE_SHARED_HOLD on. Off: no reply, as before.
export const SMS_REPLY = {
  default: 'off',
  owner: 'memory',
  kind: 'experiment',
  expires: '2027-02-08',
  issue: 'https://github.com/ferni-ai/voiceai/issues/3682',
  context:
    "Memory step 7: on in dev after the reply rows and an independent verify; prod only on Seth's yes.",
} as const satisfies FlagSpec;
