/**
 * Enhanced Person Extraction
 *
 * NER-like person extraction that goes beyond simple regex:
 * - Relationship terms ("my mom", "my wife")
 * - Proper names from context ("Sarah called me", "talked to John")
 * - Titles and roles ("my boss", "the doctor", "my therapist")
 * - Possessive patterns ("Alex's sister", "Tom and I")
 * - Learn and remember names mentioned in conversation
 *
 * @module services/superhuman/semantic-intelligence/person-extractor
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'person-extractor' });
// ============================================================================
// RELATIONSHIP PATTERNS
// ============================================================================
/**
 * Relationship term patterns with their types and base confidence.
 * Ordered by specificity (more specific patterns first).
 */
const RELATIONSHIP_PATTERNS = [
    // Parents
    { pattern: /\b(my |the )?(mom|mother|mama|mommy)\b/i, relationship: 'parent', confidence: 0.95 },
    { pattern: /\b(my |the )?(dad|father|papa|daddy)\b/i, relationship: 'parent', confidence: 0.95 },
    { pattern: /\b(my |the )?(parents?)\b/i, relationship: 'parent', confidence: 0.9 },
    // Siblings
    { pattern: /\b(my |the )?(brother|bro)\b/i, relationship: 'sibling', confidence: 0.95 },
    { pattern: /\b(my |the )?(sister|sis)\b/i, relationship: 'sibling', confidence: 0.95 },
    { pattern: /\b(my |the )?(siblings?)\b/i, relationship: 'sibling', confidence: 0.9 },
    // Spouse/Partner
    { pattern: /\b(my |the )?(wife)\b/i, relationship: 'spouse', confidence: 0.95 },
    { pattern: /\b(my |the )?(husband)\b/i, relationship: 'spouse', confidence: 0.95 },
    { pattern: /\b(my |the )?(spouse|partner)\b/i, relationship: 'spouse', confidence: 0.9 },
    { pattern: /\b(my |the )?(fiancé|fiancee|fiance)\b/i, relationship: 'spouse', confidence: 0.9 },
    // Children
    { pattern: /\b(my |the |our )?(son)\b/i, relationship: 'child', confidence: 0.95 },
    { pattern: /\b(my |the |our )?(daughter)\b/i, relationship: 'child', confidence: 0.95 },
    {
        pattern: /\b(my |the |our )?(kid|child|baby|toddler)\b/i,
        relationship: 'child',
        confidence: 0.85,
    },
    { pattern: /\b(my |the |our )?(kids|children)\b/i, relationship: 'child', confidence: 0.85 },
    // Extended Family
    {
        pattern: /\b(my |the )?(grandma|grandmother|nana|granny)\b/i,
        relationship: 'extended_family',
        confidence: 0.95,
    },
    {
        pattern: /\b(my |the )?(grandpa|grandfather|papa|gramps)\b/i,
        relationship: 'extended_family',
        confidence: 0.95,
    },
    { pattern: /\b(my |the )?(aunt|auntie)\b/i, relationship: 'extended_family', confidence: 0.9 },
    { pattern: /\b(my |the )?(uncle)\b/i, relationship: 'extended_family', confidence: 0.9 },
    { pattern: /\b(my |the )?(cousin)\b/i, relationship: 'extended_family', confidence: 0.9 },
    { pattern: /\b(my |the )?(niece|nephew)\b/i, relationship: 'extended_family', confidence: 0.9 },
    {
        pattern: /\b(my |the )?(in-laws?|mother-in-law|father-in-law)\b/i,
        relationship: 'extended_family',
        confidence: 0.9,
    },
    // Friends
    {
        pattern: /\b(my |a |the )?(best friend|bestie|bff)\b/i,
        relationship: 'friend',
        confidence: 0.95,
    },
    { pattern: /\b(my |a |the )?(friend)\b/i, relationship: 'friend', confidence: 0.85 },
    { pattern: /\b(my |a |the )?(buddy|pal)\b/i, relationship: 'friend', confidence: 0.8 },
    // Romantic (non-spouse)
    { pattern: /\b(my |the )?(girlfriend|gf)\b/i, relationship: 'romantic', confidence: 0.95 },
    { pattern: /\b(my |the )?(boyfriend|bf)\b/i, relationship: 'romantic', confidence: 0.95 },
    {
        pattern: /\b(my |the |an )?(ex|ex-girlfriend|ex-boyfriend|ex-wife|ex-husband)\b/i,
        relationship: 'romantic',
        confidence: 0.9,
    },
    // Work
    {
        pattern: /\b(my |the |a )?(boss|manager|supervisor)\b/i,
        relationship: 'coworker',
        confidence: 0.9,
    },
    {
        pattern: /\b(my |a |the )?(coworker|colleague|co-worker)\b/i,
        relationship: 'coworker',
        confidence: 0.85,
    },
    { pattern: /\b(my |the )?(team|team member)\b/i, relationship: 'coworker', confidence: 0.7 },
    // Professional
    {
        pattern: /\b(my |the |a )?(doctor|dr\.?|physician)\b/i,
        relationship: 'professional',
        confidence: 0.9,
    },
    {
        pattern: /\b(my |the |a )?(therapist|counselor|psychiatrist|psychologist)\b/i,
        relationship: 'professional',
        confidence: 0.9,
    },
    {
        pattern: /\b(my |the |a )?(lawyer|attorney)\b/i,
        relationship: 'professional',
        confidence: 0.9,
    },
    {
        pattern: /\b(my |the |a )?(teacher|professor|instructor|coach)\b/i,
        relationship: 'professional',
        confidence: 0.85,
    },
    {
        pattern: /\b(my |the |a )?(accountant|advisor|consultant)\b/i,
        relationship: 'professional',
        confidence: 0.8,
    },
    // Acquaintances
    {
        pattern: /\b(my |the |a )?(neighbor|neighbour)\b/i,
        relationship: 'acquaintance',
        confidence: 0.85,
    },
    {
        pattern: /\b(my |the |a )?(roommate|housemate)\b/i,
        relationship: 'acquaintance',
        confidence: 0.85,
    },
    { pattern: /\b(my |the |a )?(landlord)\b/i, relationship: 'acquaintance', confidence: 0.8 },
    // Pets
    { pattern: /\b(my |the |our )?(dog|puppy|pup)\b/i, relationship: 'pet', confidence: 0.9 },
    { pattern: /\b(my |the |our )?(cat|kitten|kitty)\b/i, relationship: 'pet', confidence: 0.9 },
    { pattern: /\b(my |the |our )?(pet)\b/i, relationship: 'pet', confidence: 0.85 },
];
// ============================================================================
// NAME EXTRACTION PATTERNS
// ============================================================================
/**
 * Patterns for extracting proper names from context.
 * These look for names in specific sentence structures.
 */
