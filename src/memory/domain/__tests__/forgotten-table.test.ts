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
  topics: string[];
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
    // Cells only the passage rule's distinctive word (5+ letters, or 4+ digits) decides.
    const at = (rows: string[], text: string, topic: string) =>
      rows[table.texts.indexOf(text)]![table.topicSets.findIndex((s) => s.join() === topic)];
    for (const [text, topic] of [
      ['felix broke his arm', 'Felix party'],
      ['Piano recital on Sunday', 'piano lessons'],
      ['Filed the 2024 return late', '2024 taxes'],
    ]) {
      expect([
        at(table.isForgotten, text, topic),
        at(table.isForgottenPassage, text, topic),
      ]).toEqual(['0', '1']);
    }
  });

  it('isForgotten', () => {
    expect(grid(isForgotten)).toEqual(table.isForgotten);
  });

  it('isForgottenPassage', () => {
    expect(grid(isForgottenPassage)).toEqual(table.isForgottenPassage);
  });

  it('forgetTokens and storedTopic', () => {
    const all = [...table.texts, ...table.topics];
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
