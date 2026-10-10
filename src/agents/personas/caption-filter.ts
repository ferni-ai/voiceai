/**
 * Keep speech markup out of captions.
 *
 * The LLM may open a reply with a Cartesia tag such as
 * <emotion value="sympathetic"/>. The TTS path strips or renders it, but the
 * transcription stream (what the app shows as captions) got the raw text: 3 of
 * 5 replies showed the tag on a live call (2026-09-27). Replies stream in small
 * chunks, so a tag can be split ("<emo" + "tion .../>"); an unfinished tag is
 * held back until it closes, then dropped. Bracket cues like [laughter] are
 * dropped the same way.
 *
 * A stammer written as ",," ("Yeah,, uh,, keeping...", dev eval 2026-10-10)
 * shows as a single comma, even when the two commas arrive in separate chunks.
 *
 * @module agents/personas/caption-filter
 */

import { voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

/** An unclosed '<' or '[' this far back is ordinary text, not a tag. */
const MAX_PENDING = 80;
const TAG = /<\/?[A-Za-z][^>]*>/g;
const CUE = /\[[A-Za-z][A-Za-z ]{0,30}\]/g;

export class CaptionFilter {
  private pending = '';
  private endsWithComma = false;
  private endsWithSpace = false;

  push(chunk: string): string {
    const text = this.pending + chunk;
    const cut = this.unclosedStart(text);
    this.pending = cut === -1 ? '' : text.slice(cut);
    return this.oneComma(clean(cut === -1 ? text : text.slice(0, cut)));
  }

  flush(): string {
    const rest = this.pending;
    this.pending = '';
    return /^[<[]/.test(rest) && rest.length <= MAX_PENDING ? '' : this.oneComma(clean(rest));
  }

  private oneComma(text: string): string {
    let out = text.replace(/,(\s*,)+/g, ',');
    if (this.endsWithComma && /^\s*,/.test(out)) {
      out = out.replace(/^\s*,/, '');
      if (this.endsWithSpace) out = out.trimStart();
    }
    if (out.trim()) {
      this.endsWithComma = /,\s*$/.test(out);
      this.endsWithSpace = /\s$/.test(out);
    }
    return out;
  }

  private unclosedStart(text: string): number {
    const start = Math.max(text.lastIndexOf('<'), text.lastIndexOf('['));
    if (start === -1) return -1;
    const closer = text[start] === '<' ? '>' : ']';
    if (text.indexOf(closer, start) !== -1) return -1;
    const next = text.charAt(start + 1);
    if (next !== '' && !/[A-Za-z/]/.test(next)) return -1;
    return text.length - start > MAX_PENDING ? -1 : start;
  }
}

function clean(text: string): string {
  return text.replace(TAG, '').replace(CUE, '').replace(/ {2,}/g, ' ');
}

export type Caption = string | voice.TimedString;

/** Strip markup from a caption stream; timed chunks keep their timing. */
export function filterCaptionStream(
  input: ReadableStream<Caption> | AsyncIterable<Caption>
): ReadableStream<Caption> {
  const filter = new CaptionFilter();
  const iterable = input as AsyncIterable<Caption>;
  return new ReadableStream<Caption>({
    async start(controller) {
      try {
        for await (const chunk of iterable) {
          if (typeof chunk === 'string') {
            const out = filter.push(chunk);
            if (out) controller.enqueue(out);
          } else {
            const out = filter.push(chunk.text);
            if (out) controller.enqueue(voice.createTimedString({ ...chunk, text: out }));
          }
        }
        const rest = filter.flush();
        if (rest) controller.enqueue(rest);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
