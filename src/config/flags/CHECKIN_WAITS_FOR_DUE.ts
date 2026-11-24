import type { FlagSpec } from '../flag-spec.js';

// on: the call check-in (commitment-follow-up.ts loadCallCheckIns) leaves out a commitment whose target date is today or later where the caller is, and doesn't stamp it followed up, so Ferni never asks how a plan went before its day. Off: picked and stamped as before.
export const CHECKIN_WAITS_FOR_DUE = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-16',
  issue: '#3858',
  context: 'Keep once dev calls show no check-in on a plan still ahead; else delete.',
} as const satisfies FlagSpec;
