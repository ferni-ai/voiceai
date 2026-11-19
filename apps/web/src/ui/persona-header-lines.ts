/**
 * The words around the speaker's face on the home screen: the name over the
 * avatar and the line under it. The role itself lives in the pill
 * (ai-role-label.ui.ts), so these never say it again (app audit 2026-11-16,
 * item 15: Alex's role showed four times).
 */

import { personaFirstName } from '../config/personas.js';
import { isLegendId, type PersonaConfig } from '../types/persona.js';
import { aiRoleLabel } from './ai-role-label.ui.js';

/**
 * What the header calls a persona: the team by first name ("Alex", as the talk
 * button and "Calling Alex" do; the header said "Alex Chen"); a Legend keeps
 * their full name.
 */
export function headerName(persona: Pick<PersonaConfig, 'id' | 'name'>): string {
  return isLegendId(persona.id) ? persona.name : personaFirstName(persona.name);
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The line under the name, unless it restates the role the pill already shows
 * (D2: the pill carries the role). Alex's "Communication Coach & Chief of
 * Staff" over a "Communication coach" pill read as the role twice. Whole-word,
 * case-blind match, so "Insights mentor" does not swallow "Research & insights".
 */
export function subtitleBesideRole(
  subtitle: string,
  persona: Pick<PersonaConfig, 'roleLabel'> | null | undefined
): string {
  const role = aiRoleLabel(persona).trim();
  if (!role) return subtitle;
  const restates = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(role)}($|[^\\p{L}\\p{N}])`, 'iu');
  return restates.test(subtitle) ? '' : subtitle;
}
