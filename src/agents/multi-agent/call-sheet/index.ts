/**
 * The call sheet in a call (PERSON_MODEL_READ, off by default; call-sheet plan M6,
 * docs/plans/2026-10-27-memory-call-sheet.md §4): the nightly person model
 * (person_model/current) rendered as private notes in the model instructions, after
 * "Who You're Talking To".
 *
 * Off the critical path: startCallSheet begins the reads at persona setup start, and take()
 * is synchronous, called just before the model is made. A load that hasn't settled by then
 * means no sheet for that persona, never a later first word.
 *
 * No sheet (each logged as a reason, counts only) unless all of these hold:
 * - a verified member with the owner proven on the line, on a call Ferni didn't place;
 * - no MINOR_CARE hold (account, strict; or this call, re-checked at take);
 * - no crisis risk on this call (re-checked at take) and no crisis signal in the last
 *   CRISIS_QUIET_DAYS;
 * - nothing forgotten since the build (a stored or seen forget generation above the
 *   sheet's): topic matching can miss a paraphrase, so a forget hides the whole sheet until
 *   it is rebuilt; the rest is re-rendered with the forgotten topics read now;
 * - built less than STALE_DAYS ago.
 *
 * @module agents/multi-agent/call-sheet
 */
import { flagOn } from '../../../config/env-flag.js';
import { renderPersonModel } from '../../../intelligence/person-model/index.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../../services/identity/unverified-user-id.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { outboundPartiesFor } from '../../shared/outbound-opener.js';
import { ownerProvenHere } from '../recent-texts-awareness.js';
import type { CallSheetPorts } from './ports.js';
import { callSheetPorts } from './wiring.js';

const log = createLogger({ module: 'call-sheet' });

/** How long the reads may run before the load gives up (logged as late). */
const SHEET_BUDGET_MS = 1500;
/**
 * The job rebuilds every sheet daily (its hash includes the UTC day), so a sheet this old
 * missed two nightly runs or more: dates and open items have drifted. Stricter than the
 * render's per-section rule, which keeps a quiet caller's sections for a week.
 */
const STALE_DAYS = 3;
/** The in-call cap: whole sections drop from the bottom of the sheet past it. */
const MAX_SHEET_CHARS = 1500;

const DAY_MS = 86_400_000;

type Skip =
  | 'not_member'
  | 'owner_not_proven'
  | 'outbound'
  | 'held'
  | 'minor_care'
  | 'crisis'
  | 'no_sheet'
  | 'forgotten_unreadable'
  | 'forgotten_since_build'
  | 'stale'
  | 'empty'
  | 'late'
  | 'failed';
type Loaded = { text: string; generation: number } | { skip: Skip };

export interface PendingCallSheet {
  /** The block for the model instructions, or '' (not settled, skipped, or a hold since). */
  take(): string;
}

export interface CallSheetOptions {
  phoneCall?: boolean;
  ports?: CallSheetPorts;
  now?: () => Date;
}

/** The block as it sits in the instructions, after "Who You're Talking To". */
const callSheetBlock = (text: string): string =>
  `\n---\n\n## Your Notes On This Caller\n\n${text}\n`;

async function load(userId: string, ports: CallSheetPorts, now: () => Date): Promise<Loaded> {
  const [sheet, forgotten, minorCare, crisis] = await Promise.all([
    ports.sheet(userId),
    ports.forgotten(userId),
    ports.minorCare(userId),
    ports.recentCrisis(userId),
  ]);
  if (minorCare) return { skip: 'minor_care' };
  if (crisis) return { skip: 'crisis' };
  if (!sheet) return { skip: 'no_sheet' };
  if (forgotten.topics === null) return { skip: 'forgotten_unreadable' };
  if (forgotten.generation > sheet.forgetGeneration) return { skip: 'forgotten_since_build' };
  const at = now();
  const age = at.getTime() - Date.parse(sheet.builtAt);
  if (!(age >= 0 && age < STALE_DAYS * DAY_MS)) return { skip: 'stale' };
  const text = renderPersonModel(sheet, {
    now: at,
    forgottenTopics: forgotten.topics,
    maxChars: MAX_SHEET_CHARS,
  });
  return text ? { text, generation: sheet.forgetGeneration } : { skip: 'empty' };
}

/** Never rejects: a throw is 'failed', past the budget is 'late'. */
function bounded(work: Promise<Loaded>): Promise<Loaded> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Loaded>((resolve) => {
    timer = setTimeout(() => resolve({ skip: 'late' }), SHEET_BUDGET_MS);
    timer.unref?.();
  });
  const done = work.catch((error: unknown) => {
    log.warn({ error: String(error) }, 'PERSON_MODEL_READ read failed');
    return { skip: 'failed' } as const;
  });
  return Promise.race([done, late]).finally(() => clearTimeout(timer));
}

const skipped = (reason: Skip): PendingCallSheet => ({
  take() {
    log.info({ event: 'PERSON_MODEL_READ', outcome: reason }, 'PERSON_MODEL_READ');
    return '';
  },
});

/**
 * Starts this persona's sheet load, or returns null with the flag off (nothing read, nothing
 * to take). Synchronous; never rejects.
 */
export function startCallSheet(
  sessionId: string,
  userId: string | undefined,
  opts: CallSheetOptions = {}
): PendingCallSheet | null {
  if (!flagOn('PERSON_MODEL_READ')) return null;
  const id = userId ?? '';
  if (!isMemberIdentity(id) || isUnverifiedUserId(id)) return skipped('not_member');
  // Caller ID can be spoofed, and Ferni's own calls reach other people.
  if (!ownerProvenHere(sessionId, opts.phoneCall === true)) return skipped('owner_not_proven');
  if (outboundPartiesFor(sessionId)) return skipped('outbound');
  const ports = opts.ports ?? callSheetPorts();
  if (ports.heldNow(sessionId)) return skipped('held');

  const started = Date.now();
  let settled: Loaded | undefined;
  let settledMs = 0;
  void bounded(load(id, ports, opts.now ?? (() => new Date()))).then((result) => {
    settled = result;
    settledMs = Date.now() - started;
  });

  return {
    take() {
      const outcome = settled ?? { skip: 'late' as const };
      let text = 'text' in outcome ? outcome.text : '';
      let reason: Skip | 'hit' = 'text' in outcome ? 'hit' : outcome.skip;
      // A hold or a forget since the load started ends it.
      if (text && ports.heldNow(sessionId)) [text, reason] = ['', 'held'];
      if (text && 'generation' in outcome && ports.generationSeen(id) > outcome.generation)
        [text, reason] = ['', 'forgotten_since_build'];
      const facts = { outcome: reason, ms: settled ? settledMs : Date.now() - started };
      log.info({ event: 'PERSON_MODEL_READ', ...facts, chars: text.length }, 'PERSON_MODEL_READ');
      return text ? callSheetBlock(text) : '';
    },
  };
}
