/**
 * The gate for the `seth` teammate: the founder, speaking in his own consented
 * clone (personas/roster/voice-records.ts). Open only with SETH_TEAMMATE on and
 * his voice setting holding an id. Closed, nothing lists him, nothing hands off
 * to him, no call starts as him, and nothing speaks as him.
 *
 * In config, next to his voice (voice-ids.ts), so every context can read it:
 * personas, tools and services may import config, not each other's internals.
 *
 * @module config/seth-teammate
 */

import { flagOn, type Env } from './env-flag.js';
import { sethVoiceId } from './voice-ids.js';

const SETH_ID = 'seth';

/** True for the seth listing's id, in any case or padding. */
export function isSeth(id: string): boolean {
  return id.trim().toLowerCase() === SETH_ID;
}

export function sethTeammateOpen(env: Env = process.env): boolean {
  return flagOn('SETH_TEAMMATE', env) && sethVoiceId(env) !== null;
}

/** False only for seth while his gate is closed; every other listing is unaffected. */
export function listedNow(id: string, env: Env = process.env): boolean {
  return !isSeth(id) || sethTeammateOpen(env);
}
