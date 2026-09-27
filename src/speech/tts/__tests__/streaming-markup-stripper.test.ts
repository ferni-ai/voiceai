/**
 * The LLM streams its reply in small chunks, and markup often arrives split
 * across two of them. The old per-chunk stripper missed split tags, so
 * fragments like "break time 80ms" reached Cartesia as words, and its
 * per-chunk .trim() glued sentences together ("Hey.What's happening?").
 * Found on a ferni-dev call on 2026-09-27.
 */
import { describe, expect, it } from 'vitest';
import { StreamingMarkupStripper } from '../streaming-markup-stripper.js';

function run(chunks: string[]): string {
  const s = new StreamingMarkupStripper();
  return chunks.map((c) => s.push(c)).join('') + s.flush();
}

describe('StreamingMarkupStripper', () => {
  it('removes a break tag split across chunks', () => {
    const out = run(['Hey.<break ti', 'me="80ms"/> What', "'s happening?"]);
    expect(out).not.toMatch(/break|time|80ms|[<>]/);
    expect(out.replace(/\s+/g, ' ')).toBe("Hey. What's happening?");
  });

  it('removes a self-closing emotion tag split across chunks', () => {
    const out = run(['<emotion val', 'ue="curious"/>Hey, hey!']);
    expect(out).toBe('Hey, hey!');
  });

  it('removes bracketed performance cues, even split', () => {
    expect(run(['Hmm. [laughter] Fair enough.'])).toBe('Hmm. Fair enough.');
    expect(run(['Hmm. [laugh', 'ter] Fair enough.'])).toBe('Hmm. Fair enough.');
  });

  it('keeps the space between chunks instead of gluing sentences', () => {
    expect(run(['Hey.', " What's happening?"])).toBe("Hey. What's happening?");
  });

  it('leaves real text containing < or [ alone', () => {
    expect(run(['3 < 5 is true'])).toBe('3 < 5 is true');
    expect(run(['Rate it [1-10].'])).toBe('Rate it [1-10].');
  });

  it('releases an unclosed bracket as text once it is clearly not a tag', () => {
    const long = 'x'.repeat(100);
    expect(run([`[${long}`])).toBe(`[${long}`);
  });

  it('drops a dangling tag fragment at the end of the stream', () => {
    expect(run(['Bye now.<emot'])).toBe('Bye now.');
  });
});

describe('StreamingMarkupStripper on the real 2026-09-27 call replies', () => {
  const replies = [
    '<emotion value="curious"/>Hey, hey!<break time="80ms"/> Look who it is.<break time="80ms"/> How\'s your day treating you?',
    '<emotion value="affectionate"/>"Pretty good." I\'ll take that.<break time="80ms"/> Sometimes "pretty good" is a quiet victory.',
    '<break time="200ms"/>Hmm.<break time="80ms"/> [laughter] Fair enough.<break time="80ms"/> How\'s your head feeling?',
  ];

  it('never leaks markup or glues words, wherever the stream splits', () => {
    for (const reply of replies) {
      const expected = new StreamingMarkupStripper();
      const whole = (expected.push(reply) + expected.flush()).replace(/\s+/g, ' ').trim();
      expect(whole).not.toMatch(/[<>]|\[laughter\]|break|emotion|80ms|200ms/);
      for (let i = 1; i < reply.length; i++) {
        const out = run([reply.slice(0, i), reply.slice(i)]);
        expect(out).not.toMatch(/[<>]|\[laughter\]|break|emotion|80ms|200ms/);
        expect(out.replace(/\s+/g, ' ').trim()).toBe(whole);
      }
    }
  });
});
