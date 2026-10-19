/**
 * The slice of the call-state machine the conductor reads.
 *
 * RECONCILE: PR #1686 (apps/web/src/app/call/call-machine.ts) owns these
 * types. It had not merged into this branch's base, so they are restated here
 * with #1686's exact names; once it lands, re-export from './call-machine.js'
 * and delete this file. `Transition` matches #1686's shape (its `event` is the
 * narrower `CallEvent['type']`, which is assignable to `string`).
 */

export type CallState =
  | 'idle'
  | 'connecting'
  | 'connecting_slow'
  | 'arrival'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'speaking'
  | 'handoff_out'
  | 'handoff_in'
  | 'ending'
  | 'ended'
  | 'error';

export type Mood = 'neutral' | 'tender' | 'upset' | 'crisis';

export interface Transition {
  readonly from: CallState;
  readonly to: CallState;
  readonly event: string;
  readonly at: number;
}
