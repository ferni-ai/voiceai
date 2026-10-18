/**
 * Every persona's character prompt keeps 988 for danger, not grief, and never
 * invents a loss to match the caller's. Dev grief call 2026-10-17: the caller's
 * dad had died; Ferni said "I lost my dad too" (his story has no such loss) and
 * offered the 988 line with no crisis signal (the crisis guard logged nothing).
 *
 * @module personas/__tests__/character-lines-you-dont-cross.test
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BUNDLES = fileURLToPath(new URL('../bundles', import.meta.url));
const characters = readdirSync(BUNDLES)
  .map((name) => join(BUNDLES, name, 'identity', 'character.md'))
  .filter((path) => {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  });

describe("character prompts: lines you don't cross", () => {
  it('covers every persona with a character prompt', () => {
    expect(characters.length).toBeGreaterThanOrEqual(6);
  });

  it.each(characters)('%s gives 988 for danger, not grief alone', (path) => {
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/might hurt themselves or says they don't want to be here[^.]*988/);
    expect(text).toMatch(/Grief, sadness or a rough week on its own is not that/);
    expect(text).not.toMatch(/If someone might be in danger/);
  });

  it.each(characters)('%s never invents a loss to match the caller', (path) => {
    expect(readFileSync(path, 'utf8')).toMatch(
      /never make up a loss of your own to match theirs[^.]*stay on theirs\./
    );
  });
});
