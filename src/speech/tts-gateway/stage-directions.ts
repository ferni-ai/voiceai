/**
 * Asterisk stage directions ("*smiles*", "*takes a breath*") are never spoken.
 *
 * One stripper, two callers: the always-on SSML processor (every gateway path,
 * Director on or off) and the Speech Director's normalize pass.
 *
 * A span's content reads as an action when an action verb leads it (sighs,
 * smiles, takes, looks, ...) or it contains an action noun anywhere (pause,
 * breath, beat, sigh, laugh, smile, nod — "a long pause"). What happens to
 * that span then depends on where it sits:
 * - A STAND-ALONE action (both ends of the span sit at a sentence boundary —
 *   the text's own start/end, a [.!?], or right after another removed span;
 *   SSML tags don't count as "real" text here) is removed ENTIRELY: it was
 *   never part of the sentence.
 * - An action word that's part of the sentence itself ("It *looks* great on
 *   you.": "looks" IS the sentence's verb) only has its asterisks dropped —
 *   the word stays, regardless of the caller's `unwrapEmphasis` flag,
 *   because leaving a bare, un-asterisked action word in running text reads
 *   wrong either way.
 * - Everything else (plain emphasis, markdown bold, a word that just isn't
 *   an action) keeps the flag-gated behavior it always had: the Director's
 *   normalize pass unwraps it, the default path leaves it exactly as it was.
 *
 * Review H1: before this, ANY span starting with an action verb was removed
 * ENTIRELY wherever it sat, so "It *looks* great on you." lost its verb
 * ("It great on you."). Only paired asterisks are touched, so "5*3",
 * "2 * 4" and "f***" are left alone. Sighs and breaths are Stage 2's to
 * render.
 *
 * @module speech/tts-gateway/stage-directions
 */

/** Action verbs — a span starting with one reads as an action wherever it sits. */
const ACTION_VERB =
  /^(?:sighs?|smiles?|laughs?|chuckles?|giggles?|grins?|nods?|shrugs?|winks?|pauses?|breathes?|takes|clears|leans|looks|beams?|exhales?|inhales?|whispers?|gasps?|snorts?|hums?)\b/i;
/** An action noun anywhere in the span ("a long pause", "a soft smile"). */
const ACTION_NOUN = /\b(?:pauses?|breaths?|beats?|sighs?|laughs?|smiles?|nods?)\b/i;
/** An *asterisk-wrapped* span of up to 5 words. */
const ASTERISK_SPAN = /(^|[^\w*])\*{1,3}([A-Za-z][A-Za-z' -]{0,60}?)\*{1,3}(?=$|[^\w*])/g;
const MAX_DIRECTION_WORDS = 5;
const TAG = /<[^>]*>/g;

/** True when the span's words read as an action (verb or noun), regardless of position. */
function isActionContent(inner: string): boolean {
  if (inner.trim().split(/\s+/).length > MAX_DIRECTION_WORDS) return false;
  return ACTION_VERB.test(inner) || ACTION_NOUN.test(inner);
}

/**
 * True when nothing but SSML tags and whitespace sits before the span: the
 * text's own start, or right after a sentence-ending [.!?].
 */
function startsStandalone(before: string): boolean {
  return /(?:^|[.!?])\s*$/.test(before.replace(TAG, ''));
}

/**
 * True when nothing but SSML tags and whitespace sits after the span, or
 * what follows reads as a new sentence (whitespace + a capital letter, or
 * sentence/clause punctuation) or the start of another asterisk span (a run
 * of directions back to back, e.g. "*sighs* *smiles* Hello.").
 */
function endsStandalone(after: string): boolean {
  const stripped = after.replace(TAG, '');
  return (
    /^\s*$/.test(stripped) ||
    /^\s+[A-Z]/.test(stripped) ||
    /^\s*[.,!?]/.test(stripped) ||
    /^\s*\*/.test(stripped)
  );
}

/** True when `inner`, surrounded by `before`/`after`, is a stand-alone action. */
export function isStageDirection(
  inner: string,
  before: string,
  after: string,
  chainedFromRemoval: boolean
): boolean {
  if (!isActionContent(inner)) return false;
  return (chainedFromRemoval || startsStandalone(before)) && endsStandalone(after);
}

/**
 * Drop stand-alone actions entirely; unwrap an action word that's part of
 * the sentence itself (always — never left asterisked); with
 * `unwrapEmphasis`, also take the asterisks off everything else (plain
 * emphasis, markdown bold). Spacing is left to the caller's tidy-up.
 */
export function rewriteAsteriskSpans(
  text: string,
  unwrapEmphasis: boolean
): { text: string; count: number } {
  let count = 0;
  let chainEnd = -1;
  let chainedFromRemoval = false;
  const out = text.replace(
    ASTERISK_SPAN,
    (match, lead: string, inner: string, at: number, all: string) => {
      const before = all.slice(0, at) + lead;
      const after = all.slice(at + match.length);
      const chained = chainedFromRemoval && /^\s*$/.test(all.slice(chainEnd, at));
      const standalone = isStageDirection(inner, before, after, chained);
      chainEnd = at + match.length;
      chainedFromRemoval = standalone;
      if (standalone) {
        count++;
        return lead;
      }
      if (!isActionContent(inner) && !unwrapEmphasis) return match;
      count++;
      return `${lead}${inner}`;
    }
  );
  return { text: out, count };
}
