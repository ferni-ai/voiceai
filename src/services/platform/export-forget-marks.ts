/**
 * The data export marks what the caller asked Ferni to forget, and leaves it in (#3995).
 *
 * forget.ts hides by design rather than deleting (a misread request must be recoverable), so
 * the records stay stored, and the export is the person's copy of what is kept ("Take your
 * story"). Dropping them would hand over a file that leaves out data Ferni still holds, and
 * hide a misread forget from the one place it could be seen. So, with FORGET_EVERY_READER on,
 * the export lists the forgotten topics and tags each record about one `heldByForget: true`,
 * matched as the open-loop and insight readers hold them (isForgottenPassage: any distinctive
 * word of a topic). Owner's decision, 2026-11-18: mark, don't drop.
 *
 * The list is read fresh (an export is not on a call's clock). If it can't be read, nothing is
 * tagged and the export says so: nothing is left out either way.
 *
 * @module services/platform/export-forget-marks
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'export-forget-marks' });

/** What the export envelope carries about forgotten topics. */
export interface ForgetMarks {
  /** The topics the person asked Ferni to forget; null when the list couldn't be read. */
  forgottenTopics: string[] | null;
  /** Why records are tagged, for a reader of the file. */
  forgottenNote: string;
  /** How many records are tagged, for the CSV's header line (each tagged row also says so). */
  heldCount: number;
}

const NOTE =
  'Records tagged heldByForget mention a topic you asked Ferni to forget. Ferni still stores ' +
  'them, so they are in this file, and holds them back. Tags come from matching words.';
const UNREAD_NOTE =
  "Your forgotten topics couldn't be read, so no record is tagged. Nothing was left out.";

/**
 * Tags, in place, every record in `categories` about a forgotten topic, and returns what the
 * envelope should say; undefined with the flag off (the export is unchanged).
 */
export async function markHeldByForget(
  userId: string,
  categories: Record<string, unknown>,
  env: Env = process.env
): Promise<ForgetMarks | undefined> {
  if (!flagOn('FORGET_EVERY_READER', env)) return undefined;
  try {
    const { forgottenInProcess, forgottenTopicsOrNull, isForgottenPassage } =
      await import('../../memory/index.js');
    const stored = await forgottenTopicsOrNull(userId);
    if (stored !== null) {
      const topics = [...new Set([...stored, ...forgottenInProcess(userId)])];
      const heldCount =
        topics.length > 0 ? tag(categories, (text) => isForgottenPassage(text, topics)) : 0;
      return { forgottenTopics: topics, forgottenNote: NOTE, heldCount };
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Forget marks failed');
  }
  // The export goes out whole either way: a mark is extra, never a reason to fail the file
  log.warn({ userId }, 'Forgotten topics unreadable: export not tagged');
  return { forgottenTopics: null, forgottenNote: UNREAD_NOTE, heldCount: 0 };
}

/** Every string under a value, a few levels down. */
function textOf(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth > 6 || value === null || typeof value !== 'object') return '';
  const parts = Array.isArray(value) ? value : Object.values(value);
  return parts.map((v) => textOf(v, depth + 1)).join(' ');
}

/**
 * Tags each record (an object in a list, at any depth) whose text is about a forgotten topic,
 * the innermost one: a conversation is tagged only when no message in it explains the match.
 * Returns how many records under `value` were tagged.
 */
function tag(value: unknown, about: (text: string) => boolean, depth = 0): number {
  if (depth > 6 || value === null || typeof value !== 'object') return 0;
  let tagged = 0;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const inner = tag(item, about, depth + 1);
    // Only this pass's tags count: a stored heldByForget value is data, not an explanation
    const hit = inner === 0 && Array.isArray(value) && isRecord(item) && about(textOf(item));
    if (hit) item.heldByForget = true;
    tagged += inner + (hit ? 1 : 0);
  }
  return tagged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The CSV file's header lines for the marks; none with the flag off. */
export function forgetMarksCsvLines(marks: Partial<ForgetMarks>): string[] {
  if (marks.forgottenTopics === undefined) return [];
  // The caller's own words: a newline would end the comment line and start a bare data line
  const topics = marks.forgottenTopics?.join('; ').replace(/[\r\n]+/g, ' ') ?? 'could not be read';
  const lines = [`# Forgotten topics: ${topics}`, `# ${marks.forgottenNote ?? ''}`];
  if (marks.forgottenTopics === null) return lines;
  // Each tagged record is a row with a heldByForget cell (export-csv.ts); this says how many
  return [...lines, `# Records tagged heldByForget: ${marks.heldCount ?? 0}.`];
}
