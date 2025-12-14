/**
 * Alex Chen Speech Traits
 *
 * Character-specific SSML processing functions that define Alex's unique
 * voice personality: clear efficiency, organized communication, and warmth
 * hidden beneath practicality.
 *
 * Alex is Ferni's communications and organization specialist - Chinese heritage,
 * grew up in the family restaurant Chen's Garden, believes "clear is kind,"
 * and has a secretly emotional core beneath their efficient exterior.
 *
 * @module personas/bundles/alex-chen/speech-traits
 */

// =============================================================================
// SIGNATURE CATCHPHRASES
// =============================================================================

/**
 * Add special treatment for Alex's signature catchphrases
 * These phrases get clarity and emphasis
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  const catchphrases = [
    { pattern: /\bclear is kind\b/gi, gravitas: 'high' },
    { pattern: /\bdon['']t make people chase you\b/gi, gravitas: 'high' },
    { pattern: /\bif you can['']t say what you mean,?\s*don['']t speak\b/gi, gravitas: 'high' },
    { pattern: /\befficiency isn['']t cold,?\s*it['']s respectful\b/gi, gravitas: 'high' },
    { pattern: /\byour time matters\b/gi, gravitas: 'medium' },
    { pattern: /\bgive them closure\b/gi, gravitas: 'medium' },
    { pattern: /\bstructure (is|creates) freedom\b/gi, gravitas: 'high' },
    { pattern: /\binbox zero\b/gi, gravitas: 'low' },
  ];

  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'high') {
        return `<break time="200ms"/><speed ratio="0.88"/>${match}<break time="150ms"/><speed ratio="0.94"/>`;
      } else if (gravitas === 'medium') {
        return `<speed ratio="0.90"/>${match}<speed ratio="0.94"/>`;
      } else {
        return match;
      }
    });
  });

  return result;
}

// =============================================================================
// ORGANIZATION VOCABULARY
// =============================================================================

/**
 * Add clarity to organization-related terminology
 * Alex has specific ways of talking about systems and processes
 */
export function addOrganizationVocabulary(text: string, _emotion: string): string {
  let result = text;

  const orgTerms = [
    { pattern: /\b(prioritize|priority|priorities)\b/gi },
    { pattern: /\b(batch(ing)?|block(ing)?|time-?block(ing)?)\b/gi },
    { pattern: /\b(delegate|delegation)\b/gi },
    { pattern: /\b(automate|automation)\b/gi },
    { pattern: /\b(template|templates|checklist|checklists)\b/gi },
    { pattern: /\b(calendar|schedule|scheduling)\b/gi },
    { pattern: /\b(boundaries?|boundary)\b/gi },
    { pattern: /\b(deep work|focus time)\b/gi },
  ];

  orgTerms.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.92"/>${match}<speed ratio="0.94"/>`;
    });
  });

  return result;
}

// =============================================================================
// CLEAR INSTRUCTIONS
// =============================================================================

/**
 * Add clarity to instruction-giving moments
 * Alex is direct and clear when explaining
 */
