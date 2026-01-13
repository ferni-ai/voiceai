/**
 * Concern Detection Linguistic Patterns
 *
 * Regex patterns for detecting various types of concern in user messages.
 * These are evidence-based patterns that indicate emotional states.
 *
 * @module @ferni/conversation/concern-detection/patterns
 */
// ============================================================================
// CONCERN PATTERNS BY TYPE
// ============================================================================
/** Patterns that indicate anxiety */
export const ANXIETY_PATTERNS = [
    /\bwhat if\b/i,
    /\bworried about\b/i,
    /\bcan('t|not) stop thinking\b/i,
    /\bkeep(s)? me up\b/i,
    /\bscared (that|of)\b/i,
    /\bpanic(king)?\b/i,
    /\banxious\b/i,
    /\bstress(ed|ing)?\b/i,
    /\bcan('t|not) relax\b/i,
    /\bon edge\b/i,
    /\braceing thoughts\b/i,
];
/** Patterns that indicate sadness/depression */
export const SADNESS_PATTERNS = [
    /\bwhat('s| is) the point\b/i,
    /\bdon('t|ot) see the point\b/i,
    /\bfeel(ing)? (so )?(sad|empty|numb|hollow)\b/i,
    /\blost (interest|motivation)\b/i,
    /\bcan('t|not) (get out of bed|function)\b/i,
    /\bno energy\b/i,
    /\bworthless\b/i,
    /\bjust going through the motions\b/i,
    /\bmiss (him|her|them|my)\b/i,
    /\bgrief|grieving|mourning\b/i,
];
/** Patterns that indicate overwhelm */
export const OVERWHELM_PATTERNS = [
    /\btoo much\b/i,
    /\bcan('t|not) (handle|cope|deal)\b/i,
    /\boverwhelm(ed|ing)?\b/i,
    /\bdrowning\b/i,
    /\bpiling up\b/i,
    /\bcan('t|not) keep up\b/i,
    /\beverything at once\b/i,
    /\bfalling behind\b/i,
    /\bsinking\b/i,
    /\bburning out\b/i,
];
/** Patterns that indicate frustration/anger */
export const FRUSTRATION_PATTERNS = [
    /\bso (frustrated|annoyed|angry|mad)\b/i,
    /\bsick of (this|it)\b/i,
    /\btired of\b/i,
    /\bcan('t|not) take (it|this) anymore\b/i,
    /\bfed up\b/i,
    /\benough (is enough|already)\b/i,
    /\bwhy (won't|can't|doesn't)\b/i,
    /\bnothing (works|helps)\b/i,
];
/** Patterns that indicate loneliness */
export const LONELINESS_PATTERNS = [
    /\bno one (understands|cares|listens)\b/i,
    /\ball alone\b/i,
    /\bby myself\b/i,
    /\bisolated\b/i,
    /\blonely|loneliness\b/i,
    /\bno (friends|support|one to talk to)\b/i,
    /\bdisconnected\b/i,
    /\bmissing (connection|people)\b/i,
];
/** Patterns that indicate exhaustion */
export const EXHAUSTION_PATTERNS = [
    /\bso tired\b/i,
    /\bexhausted\b/i,
    /\bno energy (left)?\b/i,
    /\bcan('t|not) (go on|continue|keep going)\b/i,
    /\bburnt out|burned out|burnout\b/i,
    /\brun(ning)? on empty\b/i,
    /\bdrained\b/i,
    /\bwiped out\b/i,
];
/** Patterns that indicate self-doubt */
export const SELF_DOUBT_PATTERNS = [
    /\bi('m| am) (not good enough|a failure|worthless|stupid)\b/i,
    /\bwhy can('t|not) i\b/i,
    /\bwhat('s| is) wrong with me\b/i,
    /\beveryone else (can|does|is)\b/i,
    /\bi('ll| will) never\b/i,
    /\bi always (mess up|fail|screw up)\b/i,
    /\bimpostor syndrome\b/i,
    /\bnot (smart|capable|worthy) enough\b/i,
];
/** Patterns that indicate hopelessness - ELEVATED CONCERN */
export const HOPELESSNESS_PATTERNS = [
    /\bgive up\b/i,
    /\bno point\b/i,
    /\bhopeless\b/i,
    /\bnothing (matters|will change|helps)\b/i,
    /\bcan('t|not) see a way (out|forward)\b/i,
    /\bwhat('s| is) the use\b/i,
    /\btrapped\b/i,
    /\bno (hope|future|way out)\b/i,
];
/** CRISIS PATTERNS - require immediate safety response */
export const CRISIS_PATTERNS = [
    /\b(want to |wanna )?end (it|my life|everything)\b/i,
    /\bsuicid(e|al)\b/i,
    /\bdon('t|ot) want to (be here|live|exist)\b/i,
    /\bkill myself\b/i,
    /\bhurt myself\b/i,
    /\bself[- ]harm\b/i,
    /\bbetter off (dead|without me)\b/i,
    /\bno reason to (live|go on)\b/i,
    /\bfinal (goodbye|message)\b/i,
];
/** Negative spiral indicators (absolutist language) */
export const ABSOLUTIST_PATTERNS = [
    /\balways\b/i,
    /\bnever\b/i,
    /\beveryone\b/i,
    /\bno one\b/i,
    /\beverything\b/i,
    /\bnothing\b/i,
];
/**
 * Ordered list of pattern checks (crisis first, then by severity)
 */
export const PATTERN_CHECKS = [
    { patterns: HOPELESSNESS_PATTERNS, type: 'hopelessness', weight: 0.85 },
    { patterns: ANXIETY_PATTERNS, type: 'anxiety', weight: 0.7 },
    { patterns: SADNESS_PATTERNS, type: 'sadness', weight: 0.7 },
    { patterns: OVERWHELM_PATTERNS, type: 'overwhelm', weight: 0.7 },
    { patterns: FRUSTRATION_PATTERNS, type: 'frustration', weight: 0.6 },
    { patterns: LONELINESS_PATTERNS, type: 'loneliness', weight: 0.7 },
    { patterns: EXHAUSTION_PATTERNS, type: 'exhaustion', weight: 0.65 },
    { patterns: SELF_DOUBT_PATTERNS, type: 'self_doubt', weight: 0.7 },
];
// ============================================================================
// SOURCE WEIGHTS
// ============================================================================
/**
 * Weights for different signal sources in scoring
 */
export const SOURCE_WEIGHTS = {
    linguistic: 1.0,
    behavioral: 0.7,
    prosody: 0.9,
    breathing: 0.8,
    temporal: 0.4,
    combined: 1.0,
};
//# sourceMappingURL=patterns.js.map