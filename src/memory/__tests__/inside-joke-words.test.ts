/**
 * The regex extractor's inside jokes keep at most 80 characters of the caller's words (Seth,
 * 2026-10-26), so every store they land in (human_signals, the profile's humanMemory,
 * human_memory/profile) gets the cut words, not the 100/200 it used to keep.
 */
import { describe, expect, it } from 'vitest';
import { extractHumanSignals } from '../human-signal-extractor.js';

const context = { userId: 'test-user', personaId: 'ferni' };
const LONG = `${'the herons and the brother '.repeat(10)}and then the county line`;

describe('extractHumanSignals inside jokes', () => {
  it('keeps 80 characters of the line and of the callback, cut on a word', () => {
    const { insideJokes } = extractHumanSignals(
      [
        { role: 'user', content: `haha remember when ${LONG}`, timestamp: new Date() },
        { role: 'assistant', content: 'ha, that again', timestamp: new Date() },
      ],
      context as never
    );
    expect(insideJokes).toHaveLength(1);
    const [joke] = insideJokes;
    expect(joke.origin.length).toBeLessThanOrEqual(80);
    expect(joke.reference.length).toBeLessThanOrEqual(80);
    expect(joke.origin.startsWith('haha remember when the herons')).toBe(true);
    expect(joke.reference.startsWith('the herons')).toBe(true);
    expect(`${joke.origin} ${joke.reference}`).not.toContain('county line');
  });

  it('keeps a short line whole', () => {
    const { insideJokes } = extractHumanSignals(
      [
        {
          role: 'user',
          content: 'lol remember when the herons stole lunch',
          timestamp: new Date(),
        },
        { role: 'assistant', content: 'ha, those herons', timestamp: new Date() },
      ],
      context as never
    );
    expect(insideJokes[0].origin).toBe('lol remember when the herons stole lunch');
    expect(insideJokes[0].reference).toBe('the herons stole lunch');
  });
});
