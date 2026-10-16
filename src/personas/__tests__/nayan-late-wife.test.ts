/**
 * Nayan is a widower. His late wife is Jyoti: the canon line in
 * identity/canon.json is the source, and the prose that mentions her must agree
 * with it. No earlier name for her may remain on Nayan's surfaces.
 *
 * @module personas/__tests__/nayan-late-wife.test
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const NAYAN = fileURLToPath(new URL('../bundles/nayan-patel', import.meta.url));
const SRC = fileURLToPath(new URL('../..', import.meta.url));

const WIFE = 'Jyoti';
const FORMER_NAMES = /Leela|Vijji/i;

const listFiles = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => listFiles(join(path, name)))
    : [path];

const read = (rel: string): string => readFileSync(join(SRC, 'personas', rel), 'utf8');

describe('Nayan Patel: late wife', () => {
  const canon = JSON.parse(read('bundles/nayan-patel/identity/canon.json')) as Record<
    string,
    string
  >;

  it('the canon line names her and gives the years and when she died', () => {
    expect(canon.wife).toContain(WIFE);
    expect(canon.wife).toContain('thirty-two years');
    expect(canon.wife).toContain('six years ago');
  });

  it.each([
    'bundles/nayan-patel/identity/biography-core.md',
    'bundles/nayan-patel/identity/biography.md',
    'bundles/nayan-patel/identity/character.md',
    'bundles/nayan-patel/identity/core-identity.md',
    'bundles/nayan-patel/identity/system-prompt.md',
  ])('%s says the same name, years and death as the canon', (rel) => {
    const text = read(rel);
    expect(text).toContain(WIFE);
    expect(text).toContain('thirty-two years');
    expect(text).toContain('six years ago');
  });

  it('the story is about her, under its own id, and is indexed to match', () => {
    const story = JSON.parse(read('bundles/nayan-patel/content/stories/jyoti-story.json')) as {
      id: string;
      title: string;
    };
    expect(story.id).toBe('jyoti-story');
    expect(story.title).toContain(WIFE);
    const index = read('bundles/nayan-patel/content/stories/_index.json');
    expect(index).toContain('"file": "jyoti-story.json"');
    expect(read('bundles/nayan-patel/content/stories/_story-graph.json')).not.toContain(
      'vijji-story'
    );
  });

  it('no former name for his wife remains on his surfaces', () => {
    const surfaces = [
      ...listFiles(NAYAN),
      join(SRC, 'personality/moments/nayan-moments.ts'),
      join(SRC, 'personas/easter-eggs.ts'),
      join(SRC, 'personas/persona-pronouns.ts'),
      join(SRC, 'tests/nayan-patel-persona-e2e.test.ts'),
    ];
    const hits = surfaces.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return FORMER_NAMES.test(text);
    });
    expect(hits.map((file) => file.slice(SRC.length))).toEqual([]);
  });

  it('the story file exists on disk under its new name only', () => {
    expect(existsSync(join(NAYAN, 'content/stories/jyoti-story.json'))).toBe(true);
    expect(existsSync(join(NAYAN, 'content/stories/vijji-story.json'))).toBe(false);
  });
});
