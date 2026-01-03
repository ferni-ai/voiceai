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

/** Title + Name patterns (Dr., Mr., Mrs., Ms., Prof.) - single name only */
const TITLE_NAME_PATTERNS = [
  /(?:Dr\.|Doctor)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  /(?:Mr\.|Mister)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  /(?:Mrs\.|Ms\.|Miss)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  /(?:Prof\.|Professor)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  /(?:Rev\.|Reverend)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
];

/** Whitelisted names in context patterns (Will, Grace, Hope, etc.) */
const WHITELISTED_NAME_PATTERNS = [
  // Name followed by verb or possessive
  /\b(Will|Grace|Hope|Faith|Joy|Rose|Max|Jack|Mark|Bill|Bob|Pat|Ray|Art)(?:'s|\s+(?:is|was|has|had|will|would|can|could|said|says|told|keeps|kept|called|asked|wants|wanted|needs|needed|goes|went|came|comes|thinks|thought|feels|felt|does|did|made|makes))/gi,
  // Name at start of text or after sentence boundary, followed by punctuation or space
  /(?:^|[.!?]\s*)(Will|Grace|Hope|Faith|Joy|Rose|Max|Jack|Mark|Bill|Bob|Pat|Ray|Art)(?=[.\s,!?]|$)/gim,
];

/** Pet name patterns */
const PET_PATTERNS = [
  /my (?:dog|cat|pet|bird|fish|rabbit|hamster|turtle|parrot)\s+([A-Z][a-z]+)/gi,
  /(?:dog|cat|pet|bird|fish)\s+named\s+([A-Z][a-z]+)/gi,
  /([A-Z][a-z]+),?\s+my\s+(?:dog|cat|pet)/gi,
  /(?:dog|cat|pet)\s+(?:is\s+)?called\s+([A-Z][a-z]+)/gi,
];

/** Family member name patterns - WITH comma support */
const FAMILY_PATTERNS = [
  // "my sister Sarah" or "my sister, Sarah," (case-insensitive for relation word)
  /my (?:wife|husband|spouse|partner|son|daughter|mother|father|brother|sister|mom|dad|kid|child|grandma|grandpa|grandmother|grandfather|aunt|uncle|cousin|niece|nephew),?\s+([A-Z][a-z]+)/gi,
  // "Sarah, my sister" (case-insensitive for relation word)
  /([A-Z][a-z]+),?\s+my\s+(?:wife|husband|son|daughter|mother|father|brother|sister)/gi,
  // Complex relationship: "Sarah, my boss's wife's sister" or "John, my friend's brother"
  /([A-Z][a-z]+),?\s+my\s+(?:\w+'s\s+)+(?:wife|husband|son|daughter|mother|father|brother|sister|friend|cousin)/gi,
  // "Aunt/Uncle [Name]" pattern (title-style family)
  /(?:Aunt|Uncle|Grandma|Grandpa|Cousin)\s+([A-Z][a-z]+)/gi,
];

/** Professional/Social relationship patterns */
const RELATIONSHIP_PATTERNS = [
  // "my boss John" or "my boss, John,"
  /my (?:boss|manager|supervisor|coworker|colleague|friend|neighbor|roommate|therapist|doctor|dentist|lawyer|teacher|coach|mentor|assistant|ex|ex-boyfriend|ex-girlfriend|ex-husband|ex-wife),?\s+([A-Z][a-z]+)/gi,
  /(?:boss|manager|friend|neighbor)\s+(?:is\s+)?named\s+([A-Z][a-z]+)/gi,
  // "John, my boss"
  /([A-Z][a-z]+),?\s+(?:who(?:'s| is))?\s+my\s+(?:boss|friend|coworker|neighbor|ex)/gi,
];

/** Action + Name patterns (call Sarah, email John, talked to David, meeting with John, etc.) */
const ACTION_NAME_PATTERNS = [
  // Direct action + name
  /(?:call|email|text|message|contact|meet|visit|see|tell|ask|thank)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // Past tense action + name
  /(?:called|emailed|texted|messaged|contacted|met|visited|saw|told|asked|thanked)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // "talked to / spoke with / chatted with" patterns
  /(?:talked|spoke|chatted|speaking|talking)\s+(?:to|with)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // "meeting/lunch/dinner/coffee with [Name]"
  /(?:meeting|lunch|dinner|coffee|drinks|appointment)\s+with\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // "remember [Name]" patterns
  /(?:remember|know|recall|forgot|forgetting)\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // "about/with [Name]" patterns (drama with Susan, issues with Mark)
  /(?:drama|issues?|problems?|conflicts?|fight|argument)\s+with\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/gi,
  // Promise patterns: "promised Sarah that", "told John I would"
  /(?:promised|told|asked|reminded)\s+([A-Z][a-z]+)\s+(?:that|i|to|about)/gi,
  // "apologize to [Name]"
  /(?:apologize|apologizing|apologized)\s+to\s+([A-Z][a-z]+)/gi,
  // "[Name] + verb" patterns: "Sarah called", "Mark said"
  /([A-Z][a-z]+)\s+(?:just\s+)?(?:called|said|told|asked|mentioned|texted|emailed|messaged)/gi,
  // "mentioned [Name]" patterns
  /(?:mentioned|know|met|saw|heard\s+(?:from|about))\s+([A-Z][a-z]+)/gi,
  // "visiting [Name]" patterns
  /(?:visit|visiting|see|seeing|meeting)\s+([A-Z][a-z]+)/gi,
  // General "with [Name]" pattern in meeting/discussion context
  /(?:with|from)\s+([A-Z][a-z]+)\s+(?:to|about|regarding|for|on)/gi,
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

/** Common words that aren't names (expanded list) */
const NOT_NAMES = new Set([
  // Greetings and responses
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
  'Okay',
  'Yes',
  'No',
  // Common verbs/gerunds that might be capitalized
  'Just',
  'Really',
  'Going',
  'Looking',
  'Thinking',
  'Wondering',
  'Calling',
  'Speaking',
  'Having',
  'Being',
  'Doing',
  'Trying',
  'Feeling',
  'Getting',
  'Making',
  'Taking',
  'Drowning',
  'Exhausting',
  'Deflecting',
  // Common adjectives
  'Here',
  'Ready',
  'Done',
  'Back',
  'New',
  'Young',
  'Old',
  'Busy',
  'Free',
  'Hard',
  'Easy',
  'Big',
  'Small',
  'Long',
  'Short',
  // Common sentence starters
  'So',
  'But',
  'And',
  'The',
  'Not',
  'Because',
  'Always',
  'Never',
  'Maybe',
  'Actually',
  'Probably',
  // Days/Times (false positives)
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'Today',
  'Tomorrow',
  'Yesterday',
  'Morning',
  'Evening',
  'Night',
  // Titles (should be followed by name, not captured alone)
  'Mr',
  'Mrs',
  'Ms',
  'Dr',
  'Prof',
  'Rev',
  'Sir',
  'Miss',
  'Mister',
  'Doctor',
  'Professor',
  // Pronouns and common words that get capitalized
  'It',
  'Its',
  'This',
  'That',
  'These',
  'Those',
  'We',
  'They',
  'She',
  'He',
  'You',
  'Your',
  'My',
  'Our',
  'Their',
  'What',
  'When',
  'Where',
  'Which',
  'Who',
  'How',
  'Why',
  // More common sentence starters
  'However',
  'Although',
  'Even',
  'Still',
  'Yet',
  'Also',
  'Both',
  'Each',
  'Every',
  'Some',
  'Any',
  'Most',
  'Many',
  'Few',
  'All',
  'None',
  // Common verbs/words that start sentences
  'Was',
  'Were',
  'Is',
  'Are',
  'Has',
  'Had',
  'Have',
  'Been',
  'Being',
  'Can',
  'Could',
  'Would',
  'Should',
  'Will',  // Note: Will as a name is in whitelist, which takes priority
  'Did',
  'Does',
  'Do',
  'Let',
  'Get',
  'Got',
  'Saw',
  'See',
  'Said',
  'Says',
]);

/** Names that are also common words - whitelist these */
const NAME_WHITELIST = new Set([
  'Will',
  'Grace',
  'Hope',
  'Faith',
  'Joy',
  'Rose',
  'Lily',
  'Ivy',
  'Holly',
  'Summer',
  'Autumn',
  'April',
  'May',
  'June',
  'Dawn',
  'Eve',
  'Art',
  'Bill',
  'Bob',
  'Pat',
  'Max',
  'Jack',
  'Mark',
  'Rich',
  'Rob',
  'Tom',
  'Ray',
  'Guy',
]);

/** Core persona names - these are our AI team members */
const CORE_PERSONA_NAMES = new Set(['Ferni', 'Maya', 'Peter', 'Alex', 'Jordan', 'Nayan']);

/** Persona last names and extended identifiers */
const PERSONA_EXTENDED = new Set(['Santos', 'Chen', 'Taylor', 'Patel', 'Bogle']);

/** Common non-places */
const NON_PLACES = ['The', 'My', 'Our', 'This', 'That'];

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Check if a potential name is valid (not a common word, or is whitelisted)
 */
function isValidName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 20) return false;

  // CRITICAL: Name must start with uppercase letter (catches case-insensitive regex false positives)
  if (!/^[A-Z]/.test(name)) return false;

  // Whitelisted names that are also words always pass
  if (NAME_WHITELIST.has(name)) return true;

  // Reject known non-names (check both original case and title case)
  const titleCase = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (NOT_NAMES.has(name) || NOT_NAMES.has(titleCase)) return false;

  // Reject core persona names (Ferni, Maya, etc.) but NOT common names like John
  if (CORE_PERSONA_NAMES.has(name)) return false;

  // Reject persona last names
  if (PERSONA_EXTENDED.has(name)) return false;

  // Basic sanity check - should be mostly letters
  if (!/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(name)) return false;

  return true;
}

/**
 * Extract specific details from user messages
 */
export function extractSmallDetails(text: string): SmallDetail[] {
  const details: SmallDetail[] = [];
  const now = new Date();
  const seenNames = new Set<string>(); // Avoid duplicates

  // Extract user names
  for (const pattern of USER_NAME_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && isValidName(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'user_name',
          value: name,
          context: match[0].trim(),
          extractedAt: now,
        });
      }
    }
  }

  // Extract names with titles (Dr., Mr., Mrs., etc.)
  for (const pattern of TITLE_NAME_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'person_name',
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
      const name = match[1];
      if (name && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'pet_name',
          value: name,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Extract family member names
  for (const pattern of FAMILY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && isValidName(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'person_name',
          value: name,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Extract relationship names (boss, friend, coworker, etc.)
  for (const pattern of RELATIONSHIP_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && isValidName(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'person_name',
          value: name,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Extract names from action patterns (call Sarah, email John)
  for (const pattern of ACTION_NAME_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      if (name && isValidName(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'person_name',
          value: name,
          context: match[0],
          extractedAt: now,
        });
      }
    }
  }

  // Extract whitelisted names in context (Will, Grace, Hope, etc.)
  for (const pattern of WHITELISTED_NAME_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const name = match[1];
      // Whitelisted names bypass isValidName (they ARE valid even if common words)
      if (name && /^[A-Z]/.test(name) && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        details.push({
          type: 'person_name',
          value: name,
          context: match[0],
          extractedAt: now,
        });
      }
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
