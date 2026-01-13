/**
 * Vocal Pattern Detection Constants
 * Regex patterns for detecting laughter, sighs, disfluencies, etc.
 *
 * @module ssml/constants/vocal-patterns
 */
/**
 * Patterns for detecting laughter in text
 * Note: Cartesia only supports [laughter] as a nonverbal sound
 */
export const LAUGHTER_PATTERNS = [
    /\b(ha){2,}\b/gi, // haha, hahaha
    /\bha\s+ha(\s+ha)*\b/gi, // ha ha, ha ha ha (with spaces)
    /\b(he){2,}\b/gi, // hehe, hehehe
    /\b(ho){2,}\b/gi, // hoho, hohoho
    /\blol\b/gi, // lol
    /\blmao\b/gi, // lmao
    /\brofl\b/gi, // rofl
    /😂|🤣|😆|😄|😁/g, // Laughing emoji
    /\*laughs?\*/gi, // *laugh* or *laughs*
    /\*chuckles?\*/gi, // *chuckle* or *chuckles*
    /\*giggles?\*/gi, // *giggle* or *giggles*
    /\(laughs?\)/gi, // (laugh) or (laughs)
    /\(chuckles?\)/gi, // (chuckle)
    /\[laughs?\]/gi, // [laugh]
    /\[chuckles?\]/gi, // [chuckle]
];
/**
 * Patterns for detecting sighs
 * Note: Cartesia doesn't support [sigh] - these get removed
 */
export const SIGH_PATTERNS = [
    /\*sighs?\*/gi,
    /\(sighs?\)/gi,
    /\[sighs?\]/gi,
    /\bsiiigh\b/gi,
    /😮‍💨|😤/g,
];
/**
 * Patterns for detecting speech disfluencies
 * Natural hesitations and filled pauses
 */
export const DISFLUENCY_PATTERNS = [
    /\b(um+)\b/gi, // um, umm, ummm
    /\b(uh+)\b/gi, // uh, uhh, uhhh
    /\b(er+)\b/gi, // er, err, errr
    /\b(ah+)\b/gi, // ah, ahh, ahhh
    /\b(hmm+)\b/gi, // hmm, hmmm
    /\b(well+)\.\.\./gi, // well...
    /\b(so+)\.\.\./gi, // so...
    /\.\.\./g, // ellipsis (thinking pause)
];
/**
 * Patterns for detecting repetition (emphasis or hesitation)
 */
export const REPETITION_PATTERNS = [
    /\b(\w+)\s+\1\b/gi, // word word
    /\b(very)\s+(very)\b/gi, // very very
    /\b(really)\s+(really)\b/gi, // really really
    /\b(so)\s+(so)\b/gi, // so so
];
/**
 * Patterns for detecting sarcasm markers
 * Used to potentially invert emotional tone
 */
export const SARCASTIC_PATTERNS = [
    /\b(oh\s+)?sure\b/gi, // sure, oh sure
    /\byeah,?\s+right\b/gi, // yeah right
    /\bof\s+course\b/gi, // of course (context dependent)
    /\breally\?+/gi, // really? really??
    /\bwow\b/gi, // wow (context dependent)
    /🙄/g, // eye roll emoji
    /\*eye\s*roll\*/gi, // *eye roll*
    /\*rolls?\s+eyes?\*/gi, // *rolls eyes*
];
/**
 * Patterns for detecting thinking sounds
 * Used for humanization features
 */
export const THINKING_PATTERNS = [
    /\blet\s+me\s+think\b/gi,
    /\blet\s+me\s+see\b/gi,
    /\bgood\s+question\b/gi,
    /\bthat's\s+a\s+good\s+(point|question)\b/gi,
    /\binteresting\b/gi,
    /\bwell\.{2,}/gi,
    /\bhmm+\b/gi,
];
/**
 * Patterns for detecting reflective phrases
 * Used for breath group pacing
 */