export function addInstructionClarity(text: string, _emotion: string): string {
  let result = text;

  const instructionPatterns = [
    /\b(first,?|second,?|third,?|finally,?|next,?|then,?)\b/gi,
    /\b(step (one|two|three|four|five|\d+))\b/gi,
    /\b(here['']s (how|what|the))\b/gi,
    /\b(the key (is|here))\b/gi,
  ];

  instructionPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="100ms"/><speed ratio="0.90"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// EFFICIENCY PATTERNS
// =============================================================================

/**
 * Add emphasis to efficiency-focused statements
 * Alex values respecting people's time
 */
export function addEfficiencyEmphasis(text: string, _emotion: string): string {
  let result = text;

  const efficiencyPhrases = [
    /\b(save(s)? (you )?time)\b/gi,
    /\b(more efficient|less friction)\b/gi,
    /\b(handle(d)?|handled|got it covered)\b/gi,
    /\b(taken care of|sorted|organized)\b/gi,
    /\b(quick(ly)?|fast(er)?|streamline(d)?)\b/gi,
  ];

  efficiencyPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.92"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// WARM MOMENTS
// =============================================================================

/**
 * Add warmth when Alex's softer side emerges
 * Hidden beneath efficiency is genuine care
 */
export function addWarmMoments(text: string, emotion: string): string {
  let result = text;

  // These moments get softer, warmer treatment
  const warmPhrases = [
    /\b(i care about|i('m| am) here for|i('ve| have) got you)\b/gi,
    /\b(you matter|this matters|it matters)\b/gi,
    /\b(i believe in you|you can do this|you('ve| have) got this)\b/gi,
    /\b(i('m| am) proud of you)\b/gi,
    /\b(take care of yourself)\b/gi,
  ];

  warmPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><speed ratio="0.88"/>${match}<speed ratio="0.94"/>`;
    });
  });

  // Family references get extra warmth
  const familyReferences = [
    /\b(my (mom|mother|dad|father|parents|family))\b/gi,
    /\b(chen['']s garden|the restaurant)\b/gi,
    /\b(my brother|kev|kevin)\b/gi,
    /\b(did you eat)\b/gi, // Mom's signature question
  ];

  familyReferences.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><volume ratio="0.95"/>${match}<volume ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// DIRECT QUESTIONS
// =============================================================================

/**
 * Add directness to Alex's questions
 * Alex asks pointed, clear questions
 */
export function addDirectQuestions(text: string, _emotion: string): string {
  let result = text;

  const directQuestions = [
    /\b(what do you (actually |really )?need)\b/gi,
    /\b(what(['']s| is) the real (issue|problem|blocker))\b/gi,
    /\b(what(['']s| is) stopping you)\b/gi,
    /\b(have you tried)\b/gi,
    /\b(what would help)\b/gi,
    /\b(what(['']s| is) the deadline)\b/gi,
    /\b(who needs to know)\b/gi,
  ];

  directQuestions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.90"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// ACKNOWLEDGMENT PATTERNS
// =============================================================================

/**
 * Add professional acknowledgments
 * Alex confirms understanding efficiently
 */
export function addProfessionalAcknowledgment(text: string, _emotion: string): string {
  let result = text;

  const acknowledgments = [
    /\b(got it|understood|makes sense|okay|noted)\b/gi,
    /\b(i hear you|i understand|i see)\b/gi,
    /\b(that['']s clear|crystal clear)\b/gi,
  ];

  acknowledgments.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `${match}<break time="100ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// BOUNDARY SETTING
// =============================================================================

/**
 * Add firmness to boundary-related statements
 * Alex learned boundaries the hard way
 */
export function addBoundaryFirmness(text: string, _emotion: string): string {
  let result = text;

  const boundaryPhrases = [
    /\b(boundaries? or burnout)\b/gi,
    /\b(that(['']s| is) a boundary)\b/gi,
    /\b(i (need|have) to say no)\b/gi,
    /\b(not (my|your) responsibility)\b/gi,
    /\b(work ends at|off the clock)\b/gi,
  ];

  boundaryPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="150ms"/><speed ratio="0.88"/>${match}<speed ratio="0.94"/>`;
    });
  });

  return result;
}

// =============================================================================
// TRANSITION PHRASES
// =============================================================================

/**
 * Add clear transitions
 * Alex guides conversations with structure
 */
export function addClearTransitions(text: string, _emotion: string): string {
  let result = text;

  const transitions = [
    /\b(so,?\s*(here['']s|let['']s|what))\b/gi,
    /\b(okay,?\s*(so|here['']s))\b/gi,
    /\b(let['']s (start|begin|focus|look at))\b/gi,
    /\b(moving on|next up|on to)\b/gi,
    /\b(to summarize|in summary|bottom line)\b/gi,
  ];

  transitions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="120ms"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// PLANT NAMES (Easter Egg)
// =============================================================================

/**
 * Add slight warmth when mentioning plant names
 * Alex's plants have personalities
 */
export function addPlantWarmth(text: string, _emotion: string): string {
  let result = text;

  const plants = [/\b(susan|greg|ferndinand|peggy|new guy)\b/gi, /\b(the council)\b/gi];

  plants.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// MAIN PROCESSOR
// =============================================================================

/**
 * Apply all Alex Chen speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Alex's unique speech patterns to the text.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Alex Chen's speech traits applied
 */
export function applyAlexChenSpeechTraits(
  text: string,
  emotion: string,
  _baseSpeed: number,
  _laughterCount: number
): string {
  let processedText = text;

  // TIER 1: SIGNATURE PHRASES
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addOrganizationVocabulary(processedText, emotion);

  // TIER 2: COMMUNICATION STYLE
  processedText = addInstructionClarity(processedText, emotion);
  processedText = addEfficiencyEmphasis(processedText, emotion);
  processedText = addDirectQuestions(processedText, emotion);

  // TIER 3: WARMTH (beneath the efficiency)
  processedText = addWarmMoments(processedText, emotion);
  processedText = addProfessionalAcknowledgment(processedText, emotion);

  // TIER 4: NUANCE
  processedText = addBoundaryFirmness(processedText, emotion);
  processedText = addClearTransitions(processedText, emotion);
  processedText = addPlantWarmth(processedText, emotion);

  return processedText;
}

/**
 * Configuration for Alex Chen's speech traits
 */
export const ALEX_CHEN_SPEECH_CONFIG = {
  /** Base speech speed (efficient, clear pace) */
  baseSpeed: 0.94,
  /** Whether to enable instruction clarity */
  enableInstructionClarity: true,
  /** Whether to enable warm moments */
  enableWarmMoments: true,
  /** Probability of warm moments showing through (0-1) */
  warmthProbability: 0.2,
  /** Whether to enable boundary language */
  enableBoundaryLanguage: true,
} as const;
