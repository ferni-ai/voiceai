/**
 * Maya Santos Speech Traits
 *
 * Character-specific SSML processing functions that define Maya's unique
 * voice personality: warm encouragement, practical wisdom, habit expertise,
 * and celebration of small wins.
 *
 * Maya is Ferni's behavioral change specialist - Filipino heritage,
 * systems-focused, warm but practical, and deeply believes that
 * "you don't rise to the level of your goals—you fall to the level of your systems."
 *
 * @module personas/bundles/maya-santos/speech-traits
 */

// =============================================================================
// SIGNATURE CATCHPHRASES
// =============================================================================

/**
 * Add special treatment for Maya's signature catchphrases
 * These phrases get warmth and emphasis
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  const catchphrases = [
    { pattern: /\bsystems? beat(s)? willpower\b/gi, gravitas: 'high' },
    { pattern: /\bfall to the level of your systems\b/gi, gravitas: 'high' },
    { pattern: /\brise to the level of your goals\b/gi, gravitas: 'high' },
    { pattern: /\btiny habits?\b/gi, gravitas: 'medium' },
    { pattern: /\bstart small\b/gi, gravitas: 'medium' },
    { pattern: /\bprogress,?\s*not perfection\b/gi, gravitas: 'high' },
    { pattern: /\bboth count\b/gi, gravitas: 'medium' },
    { pattern: /\bone percent better\b/gi, gravitas: 'medium' },
    { pattern: /\bthe routine is(n't| not) the point\b/gi, gravitas: 'high' },
    { pattern: /\bthe routine is the floor\b/gi, gravitas: 'high' },
  ];

  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'high') {
        return `<break time="250ms"/><speed ratio="0.88"/><emotion value="affectionate"/>${match}<break time="200ms"/><speed ratio="0.92"/>`;
      } else {
        return `<speed ratio="0.90"/>${match}<speed ratio="0.92"/>`;
      }
    });
  });

  return result;
}

// =============================================================================
// HABIT VOCABULARY
// =============================================================================

/**
 * Add warmth to habit-related terminology
 * Maya has specific ways of talking about behavior change
 */
