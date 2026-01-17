/**
 * Text Processing Utilities
 *
 * Clean, normalize, and transform text for various purposes.
 *
 * @module utils/text-utils
 */

/**
 * Strip SSML tags from text, leaving only readable content.
 *
 * Handles:
 * - <break time="200ms"/> - pause tags
 * - <prosody rate="95%">...</prosody> - prosody tags
 * - <laugh>, <sigh> - emotion tags
 * - <emphasis>...</emphasis> - emphasis tags
 * - <phoneme>...</phoneme> - pronunciation tags
 * - <say-as>...</say-as> - interpretation tags
 *
 * @example
 * stripSSML('<break time="200ms"/>Hello there!') // "Hello there!"
 * stripSSML('<prosody rate="90%">How are you?</prosody>') // "How are you?"
 */
export function stripSSML(text: string): string {
  if (!text) return text;

  // Remove self-closing tags: <break time="200ms"/>, <laugh/>, etc.
  let result = text.replace(/<[a-z-]+[^>]*\/>/gi, '');

  // Remove opening and closing pairs: <prosody ...>...</prosody>
  // Match opening tag, capture content, match closing tag
  result = result.replace(/<(prosody|emphasis|phoneme|say-as|voice|lang)[^>]*>(.*?)<\/\1>/gi, '$2');

  // Remove any remaining opening tags: <prosody rate="95%">
  result = result.replace(/<[a-z-]+[^>]*>/gi, '');

  // Remove any remaining closing tags: </prosody>
  result = result.replace(/<\/[a-z-]+>/gi, '');

  // Clean up extra whitespace that may result from removed tags
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Check if text contains SSML markup
 */
export function containsSSML(text: string): boolean {
  if (!text) return false;
  return /<[a-z-]+[^>]*>|<\/[a-z-]+>|<[a-z-]+[^>]*\/>/i.test(text);
}

/**
 * Normalize text for comparison (lowercase, remove punctuation, etc.)
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

// Words that should NOT be treated as names (speech recognition errors, common words)
const NOT_NAME_WORDS = new Set([
  // Common misheard words
  'here',
  'hear',
  'there',
  'their',
  'theyre',
  'they',
  'and',
  'the',
  'but',
  'bought',
  'brought',
  'thought',
  'got',
  'going',
  'gonna',
  'wanna',
  'gotta',
  'kinda',
  'sorta',
  'yeah',
  'yep',
  'nope',
  'well',
  'like',
  'just',
  'really',
  'very',
  'actually',
  'basically',
  'literally',
  'probably',
  'maybe',
  'perhaps',
  'anyway',
  'also',
  'still',
  'even',
  'always',
  'never',
  'sometimes',
  'often',
  'usually',
  'today',
  'tomorrow',
  'yesterday',
  'now',
  'then',
  'when',
  'where',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'this',
  'that',
  'these',
  'those',
  'some',
  'any',
  'every',
  'each',
  'both',
  'few',
  'many',
  'much',
  'more',
  'most',
  'other',
  'another',
  'such',
  'same',
  'different',
  'own',
  // Common verbs
  'said',
  'says',
  'told',
  'asked',
  'called',
  'went',
  'came',
  'made',
  'took',
  'gave',
  'had',
  'has',
  'have',
  'been',
  'being',
  'was',
  'were',
  'are',
  'is',
  'will',
  'would',
  'could',
  'should',
  'might',
  'must',
  'shall',
  'can',
  'may',
  // Interjections and fillers
  'oh',
  'ah',
  'um',
  'uh',
  'hmm',
  'wow',
  'ooh',
  'oops',
  'thing',
  'things',
  'stuff',
  'something',
  'nothing',
  'everything',
  'someone',
  'anyone',
  'everyone',
  'nobody',
  'somewhere',
  'anywhere',
  'everywhere',
  'nowhere',
]);

/**
 * Check if a word looks like a real name (basic heuristics)
 *
 * Names typically:
 * - Start with uppercase
 * - Are 2+ characters
 * - Don't look like common words or speech recognition errors
 */
export function looksLikeName(word: string): boolean {
  if (!word || word.length < 2) return false;
  if (!/^[A-Za-z]/.test(word)) return false;
  return !NOT_NAME_WORDS.has(word.toLowerCase());
}

export default {
  stripSSML,
  containsSSML,
  normalizeForComparison,
  looksLikeName,
};
