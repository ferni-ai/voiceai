/**
 * Alex's prompt as chief of staff (ALEX_CHIEF_OF_STAFF=on).
 *
 * With the flag on, Ferni hands planning to Alex (tools/handoff/chief-of-staff-note.ts),
 * so Alex's prompt carries identity/chief-of-staff.md after it: the one thing that
 * matters today first, short lists, a read-back for anything he adds, one clarifying
 * question at most, Ferni for feelings and life, and the weekly review. Read when
 * the agent is built (agent-setup.ts), after applyCallerFlags. Off, or for anyone
 * but Alex, the prompt is exactly as loaded.
 *
 * @module agents/personas/chief-of-staff-role
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alexChiefOfStaffEnabled,
  CHIEF_OF_STAFF_ID,
} from '../../config/alex-chief-of-staff-flag.js';
import { getCanonicalPersonaId } from '../../personas/voice-registry.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'chief-of-staff-role' });

export const CHIEF_OF_STAFF_FILE = 'identity/chief-of-staff.md';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../personas/bundles');

/** `prompt`, with Alex's chief-of-staff role after it while the flag is on. */
export async function withChiefOfStaffRole(personaId: string, prompt: string): Promise<string> {
  if (!alexChiefOfStaffEnabled() || getCanonicalPersonaId(personaId) !== CHIEF_OF_STAFF_ID) {
    return prompt;
  }
  const role = await readFile(join(BUNDLES, CHIEF_OF_STAFF_ID, CHIEF_OF_STAFF_FILE), 'utf8').catch(
    (error: unknown) => {
      log.warn({ error: String(error) }, 'Chief-of-staff role not read; Alex keeps his prompt');
      return null;
    }
  );
  return role ? `${prompt.trimEnd()}\n\n${role.trim()}\n` : prompt;
}
