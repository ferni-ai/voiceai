/**
 * A crisis script for a caller who sounds under 18 (MINOR_CRISIS_CARE=on, with MINOR_CARE on):
 * the script as it is, every line and number, then one short spoken youth line, after the
 * script's own safety question ("Is anyone nearby who can be with you?"). Nothing is removed
 * or reworded.
 * A guided crisis reply gets MINOR_CRISIS_NOTE instead (minor-care.ts, via the turn reminder).
 *
 * @module utils/minor-crisis-care
 */
import { createLogger } from './safe-logger.js';
import { lastFerniLine, minorCrisisCare } from './minor-care.js';

const log = createLogger({ module: 'minor-crisis-care' });

type Items = Parameters<typeof lastFerniLine>[0];

/** One short spoken line, 12 words: 988 is for teens too, and an adult they trust. */
export const YOUTH_SCRIPT_LINE = 'Teens can text 988, and tell an adult you trust.';

/** The same line for a Spanish script. */
export const YOUTH_SCRIPT_LINE_ES = 'Puedes escribir al 988 y hablar con un adulto de confianza.';

/** The script, then the youth line: the script's own safety question comes first. */
export function withYouthLine(script: string): string {
  const line = /¿|AYUDA/.test(script) ? YOUTH_SCRIPT_LINE_ES : YOUTH_SCRIPT_LINE;
  return `${script}\n\n${line}`;
}

/**
 * The crisis script for this turn. Never throws: on any failure the script goes as it is,
 * so a youth line can never cost a caller the crisis reply. Reads process.env, as the turn
 * reminder's minorCareNote does, so a script turn and a guided turn agree.
 */
export function minorCrisisScript(
  script: string,
  sessionId: string | undefined,
  said: string,
  items: Items
): string {
  try {
    return minorCrisisCare(sessionId, said, { asked: lastFerniLine(items) })
      ? withYouthLine(script)
      : script;
  } catch (error) {
    log.warn({ error: String(error) }, 'MINOR_CRISIS_CARE script line failed');
    return script;
  }
}
