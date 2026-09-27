/**
 * The LLM is prompted to write Cartesia sonic-3 markup (<emotion/>, <break/>,
 * [laughter]) and streams it in small chunks. Cartesia renders a tag only if it
 * arrives whole; a split tag is read aloud ("break time 80ms"), which is what a
 * ferni-dev call on 2026-09-27 did. The filter assembles tags across chunks,
 * forwards the ones Cartesia supports, and drops the rest.
 */
import { describe, expect, it } from 'vitest';
import { CartesiaMarkupFilter, filterCartesiaMarkup } from '../cartesia-markup-filter.js';

function run(chunks: string[]): string {
  const f = new CartesiaMarkupFilter();
  return chunks.map((c) => f.push(c)).join('') + f.flush();
}

/** Every pushed piece must contain only whole tags: no "<" without its ">". */
function piecesAreWhole(chunks: string[]): boolean {
  const f = new CartesiaMarkupFilter();
  const pieces = [...chunks.map((c) => f.push(c)), f.flush()];
  return pieces.every((p) => (p.match(/</g) ?? []).length === (p.match(/>/g) ?? []).length);
}

describe('CartesiaMarkupFilter: supported tags pass through whole', () => {
  it('forwards a break tag split across chunks as one whole tag', () => {
    const chunks = ['Hey.<break ti', 'me="80ms"/> What', "'s happening?"];
    expect(run(chunks)).toBe('Hey.<break time="80ms"/> What\'s happening?');
    expect(piecesAreWhole(chunks)).toBe(true);
  });

  it('forwards a valid emotion tag split across chunks', () => {
    expect(run(['<emotion val', 'ue="curious"/>Hey, hey!'])).toBe('<emotion value="curious"/>Hey, hey!');
  });

  it('forwards [laughter], even split, and normalises laugh variants', () => {
    expect(run(['Hmm. [laugh', 'ter] Fair enough.'])).toBe('Hmm. [laughter] Fair enough.');
    expect(run(['Ha [Laughs] okay.'])).toBe('Ha [laughter] okay.');
  });

  it('forwards speed, volume and spell tags', () => {
    expect(run(['<speed ratio="0.9"/>Slowly.'])).toBe('<speed ratio="0.9"/>Slowly.');
    expect(run(['<volume ratio="1.2"/>Loud.'])).toBe('<volume ratio="1.2"/>Loud.');
    expect(run(['Code <spell>AB12</spell> ok.'])).toBe('Code <spell>AB12</spell> ok.');
  });
});

describe('CartesiaMarkupFilter: values are clamped to what Cartesia accepts', () => {
  it('clamps speed to 0.6-1.5 and volume to 0.5-2.0', () => {
    expect(run(['<speed ratio="3"/>x'])).toBe('<speed ratio="1.5"/>x');
    expect(run(['<speed ratio="0.1"/>x'])).toBe('<speed ratio="0.6"/>x');
    expect(run(['<volume ratio="9"/>x'])).toBe('<volume ratio="2"/>x');
  });

  it('caps a break at 2 seconds and accepts seconds or milliseconds', () => {
    expect(run(['a<break time="10s"/>b'])).toBe('a<break time="2000ms"/>b');
    expect(run(['a<break time="0.5s"/>b'])).toBe('a<break time="500ms"/>b');
  });
});

describe('CartesiaMarkupFilter: unsupported markup is dropped', () => {
  it('drops emotion values Cartesia does not know', () => {
    expect(run(['<emotion value="grumpy"/>Hi.'])).toBe('Hi.');
  });

  it('drops unsupported cues and tags but keeps their text', () => {
    expect(run(['[soft breath] Hey.'])).toBe('Hey.');
    expect(run(['<prosody rate="slow">easy</prosody> now'])).toBe('easy now');
    expect(run(['<speak>Hi.</speak>'])).toBe('Hi.');
  });

  it('drops a malformed speed value instead of forwarding it', () => {
    expect(run(['<speed ratio="fast"/>Go.'])).toBe('Go.');
  });

  it('drops a dangling fragment at the end of the stream', () => {
    expect(run(['Bye now.<emot'])).toBe('Bye now.');
  });
});

describe('CartesiaMarkupFilter: plain text', () => {
  it('keeps the space between chunks instead of gluing sentences', () => {
    expect(run(['Hey.', " What's happening?"])).toBe("Hey. What's happening?");
  });

  it('leaves real text containing < or [ alone', () => {
    expect(run(['3 < 5 is true'])).toBe('3 < 5 is true');
    expect(run(['Rate it [1-10].'])).toBe('Rate it [1-10].');
  });

  it('filters a whole string in one call', () => {
    expect(filterCartesiaMarkup('[soft breath]<emotion value="calm"/>Hi.')).toBe('<emotion value="calm"/>Hi.');
  });
});

describe('CartesiaMarkupFilter on the real 2026-09-27 call replies', () => {
  const replies = [
    '<emotion value="curious"/>Hey, hey!<break time="80ms"/> Look who it is.<break time="80ms"/> How\'s your day treating you?',
    '<emotion value="affectionate"/>"Pretty good." I\'ll take that.<break time="80ms"/> Sometimes "pretty good" is a quiet victory.',
    '<break time="200ms"/>Hmm.<break time="80ms"/> [laughter] Fair enough.<break time="80ms"/> How\'s your head feeling?',
  ];

  it('forwards every tag whole wherever the stream splits', () => {
    for (const reply of replies) {
      const whole = filterCartesiaMarkup(reply);
      expect(whole).toBe(reply);
      for (let i = 1; i < reply.length; i++) {
        const chunks = [reply.slice(0, i), reply.slice(i)];
        expect(run(chunks)).toBe(whole);
        expect(piecesAreWhole(chunks)).toBe(true);
      }
    }
  });
});