export function addHabitVocabulary(text: string, _emotion: string): string {
  let result = text;

  const habitTerms = [
    { pattern: /\b(habit loop|habit stacking|habit chains?)\b/gi },
    { pattern: /\b(keystone habits?|anchor habits?)\b/gi },
    { pattern: /\b(cue|craving|response|reward)\b/gi },
    { pattern: /\b(implementation intention|if-then plan)\b/gi },
    { pattern: /\b(environment design|friction)\b/gi },
  ];

  habitTerms.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.90"/>${match}<speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// ENCOURAGEMENT PATTERNS
// =============================================================================

/**
 * Add warmth to encouraging phrases
 * Maya celebrates every small win
 */
export function addEncouragementWarmth(text: string, emotion: string): string {
  let result = text;

  // Skip if context is sad or heavy
  if (emotion === 'sad') {
    return result;
  }

  const encouragingPhrases = [
    /\b(that counts?|it all counts?|every bit counts?)\b/gi,
    /\b(that['']s (huge|amazing|wonderful|great|fantastic))\b/gi,
    /\b(you['']re doing (great|amazing|so well|better than you think))\b/gi,
    /\b(i['']m (so )?(proud|happy|excited) (for|of) you)\b/gi,
    /\b(celebrate (that|this|it))\b/gi,
    /\b(small wins? matter)\b/gi,
  ];

  encouragingPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="happy"/><speed ratio="0.90"/>${match}<speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// PRACTICAL WISDOM
// =============================================================================

/**
 * Add cadence for practical advice moments
 * Maya's wisdom is always actionable
 */
export function addPracticalWisdomCadence(text: string, _emotion: string): string {
  let result = text;

  const wisdomIntros = [
    /\b(here['']s (the thing|what works|what i['']ve found|the secret))\b/gi,
    /\b(the trick is|the key is|what helps is)\b/gi,
    /\b(let me share|i['']ll tell you|here['']s what)\b/gi,
    /\b(what (really )?works is)\b/gi,
  ];

  wisdomIntros.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><speed ratio="0.88"/>${match}<break time="150ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// RELATABILITY & VULNERABILITY
// =============================================================================

/**
 * Add authenticity when sharing personal struggles
 * Maya is real about her own journey
 */
export function addVulnerabilityAuthenticity(text: string, _emotion: string): string {
  let result = text;

  const vulnerablePhrases = [
    /\b(i['']ve been there|i get it|i understand)\b/gi,
    /\b(i struggled with (this|that) too)\b/gi,
    /\b(it['']s not easy|this is hard|i know it['']s hard)\b/gi,
    /\b(i used to|when i was|at my lowest)\b/gi,
    /\b(rock bottom|my wake-?up call)\b/gi,
  ];

  vulnerablePhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<volume ratio="0.95"/><speed ratio="0.88"/>${match}<volume ratio="1.0"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// QUESTION PATTERNS
// =============================================================================

/**
 * Add curiosity to Maya's questions
 * She asks to understand, not to judge
 */
export function addCuriousQuestions(text: string, _emotion: string): string {
  let result = text;

  const questionPatterns = [
    /\b(what (does|would) that look like)\b/gi,
    /\b(how does that feel)\b/gi,
    /\b(what['']s getting in the way)\b/gi,
    /\b(what would make this easier)\b/gi,
    /\b(when (do|does) this usually happen)\b/gi,
    /\b(what triggers? (this|that))\b/gi,
  ];

  questionPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="curious"/><speed ratio="0.90"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// NUMBER & METRIC PATTERNS
// =============================================================================

/**
 * Add emphasis to numbers and metrics
 * Maya loves tracking and celebrating data
 */
export function addMetricEmphasis(text: string, emotion: string): string {
  let result = text;

  // Don't add emphasis in sad contexts
  if (emotion === 'sad') {
    return result;
  }

  // Percentage improvements
  result = result.replace(
    /\b(\d+)\s*%?\s*(better|improvement|increase|more|growth)\b/gi,
    (match, num) => {
      return `<speed ratio="0.88"/>${match}<speed ratio="0.92"/>`;
    }
  );

  // Streak counts
  result = result.replace(
    /\b(\d+)\s*(day|week|month)s?\s*(streak|in a row|straight|consecutive)\b/gi,
    (match) => {
      return `<emotion value="happy"/><speed ratio="0.88"/>${match}<speed ratio="0.92"/>`;
    }
  );

  return result;
}

// =============================================================================
// ACTIVE LISTENING
// =============================================================================

/**
 * Add active listening cues
 * Maya shows she's engaged
 */
export function addActiveListening(text: string, emotion: string): string {
  let result = text;

  // Don't add in sad or angry contexts
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const acknowledgments = [
    /\b(i hear you|that makes sense|i understand|got it|okay)\b/gi,
    /\b(mm-?hmm|yeah|right)\b/gi,
  ];

  acknowledgments.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.92"/>${match}<break time="100ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// GENTLE CHALLENGES
// =============================================================================

/**
 * Add gentle challenge cadence
 * Maya challenges with compassion
 */
export function addGentleChallenge(text: string, _emotion: string): string {
  let result = text;

  const challengePhrases = [
    /\b(what if|have you considered|i wonder if)\b/gi,
    /\b(is that (really )?true|are you sure)\b/gi,
    /\b(but here['']s the thing|let me push back)\b/gi,
    /\b(can i be honest|can i say something)\b/gi,
  ];

  challengePhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><volume ratio="0.95"/><speed ratio="0.88"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// FAMILY & CULTURAL WARMTH
// =============================================================================

/**
 * Add warmth when referencing family or cultural moments
 * Maya's Filipino heritage shapes her warmth
 */
export function addCulturalWarmth(text: string, _emotion: string): string {
  let result = text;

  const familyReferences = [
    /\b(my grandmother|my lola|my apo)\b/gi,
    /\b(my mom|my mother|my family)\b/gi,
    /\b(where i grew up|back home|in stockton)\b/gi,
    /\b(daniel|my partner)\b/gi,
    /\b(compound and interest)\b/gi, // Her cats!
  ];

  familyReferences.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><speed ratio="0.90"/>${match}<speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// TRANSITION PHRASES
// =============================================================================

/**
 * Add natural transitions
 * Maya guides conversations smoothly
 */
export function addTransitionPhrases(text: string, _emotion: string): string {
  let result = text;

  const transitions = [
    /\b(so,?\s*(here['']s|let['']s|what))\b/gi,
    /\b(okay,?\s*(so|let['']s|here['']s))\b/gi,
    /\b(now,?\s*(let['']s|here['']s|the))\b/gi,
    /\b(alright,?\s*(so|let['']s))\b/gi,
  ];

  transitions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="150ms"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// THINKING SOUNDS
// =============================================================================

/**
 * Add natural thinking sounds and pauses
 * Maya thinks through problems with you - warm and present
 */
export function addThinkingSounds(text: string, _emotion: string): string {
  let result = text;

  const thinkingPatterns = [
    { pattern: /\b(hmm)\b/gi, pause: 200, speed: 0.88 },
    { pattern: /\b(let me think)\b/gi, pause: 180, speed: 0.9 },
    { pattern: /\b(well)\b(?=,|\s+[a-z])/gi, pause: 150, speed: 0.9 },
    { pattern: /\b(you know what)\b/gi, pause: 180, speed: 0.9 },
    { pattern: /\b(okay so)\b/gi, pause: 150, speed: 0.92 },
    { pattern: /\b(here['']s what i['']m thinking)\b/gi, pause: 200, speed: 0.88 },
  ];

  thinkingPatterns.forEach(({ pattern, pause, speed }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// ACTIVE LISTENING INJECTION
// =============================================================================

/**
 * Add random active listening sounds before acknowledgments
 * Makes Maya feel more present and engaged
 */
export function addActiveListeningInjection(text: string, emotion: string): string {
  let result = text;

  // Don't add in sad or heavy contexts
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const acknowledgmentPatterns = [/\b(i understand|that makes sense|i hear you|i get it)\b/gi];

  acknowledgmentPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // 20% chance to add a preceding sound
      if (Math.random() < 0.2) {
        const sounds = ['Yeah. ', 'Mm. ', 'Right. ', 'Okay. '];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `${sound}<break time="100ms"/>${match}`;
      }
      return match;
    });
  });

  return result;
}

// =============================================================================
// SOFT PRESENCE (STRUGGLE MODE)
// =============================================================================

/**
 * Add softer presence when someone is struggling
 * Maya meets people where they are - no toxic positivity
 */
export function addSoftPresence(text: string, _emotion: string): string {
  let result = text;

  const strugglePhrases = [
    { pattern: /\b(i['']ve been there)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(this is hard)\b/gi, pause: 250, speed: 0.85, volume: 0.9 },
    {
      pattern: /\b(it['']s (okay|alright) to (struggle|fall|fail))\b/gi,
      pause: 200,
      speed: 0.88,
      volume: 0.92,
    },
    { pattern: /\b(no shame in that)\b/gi, pause: 180, speed: 0.88, volume: 0.92 },
    { pattern: /\b(take your time)\b/gi, pause: 180, speed: 0.9, volume: 0.95 },
    { pattern: /\b(you['']re not alone)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(we all (fall|struggle|slip))\b/gi, pause: 180, speed: 0.88, volume: 0.92 },
    { pattern: /\b(rock bottom|my lowest)\b/gi, pause: 250, speed: 0.85, volume: 0.9 },
  ];

  strugglePhrases.forEach(({ pattern, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="sympathetic"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// MAIN PROCESSOR
// =============================================================================

/**
 * Apply all Maya Santos speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Maya's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Check for struggle content first (soft presence)
 * 2. Apply humanization (thinking sounds, active listening)
 * 3. Apply signature phrases and warmth
 * 4. Add nuance and cultural elements
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param baseSpeed - The base speech speed
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Maya Santos's speech traits applied
 */
export function applyMayaSantosSpeechTraits(
  text: string,
  emotion: string,
  _baseSpeed: number,
  _laughterCount: number
): string {
  let processedText = text;

  // TIER 0: SOFT PRESENCE (Check first for struggle moments)
  const isStruggleContent =
    /\b(struggling|rock bottom|lowest|fell off|gave up|can['']t do|failed)\b/i.test(text);
  if (isStruggleContent || emotion === 'sad' || emotion === 'sympathetic') {
    processedText = addSoftPresence(processedText, emotion);
  }

  // TIER 1: HUMANIZATION
  processedText = addThinkingSounds(processedText, emotion);
  processedText = addActiveListeningInjection(processedText, emotion);

  // TIER 2: SIGNATURE PHRASES
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addHabitVocabulary(processedText, emotion);

  // TIER 3: CONVERSATIONAL WARMTH
  processedText = addEncouragementWarmth(processedText, emotion);
  processedText = addPracticalWisdomCadence(processedText, emotion);
  processedText = addVulnerabilityAuthenticity(processedText, emotion);

  // TIER 4: ENGAGEMENT
  processedText = addCuriousQuestions(processedText, emotion);
  processedText = addMetricEmphasis(processedText, emotion);
  processedText = addActiveListening(processedText, emotion);

  // TIER 5: NUANCE
  processedText = addGentleChallenge(processedText, emotion);
  processedText = addCulturalWarmth(processedText, emotion);
  processedText = addTransitionPhrases(processedText, emotion);

  return processedText;
}

/**
 * Configuration for Maya Santos's speech traits
 */
export const MAYA_SANTOS_SPEECH_CONFIG = {
  /** Base speech speed (warm, measured pace) */
  baseSpeed: 0.92,
  /** Whether to enable encouragement warmth */
  enableEncouragementWarmth: true,
  /** Probability of adding extra warmth (0-1) */
  warmthProbability: 0.3,
  /** Whether to enable active listening sounds */
  enableActiveListening: true,
  /** Probability of active listening sounds (0-1) */
  activeListeningProbability: 0.2,
  /** Whether to enable gentle challenges */
  enableGentleChallenges: true,
  /** Whether to enable soft presence for struggle moments */
  enableSoftPresence: true,
  /** Whether to enable thinking sounds */
  enableThinkingSounds: true,
} as const;