const NAME_CONTEXT_PATTERNS = [
    // "[Name] called/texted/messaged me"
    {
        pattern: /\b([A-Z][a-z]+)\s+(?:called|texted|messaged|emailed|contacted)\s+me\b/i,
        nameGroup: 1,
        confidence: 0.9,
    },
    // "talked/spoke to/with [Name]"
    {
        pattern: /\b(?:talked|spoke|chatted)\s+(?:to|with)\s+([A-Z][a-z]+)\b/i,
        nameGroup: 1,
        confidence: 0.85,
    },
    // "met [Name]" or "saw [Name]"
    { pattern: /\b(?:met|saw|visited)\s+([A-Z][a-z]+)\b/i, nameGroup: 1, confidence: 0.8 },
    // "[Name] and I"
    { pattern: /\b([A-Z][a-z]+)\s+and\s+I\b/i, nameGroup: 1, confidence: 0.9 },
    // "I and [Name]" (less common but valid)
    { pattern: /\bI\s+and\s+([A-Z][a-z]+)\b/i, nameGroup: 1, confidence: 0.85 },
    // "with [Name]" at start of clause
    { pattern: /\bwith\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/i, nameGroup: 1, confidence: 0.75 },
    // "[Name] said/told/asked"
    {
        pattern: /\b([A-Z][a-z]+)\s+(?:said|told|asked|mentioned|suggested)\b/i,
        nameGroup: 1,
        confidence: 0.85,
    },
    // "from [Name]" (got a message from...)
    { pattern: /\bfrom\s+([A-Z][a-z]+)(?:\s|,|\.|\!|\?|$)/i, nameGroup: 1, confidence: 0.7 },
    // "[Name]'s [thing]" (possessive)
    { pattern: /\b([A-Z][a-z]+)'s\s+\w+/i, nameGroup: 1, confidence: 0.8 },
    // "my friend [Name]" or "my sister [Name]"
    {
        pattern: /\bmy\s+(?:friend|sister|brother|cousin|neighbor|coworker|boss)\s+([A-Z][a-z]+)\b/i,
        nameGroup: 1,
        confidence: 0.95,
    },
    // "called [Name]" or "texted [Name]"
    {
        pattern: /\b(?:called|texted|messaged|emailed)\s+([A-Z][a-z]+)\b/i,
        nameGroup: 1,
        confidence: 0.85,
    },
];
/**
 * Common names to help validate extractions.
 * This is a subset - we use it to boost confidence for known names.
 */
const COMMON_NAMES = new Set([
    // Common English names (subset)
    'james',
    'john',
    'robert',
    'michael',
    'david',
    'william',
    'richard',
    'joseph',
    'thomas',
    'charles',
    'mary',
    'patricia',
    'jennifer',
    'linda',
    'elizabeth',
    'barbara',
    'susan',
    'jessica',
    'sarah',
    'karen',
    'daniel',
    'matthew',
    'anthony',
    'mark',
    'donald',
    'steven',
    'paul',
    'andrew',
    'joshua',
    'kenneth',
    'nancy',
    'betty',
    'margaret',
    'sandra',
    'ashley',
    'dorothy',
    'kimberly',
    'emily',
    'donna',
    'michelle',
    'alex',
    'sam',
    'chris',
    'jordan',
    'taylor',
    'casey',
    'riley',
    'jamie',
    'morgan',
    'avery',
    'emma',
    'olivia',
    'ava',
    'sophia',
    'isabella',
    'mia',
    'charlotte',
    'amelia',
    'harper',
    'evelyn',
    'liam',
    'noah',
    'oliver',
    'elijah',
    'lucas',
    'mason',
    'logan',
    'alexander',
    'ethan',
    'jacob',
    'ben',
    'max',
    'tom',
    'nick',
    'jake',
    'ryan',
    'kevin',
    'brian',
    'eric',
    'jason',
    'lisa',
    'anna',
    'kate',
    'amy',
    'rachel',
    'laura',
    'helen',
    'julie',
    'grace',
    'victoria',
    // Common nicknames
    'mike',
    'matt',
    'dan',
    'dave',
    'bob',
    'rob',
    'bill',
    'joe',
    'jim',
    'tim',
    'sue',
    'jen',
    'jess',
    'liz',
    'beth',
    'meg',
    'kate',
    'kim',
    'sam',
    'alex',
]);
/**
 * Words that look like names but aren't (filter list).
 */
const NOT_NAMES = new Set([
    'i',
    'me',
    'my',
    'you',
    'your',
    'he',
    'she',
    'it',
    'they',
    'we',
    'us',
    'the',
    'a',
    'an',
    'this',
    'that',
    'these',
    'those',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'today',
    'tomorrow',
    'yesterday',
    'morning',
    'afternoon',
    'evening',
    'night',
    'called',
    'said',
    'told',
    'asked',
    'met',
    'saw',
    'talked',
    'spoke',
    'just',
    'really',
    'actually',
    'basically',
    'honestly',
    'literally',
    'think',
    'feel',
    'know',
    'want',
    'need',
    'like',
    'love',
    'hate',
    'good',
    'bad',
    'great',
    'nice',
    'fine',
    'okay',
    'yes',
    'no',
    'maybe',
    'sure',
    'thanks',
    'sorry',
    'ferni',
    'peter',
    'maya',
    'jordan',
    'alex',
    'nayan', // Our personas
]);
// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================
/**
 * Extract all person mentions from text.
 *
 * @param text - The user's message text
 * @returns Array of extracted persons with confidence scores
 */
export function extractPersons(text) {
    if (!text || text.trim().length === 0) {
        return [];
    }
    const extracted = [];
    const seen = new Set(); // Prevent duplicates
    // 1. Extract relationship-based mentions
    for (const { pattern, relationship, confidence } of RELATIONSHIP_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            // BETTER THAN HUMAN FIX: Get the relationship term (group 2), not the possessive prefix (group 1)
            // Pattern structure: /\b(my |the )?(mom|mother|...)\b/i
            // match[0] = full match, match[1] = possessive prefix, match[2] = relationship term
            const name = match[2] || match[1] || match[0];
            const normalizedName = name.toLowerCase().trim();
            if (!seen.has(normalizedName)) {
                seen.add(normalizedName);
                extracted.push({
                    name: name.trim(),
                    relationship,
                    confidence,
                    contextSnippet: extractContextSnippet(text, match.index || 0, match[0].length),
                    isProperName: false,
                });
            }
        }
    }
    // 2. Extract proper names from context patterns
    for (const { pattern, nameGroup, confidence } of NAME_CONTEXT_PATTERNS) {
        const match = text.match(pattern);
        if (match && match[nameGroup]) {
            const name = match[nameGroup];
            const normalizedName = name.toLowerCase().trim();
            // Validate it's likely a name
            if (isLikelyName(name) && !seen.has(normalizedName)) {
                seen.add(normalizedName);
                // Boost confidence if it's a common name
                const adjustedConfidence = COMMON_NAMES.has(normalizedName)
                    ? Math.min(confidence + 0.1, 1.0)
                    : confidence;
                extracted.push({
                    name: name.trim(),
                    relationship: inferRelationship(text, name),
                    confidence: adjustedConfidence,
                    contextSnippet: extractContextSnippet(text, match.index || 0, match[0].length),
                    isProperName: true,
                });
            }
        }
    }
    // 3. Sort by confidence (highest first)
    extracted.sort((a, b) => b.confidence - a.confidence);
    log.debug({ count: extracted.length, persons: extracted.map((p) => p.name) }, '👥 Extracted persons');
    return extracted;
}
/**
 * Get the primary person mentioned (highest confidence).
 */
