/**
 * A goodbye turn, decided in code from the call's wrap-up state: the caller's line ends with a
 * goodbye, Ferni's line before it was a goodbye, or both sides have already said goodbye on this
 * call. Only then may the classifier's goodbye rules apply (crisis-goodbye-rules.ts); mid-call,
 * "goodbye to all of it" is read with the base prompt alone.
 *
 * @module GoodbyeTurn
 */

import { callerSaysGoodbye, farewellSaid, ferniSaysGoodbye } from './call-farewell.js';

export function goodbyeTurn(
  input: { latest: string; companion?: string },
  call: string | undefined
): boolean {
  return (
    callerSaysGoodbye(input.latest) ||
    ferniSaysGoodbye(input.companion ?? '') ||
    (call !== undefined && farewellSaid(call))
  );
}
