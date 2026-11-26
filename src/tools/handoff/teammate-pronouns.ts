/**
 * Teammates' pronouns on the team lines a persona reads every turn, while
 * TEAMMATE_PRONOUNS is on.
 *
 * The canon pronouns (personas/persona-pronouns.ts) reached the life ledger and
 * the director, but no line a persona sees about its teammates carried them, so
 * the model guessed from the name. Prod call 2026-10-13: Ferni called Jordan
 * both "he" and "she" in one call (#1486). Dev call 2026-11-11: Maya called
 * Alex "she". So the per-turn team lines (team-by-need-note.ts with TEAM_BY_NEED
 * on, locked-teammates.ts teamStatusNote with it off) name each teammate as
 * "Jordan (she/her)", read from persona-pronouns.ts, never written out here.
 *
 * @module tools/handoff/teammate-pronouns
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { getPersonaPronouns } from '../../personas/index.js';

/**
 * "Jordan (she/her)" for `name` while TEAMMATE_PRONOUNS is on; `name` as is while off.
 *
 * @param id - the teammate's canonical persona id ("jordan-taylor"), the key into the canon
 * @param name - how the line names them ("Jordan", "Henry Caldwell")
 */
export function withPronouns(id: string, name: string, env: Env = process.env): string {
  if (!flagOn('TEAMMATE_PRONOUNS', env)) return name;
  const { subject, object } = getPersonaPronouns(id);
  return `${name} (${subject}/${object})`;
}
