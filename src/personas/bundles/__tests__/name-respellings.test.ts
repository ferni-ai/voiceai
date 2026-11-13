/**
 * No persona or prompt text spells a teammate's name with the wrong vowel.
 *
 * Nayan is NY-un, rhyming with "lion" (the owner, 2026-11-11). Until
 * 2026-11-12 the persona's character.md and system-prompt.md said the name "is said
 * nah-yahn" and told the LLM to write that respelling when asked. The voice
 * then read the reply as NAH-yahn, so dropping the dictionary entry would not
 * have fixed "how do you say your name?". The old sounds-like constants
 * ("Nuh-yahn") had the same vowel. This scans every non-test text file under
 * src/personas and src/agents, which hold every persona and prompt the LLM
 * reads.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ROOTS = ['personas', 'agents'];
const TEXT = /\.(md|json|ts|txt|ya?ml)$/;
const SKIP = /(^|\/)(__tests__|tests?|fixtures)(\/|$)|\.test\.ts$/;

/** The wrong-vowel respellings: nah-yahn, Nuh-yahn, nahyahn, NAH-yahn, with or without z. */
const WRONG_RESPELLING = /\b(?:nah|nuh)[-\s]?yahnz?\b/i;

function promptFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const entry of readdirSync(join(srcDir, root), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !TEXT.test(entry.name)) continue;
      const path = relative(srcDir, join(entry.parentPath, entry.name));
      if (!SKIP.test(path)) files.push(path);
    }
  }
  return files;
}

describe('teammate name respellings', () => {
  const files = promptFiles();

  it('scans the persona bundles and agent prompts (positive control)', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain('personas/bundles/nayan-patel/identity/character.md');
    expect(files).toContain('personas/bundles/nayan-patel/identity/system-prompt.md');
  });

  it('matches every old respelling it is meant to catch', () => {
    for (const s of ['nah-yahn', 'Nuh-yahn', 'NAH-yahn', 'nahyahn', 'nahyahnz', 'nah yahn']) {
      expect(WRONG_RESPELLING.test(s), s).toBe(true);
    }
    for (const s of ['Nayan', "Nayan's", 'ny-un', 'yahoo']) {
      expect(WRONG_RESPELLING.test(s), s).toBe(false);
    }
  });

  it('finds none in any persona or prompt file', () => {
    const hits = files.filter((f) => WRONG_RESPELLING.test(readFileSync(join(srcDir, f), 'utf8')));
    expect(hits).toEqual([]);
  });

  it('tells Nayan the respelling that is heard as NY-un', () => {
    for (const f of ['character.md', 'system-prompt.md']) {
      const text = readFileSync(join(srcDir, 'personas/bundles/nayan-patel/identity', f), 'utf8');
      expect(text, f).toMatch(/\bny-un\b/);
    }
  });
});
