/**
 * Small Details Module
 *
 * Extracts and manages small but meaningful details from conversations:
 * - User names
 * - Person names (family, friends)
 * - Pet names
 * - Places
 * - Companies
 * - Dates
 * - Amounts
 *
 * @module conversation-quality/small-details
 */

import type { SmallDetail } from './types.js';

// ============================================================================
// PATTERNS
// ============================================================================

/** User name patterns */
const USER_NAME_PATTERNS = [
  /my name(?:'s| is)\s+([A-Z][a-z]+)/gi,
  /(?:^|\s)I'm\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi,
  /call me\s+([A-Z][a-z]+)/gi,
  /(?:^|\s)(?:I am|name's)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi,
  /^([A-Z][a-z]+)\s+here(?:\s|,|\.|\!|$)/gi,
  /this is\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi,
  /(?:^|\s)it's\s+([A-Z][a-z]+)(?:\s|,|\.|\!|$)/gi,
];

/** Pet name patterns */
const PET_PATTERNS = [
  /my (?:dog|cat|pet|bird|fish)\s+([A-Z][a-z]+)/gi,
  /(?:dog|cat|pet|bird)\s+named\s+([A-Z][a-z]+)/gi,
  /([A-Z][a-z]+),?\s+my\s+(?:dog|cat|pet)/gi,
];

/** Family member name patterns */
const FAMILY_PATTERNS = [
  /my (?:wife|husband|spouse|partner|son|daughter|mother|father|brother|sister|mom|dad|kid|child)\s+([A-Z][a-z]+)/gi,
  /([A-Z][a-z]+),?\s+my\s+(?:wife|husband|son|daughter|mother|father)/gi,
];

/** Place patterns */
const PLACE_PATTERNS = [
  /(?:live|living|moved|moving|from|in)\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
];

/** Company patterns */
const COMPANY_PATTERNS = [
  /(?:work|worked|working)\s+(?:at|for)\s+([A-Z][a-zA-Z]+)/gi,
  /my (?:company|employer|job at)\s+([A-Z][a-zA-Z]+)/gi,
];

/** Amount patterns */
const AMOUNT_PATTERNS = [
  /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|k|m|b))?/gi,
  /(\d+(?:\.\d+)?)\s*(?:million|billion|thousand)\s*dollars?/gi,
];

/** Common words that aren't names */
const NOT_NAMES = new Set([
  'Good',
  'Fine',
  'Great',
  'Happy',
  'Sad',
  'Worried',
  'Excited',
  'Tired',
  'Sorry',
  'Sure',
  'Thanks',
  'Hello',
  'Hey',
  'Hi',
  'Well',
  'Just',
  'Really',
  'Going',
  'Looking',
  'Thinking',
  'Wondering',
  'Calling',
  'Speaking',
  'Here',
  'Ready',
  'Done',
  'Back',
  'New',
  'Young',
  'Old',
  'Busy',
  'Free',
]);

/** Persona names - never confuse with user names */
const PERSONA_NAMES = new Set([
  'Ferni',
  'Maya',
  'Peter',
  'Alex',
  'Jordan',
  'Nayan',
  'Santos',
  'Chen',
  'Taylor',
  'John',
  'Patel',
]);

/** Common non-places */
const NON_PLACES = ['The', 'My', 'Our', 'This', 'That'];

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract specific details from user messages
 */
export function extractSmallDetails(text: string): SmallDetail[] {
  const details: SmallDetail[] = [];
  const now = new Date();

  // Extract user names
  for (const pattern of USER_NAME_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (
        name &&
        !NOT_NAMES.has(name) &&
        !PERSONA_NAMES.has(name) &&
        name.length >= 2 &&
        name.length <= 15
      ) {
        details.push({
          type: 'user_name',
          value: name,
          context: match[0].trim(),
          extractedAt: now,
        });
      }
    }
  }

  // Extract pet names
  for (const pattern of PET_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'pet_name',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Extract family member names
  for (const pattern of FAMILY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'person_name',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Extract places
  for (const pattern of PLACE_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const place = match[1];
      if (!NON_PLACES.includes(place)) {
        details.push({
          type: 'place',
          value: place,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Extract companies
  for (const pattern of COMPANY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'company',
        value: match[1],
        context: match[0],
        extractedAt: now,
      });
    }
  }

  // Extract amounts
  for (const pattern of AMOUNT_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      details.push({
        type: 'amount',
        value: match[0],
        context: text.slice(Math.max(0, match.index! - 20), match.index! + match[0].length + 20),
        extractedAt: now,
      });
    }
  }

  return details;
}

/**
 * Get a contextual reference to a remembered detail
 */
export function getDetailCallback(detail: SmallDetail): string {
  switch (detail.type) {
    case 'pet_name':
      return `How's ${detail.value} doing?`;
    case 'person_name':
      return `Give my best to ${detail.value}.`;
    case 'place':
      return `How are things in ${detail.value}?`;
    case 'company':
      return `How's work at ${detail.value}?`;
    default:
      return '';
  }
}
