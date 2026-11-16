/**
 * Story So Far's Open Loops never lists a line twice, whatever the server sends.
 * 2026-11-16 audit: three loops showed twice each (the server saved every turn's loops twice).
 */
import { describe, expect, it } from 'vitest';
import { toOpenLoops } from '../../src/services/your-story-sections.js';
import { onePerWording, wordingKey } from '../../src/utils/one-per-wording.js';

const item = (id: string, content: string) => ({
  id,
  type: 'intention',
  content,
  createdAt: '2026-11-15T12:00:00.000Z',
  priority: 'medium' as const,
});

describe('toOpenLoops', () => {
  it('draws each wording once and counts it once', () => {
    const loops = toOpenLoops({
      total: 6,
      items: [
        item('a1', 'I need to find places to stop'),
        item('a2', 'I need to find places to stop'),
        item('b1', "I'm going to split it up"),
        item('b2', "i'm going to split it up."),
        item('c1', "I'll follow up with you to see"),
        item('c2', "I'll follow up with you to see"),
      ],
    });

    expect(loops?.loops.map((l) => l.id)).toEqual(['a1', 'b1', 'c1']);
    expect(loops?.totalOpen).toBe(3);
  });
});

describe('toOpenLoops: who a loop is about', () => {
  const about = (id: string, relatedPerson?: string) => ({
    ...item(id, "I'll call her tomorrow"),
    ...(relatedPerson ? { relatedPerson } : {}),
  });

  it('keeps the same words about two people as two rows', () => {
    const loops = toOpenLoops({ total: 2, items: [about('m', 'Mom'), about('d', 'Dad')] });
    expect(loops?.loops.map((l) => [l.id, l.relatedPerson])).toEqual([
      ['m', 'Mom'],
      ['d', 'Dad'],
    ]);
    expect(loops?.totalOpen).toBe(2);
  });

  it('draws the same words about the same person once', () => {
    const loops = toOpenLoops({
      total: 3,
      items: [about('m1', 'Mom'), about('m2', ' mom'), about('x')],
    });
    expect(loops?.loops.map((l) => l.id)).toEqual(['m1', 'x']);
    expect(loops?.totalOpen).toBe(2);
  });
});

describe('onePerWording', () => {
  it('treats case, spacing, end punctuation and a dash pause as the same line', () => {
    expect(wordingKey('Just checking in - no pressure.')).toBe(
      wordingKey('just checking in,  no pressure')
    );
    expect(wordingKey('I need to stop')).not.toBe(wordingKey('I need to start'));
  });

  it('keeps the first of each wording, in order', () => {
    expect(onePerWording(['b', 'a', 'B.', 'c', 'a'], (s) => s)).toEqual(['b', 'a', 'c']);
  });
});
