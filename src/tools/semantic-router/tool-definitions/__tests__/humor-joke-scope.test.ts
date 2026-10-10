import { describe, expect, it } from 'vitest';
import { getToolDescription } from '../../../utils/tool-descriptions.js';
import { tellJokeTool } from '../humor.semantic.js';

/**
 * "Make me laugh" got stock riddles from tellJoke on 3 of 3 dev hard-news
 * calls (judge.mjs, 2026-10-10). A friend tells something funny that happened
 * to them, so the joke tool is only for an explicit ask for a joke.
 */
describe('tellJoke is only for an explicit joke', () => {
  const asksForFun = ['Can you just tell me something funny?', 'Make me laugh', 'I need a laugh', 'Cheer me up'];
  const asksForJoke = ['Tell me a joke', 'Got any jokes?', 'Hit me with a pun'];

  it('its patterns match asks for a joke, not asks to be cheered up', () => {
    const matches = (t: string) => (tellJokeTool.triggers.patterns ?? []).some((p) => p.test(t));
    for (const t of asksForFun) expect(matches(t)).toBe(false);
    for (const t of asksForJoke) expect(matches(t)).toBe(true);
    expect(tellJokeTool.counterExamples).toContain('Can you just tell me something funny?');
  });

  it('tells the model to share something funny of its own instead', () => {
    const d = getToolDescription('tellJoke');
    expect(d).toMatch(/ONLY when the caller explicitly asks for a joke/);
    expect(d).toMatch(/something funny that happened to you/);
  });
});
