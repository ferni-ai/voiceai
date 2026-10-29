/**
 * The shared forget matcher (domain/forgotten.ts) gives exactly the answers the
 * copies it replaced gave on main: every cell of a fictional corpus, captured
 * from origin/main before the move (fixtures/forgotten-main-table.json), for
 * isForgotten, isForgottenPassage, forgetTokens, storedTopic and factText, and
 * the old exports are the same functions.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  factText,
  forgetTokens,
  isForgotten,
  isForgottenPassage,
  storedTopic,
} from '../forgotten.js';
import * as sessionRecall from '../../recall/session-recall.js';
import * as episodes from '../../recall/episodes.js';
import * as forget from '../../recall/forget.js';

const table = JSON.parse(
  readFileSync(new URL('./fixtures/forgotten-main-table.json', import.meta.url), 'utf8')
) as {
  capturedFrom: string;
  texts: string[];
  topicSets: string[][];
  isForgotten: string[];
  isForgottenPassage: string[];
  forgetTokens: string[][];
  storedTopic: string[];
  factTextDocs: Record<string, unknown>[];
  factText: string[];
};

const grid = (f: (text: string, topics: string[]) => boolean) =>
  table.texts.map((t) => table.topicSets.map((s) => (f(t, s) ? '1' : '0')).join(''));

describe('the forget matcher matches main, cell for cell', () => {
  it('was captured from main over a corpus with both answers in it', () => {
    expect(table.capturedFrom).toMatch(/^origin\/main [0-9a-f]{10}$/);
    const ones = (rows: string[]) => rows.join('').split('1').length - 1;
    expect(ones(table.isForgotten)).toBeGreaterThan(50);
    expect(ones(table.isForgottenPassage)).toBeGreaterThan(ones(table.isForgotten));
  });

  it('isForgotten', () => {
    expect(grid(isForgotten)).toEqual(table.isForgotten);
  });

  it('isForgottenPassage', () => {
    expect(grid(isForgottenPassage)).toEqual(table.isForgottenPassage);
  });

  it('forgetTokens and storedTopic', () => {
    // The capture's strings: every text, then each single topic (topicSets[1..40]).
    const all = [...table.texts, ...table.topicSets.slice(1, 41).map((s) => s[0]!)];
    expect(all).toHaveLength(table.forgetTokens.length);
    expect(all.map((s) => forgetTokens(s))).toEqual(table.forgetTokens);
    expect(all.map((s) => storedTopic(s))).toEqual(table.storedTopic);
  });

  it('factText', () => {
    expect(table.factTextDocs.map((d) => factText(d))).toEqual(table.factText);
  });

  it('keeps the old exports as the same functions', () => {
    expect(sessionRecall.isForgotten).toBe(isForgotten);
    expect(sessionRecall.forgetTokens).toBe(forgetTokens);
    expect(sessionRecall.storedTopic).toBe(storedTopic);
    expect(episodes.isForgottenPassage).toBe(isForgottenPassage);
    expect(forget.isForgotten).toBe(isForgotten);
    expect(forget.factText).toBe(factText);
  });
});
