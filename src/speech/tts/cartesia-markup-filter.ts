/**
 * Forwards Cartesia sonic-3 markup from a STREAMED reply, whole.
 *
 * The LLM is prompted to write `<emotion value="…"/>`, `<break time="…"/>` and
 * `[laughter]`, and Cartesia renders them natively — but only when a tag
 * arrives whole. Replies stream in small chunks, so a tag is often split
 * ("<break ti" + "me=\"80ms\"/>"); forwarded as-is, Cartesia reads it aloud.
 * This holds back an unfinished `<tag` or `[cue` until it closes, then keeps
 * the tags Cartesia supports (values clamped to its accepted ranges) and drops
 * everything else, keeping the text between tags.
 *
 * Supported (docs.cartesia.ai, sonic-3 SSML tags): speed 0.6-1.5, volume
 * 0.5-2.0, break, spell, emotion (named values below), and [laughter].
 *
 * @module speech/tts/cartesia-markup-filter
 */

/** Past this length an unclosed `<` or `[` is treated as ordinary text. */
const MAX_PENDING = 80;
/** A pause longer than this in conversation sounds like a dropped call. */
const MAX_BREAK_MS = 2000;

const TAG = /<\/?[A-Za-z][^>]*>/g;
const CUE = /\[[A-Za-z][A-Za-z ]{0,30}\]/g;
const DANGLING_TAG = /^<\/?[A-Za-z]?[^>]*$/;
const DANGLING_CUE = /^\[[A-Za-z][A-Za-z ]{0,30}$/;
/** Marks where a dropped tag was, so spacing can be repaired afterwards. */
const DROPPED = '\u0000';

export const CARTESIA_EMOTIONS: ReadonlySet<string> = new Set([
  'neutral', 'happy', 'excited', 'enthusiastic', 'elated', 'euphoric', 'triumphant', 'amazed',
  'surprised', 'flirtatious', 'curious', 'content', 'peaceful', 'serene', 'calm', 'grateful',
  'affectionate', 'trust', 'sympathetic', 'anticipation', 'mysterious', 'angry', 'mad', 'outraged',
  'frustrated', 'agitated', 'threatened', 'disgusted', 'contempt', 'envious', 'sarcastic', 'ironic',
  'sad', 'dejected', 'melancholic', 'disappointed', 'hurt', 'guilty', 'bored', 'tired', 'rejected',
  'nostalgic', 'wistful', 'apologetic', 'hesitant', 'insecure', 'confused', 'resigned', 'anxious',
  'panicked', 'alarmed', 'scared', 'proud', 'confident', 'distant', 'skeptical', 'contemplative',
  'determined',
]);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The Cartesia form of a complete tag, or null to drop it. */
function supportedTag(tag: string): string | null {
  const brk = /^<break\s+time\s*=\s*"(\d+(?:\.\d+)?)\s*(ms|s)"\s*\/?>$/i.exec(tag);
  if (brk) {
    const ms = Number(brk[1]) * (brk[2].toLowerCase() === 's' ? 1000 : 1);
    return `<break time="${Math.round(clamp(ms, 0, MAX_BREAK_MS))}ms"/>`;
  }
  const emo = /^<emotion\s+value\s*=\s*"([A-Za-z]+)"\s*\/?>$/i.exec(tag);
  if (emo) {
    const value = emo[1].toLowerCase();
    return CARTESIA_EMOTIONS.has(value) ? `<emotion value="${value}"/>` : null;
  }
  const ratio = /^<(speed|volume)\s+ratio\s*=\s*"(\d+(?:\.\d+)?)"\s*\/?>$/i.exec(tag);
  if (ratio) {
    const kind = ratio[1].toLowerCase();
    const [lo, hi] = kind === 'speed' ? [0.6, 1.5] : [0.5, 2.0];
    return `<${kind} ratio="${clamp(Number(ratio[2]), lo, hi)}"/>`;
  }
  const spell = /^<(\/?)spell\s*>$/i.exec(tag);
  if (spell) return `<${spell[1]}spell>`;
  return null;
}

function supportedCue(cue: string): string | null {
  return /^\[\s*laugh(?:ter|s|ing)?\s*\]$/i.test(cue) ? '[laughter]' : null;
}

export class CartesiaMarkupFilter {
  private pending = '';
  private emittedAny = false;
  private lastEndedWithSpace = false;
  /** A tag was dropped at the end of the last segment; space it from what follows. */
  private owedSpace = false;

  /** Add a chunk; returns text whose tags are all whole and supported. */
  push(chunk: string): string {
    const text = this.pending + chunk;
    const cut = this.findUnclosedStart(text);
    if (cut === -1) {
      this.pending = '';
      return this.emit(text);
    }
    this.pending = text.slice(cut);
    return this.emit(text.slice(0, cut));
  }

  /** End of stream: release what is left, dropping a dangling tag fragment. */
  flush(): string {
    const rest = this.pending;
    this.pending = '';
    if (DANGLING_TAG.test(rest) || DANGLING_CUE.test(rest)) return '';
    return this.emit(rest);
  }

  private findUnclosedStart(text: string): number {
    const lt = text.lastIndexOf('<');
    const lb = text.lastIndexOf('[');
    const start = Math.max(lt, lb);
    if (start === -1) return -1;
    const closer = start === lt ? '>' : ']';
    if (text.indexOf(closer, start) !== -1) return -1;
    const next = text.charAt(start + 1);
    const looksLikeMarkup =
      next === '' || (start === lt ? /[A-Za-z/]/.test(next) : /[A-Za-z]/.test(next));
    if (!looksLikeMarkup) return -1;
    if (text.length - start > MAX_PENDING) return -1;
    return start;
  }

  private emit(raw: string): string {
    if (raw === '') return '';
    let out = raw
      .replace(TAG, (t) => supportedTag(t) ?? DROPPED)
      .replace(CUE, (c) => supportedCue(c) ?? DROPPED)
      // A dropped tag and the whitespace around it collapse to one marker.
      .replace(/[ \t]*\u0000[\u0000 \t]*/g, DROPPED);

    const atLineStart = !this.emittedAny || this.lastEndedWithSpace;
    if (out.startsWith(DROPPED)) {
      out = out.slice(1);
      if (!atLineStart && out !== '' && !out.startsWith(DROPPED)) this.owedSpace = true;
    }
    let owesAfter = false;
    if (out.endsWith(DROPPED)) {
      out = out.slice(0, -1);
      owesAfter = true;
    }
    out = out.split(DROPPED).join(' ').replace(/[ \t]{2,}/g, ' ');

    if (atLineStart) out = out.replace(/^[ \t]+/, '');
    if (out !== '' && this.owedSpace && this.emittedAny && !/^[ \t]/.test(out)) out = ' ' + out;
    if (out !== '') this.owedSpace = false;
    if (owesAfter) this.owedSpace = true;
    if (out === '') return '';
    this.emittedAny = true;
    this.lastEndedWithSpace = /[ \t]$/.test(out);
    return out;
  }
}

/** Filter a complete (non-streamed) string. */
export function filterCartesiaMarkup(text: string): string {
  const f = new CartesiaMarkupFilter();
  return f.push(text) + f.flush();
}
