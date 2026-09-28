import { describe, expect, it } from 'vitest';
import { voice } from '@livekit/agents';
import { CaptionFilter, filterCaptionStream } from '../caption-filter.js';

const run = (chunks: string[]) => {
  const f = new CaptionFilter();
  return chunks.map((c) => f.push(c)).join('') + f.flush();
};

describe('CaptionFilter', () => {
  it('drops the emotion tag seen in live captions', () => {
    expect(run(['<emotion value="sympathetic"/>Oh, no. Not the charger too!'])).toBe(
      'Oh, no. Not the charger too!'
    );
  });

  it('drops a tag split across streamed chunks', () => {
    expect(run(['<emo', 'tion value="calm"/>', 'Yeah, I get it.'])).toBe('Yeah, I get it.');
  });

  it('drops bracket cues but keeps ordinary text', () => {
    expect(run(['That was funny [laughter] honestly.'])).toBe('That was funny honestly.');
    expect(run(['Rates rose 3 < 5 percent'])).toBe('Rates rose 3 < 5 percent');
  });

  it('does not swallow the tail of a reply that ends mid-tag', () => {
    expect(run(['All good. <break'])).toBe('All good. ');
  });
});

describe('filterCaptionStream', () => {
  it('filters strings and keeps timing on timed chunks', async () => {
    const input = (async function* () {
      yield '<emotion value="calm"/>Hey';
      yield voice.createTimedString({ text: ' there', startTime: 1.2, endTime: 1.5 });
    })();
    const out: Array<string | voice.TimedString> = [];
    for await (const c of filterCaptionStream(input) as unknown as AsyncIterable<
      string | voice.TimedString
    >) {
      out.push(c);
    }
    expect(out[0]).toBe('Hey');
    const timed = out[1] as voice.TimedString;
    expect(voice.isTimedString(timed)).toBe(true);
    expect(timed.text).toBe(' there');
    expect(timed.startTime).toBe(1.2);
  });
});