export function getPrimaryPerson(text) {
    const persons = extractPersons(text);
    return persons.length > 0 ? persons[0] : null;
}
/**
 * Get the primary person's name (convenience function).
 */
export function getPrimaryPersonName(text) {
    const person = getPrimaryPerson(text);
    return person?.name;
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Check if a word is likely a proper name.
 */
function isLikelyName(word) {
    if (!word || word.length < 2 || word.length > 20)
        return false;
    const lower = word.toLowerCase();
    // Filter out non-names
    if (NOT_NAMES.has(lower))
        return false;
    // Must start with capital letter
    if (!/^[A-Z]/.test(word))
        return false;
    // Rest should be lowercase (no ALL CAPS)
    if (/^[A-Z]+$/.test(word) && word.length > 2)
        return false;
    // Should be mostly letters
    if (!/^[A-Za-z'-]+$/.test(word))
        return false;
    return true;
}
/**
 * Try to infer relationship from context around the name.
 */
function inferRelationship(text, name) {
    const lowerText = text.toLowerCase();
    const lowerName = name.toLowerCase();
    // Check for relationship qualifiers near the name
    const nameIndex = lowerText.indexOf(lowerName);
    if (nameIndex === -1)
        return undefined;
    // Get surrounding context (50 chars before and after)
    const start = Math.max(0, nameIndex - 50);
    const end = Math.min(lowerText.length, nameIndex + lowerName.length + 50);
    const context = lowerText.slice(start, end);
    // Check for relationship indicators
    if (/\b(friend|buddy|pal)\b/.test(context))
        return 'friend';
    if (/\b(boss|manager|coworker|colleague)\b/.test(context))
        return 'coworker';
    if (/\b(wife|husband|spouse|partner|married)\b/.test(context))
        return 'spouse';
    if (/\b(girlfriend|boyfriend|dating|date)\b/.test(context))
        return 'romantic';
    if (/\b(sister|brother|sibling)\b/.test(context))
        return 'sibling';
    if (/\b(doctor|therapist|lawyer)\b/.test(context))
        return 'professional';
    return undefined;
}
/**
 * Extract a context snippet around a match.
 */
function extractContextSnippet(text, matchIndex, matchLength) {
    const snippetRadius = 40;
    const start = Math.max(0, matchIndex - snippetRadius);
    const end = Math.min(text.length, matchIndex + matchLength + snippetRadius);
    let snippet = text.slice(start, end).trim();
    // Add ellipsis if truncated
    if (start > 0)
        snippet = '...' + snippet;
    if (end < text.length)
        snippet = snippet + '...';
    return snippet;
}
// ============================================================================
// EXPORTS
// ============================================================================
export { COMMON_NAMES, NOT_NAMES };
//# sourceMappingURL=person-extractor.js.map