/**
 * FERNI_PERSONA_SLIP_GUARD=on (off by default): keeps Ferni's own life apart
 * from the product team and from what he is.
 *
 * Prod phone call, 2026-10-11: asked whether he had friends, Ferni named
 * "Peter and Maya on the team" and the caller. Every caller turn carries the
 * team line ("Of your teammates, only Peter and Maya are available to this
 * caller", locked-teammates.ts), and the character sheet names no friends, so
 * the nearest people were the teammates. Asked his age, he had no idea, then
 * joked about "carbon-based years versus whatever an algorithm counts": the
 * character sheet gives no age, and the only thing about what he is in the
 * prompt is the AI-honesty rule (shared/ai-honesty.md).
 *
 * On, the character prompt gets identity/character-own-life.md (his friends,
 * his age, the team as colleagues, no AI talk unprompted) and the team line
 * says the teammates are colleagues. The AI-honesty rule is unchanged.
 *
 * @module personas/persona-slip-guard
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Env = Record<string, string | undefined>;

export function personaSlipGuardEnabled(env: Env = process.env): boolean {
  return env.FERNI_PERSONA_SLIP_GUARD === 'on';
}

/** Appended to the team line (locked-teammates.ts) when the guard is on. */
export const TEAMMATES_ARE_COLLEAGUES =
  "They're colleagues you can bring in for their specialty, not your friends or family.";

/** The character-prompt addendum, in the persona bundle. */
export const OWN_LIFE_FILE = 'identity/character-own-life.md';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), 'bundles');

/**
 * A character sheet with the bundle's own-life sheet after it, when the guard
 * is on and the bundle has one; otherwise the sheet as it is (null stays null).
 * Called by loadCharacterPrompt (agents/personas/prompt-loader.ts).
 */
export async function withOwnLife(
  sheet: string | null,
  bundleDir: string,
  env: Env = process.env
): Promise<string | null> {
  if (!sheet || !personaSlipGuardEnabled(env)) return sheet;
  // Most bundles have no own-life sheet: a missing file means the sheet as is.
  const ownLife = await readFile(join(BUNDLES, bundleDir, OWN_LIFE_FILE), 'utf8').catch(() => null);
  return ownLife ? `${sheet.trimEnd()}\n\n${ownLife}` : sheet;
}
