import type { FlagSpec } from '../flag-spec.js';

// on: what Ferni says he did must be backed by real state (action-claim-guard.ts). A past "I checked / I searched / I looked it up" with no tool run this turn, and a "let me look" with no tool call in the reply, become an honest line or an offer (announced-check.ts, #3003). A call, text or booking claimed done or under way, or "I will let you know when I have reached them", with its tool open but not run in the reply, this turn or earlier on the call, gets the not-yet line (#3006). Asked "did you call my mom?", a "yes, I did" or a story of the call stands only with the call result in the conversation, not a records lookup the model never saw (call-narration.ts, #3005). On calls placed for the owner, Ferni is told to say he does not have an earlier call or message in front of him rather than invent one (outbound-call-context.ts, #3008). Off: as before.
export const GROUNDED_CLAIMS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
