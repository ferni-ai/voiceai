/**
 * Cartesia markup the gateway must keep or tidy (Cartesia docs, 2026-10-03):
 * - `<spell>TEXT</spell>` reads a code or ID character by character. The SSML
 *   processor stripped it as an unknown tag; it now passes through, and never
 *   next to a `<break>` (Cartesia: don't chain spell with break).
 * - consecutive `<break>` tags made Sonic hallucinate; a run of breaks with
 *   no words between them collapses to one, at the run's longest duration.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartesiaTTSProvider } from '../providers/cartesia.js';
import { createSSMLProcessor } from '../ssml/processor.js';
import { collapseBreaks, dropBreaksBesideSpell, protectSpell } from '../ssml/speech-markup.js';

const clean = (text: string): string => createSSMLProcessor().parse(text).cleanText;

describe('collapseBreaks', () => {
  it('keeps one break per run, at the longest duration', () => {
    expect(collapseBreaks('a <break time="300ms"/><break time="1s"/> b')).toBe(
      'a <break time="1000ms"/> b'
    );
    expect(collapseBreaks('a<break time="200ms"/> <break time="150ms"/>b')).toBe(
      'a<break time="200ms"/>b'
    );
  });

  it('leaves breaks with words between them alone', () => {
    const text = 'a <break time="300ms"/> b <break time="500ms"/> c';
    expect(collapseBreaks(text)).toBe(text);
  });
});

describe('<spell> passthrough', () => {
  it('drops a break right before or after a spell element', () => {
    expect(dropBreaksBesideSpell('code <break time="300ms"/><spell>AB12</spell> ok')).toBe(
      'code <spell>AB12</spell> ok'
    );
    expect(dropBreaksBesideSpell('<spell>AB12</spell> <break time="300ms"/>ok')).toBe(
      '<spell>AB12</spell> ok'
    );
  });

  it('round-trips spell elements through a placeholder', () => {
    const p = protectSpell('your code is <SPELL>X7 Q</SPELL>, ok');
    expect(p.text).not.toContain('spell');
    expect(p.restore(p.text)).toBe('your code is <spell>X7 Q</spell>, ok');
  });

  it('survives the SSML processor, with a neighbouring break dropped', () => {
    expect(clean('Your confirmation is <break time="400ms"/><spell>K7Q2</spell>. Got it?')).toBe(
      'Your confirmation is <spell>K7Q2</spell>. Got it?'
    );
    // Other unknown tags are still stripped.
    expect(clean('<foo>Hi</foo> <spell>a1</spell>')).toBe('Hi <spell>a1</spell>');
  });

  it('is not mistaken for sentence text by the cleanup rules', () => {
    expect(clean('Code<spell>a.B</spell>ok')).toBe('Code<spell>a.B</spell>ok');
  });

  // ---- M2: a break NESTED inside <spell>…</spell> must be dropped too ----
  it('strips a break nested inside spell, not just one adjacent to it', () => {
    expect(clean('Code <spell>A<break time="1s"/>B</spell> ok')).toBe('Code <spell>AB</spell> ok');
    expect(protectSpell('Code <spell>A<break time="1s"/>B</spell> ok').text).not.toContain(
      'break'
    );
  });
});

describe('consecutive breaks in the SSML processor', () => {
  it('turn into one pause, not a stack of punctuation', () => {
    expect(clean('Hmm.<break time="300ms"/><break time="300ms"/>Okay')).toBe(
      clean('Hmm.<break time="300ms"/>Okay')
    );
    expect(clean('Well<break time="200ms"/><break time="600ms"/>okay')).toBe('Well. okay');
  });
});

describe('Cartesia bytes path keeps <spell>', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('CARTESIA_API_KEY', 'test-key');
    fetchMock.mockResolvedValue(new globalThis.Response(new ArrayBuffer(4)));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends spell intact and strips other tags', async () => {
    await new CartesiaTTSProvider().synthesize(
      'It is <spell>ZX9</spell> <break time="300ms"/>now.',
      'voice-1'
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.transcript).toBe('It is <spell>ZX9</spell> now.');
  });

  // ---- L1: an unclosed <spell> must be stripped here too, like the processor ----
  it('strips an unclosed spell, matching the SSML processor', async () => {
    expect(clean('Unclosed <spell>ABC then more')).toBe('Unclosed ABC then more');
    await new CartesiaTTSProvider().synthesize('Unclosed <spell>ABC then more', 'voice-1');
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);
    expect(body.transcript).toBe('Unclosed ABC then more');
  });
});

describe('live reply-stream path keeps <spell>', () => {
  it('pushes the spell element to Cartesia unchanged', async () => {
    const { createContinuationTTS } = await import('../continuation-tts.js');
    const { prosodyTags } = await import('../providers/cartesia.js');
    const pushes: string[] = [];
    const processor = createSSMLProcessor();
    const stream = createContinuationTTS({
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue('Your booking code is <spell>QX7</spell>. See you then.');
          c.close();
        },
      }),
      reply: {
        push: (t: string) => pushes.push(t),
        end: () => undefined,
        cancel: () => undefined,
        async *[Symbol.asyncIterator]() {},
      },
      sanitize: (chunk) => {
        const r = processor.parse(chunk);
        return { text: r.cleanText.trim(), prosody: r.prosody };
      },
      openingTags: prosodyTags,
      toFrames: () => [],
      onFirstAudio: () => undefined,
      onError: () => undefined,
    });
    for await (const _ of stream) {
      /* drain */
    }
    expect(pushes.join('')).toContain('<spell>QX7</spell>');
  });
});
