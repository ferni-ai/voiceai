/**
 * What the inbound SMS handler answers the route with. `called`: a "call me" text placed a call
 * now, or for later. `crisis`: SMS_REPLY's own crisis read answered the text. `unverified`: from no
 * member's verified phone and not a maybe-"stop" (SMS_REPLY_UNVERIFIED).
 */
export type InboundSmsResult = {
  success: boolean;
  twiml?: string;
  called?: 'now' | 'later';
  crisis?: true;
  unverified?: true;
};
