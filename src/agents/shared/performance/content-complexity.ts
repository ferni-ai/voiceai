/**
 * Content complexity analysis for adaptive pacing (POST_TTS_ADAPTIVE_PACING).
 *
 * @module agents/shared/performance/content-complexity
 */

/**
 * Analyze text content to determine complexity for adaptive pacing.
 *
 * This enables the POST_TTS_ADAPTIVE_PACING feature to automatically adjust
 * speech tempo based on how complex the content is:
 * - Complex content (technical, multi-clause) → slower pacing for comprehension
 * - Simple content (casual, short) → natural/faster pacing
 *
 * Factors analyzed:
 * - Sentence length and structure
 * - Word complexity (syllable count, technical terms)
 * - Question density
 * - Clause complexity (conjunctions, parentheticals)
 * - Emotional weight (certain words need time to land)
 *
 * @param text - The text content to analyze
 * @returns Complexity score 0-1 (0 = simple, 1 = very complex)
 */
export function analyzeContentComplexity(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0.5; // Default moderate complexity
  }

  let complexity = 0.3; // Base level

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // 1. Text length factor (longer = more complex)
  if (wordCount > 50) complexity += 0.15;
  else if (wordCount > 30) complexity += 0.08;
  else if (wordCount < 10) complexity -= 0.1; // Short = simpler

  // 2. Average word length (longer words = more complex)
  const avgWordLength =
    words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0) / Math.max(wordCount, 1);
  if (avgWordLength > 7) complexity += 0.15;
  else if (avgWordLength > 5.5) complexity += 0.08;
  else if (avgWordLength < 4) complexity -= 0.08;

  // 3. Sentence complexity (clauses, punctuation)
  const commaCount = (text.match(/,/g) || []).length;
  const semicolonCount = (text.match(/;/g) || []).length;
  if (commaCount > 4 || semicolonCount > 0) complexity += 0.1;

  // 4. Question density (questions need processing time)
  const questionCount = (text.match(/\?/g) || []).length;
  complexity += questionCount * 0.08;

  // 5. Technical/complex vocabulary
  const technicalPatterns = [
    /\b(understand|consider|important|significant|however|therefore)\b/gi,
    /\b(specifically|particularly|essentially|fundamentally|consequently)\b/gi,
    /\b(nevertheless|furthermore|additionally|alternatively|respectively)\b/gi,
    /\b(psychological|philosophical|analytical|theoretical|substantial)\b/gi,
  ];
  let technicalMatches = 0;
  for (const pattern of technicalPatterns) {
    technicalMatches += (text.match(pattern) || []).length;
  }
  if (technicalMatches > 3) complexity += 0.15;
  else if (technicalMatches > 1) complexity += 0.08;

  // 6. Emotional weight words (need time to land)
  const emotionalPatterns =
    /\b(love|grief|fear|hope|dream|loss|pain|joy|sorry|proud|grateful|worried)\b/gi;
  const emotionalMatches = (text.match(emotionalPatterns) || []).length;
  if (emotionalMatches > 0) complexity += 0.05 * Math.min(emotionalMatches, 3);

  // 7. Parenthetical/nested content (requires more cognitive load)
  const parentheticalCount = (text.match(/[(\[]/g) || []).length;
  const dashCount = (text.match(/[—–-]{2,}/g) || []).length;
  complexity += (parentheticalCount + dashCount) * 0.05;

  // 8. Numbers and data (need processing time)
  const numberCount = (text.match(/\d+/g) || []).length;
  if (numberCount > 2) complexity += 0.1;

  // 9. Conjunction chains (complex sentence structure)
  const conjunctionChains = (
    text.match(/\b(and|but|or|while|because|although|if|when|since)\b/gi) || []
  ).length;
  if (conjunctionChains > 3) complexity += 0.1;

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, complexity));
}

/**
 * Get recommended pacing multiplier based on complexity.
 *
 * Higher complexity → lower multiplier (slower speech)
 * Lower complexity → higher multiplier (can speak faster)
 *
 * Range: 0.85 (very complex, slow down 15%) to 1.1 (simple, speed up 10%)
 */
export function getRecommendedPacingFromComplexity(complexity: number): number {
  // Map complexity 0-1 to pacing 1.1-0.85
  // complexity 0 → 1.1 (fast, simple content)
  // complexity 0.5 → 0.975 (normal)
  // complexity 1 → 0.85 (slow, complex content)
  return 1.1 - complexity * 0.25;
}
