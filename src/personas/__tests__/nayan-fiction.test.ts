/**
 * Nayan's bundle is fiction. None of its text may name a real person, a real
 * organisation or a real landmark, and the stories must index and link to each
 * other. The guard tests keep their own markers; this one scans the bundle.
 *
 * @module personas/__tests__/nayan-fiction.test
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BUNDLE = fileURLToPath(new URL('../bundles/nayan-patel', import.meta.url));
const STORIES = join(BUNDLE, 'content', 'stories');

/** Real people, organisations and landmarks his old stories were built on. */
const REAL_WORLD =
  /\b(Sadhguru|Jaggi|Isha|Adiyogi|Dhyanalinga|Chamundi|Mysore|Mysuru|Kailash|Kailas|Kumbh|Coimbatore|Mahasamadhi|Sabarmati|Vijji|Leela|Bogle|Lynch|Dickson|Vanguard)\b|Save Soil|Rally for Rivers|Inner Engineering|Royal Enfield/i;

const listFiles = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => listFiles(join(path, name)))
    : [path];

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('Nayan Patel bundle is fiction', () => {
  it('names no real person, organisation or landmark in any file', () => {
    const hits = listFiles(BUNDLE)
      .filter((file) => REAL_WORLD.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(BUNDLE.length + 1));
    expect(hits).toEqual([]);
  });

  it('keeps no meditation named after a real organisation', () => {
    const meditations = readJson(join(BUNDLE, 'content', 'behaviors', 'guided-meditations.json'));
    expect(Object.keys(meditations as object).filter((key) => /isha/i.test(key))).toEqual([]);
  });

  it('indexes each story under its own id, and each indexed file exists', () => {
    const index = readJson(join(STORIES, '_index.json')) as {
      stories: Array<{ id: string; file: string }>;
    };
    for (const story of index.stories) {
      expect(readdirSync(STORIES), story.file).toContain(story.file);
    }
    for (const story of index.stories) {
      const doc = readJson(join(STORIES, story.file)) as { id: string };
      expect(doc.id, story.file).toBe(story.id);
    }
  });

  it('links only to stories that exist', () => {
    const index = readJson(join(STORIES, '_index.json')) as { stories: Array<{ id: string }> };
    const known = new Set(index.stories.map((s) => s.id));
    const graph = readJson(join(STORIES, '_story-graph.json'));
    const referenced = new Set<string>();
    const walk = (node: unknown, key = ''): void => {
      if (Array.isArray(node)) {
        node.forEach((item) => (typeof item === 'string' ? referenced.add(item) : walk(item)));
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (/^[a-z]+(-[a-z]+)+$/.test(k)) referenced.add(k);
          walk(v, k);
        }
      }
    };
    walk(graph);
    const ids = [...referenced].filter((id) => /^[a-z]+(-[a-z]+)+$/.test(id));
    expect(ids.filter((id) => !known.has(id))).toEqual([]);
  });
});
