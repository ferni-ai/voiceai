/**
 * identity/character-spark.md (PERSONA_SPARK=on, agents/personas/character-spark.ts):
 * each persona's bright side, described and never scripted. The model copies
 * example lines word for word (the reason PROMPT_MODE=character exists), so a
 * spark file quotes nothing. It never touches what the persona is (the
 * AI-honesty rule lives in shared/ai-honesty.md) or the lines it doesn't
 * cross, and it hands hard moments back to the character sheet.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPARKED = ['ferni', 'maya-santos', 'alex-chen', 'jordan-taylor', 'nayan-patel', 'peter-john'];
const spark = (bundle: string): string =>
  readFileSync(join(BUNDLES, bundle, 'identity/character-spark.md'), 'utf8');

describe('character-spark.md prose', () => {
  it.each(SPARKED)('%s: has a spark next to its character sheet', (bundle) => {
    expect(existsSync(join(BUNDLES, bundle, 'identity/character.md'))).toBe(true);
    expect(spark(bundle).split('\n').length).toBeLessThanOrEqual(30);
  });

  it.each(SPARKED)('%s: describes, never scripts (no quoted lines)', (bundle) => {
    expect(spark(bundle)).not.toMatch(/["“”]/);
  });

  it.each(SPARKED)('%s: leaves hard moments to the sheet and pain alone', (bundle) => {
    const text = spark(bundle);
    expect(text).toMatch(/^## When something is genuinely good\n/);
    expect(text).toContain('When things are hard, the sheet above stands as written.');
    expect(text).toContain("never brightness on top of someone's pain");
  });

  it.each(SPARKED)('%s: says nothing about what the persona is, and names no studio', (bundle) => {
    const text = spark(bundle);
    expect(text).not.toMatch(/\bAI\b|artificial|language model|\bbot\b|human being/i);
    expect(text).not.toMatch(/pixar|disney/i);
    expect(text).not.toMatch(/lines you don't cross|988/i);
  });

  it('gives every persona its own colour, not one shared paragraph', () => {
    const colours = SPARKED.map((b) => /Your colour is ([^.]+)\./.exec(spark(b))?.[1]);
    expect(colours.every(Boolean)).toBe(true);
    expect(new Set(colours).size).toBe(SPARKED.length);
  });
});
