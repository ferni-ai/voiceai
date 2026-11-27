import type { FlagSpec } from '../flag-spec.js';

// on: a call Ferni placed for the user is reported as "they asked you to call back" only when the person on it asked (the analysis's callbackRequested); a missed call, a voicemail greeting or a lost transcript carries retryOffered instead, is reported in Ferni's words by name ("Linda didn't pick up.", "My call to Linda didn't go through.", never a status or a carrier error), and each report offers once to try her again or let the user call; a person who picked up and said no is handed back the way a friend would ("I got hold of Linda, but it wasn't a good time for her. She might like hearing from you directly."), never offered as a redial, with a pronoun only from the saved relationship (services/background-agents/call-follow-up/callback-meaning.ts). Both stores keep the call's own fields and every reader derives the ask from them, so processes with the flag set differently agree. The "Call them back" event is made only for a real ask, on the user's saved zone (userTimezone; none or invalid, no event), where a clock time wins ("tonight at 8pm" is 20:00) and "tonight" alone is 18:00, or an hour from now once past; the web keeps a missed call as "Action needed". Off: every one of those (a refusal too) sets callbackRequired, the reports say the person wants a call back in main's words, and the event uses the server's clock, as before.
export const CALLBACK_MEANS_ASKED = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
  expires: '2027-02-26',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4468',
  context:
    'dev on, then a no-answer call never reports that the person asked for a call back and a real ask makes its calendar event at the user-zone time; then prod on the owner yes and delete the flag.',
} as const satisfies FlagSpec;