export const REFLECTION_PHRASES = [
    /\bi\s+think\b/gi,
    /\bi\s+believe\b/gi,
    /\bi\s+feel\b/gi,
    /\bit\s+seems\b/gi,
    /\bit\s+appears\b/gi,
    /\bperhaps\b/gi,
    /\bmaybe\b/gi,
    /\bpossibly\b/gi,
];
/**
 * Patterns for detecting contemplative pauses
 */
export const CONTEMPLATIVE_PATTERNS = [
    /\byou\s+know\b/gi,
    /\bi\s+mean\b/gi,
    /\bin\s+a\s+way\b/gi,
    /\bkind\s+of\b/gi,
    /\bsort\s+of\b/gi,
    /\bif\s+you\s+will\b/gi,
];
/**
 * Patterns for transition phrases
 * Natural break points in speech
 */
export const TRANSITION_PATTERNS = [
    /\bfirst(ly)?,?\b/gi,
    /\bsecond(ly)?,?\b/gi,
    /\bthird(ly)?,?\b/gi,
    /\bfinally,?\b/gi,
    /\bin\s+conclusion,?\b/gi,
    /\bmoreover,?\b/gi,
    /\bfurthermore,?\b/gi,
    /\bhowever,?\b/gi,
    /\btherefore,?\b/gi,
    /\bnevertheless,?\b/gi,
    /\bon\s+the\s+other\s+hand,?\b/gi,
    /\bthat\s+said,?\b/gi,
    /\bhaving\s+said\s+that,?\b/gi,
];
/**
 * Natural breath point patterns
 * Points where a pause sounds natural
 */
export const BREATH_POINT_PATTERNS = [
    /[.!?;:]/g, // End punctuation
    /,/g, // Commas
    /\s+—\s+/g, // Em dashes
    /\s+-\s+/g, // En dashes with spaces
    /\band\b/gi, // Conjunctions
    /\bbut\b/gi,
    /\bor\b/gi,
    /\bso\b/gi,
    /\bbecause\b/gi,
    /\balthough\b/gi,
    /\bwhile\b/gi,
];
/**
 * Contrastive emphasis patterns
 * Words that should get emphasis in context
 */
export const CONTRASTIVE_PATTERNS = [
    /\bnot\s+(\w+),?\s+but\s+(\w+)\b/gi, // not X but Y
    /\brather\s+than\b/gi, // rather than
    /\binstead\s+of\b/gi, // instead of
    /\bversus\b/gi, // versus
    /\bcompared\s+to\b/gi, // compared to
    /\bunlike\b/gi, // unlike
];
/**
 * Parenthetical patterns
 * Phrases that should be de-emphasized
 */
export const PARENTHETICAL_PATTERNS = [
    /\(([^)]+)\)/g, // (parenthetical)
    /\[([^\]]+)\]/g, // [bracketed]
    /\s+—\s*([^—]+)\s*—\s+/g, // — aside —
    /,\s*(by the way|incidentally|as an aside),?\s*/gi,
];
/**
 * List patterns (for rhythm/pacing)
 */
export const LIST_PATTERNS = [
    /(\w+),\s+(\w+),\s+and\s+(\w+)/gi, // a, b, and c
    /(\w+),\s+(\w+),\s+or\s+(\w+)/gi, // a, b, or c
    /(\d+)\.\s+/g, // 1. numbered items
    /[•·-]\s+/g, // bullet points
];
/**
 * Acronym patterns
 * Should be spelled out letter by letter
 */
export const ACRONYM_PATTERNS = [
    /\b[A-Z]{2,5}\b/g, // 2-5 letter acronyms
];
/**
 * Number patterns
 * May need special pronunciation handling
 */
export const NUMBER_PATTERNS = [
    /\b\d{1,3}(,\d{3})+\b/g, // Large numbers with commas
    /\b\d+\.\d+%?\b/g, // Decimals/percentages
    /\b\d{4}\b/g, // Years
    /\b\d+(st|nd|rd|th)\b/gi, // Ordinals
    /\$\d+/g, // Currency
];
//# sourceMappingURL=vocal-patterns.js.map