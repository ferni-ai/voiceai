/**
 * Topic and fact extraction for entity capture (integration.ts uses them). Split out of
 * integration.ts so it has room to bind the Firestore database (the file is over the
 * 500-line ratchet).
 *
 * @module memory/entity-store/capture-extraction
 */

import type { PersonCaptureInput, CaptureContext, ExtractedFact } from './types.js';

// ============================================================================
// TOPIC EXTRACTION
// ============================================================================

/**
 * Extract topics from transcript (simple keyword extraction)
 */
export function extractTopics(transcript: string): string[] {
  const topics: string[] = [];
  const lower = transcript.toLowerCase();

  // Topic patterns
  const topicPatterns: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /\b(work|job|office|career|boss|meeting)\b/, topic: 'work' },
    { pattern: /\b(health|sick|hospital|doctor|surgery|medical)\b/, topic: 'health' },
    { pattern: /\b(family|mom|dad|brother|sister|kids|children)\b/, topic: 'family' },
    { pattern: /\b(money|pay|salary|bills|financial|budget)\b/, topic: 'finances' },
    { pattern: /\b(wedding|engaged|married|anniversary)\b/, topic: 'relationship' },
    { pattern: /\b(birthday|holiday|christmas|thanksgiving|celebration)\b/, topic: 'celebration' },
    { pattern: /\b(school|college|university|class|exam|grade)\b/, topic: 'education' },
    { pattern: /\b(move|moving|house|apartment|home)\b/, topic: 'housing' },
    { pattern: /\b(trip|vacation|travel|flight|visit)\b/, topic: 'travel' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(lower)) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Extract facts from input and context
 */
export function extractFacts(input: PersonCaptureInput, context: CaptureContext): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  if (input.phone) {
    facts.push({
      type: 'attribute',
      key: 'phone',
      value: input.phone,
      confidence: 0.95,
    });
  }

  if (input.email) {
    facts.push({
      type: 'attribute',
      key: 'email',
      value: input.email,
      confidence: 0.95,
    });
  }

  if (input.relationship) {
    facts.push({
      type: 'relationship',
      key: 'relationship_to_user',
      value: input.relationship,
      confidence: 0.9,
    });
  }

  return facts;
}
