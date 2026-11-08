/**
 * Who the persona evals iterate: every persona with a bundle (the core six and
 * the three legends), checked against the bundles themselves so a new persona
 * can't be silently skipped, and the name each one goes by on a call.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_CANONICAL_IDS } from '../../src/personas/persona-ids.js';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const bundleDir = (repo: string, id: string): string => join(repo, 'src/personas/bundles', id);

/** Every persona an eval runs, in a fixed order (seeded shuffles depend on it). */
export const PERSONAS: readonly string[] = [...ALL_CANONICAL_IDS];

/** The bundle dirs that hold a persona manifest: the registry PERSONAS must match. */
export function bundlePersonas(repo = REPO): string[] {
  return readdirSync(join(repo, 'src/personas/bundles'), { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(join(bundleDir(repo, d.name), 'persona.manifest.json'))
    )
    .map((d) => d.name)
    .sort();
}

/** The name the persona goes by on a call, split into words (manifest identity.name). */
export function personaNames(id: string, repo = REPO): string[] {
  const manifest = JSON.parse(
    readFileSync(join(bundleDir(repo, id), 'persona.manifest.json'), 'utf8')
  ) as { identity: { name: string } };
  return manifest.identity.name.split(/\s+/).filter(Boolean);
}

/**
 * One paragraph on how the persona is with people: the first paragraph of
 * "## How you are with people" in the bundle's identity/character.md.
 */
export function personaParagraph(id: string, repo = REPO): string {
  const md = readFileSync(join(bundleDir(repo, id), 'identity/character.md'), 'utf8');
  const section = md.split(/^## How you are with people\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const paragraph = section
    .trim()
    .split(/\n\s*\n/)[0]
    ?.trim();
  if (!paragraph) throw new Error(`${id}: character.md has no "How you are with people" paragraph`);
  return paragraph.replace(/\s+/g, ' ');
}
