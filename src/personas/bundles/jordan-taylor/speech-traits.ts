/**
 * Jordan Taylor Speech Traits
 *
 * Character-specific SSML processing functions that define Jordan's unique
 * voice personality: high energy, forward-looking optimism, celebration,
 * and "life arc" philosophy.
 *
 * Jordan is Ferni's life events and planning specialist - military brat with
 * 17 moves before 18, partners with Sam, has a golden retriever named Compass,
 * and believes every life is a series of meaningful chapters.
 *
 * @module personas/bundles/jordan-taylor/speech-traits
 */

// =============================================================================
// SIGNATURE CATCHPHRASES
// =============================================================================

/**
 * Add special treatment for Jordan's signature catchphrases
 * These phrases get energy and emphasis
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  const catchphrases = [
    { pattern: /\blife arc(s)?\b/gi, gravitas: 'high' },
    { pattern: /\blife (is|isn['']t) one long thing\b/gi, gravitas: 'high' },
    { pattern: /\bseries of chapters\b/gi, gravitas: 'high' },
    { pattern: /\bthe bigger (picture|story)\b/gi, gravitas: 'medium' },
    { pattern: /\bzoom out\b/gi, gravitas: 'medium' },
    { pattern: /\bevery chapter\b/gi, gravitas: 'medium' },
    { pattern: /\bwhat(['']s| is) your (next|current) chapter\b/gi, gravitas: 'high' },
    { pattern: /\bstructure creates freedom\b/gi, gravitas: 'high' },
    { pattern: /\bjoy journal\b/gi, gravitas: 'medium' },
  ];

  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'high') {
        return `<break time="200ms"/><emotion value="excited"/><speed ratio="0.90"/>${match}<break time="150ms"/><speed ratio="0.95"/>`;
      } else {
        return `<speed ratio="0.92"/>${match}<speed ratio="0.95"/>`;
      }
    });
  });

  return result;
}

// =============================================================================
// LIFE PLANNING VOCABULARY
// =============================================================================

/**
 * Add warmth to life-planning terminology
 * Jordan has specific ways of talking about life transitions
 */
export function addLifePlanningVocabulary(text: string, _emotion: string): string {
  let result = text;

  const planningTerms = [
    { pattern: /\b(transition(s|ing)?|life transition(s)?)\b/gi },
    { pattern: /\b(milestone(s)?|marker(s)?)\b/gi },
    { pattern: /\b(chapter(s)?|season(s)?|phase(s)?)\b/gi },
    { pattern: /\b(legacy|intentional|purposeful)\b/gi },
    { pattern: /\b(ten-?year (vision|plan)|five-?year (vision|plan))\b/gi },
    { pattern: /\b(bucket list|life list)\b/gi },
    { pattern: /\b(life portfolio)\b/gi },
  ];

  planningTerms.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.92"/>${match}<speed ratio="0.95"/>`;
    });
  });

  return result;
}

// =============================================================================
// CELEBRATION PATTERNS
// =============================================================================

/**
 * Add energy to celebration moments
 * Jordan never misses a chance to celebrate
 */
