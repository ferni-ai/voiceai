/**
 * The brand's word lists, read from design-system/tokens/brand-guardrails.json
 * (the same file the brand linters use) rather than copied here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Audience } from './post-types.js';

interface Guardrails {
  language: { forbiddenWords: Record<string, string[]>; forbiddenPhrases: string[] };
  colors: { allowedPalette: { personas: Record<string, string> } };
}

const GUARDRAILS = 'design-system/tokens/brand-guardrails.json';

/**
 * Words a developer post needs to name what it's about: "the platform", "to
 * implement a webhook". Everything else on the list holds for both blogs.
 */
const DEVELOPER_ALLOWED = new Set([
  'platform',
  'implement',
  'scalable',
  'enterprise',
  'optimize',
  'algorithm',
  'solution',
]);

/** The stacks AGENTS.md calls retired: a post naming them describes a Ferni that no longer exists. */
export const RETIRED_STACK = [
  'Gemini Live',
  'OpenAI Realtime',
  'GCE',
  'Google Compute Engine',
  'Sonata',
];

function load(root: string): Guardrails {
  return JSON.parse(fs.readFileSync(path.join(root, GUARDRAILS), 'utf-8')) as Guardrails;
}

export function forbiddenTerms(
  root: string,
  audience: Audience
): { words: string[]; phrases: string[] } {
  const { forbiddenWords, forbiddenPhrases } = load(root).language;
  const all = [...new Set(Object.values(forbiddenWords).flat())];
  const words =
    audience === 'developer' ? all.filter((w) => !DEVELOPER_ALLOWED.has(w.toLowerCase())) : all;
  return { words, phrases: forbiddenPhrases };
}

export function personaColor(root: string, key: string): string {
  const color = load(root).colors.allowedPalette.personas[key];
  if (!color) throw new Error(`${GUARDRAILS}: no persona color for "${key}"`);
  return color;
}
