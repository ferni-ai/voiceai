/**
 * The kept crisis script words (crisis-script-words.kept.md) and the owner's stamp on them, which
 * the flip gate reads: CRISIS_SCRIPT_IMMINENT_READ may default on only while it is current.
 *
 * The stamp line is `reviewed: none`, or `reviewed: <github login> <YYYY-MM-DD> sha256:<hex>`
 * (the hash of everything after it). Current means the hash matches and the login is a crisis
 * owner in scripts/ci/autonomy-policy.json (approvers.crisis); no login is written here. A builder
 * writes it, in a commit of its own, after the owner approves that commit's exact head.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

export const KEPT_PATH = join(
  process.cwd(),
  'src/agents/personas/__tests__/crisis-script-words.kept.md'
);
const POLICY_PATH = join(process.cwd(), 'scripts/ci/autonomy-policy.json');

interface Policy {
  approvers?: { crisis?: unknown };
}
const STAMP_LINE = /^reviewed: (.*)$/m;
const STAMPED = /^(\S+) (\d{4}-\d{2}-\d{2}) sha256:([0-9a-f]{64})$/;

export type KeptStamp =
  | { state: 'none' }
  | { state: 'current' | 'stale' | 'not-owner'; reviewer: string; date: string }
  | { state: 'malformed'; why: string };

/** The crisis owners the policy names (approvers.crisis); empty when it names none. */
export function crisisOwners(): string[] {
  const policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8')) as Policy;
  const owners = policy.approvers?.crisis;
  return Array.isArray(owners) ? owners.filter((o): o is string => typeof o === 'string') : [];
}

/** The kept file split at its stamp line: what comes before it, the stamp, and the blocks. */
export function splitKept(file: string): { head: string; stamp: string; blocks: string } | null {
  const match = STAMP_LINE.exec(file);
  if (!match) return null;
  const end = match.index + match[0].length + 1;
  return { head: file.slice(0, match.index), stamp: match[1], blocks: file.slice(end) };
}

const blocksHash = (blocks: string): string =>
  createHash('sha256').update(blocks, 'utf8').digest('hex');

/** The stamp: none, current, stale (the words changed), not-owner (by the policy) or malformed. */
export function stampOf(file: string, owners: readonly string[] = crisisOwners()): KeptStamp {
  const parts = splitKept(file);
  if (!parts) return { state: 'malformed', why: 'no `reviewed:` line' };
  if (parts.stamp === 'none') return { state: 'none' };
  const stamped = STAMPED.exec(parts.stamp);
  if (!stamped) return { state: 'malformed', why: `unreadable stamp '${parts.stamp}'` };
  const [, reviewer, date, hash] = stamped;
  if (hash !== blocksHash(parts.blocks)) return { state: 'stale', reviewer, date };
  const owner = owners.some((o) => o.toLowerCase() === reviewer.toLowerCase());
  return { state: owner ? 'current' : 'not-owner', reviewer, date };
}

/** The kept file with the owner's stamp on its current blocks (the follow-up commit's change). */
export function stamped(file: string, reviewer: string, date: string): string {
  const parts = splitKept(file);
  if (!parts) throw new Error('kept file has no `reviewed:` line');
  const line = `reviewed: ${reviewer} ${date} sha256:${blocksHash(parts.blocks)}`;
  return `${parts.head}${line}\n${parts.blocks}`;
}

/**
 * Whether CRISIS_SCRIPT_IMMINENT_READ may have this default: 'on' changes the words a caller
 * hears, so it needs a current stamp; 'off' and 'shadow' say today's words and need none.
 */
export const flipAllowed = (flagDefault: string, stamp: KeptStamp): boolean =>
  flagDefault !== 'on' || stamp.state === 'current';
