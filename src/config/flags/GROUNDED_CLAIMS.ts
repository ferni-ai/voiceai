import type { FlagSpec } from '../flag-spec.js';

// on: what Ferni says he did must be backed by real state (action-claim-guard.ts). A past "I checked / I searched / I looked it up" stands only on a look-up tool run since the caller spoke (or just before a short "are you sure?"), and a "let me look" only on a look-up call in the reply; otherwise an honest line or an offer, and the invented result goes too (announced-check.ts, #3003). A call or text claimed done or under way, "I'll let you know once I've reached her" and "I'll make sure to give her a call" (read only with this flag, and only with a person after the verb) stand only on their tool's run in the reply, this turn or this call, a call result in the conversation, or a question about an earlier session (#3006). Asked "did you call my mom?", a "yes, I did" or a story of the call, and what "she said" after it, stand only on the call result in the conversation, not a records lookup the model never saw (call-narration.ts, #3005). On calls placed for the owner, Ferni is told to say he does not have an earlier call or message in front of him rather than invent one (outbound-call-context.ts, #3008). Evidence is per person and read from the call records in the store (on_behalf_calls, the callStatus source) and this call's call or text tools, never from the chat (claim-evidence.ts); a simple-past text with no text tool behind it is rewritten. Off: exactly as before.
export const GROUNDED_CLAIMS = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
