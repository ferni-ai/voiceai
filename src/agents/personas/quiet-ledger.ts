/**
 * TROUBLES_TALK=on: on a trouble ("Do you have a minute to talk?", bad news)
 * the ledger keeps him consistent but invites no thread of his own
 * (troubles-talk.ts); "pick a thread back up" got his brother's first snow.
 *
 * @module agents/personas/quiet-ledger
 */

import { BRIDGE_FOOTER, THREAD_FOOTER } from './life-ledger.js';
import { troublesTalkEnabled, troubleWords } from './troubles-talk.js';

/** The ledger note with its thread invite swapped for the bridge footer on a trouble. */
export function quietLedger(note: string | null, said: string): string | null {
  if (!note || !troublesTalkEnabled() || !troubleWords(said)) return note;
  return note.replace(THREAD_FOOTER, BRIDGE_FOOTER);
}
