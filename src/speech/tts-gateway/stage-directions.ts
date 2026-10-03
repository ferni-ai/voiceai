/**
 * Asterisk stage directions ("*smiles*", "*takes a breath*") are never spoken.
 *
 * One stripper, two callers: the always-on SSML processor (every gateway path,
 * Director on or off) and the Speech Director's normalize pass. A span of up to
 * five words wrapped in asterisks is a direction when it starts with an action
 * verb, or opens a sentence in lowercase ("*a long pause*"). Anything else is
 * emphasis ("*really*"): the Director unwraps it, the default path leaves it as
 * it always was. Only paired asterisks are touched, so "5*3", "2 * 4" and
 * "f***" are left alone. Sighs and breaths are Stage 2's to render.
 *
 * @module speech/tts-gateway/stage-directions
 */

/** Verbs that make an *asterisk span* a stage direction wherever it sits. */
const ACTION_VERB =
  /^(?:sighs?|smiles?|laughs?|chuckles?|giggles?|grins?|nods?|shrugs?|winks?|pauses?|breathes?|takes|clears|leans|looks|beams?|exhales?|inhales?|whispers?|gasps?|snorts?|hums?)\b/i;
/** An *asterisk-wrapped* span of up to 5 words. */
const ASTERISK_SPAN = /(^|[^\w*])\*{1,3}([A-Za-z][A-Za-z' -]{0,60}?)\*{1,3}(?=$|[^\w*])/g;
const MAX_DIRECTION_WORDS = 5;

/** True when `inner` (the span's words), preceded by `before`, is a stage direction. */
export function isStageDirection(inner: string, before: string): boolean {
  // Lowercase at a sentence start reads as a direction (*a long pause*);
  // emphasis there would be capitalised (*Really*).
  const startsSentence = /(?:^|[.!?])\s*$/.test(before) && /^[a-z]/.test(inner);
  const words = inner.trim().split(/\s+/).length;
  return words <= MAX_DIRECTION_WORDS && (ACTION_VERB.test(inner) || startsSentence);
}

/**
 * Drop stage directions; with `unwrapEmphasis`, also take the asterisks off
 * emphasis spans. Spacing is left to the caller's tidy-up.
 */
export function rewriteAsteriskSpans(
  text: string,
  unwrapEmphasis: boolean
): { text: string; count: number } {
  let count = 0;
  const out = text.replace(
    ASTERISK_SPAN,
    (match, lead: string, inner: string, at: number, all: string) => {
      if (isStageDirection(inner, all.slice(0, at) + lead)) {
        count++;
        return lead;
      }
      if (!unwrapEmphasis) return match;
      count++;
      return `${lead}${inner}`;
    }
  );
  return { text: out, count };
}
