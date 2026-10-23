import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { createSSMLProcessor } from '../../tts-gateway/ssml/processor.js';
import { normalizeSpokenPunctuation, spokenPunctuation } from '../spoken-punctuation.js';

const ON = { SPOKEN_PUNCTUATION_NORMALIZE: 'on' };
const BREAK = '<break time="300ms"/>';

/** Stream chunks through the transform; return every chunk it emitted. */
async function stream(chunks: string[], env: Record<string, string> = ON): Promise<string[]> {
  const out: string[] = [];
  const source = new ReadableStream<string>({
    start(c) {
      for (const chunk of chunks) c.enqueue(chunk);
      c.close();
    },
  });
  for await (const chunk of source.pipeThrough(spokenPunctuation(env))) out.push(chunk);
  return out;
}

const joined = async (chunks: string[], env?: Record<string, string>): Promise<string> =>
  (await stream(chunks, env)).join('');

describe('normalizeSpokenPunctuation', () => {
  it('a mid-sentence ellipsis becomes a short break', () => {
    expect(normalizeSpokenPunctuation('Just... talk.')).toBe(`Just${BREAK} talk.`);
    expect(normalizeSpokenPunctuation('The darkness was ... full.')).toBe(
      `The darkness was${BREAK} full.`
    );
  });

  it('a unicode ellipsis is treated the same', () => {
    expect(normalizeSpokenPunctuation('Just… talk.')).toBe(`Just${BREAK} talk.`);
    expect(normalizeSpokenPunctuation('Just….. talk.')).toBe(`Just${BREAK} talk.`);
  });

  it('a trailing ellipsis at the end of the reply becomes a full stop', () => {
    expect(normalizeSpokenPunctuation("I don't know...")).toBe("I don't know.");
    expect(normalizeSpokenPunctuation('I miss it… ')).toBe('I miss it.');
    expect(normalizeSpokenPunctuation('Really?...')).toBe('Really?');
  });

  it('a leading ellipsis or dash is dropped', () => {
    expect(normalizeSpokenPunctuation('...and then it rained.')).toBe('and then it rained.');
    expect(normalizeSpokenPunctuation('— so anyway.')).toBe('so anyway.');
  });

  it('next to an existing break, one break survives: the longer one', () => {
    expect(normalizeSpokenPunctuation('Just... <break time="500ms"/> talk.')).toBe(
      'Just<break time="500ms"/> talk.'
    );
    expect(normalizeSpokenPunctuation('Just <break time="1s"/>... talk.')).toBe(
      'Just<break time="1s"/> talk.'
    );
    expect(normalizeSpokenPunctuation('Just <break time="100ms"/> ... talk.')).toBe(
      `Just${BREAK} talk.`
    );
    expect(normalizeSpokenPunctuation('wait — <break time="400ms"/> no.')).toBe(
      'wait<break time="400ms"/> no.'
    );
  });

  it('an em dash or a spaced "--" becomes a comma, never doubled', () => {
    expect(normalizeSpokenPunctuation('It was late — really late.')).toBe(
      'It was late, really late.'
    );
    expect(normalizeSpokenPunctuation('It was late—really late.')).toBe(
      'It was late, really late.'
    );
    expect(normalizeSpokenPunctuation('It was late -- really late.')).toBe(
      'It was late, really late.'
    );
    expect(normalizeSpokenPunctuation('Well, — yes.')).toBe('Well, yes.');
    expect(normalizeSpokenPunctuation('Well,... yes.')).toBe('Well, yes.');
    expect(normalizeSpokenPunctuation('yes —, fine.')).toBe('yes, fine.');
    expect(normalizeSpokenPunctuation('I was going to—')).toBe('I was going to.');
  });

  it('leaves SSML tags and attribute values, URLs, ranges and flags alone', () => {
    const tag = '<emotion value="sad—ish"/>Okay.';
    expect(normalizeSpokenPunctuation(tag)).toBe(tag);
    const prosody = '<prosody rate="slow..."> hi </prosody>';
    expect(normalizeSpokenPunctuation(prosody)).toBe(prosody);
    const url = 'See https://example.com/a...b—c for more.';
    expect(normalizeSpokenPunctuation(url)).toBe(url);
    expect(normalizeSpokenPunctuation('Pages 1...3 and 10—12.')).toBe('Pages 1...3 and 10—12.');
    expect(normalizeSpokenPunctuation('Run it with --help please.')).toBe(
      'Run it with --help please.'
    );
    expect(normalizeSpokenPunctuation('Two dots.. stay.')).toBe('Two dots.. stay.');
  });

  it('through the SSML processor the break is heard as a single comma', () => {
    const ssml = createSSMLProcessor();
    const spoken = (t: string): string => ssml.parse(normalizeSpokenPunctuation(t)).cleanText;
    expect(spoken('Just... talk.')).toBe('Just, talk.');
    expect(spoken('Well,... yes — fine.')).toBe('Well, yes, fine.');
  });
});

describe('spokenPunctuation stream', () => {
  it('flag off: every chunk passes through byte-identical', async () => {
    const chunks = ['Just..', '. talk', ' — ok', '<break time="1s"/>', '…'];
    expect(await stream(chunks, {})).toEqual(chunks);
    expect(await stream(chunks, { SPOKEN_PUNCTUATION_NORMALIZE: 'off' })).toEqual(chunks);
  });

  it('an ellipsis split across chunks is still one ellipsis', async () => {
    expect(await joined(['Just..', '. talk.'])).toBe(`Just${BREAK} talk.`);
    expect(await joined(['Just.', '.', '.', ' ', 'talk.'])).toBe(`Just${BREAK} talk.`);
    expect(await joined(["I don't know.", '..'])).toBe("I don't know.");
  });

  it('a dash split across chunks is still one dash', async () => {
    expect(await joined(['It was late ', '—', ' really late.'])).toBe('It was late, really late.');
    expect(await joined(['It was late -', '- really late.'])).toBe('It was late, really late.');
  });

  it('an ellipsis next to a break tag arriving in pieces merges into one break', async () => {
    const out = await joined(['Just... <br', 'eak time="500ms"', '/> talk.']);
    expect(out).toBe('Just<break time="500ms"/> talk.');
  });

  it('settled text is released at once; only the unsettled tail waits', async () => {
    expect(await stream(['Hello there', ' friend...', ' how', ' are you'])).toEqual([
      'Hello there',
      ' friend',
      `${BREAK} how`,
      ' are you',
    ]);
  });
});
