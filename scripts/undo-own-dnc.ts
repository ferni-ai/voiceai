#!/usr/bin/env npx tsx
/**
 * An operator lifts a do-not-call on a user's OWN verified number (they asked
 * to be called again). Never takes a number: it uses the account's verified
 * phone, so it can't lift someone else's do-not-call, and never for a
 * sponsored identity. Recorded as admin-undo. A dry run unless --execute and
 * --confirm-project (`ferni users undo-dnc <userId> --execute` asks for it).
 *
 * Usage: npx tsx scripts/undo-own-dnc.ts --user=<userId> [--dry-run | --execute --confirm-project=<id>]
 */
import { undoOwnCallOptOut } from '../src/services/messaging/owner-call-optin.js';

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const user = arg('user');
const execute = process.argv.includes('--execute') && !!arg('confirm-project');
if (!user) {
  console.error(
    'Usage: npx tsx scripts/undo-own-dnc.ts --user=<userId> [--execute --confirm-project=<id>]'
  );
  process.exit(1);
}
const out = await undoOwnCallOptOut(user, undefined, { source: 'admin-undo', dryRun: !execute });
if (!out.ok) console.log(`Not done: ${out.reason}`);
else if (out.dryRun)
  console.log(`Dry run: would allow calls to the number ending ${out.phoneLast4}.`);
else console.log(`Done: calls to the number ending ${out.phoneLast4} are allowed again.`);
process.exit(out.ok ? 0 : 1);
