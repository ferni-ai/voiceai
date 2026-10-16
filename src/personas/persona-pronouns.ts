/**
 * The single source of truth for how each persona is referred to in the third
 * person. Anything that describes a persona to a model (the life ledger's
 * extraction and biography check, character sheets) reads it from here. The
 * voice-gender tables in services/voice and api/v1 describe TTS voices, not
 * who the persona is, so don't use them for this. Kept apart from
 * persona-ids.ts so importing it has no side effects.
 *
 * @module personas/persona-pronouns
 */

import type { CanonicalPersonaId } from './persona-ids.js';

export interface PersonaPronouns {
  subject: string;
  object: string;
  possessive: string;
}

const HE: PersonaPronouns = { subject: 'he', object: 'him', possessive: 'his' };
const SHE: PersonaPronouns = { subject: 'she', object: 'her', possessive: 'her' };
const THEY: PersonaPronouns = { subject: 'they', object: 'them', possessive: 'their' };

/**
 * Ferni and Alex are he/him (Seth, 2026-10-11). The rest follow their own
 * bundles: Maya's and Jordan's "her own", Nayan's late wife Jyoti, Joel's "my
 * wife".
 */
const PERSONA_PRONOUNS: Partial<Record<CanonicalPersonaId, PersonaPronouns>> = {
  ferni: HE,
  'peter-john': HE,
  'alex-chen': HE,
  'maya-santos': SHE,
  'jordan-taylor': SHE,
  'nayan-patel': HE,
  'joel-dickson': HE,
  'peter-lynch': HE,
  'john-bogle': HE,
};

/**
 * A persona's pronouns by canonical id ("maya-santos") or first name ("Maya",
 * as the life ledger names them); they/them for anyone not listed.
 */
export function getPersonaPronouns(idOrName: string): PersonaPronouns {
  const key = idOrName.toLowerCase().trim();
  for (const [id, pronouns] of Object.entries(PERSONA_PRONOUNS)) {
    if (id === key || id.split('-')[0] === key) return pronouns;
  }
  return THEY;
}
