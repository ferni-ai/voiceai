import type { FlagSpec } from '../flag-spec.js';

// on: the Digital Twin hears the conversation so far, is told never to invent facts about the person's life (say it doesn't remember instead), greets only on the first turn, keeps its sign-off for goodbyes, and its reply carries no em dashes (twin-reply.ts).
export const TWIN_CONVERSATION_V2 = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-03-01',
  issue: '#3863',
  context: 'Promote after dev conversations show no invented facts and no repeated greetings.',
} as const satisfies FlagSpec;