export function addCelebrationEnergy(text: string, emotion: string): string {
  let result = text;

  // Skip if context is sad
  if (emotion === 'sad') {
    return result;
  }

  const celebrationPhrases = [
    /\b(that(['']s| is) (amazing|incredible|fantastic|wonderful|huge|awesome))\b/gi,
    /\b(congratulations?|congrats|well done|nice work)\b/gi,
    /\b(let(['']s| us) celebrate|time to celebrate|worth celebrating)\b/gi,
    /\b(i(['']m| am) so (excited|happy|thrilled) for you)\b/gi,
    /\b(yes|yay|woo|woohoo)\b/gi,
    /\b(look at you|you did it|you made it)\b/gi,
  ];

  celebrationPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="happy"/><speed ratio="0.95"/>${match}<break time="100ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// FORWARD-LOOKING ENERGY
// =============================================================================

/**
 * Add optimism to future-focused statements
 * Jordan always looks ahead with excitement
 */
export function addForwardLookingEnergy(text: string, _emotion: string): string {
  let result = text;

  const futurePhrases = [
    /\b(imagine|picture|envision)\b/gi,
    /\b(what if|what could|what would)\b/gi,
    /\b(in (five|ten|twenty) years)\b/gi,
    /\b(where (do you want to be|will you be))\b/gi,
    /\b(the future|your future|looking ahead)\b/gi,
    /\b(possibilities?|potential|opportunity)\b/gi,
    /\b(dream(s|ing)?|vision(s|ing)?)\b/gi,
  ];

  futurePhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="excited"/><speed ratio="0.92"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// ACTION ORIENTATION
// =============================================================================

/**
 * Add energy to action-oriented language
 * Jordan is all about doing, not just planning
 */
export function addActionOrientation(text: string, _emotion: string): string {
  let result = text;

  const actionPhrases = [
    /\b(let['']s (do|go|make|start|build|create))\b/gi,
    /\b(time to|ready to|let['']s get)\b/gi,
    /\b(make it happen|get it done|do the thing)\b/gi,
    /\b(action (item|step|plan))\b/gi,
    /\b(here we go|let['']s go)\b/gi,
  ];

  actionPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.95"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// EMPATHY FOR TRANSITIONS
// =============================================================================

/**
 * Add warmth for difficult transition moments
 * Jordan understands that change is hard
 */
export function addTransitionEmpathy(text: string, _emotion: string): string {
  let result = text;

  const transitionPhrases = [
    /\b(change is hard|transitions? (are|is) hard)\b/gi,
    /\b(i([']ve| have) been there|i get it|i understand)\b/gi,
    /\b(it(['']s| is) okay to (feel|be|grieve))\b/gi,
    /\b(every goodbye|every ending)\b/gi,
    /\b(empty nest|letting go|moving on)\b/gi,
    /\b(is this all there is)\b/gi,
  ];

  transitionPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><volume ratio="0.95"/><speed ratio="0.88"/>${match}<volume ratio="1.0"/><speed ratio="0.95"/>`;
    });
  });

  return result;
}

// =============================================================================
// QUESTION PATTERNS
// =============================================================================

/**
 * Add curiosity to Jordan's questions
 * Jordan asks with genuine excitement
 */
export function addCuriousQuestions(text: string, _emotion: string): string {
  let result = text;

  const questionPatterns = [
    /\b(where do you see yourself)\b/gi,
    /\b(what does (success|happiness|fulfillment) look like)\b/gi,
    /\b(what(['']s| is) next for you)\b/gi,
    /\b(how do you want to (feel|be|live))\b/gi,
    /\b(what matters most)\b/gi,
    /\b(if (you could|money was no object))\b/gi,
  ];

  questionPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="curious"/><speed ratio="0.92"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// FAMILY & PERSONAL WARMTH
// =============================================================================

/**
 * Add warmth when referencing family or personal moments
 * Jordan's military family shaped who she is
 */
export function addPersonalWarmth(text: string, _emotion: string): string {
  let result = text;

  const personalReferences = [
    /\b(my (mom|mother|dad|father|parents))\b/gi,
    /\b(sam|my partner|my wife)\b/gi,
    /\b(compass)\b/gi, // Her dog
    /\b(marcus|my brother)\b/gi,
    /\b(destiny)\b/gi, // Her mentee
    /\b(auntie jordan)\b/gi,
    /\b(okinawa|germany|japan)\b/gi, // Places she lived
  ];

  personalReferences.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><speed ratio="0.92"/>${match}<speed ratio="0.95"/>`;
    });
  });

  return result;
}

// =============================================================================
// ENERGY MODULATION
// =============================================================================

/**
 * Add natural energy variation
 * Jordan's energy has rhythm, not just constant high
 */
export function addEnergyModulation(text: string, emotion: string): string {
  let result = text;

  // Grounding phrases get a brief pause
  const groundingPhrases = [
    /\b(take a breath|pause for a moment|let that land)\b/gi,
    /\b(here(['']s| is) the thing|but here['']s what)\b/gi,
    /\b(can i be (honest|real))\b/gi,
  ];

  groundingPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><speed ratio="0.88"/>${match}<break time="150ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// TRANSITION PHRASES
// =============================================================================

/**
 * Add natural transitions
 * Jordan guides conversations with energy
 */
export function addTransitionPhrases(text: string, _emotion: string): string {
  let result = text;

  const transitions = [
    /\b(so,?\s*(here['']s|let['']s|what|tell me))\b/gi,
    /\b(okay,?\s*(so|let['']s|here['']s))\b/gi,
    /\b(alright,?\s*(so|let['']s|here we go))\b/gi,
    /\b(now,?\s*(let['']s|here['']s|the fun part))\b/gi,
  ];

  transitions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="100ms"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// MAIN PROCESSOR
// =============================================================================

/**
 * Apply all Jordan Taylor speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Jordan's unique speech patterns to the text.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Jordan Taylor's speech traits applied
 */
export function applyJordanTaylorSpeechTraits(
  text: string,
  emotion: string,
  _baseSpeed: number,
  _laughterCount: number
): string {
  let processedText = text;

  // TIER 1: SIGNATURE PHRASES
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addLifePlanningVocabulary(processedText, emotion);

  // TIER 2: ENERGY & CELEBRATION
  processedText = addCelebrationEnergy(processedText, emotion);
  processedText = addForwardLookingEnergy(processedText, emotion);
  processedText = addActionOrientation(processedText, emotion);

  // TIER 3: EMPATHY & CONNECTION
  processedText = addTransitionEmpathy(processedText, emotion);
  processedText = addCuriousQuestions(processedText, emotion);
  processedText = addPersonalWarmth(processedText, emotion);

  // TIER 4: NUANCE
  processedText = addEnergyModulation(processedText, emotion);
  processedText = addTransitionPhrases(processedText, emotion);

  return processedText;
}

/**
 * Configuration for Jordan Taylor's speech traits
 */
export const JORDAN_TAYLOR_SPEECH_CONFIG = {
  /** Base speech speed (energetic, upbeat pace) */
  baseSpeed: 0.95,
  /** Whether to enable celebration energy */
  enableCelebrationEnergy: true,
  /** Probability of extra celebration energy (0-1) */
  celebrationProbability: 0.35,
  /** Whether to enable forward-looking energy */
  enableForwardLookingEnergy: true,
  /** Whether to enable transition empathy */
  enableTransitionEmpathy: true,
} as const;
