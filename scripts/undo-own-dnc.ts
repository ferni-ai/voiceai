#!/usr/bin/env npx tsx
/**
 * Lift a do-not-call on a user's OWN verified number (they asked to be called
 * again). Never takes a number: it uses the account's verified phone, so it
 * can't lift someone else's do-not-call. Writes a call opt-in to
 * consent/{phoneHash} and removes the call_opt_outs entry.
 *
 * Usage: npx tsx scripts/undo-own-dnc.ts --user=<userId>
 * (or `ferni users undo-dnc <userId>`)
 */
import { undoOwnCallOptOut } from '../src/services/messaging/owner-call-optin.js';

const user = process.argv.find((a) => a.startsWith('--user='))?.slice('--user='.length);
if (!user) {
  console.error('Usage: npx tsx scripts/undo-own-dnc.ts --user=<userId>');
  process.exit(1);
}
const out = await undoOwnCallOptOut(user);
console.log(
  out.ok
    ? `Done: calls to the number ending ${out.phoneLast4} are allowed again.`
    : `Not done: ${out.reason}`
);
process.exit(out.ok ? 0 : 1);
