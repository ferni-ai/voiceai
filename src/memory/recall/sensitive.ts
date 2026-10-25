/**
 * Not an opener: grief, health, pregnancy, money and relationships, the things
 * recall already says never to raise first. Whole words only. Shared by the
 * welcome back (agents/multi-agent/welcome-back.ts) and the person model.
 *
 * @module memory/recall/sensitive
 */
const SENSITIVE =
  /\b(?:died|death|dying|passed away|funeral|grie(?:f|ve|ving)|miscarriage|pregnan\w*|cancer|tumou?r|biopsy|diagnos\w*|surgery|hospital\w*|chemo\w*|illness|sick|health|doctor|therap(?:y|ist)|depress\w*|anxiety|panic attacks?|divorce|break ?up|broke up|separat(?:ed|ion)|laid off|fired|debt|money|bankrupt\w*|evict\w*)\b/i;

export function isSensitiveThread(text: string): boolean {
  return SENSITIVE.test(text);
}
