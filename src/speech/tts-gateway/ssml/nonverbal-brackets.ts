/**
 * Nonverbal bracket-expression patterns for SSML pre-processing.
 *
 * Split out of processor.ts to keep that file under the quality ratchet's
 * line-count limit.
 *
 * @module speech/tts-gateway/ssml/nonverbal-brackets
 */

/**
 * Bracket expressions that map to Cartesia's native [laughter] tag.
 * LLMs often output variations; we normalize them all.
 */
export const LAUGHTER_BRACKET_REGEX =
  /\[(laughs?|chuckles?|chuckling|warm laugh|big laugh|laughing|laughter)\]/gi;

/**
 * Bracket expressions built around breath/sigh/exhale/inhale — none are
 * Cartesia-documented nonverbal tags (only `[laughter]` is), and content
 * files + prompt guidance commonly describe them with a leading adjective
 * ("[soft breath]", "[gentle exhale]", "[quiet sigh]"). STRIP_BRACKET_REGEX
 * only matches when the direction word is FIRST in the brackets, so those
 * adjective-led variants slipped through and were spoken literally. Match
 * the keyword anywhere in the brackets instead of only at the start.
 */
export const BREATH_BRACKET_REGEX =
  /\[[^[\]]*\b(?:breath(?:e[sd]?|ing)?|sighs?|exhales?|inhales?)\b[^[\]]*\]/gi;
