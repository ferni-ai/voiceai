/**
 * Nayan Patel is a fictional character.
 *
 * His bundle used to tell a real spiritual teacher's life in the first person
 * (the hill where he awoke at 25, the temple, the statue, the motorcycle ride for
 * soil, his brain surgery), and his spontaneous shares told the index-fund
 * founder's (a Vanguard business card, being fired from Wellington). Seth's
 * 2026-10-11 decision: no persona copies a real person's life. The persona
 * audit (2026-10-17) found 8 of his indexed stories still did; the index now
 * points at the fictional versions written for them in #948 and #952.
 *
 * Scanned: identity, behaviors, knowledge, the manifest, every story the story
 * index can hand to a call plus the index and story graph, and his spontaneous
 * shares. The tool id `getBogleQuote` is stripped first: it names a tool, not a
 * life he claims.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HOT_TAKES,
  MICRO_STORIES,
} from '../../intelligence/context-builders/personas/spontaneous-vulnerability.js';

const BUNDLE_DIR = fileURLToPath(new URL('../bundles/nayan-patel', import.meta.url));
const STORIES_DIR = join(BUNDLE_DIR, 'content/stories');

// The real teacher's life and places, and the index-fund founder's.
const DENYLIST =
  /Sadhguru|Jaggi|\bIsha\b|Adiyogi|Chamundi|Mysore|Vijji|motorcycl|Save Soil|Rally for Rivers|Inner Engineering|Dhyanalinga|Kailash|Kumbh|Coimbatore|Velliangiri|brain surgery|operated on my brain|112 feet|Bogle|Vanguard|Wellington|Valley Forge|heart transplant/i;

const TOOL_IDS = /\bgetBogleQuote\b/g;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const index = JSON.parse(readFileSync(join(STORIES_DIR, '_index.json'), 'utf8')) as {
  stories: { id: string; file: string }[];
};
const indexedStories = index.stories.map((s) => join(STORIES_DIR, s.file));

const files = [
  ...listFiles(join(BUNDLE_DIR, 'identity')),
  ...listFiles(join(BUNDLE_DIR, 'content/behaviors')),
  ...listFiles(join(BUNDLE_DIR, 'content/knowledge')),
  join(BUNDLE_DIR, 'persona.manifest.json'),
  join(STORIES_DIR, '_index.json'),
  join(STORIES_DIR, '_story-graph.json'),
  ...indexedStories,
];
const shares = [...(MICRO_STORIES['nayan-patel'] ?? []), ...(HOT_TAKES['nayan-patel'] ?? [])];
const corpus = [
  ...files.map((path) => ({ path, text: readFileSync(path, 'utf8') })),
  ...shares.map((share, i) => ({
    path: `<spontaneous-vulnerability nayan-patel #${i}>`,
    text: [share.content, share.transition, share.ssmlEnhanced].join('\n'),
  })),
];

describe("Nayan Patel's persona is fictional", () => {
  it('reads the scanned files, including every indexed story', () => {
    expect(indexedStories.length).toBeGreaterThan(15);
    expect(corpus.some(({ path }) => path.endsWith('identity/character.md'))).toBe(true);
    expect(corpus.some(({ path }) => path.endsWith('stories/grandmother.json'))).toBe(true);
    expect(shares.length).toBeGreaterThan(0);
  });

  it('every indexed story file exists and carries its id', () => {
    for (const { id, file } of index.stories) {
      const story = JSON.parse(readFileSync(join(STORIES_DIR, file), 'utf8')) as { id: string };
      expect(story.id, file).toBe(id);
    }
  });

  it('carries the fictional canon: Vadodara, his grandmother, Jyoti', () => {
    const all = corpus.map(({ text }) => text).join('\n');
    expect(all).toMatch(/Vadodara/);
    expect(all).toMatch(/grandmother/);
    expect(all).toMatch(/Jyoti/);
  });

  it("tells no real person's life as his own", () => {
    const hits = corpus.flatMap(({ path, text }) =>
      text
        .replace(TOOL_IDS, '')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => DENYLIST.test(line))
        .map(({ line, i }) => `${path.replace(BUNDLE_DIR, '')}:${i + 1}: ${line.trim().slice(0, 120)}`)
    );
    expect(hits).toEqual([]);
  });

  it('the denylist really catches the old content', () => {
    expect(DENYLIST.test('When I was 25, I climbed Chamundi Hills in Mysore.')).toBe(true);
    expect(DENYLIST.test('I still keep my first Vanguard business card.')).toBe(true);
    expect(DENYLIST.test('My grandmother was in the back room in Vadodara.')).toBe(false);
  });
});
