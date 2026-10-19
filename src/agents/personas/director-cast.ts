/**
 * Who the director and the deliberator are directing: the persona actually
 * speaking, by name, with a short brief from its own bundle.
 *
 * Both prompts were written for Ferni ("Ferni (warm, dry, curious; grew up in
 * Wyoming...)") and every persona got them: after a handoff to Maya, the
 * director still coached a Wyoming life coach. With DIRECTOR_SEES_SCENE=on the
 * prompts are built from the speaker's Cast instead (director-notes.ts,
 * deliberation.ts). FERNI_CAST is the hand-written brief prod sends today, so
 * with the flag off every prompt is byte-identical (director-sees-scene.test.ts
 * compares them with a golden captured from origin/main).
 *
 * @module agents/personas/director-cast
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { toCanonical } from '../../personas/persona-ids.js';
import { getPersonaPronouns, type PersonaPronouns } from '../../personas/persona-pronouns.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { CHARACTER_FILE, readBundleFile } from './character-spark.js';

export function directorSeesScene(env: Env = process.env): boolean {
  return flagOn('DIRECTOR_SEES_SCENE', env);
}

export interface Cast {
  /** As the director names them: the same name the speaker labels use (director-persona.ts). */
  name: string;
  /** A few words on who they are, or '' when the bundle has nothing to say. */
  brief: string;
  p: PersonaPronouns;
}

export const FERNI_CAST: Cast = {
  name: 'Ferni',
  brief:
    'warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend',
  p: getPersonaPronouns('ferni'),
};

/** "he's" / "she's" / "they're". */
export const isShort = (c: Cast): string =>
  c.p.subject === 'they' ? "they're" : `${c.p.subject}'s`;
/** "cares" for he and she, "care" for they. */
export const verbS = (c: Cast, verb: string): string =>
  c.p.subject === 'they' ? verb : `${verb}s`;
export const self = (c: Cast): string =>
  ({ he: 'himself', she: 'herself' })[c.p.subject] ?? 'themselves';
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const MAX_BRIEF = 160;

/**
 * The brief from a bundle: up to three plain traits, where they come from
 * (the first clause of the sheet's "## Your life", turned to the third
 * person) and their role. Pure, for tests; '' parts are left out.
 */
export function characterBrief(
  sheet: string | null,
  manifest: { traits?: string[]; role?: string },
  p: PersonaPronouns
): string {
  const traits = (manifest.traits ?? [])
    // Plain words only ("warm", "genuinely-curious"), not in-jokes like "sam-grounded".
    .filter((t) => /^(?:[a-z]+|[a-z]+ly-[a-z]+|non-[a-z]+)$/.test(t))
    .slice(0, 3)
    .map((t) => t.replace(/-/g, ' ').replace(/^non /, 'non-'));
  const life = sheet?.split(/^## Your life\s*$/m)[1]?.trim() ?? '';
  const origin = life
    .split(/[,.:;]/)[0]
    .replace(/^You(?:'re| are) /, '')
    .replace(/^You were /, 'was ')
    .replace(/^You /, '')
    .replace(/\byourself\b/g, p.subject === 'they' ? 'themselves' : `${p.object}self`)
    .replace(/\byour\b/g, p.possessive)
    .replace(/\byou\b/g, p.subject)
    .trim();
  const role = manifest.role?.replace(/-/g, ' ').toLowerCase().trim();
  const parts = [
    traits.join(', '),
    origin.length <= 70 ? origin : '',
    role ? `${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}` : '',
  ].filter(Boolean);
  const brief = parts.join('; ');
  return brief.length <= MAX_BRIEF ? brief : brief.slice(0, MAX_BRIEF).replace(/[;,]?\s+\S*$/, '');
}

interface Manifest {
  personality?: { traits?: string[] };
  role?: { id?: string; primary?: string };
}

const casts = new Map<string, Promise<Cast>>();

/** The cast for a persona id, read once per process from its bundle. Never throws. */
export async function castFor(personaId: string): Promise<Cast> {
  const id = toCanonical(personaId || 'ferni');
  let cast = casts.get(id);
  if (!cast) {
    cast = (async (): Promise<Cast> => {
      const p = getPersonaPronouns(id);
      const [sheet, raw] = await Promise.all([
        readBundleFile(id, CHARACTER_FILE),
        readBundleFile(id, 'persona.manifest.json'),
      ]);
      let m: Manifest = {};
      try {
        m = raw ? (JSON.parse(raw) as Manifest) : {};
      } catch {
        m = {};
      }
      const role = m.role?.primary ?? m.role?.id;
      const brief = characterBrief(sheet, { traits: m.personality?.traits, role }, p);
      return { name: getPersonaDisplayName(id), brief, p };
    })();
    casts.set(id, cast);
  }
  return cast;
}
