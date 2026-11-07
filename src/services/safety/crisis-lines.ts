/**
 * The crisis lines that tools, prompts and replies name, by name, read from CRISIS_RESOURCES.
 *
 * Code outside services/safety that prints "988", "Text HOME to 741741" or a hotline's name
 * reads it from here instead of keeping its own copy, so each name and number has one source
 * (docs/plans/2026-11-05-crisis-centralize.md, step S1). Each line is the first
 * CRISIS_RESOURCES entry with that name, and that entry must have every field the callers read.
 * A renamed entry, or a first entry with an emptied field, throws when this module loads rather
 * than falling through to a later entry with the same name, so a kernel edit cannot leave a
 * caller printing "undefined" or a number the kernel no longer lists first.
 *
 * @module services/safety/crisis-lines
 */
import { CRISIS_RESOURCES, type CrisisResource } from './crisis-response.js';

type Field = 'phone' | 'text' | 'chat';
type CrisisLine<F extends Field> = CrisisResource & Required<Pick<CrisisResource, F>>;

function line<F extends Field>(name: string, ...fields: F[]): CrisisLine<F> {
  const found = Object.values(CRISIS_RESOURCES)
    .flat()
    .find((r) => r.name === name);
  if (!found) throw new Error(`CRISIS_RESOURCES has no "${name}"`);
  const missing = fields.filter((f) => !found[f]);
  if (missing.length > 0) {
    throw new Error(`CRISIS_RESOURCES' first "${name}" entry has no ${missing.join(', ')}`);
  }
  return found as CrisisLine<F>;
}

export const LIFELINE_988 = line('988 Suicide & Crisis Lifeline', 'phone', 'text', 'chat');
export const CRISIS_TEXT_LINE = line('Crisis Text Line', 'text');
export const SUICIDE_PREVENTION_DIRECTORY = line(
  'International Association for Suicide Prevention',
  'chat'
);
export const DOMESTIC_VIOLENCE_HOTLINE = line(
  'National Domestic Violence Hotline',
  'phone',
  'text',
  'chat'
);
export const SEXUAL_ASSAULT_HOTLINE = line('RAINN National Sexual Assault Hotline', 'phone');
export const CHILD_ABUSE_HOTLINE = line('Childhelp National Child Abuse Hotline', 'phone');
export const SUBSTANCE_HELPLINE = line('SAMHSA National Helpline', 'phone');
export const MENTAL_HEALTH_HELPLINE = line('NAMI Helpline', 'phone');
