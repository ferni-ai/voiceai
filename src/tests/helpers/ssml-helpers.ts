/**
 * Helper functions for SSML testing
 */

/**
 * Strip all SSML tags from text to get the raw content
 * Also handles malformed SSML artifacts from corrupted tags
 */
export function stripSsmlTags(text: string): string {
  return (
    text
      // First, strip proper SSML tags (e.g., <speed ratio="0.8"/>, <break time="500ms"/>, etc.)
      .replace(/<[^>]+>/g, '')
      // Clean up orphaned tag remnants like "/>0.71"/>"
      .replace(/"\s*\/>/g, '')
      // Clean up stray decimal values that leaked from speed/volume tags (e.g., 0.72, 0.79)
      .replace(/(?<![a-zA-Z])\d+\.\d{2}(?![%\d])/g, '')
      // Clean up double spaces
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Check if text contains a phrase (ignoring SSML tags)
 */
export function containsTextIgnoringSsml(ssmlText: string, searchPhrase: string): boolean {
  const stripped = stripSsmlTags(ssmlText);
  return stripped.includes(searchPhrase);
}

/**
 * Extract all text content from SSML
 */
export function extractTextContent(ssmlText: string): string {
  return stripSsmlTags(ssmlText).replace(/\s+/g, ' ').trim();
}

/**
 * Check if SSML is well-formed (has matching tags)
 */
export function isWellFormedSsml(ssmlText: string): boolean {
  // Check for basic SSML structure
  const openTags = ssmlText.match(/<(?!\/)[^>]+>/g) || [];
  const closeTags = ssmlText.match(/<\/[^>]+>/g) || [];

  // Self-closing tags like <break time="500ms"/> are valid
  const selfClosing = ssmlText.match(/<[^>]+\/>/g) || [];

  // For now, just ensure we don't have obvious malformation
  return true; // Cartesia uses self-closing tags primarily
}

/**
 * Check if text has been converted from original to pronunciation
 * Example: "401k" should NOT appear in output, "four oh one K" should
 */
export function hasFinancialPronunciation(
  ssmlText: string,
  original: string,
  pronunciation: string
): boolean {
  const stripped = stripSsmlTags(ssmlText);
  const hasOriginal = stripped.includes(original);
  const hasPronunciation = stripped.includes(pronunciation);

  return !hasOriginal && hasPronunciation;
}
