/**
 * The kept copy of the crisis script words a caller can hear (crisis-script-words.kept.md), and
 * the owner's stamp on it. crisis-script-words.test.ts writes the file from the real scriptReply,
 * and its flip gate reads the stamp: CRISIS_SCRIPT_IMMINENT_READ may default on only while the
 * stamp is current.
 *
 * The stamp line is `reviewed: none`, or `reviewed: <github login> <YYYY-MM-DD> sha256:<hex>`,
 * where the hash is of everything after the stamp line. A builder writes it, in a commit of its
 * own, after the owner approves that commit's exact head; never the verifier.
 */
import { createHash } from 'crypto';
import { join } from 'path';

export const KEPT_PATH = join(
  process.cwd(),
  'src/agents/personas/__tests__/crisis-script-words.kept.md'
);

const STAMP_LINE = /^reviewed: (.*)$/m;
const STAMPED = /^(\S+) (\d{4}-\d{2}-\d{2}) sha256:([0-9a-f]{64})$/;

export type KeptStamp =
  | { state: 'none' }
  | { state: 'current' | 'stale'; reviewer: string; date: string }
  | { state: 'malformed'; why: string };

/** The kept file split at its stamp line: what comes before it, the stamp, and the blocks. */
export function splitKept(file: string): { head: string; stamp: string; blocks: string } | null {
  const match = STAMP_LINE.exec(file);
  if (!match) return null;
  const end = match.index + match[0].length + 1;
  return { head: file.slice(0, match.index), stamp: match[1], blocks: file.slice(end) };
}

const blocksHash = (blocks: string): string =>
  createHash('sha256').update(blocks, 'utf8').digest('hex');

/** The owner's stamp on a kept file: none yet, current, stale (the words changed), or malformed. */
export function stampOf(file: string): KeptStamp {
  const parts = splitKept(file);
  if (!parts) return { state: 'malformed', why: 'no `reviewed:` line' };
  if (parts.stamp === 'none') return { state: 'none' };
  const stamped = STAMPED.exec(parts.stamp);
  if (!stamped) return { state: 'malformed', why: `unreadable stamp '${parts.stamp}'` };
  const [, reviewer, date, hash] = stamped;
  return { state: hash === blocksHash(parts.blocks) ? 'current' : 'stale', reviewer, date };
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
