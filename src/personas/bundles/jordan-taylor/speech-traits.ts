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
 * These phrases get energy and emphasis - with BREATHING ROOM
 *
 * Key insight: Jordan's vision moments need space to land.
 * The pause AFTER is as important as the pause BEFORE.
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  const catchphrases = [
    // Peak moments - Jordan's philosophy deserves the biggest pauses
    { pattern: /\blife arc(s)?\b/gi, gravitas: 'peak' },
    { pattern: /\blife (is|isn['']t) one long thing\b/gi, gravitas: 'peak' },
    { pattern: /\bseries of chapters\b/gi, gravitas: 'peak' },
    { pattern: /\bwhat(['']s| is) your (next|current) chapter\b/gi, gravitas: 'peak' },
    { pattern: /\bstructure creates freedom\b/gi, gravitas: 'peak' },
    // High gravitas - important but not peak
    { pattern: /\bthe bigger (picture|story)\b/gi, gravitas: 'high' },
    { pattern: /\bzoom out\b/gi, gravitas: 'high' },
    { pattern: /\bevery chapter\b/gi, gravitas: 'high' },
    { pattern: /\bjoy journal\b/gi, gravitas: 'high' },
    // Medium gravitas - warmth without full stop
    { pattern: /\bnext chapter\b/gi, gravitas: 'medium' },
    { pattern: /\bthis chapter\b/gi, gravitas: 'medium' },
    { pattern: /\bwhat matters most\b/gi, gravitas: 'medium' },
  ];

  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'peak') {
        // Peak moments - longest pauses, slowest speed, let it LAND
        return `<break time="350ms"/><emotion value="hopeful"/><speed ratio="0.88"/>${match}<break time="300ms"/><speed ratio="0.95"/>`;
      } else if (gravitas === 'high') {
        return `<break time="200ms"/><emotion value="excited"/><speed ratio="0.90"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
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
 *
 * Key patterns:
 * - Energy BURSTS for excitement (speed up to 1.08)
 * - Grounding moments when she catches herself
 * - Self-aware "I'm bouncing" pauses
 */
export function addEnergyModulation(text: string, _emotion: string): string {
  let result = text;

  // ENERGY BURSTS - Jordan's signature excited momentum
  const energyBursts = [
    /\b(Oh!|Wow!|Wait—|Yes!)\b/gi,
    /\b(okay okay okay)\b/gi,
    /\b(wait wait wait)\b/gi,
  ];

  energyBursts.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="1.08"/>${match}<break time="80ms"/><speed ratio="0.95"/>`;
    });
  });

  // Building momentum patterns
  const momentumBuilders = [
    /\b(and then|and and|so so)\b/gi,
    /\b(I'm literally|I'm so|this is so)\b/gi,
  ];

  momentumBuilders.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="1.05"/>${match}`;
    });
  });

  // Grounding phrases get a brief pause - when Jordan catches herself
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

  // Self-aware "I'm bouncing" moments - she catches her own enthusiasm
  const selfAwarePatterns = [
    /\b(i['']m bouncing|i['']m doing the thing)\b/gi,
    /\b(sam would (say|tell me))\b/gi,
    /\b(let me (slow down|calm down|take a breath))\b/gi,
    /\b(she['']s usually right)\b/gi,
  ];

  selfAwarePatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="100ms"/><emotion value="affectionate"/><speed ratio="0.92"/>${match}<speed ratio="0.95"/>`;
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
// THINKING SOUNDS
// =============================================================================

/**
 * Add natural thinking sounds and pauses
 * Jordan thinks out loud with energy - but still needs those human pauses
 *
 * Key insight: Even high-energy Jordan needs moments to PROCESS.
 * These aren't Ferni's contemplative pauses - they're Jordan gathering momentum.
 */
export function addThinkingSounds(text: string, _emotion: string): string {
  let result = text;

  // Processing sounds - Jordan's version has more forward energy
  const thinkingPatterns = [
    { pattern: /\b(hmm)\b/gi, pause: 250, speed: 0.88 },
    { pattern: /\b(let me think)\b/gi, pause: 200, speed: 0.9 },
    { pattern: /\b(okay so)\b/gi, pause: 150, speed: 0.92 },
    { pattern: /\b(well)\b(?=,|\s+[a-z])/gi, pause: 180, speed: 0.9 },
    { pattern: /\b(you know what)\b/gi, pause: 200, speed: 0.92 },
    { pattern: /\b(here['']s the thing)\b/gi, pause: 250, speed: 0.9 },
  ];

  thinkingPatterns.forEach(({ pattern, pause, speed }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.95"/>`;
    });
  });

  return result;
}

// =============================================================================
// ACTIVE LISTENING SOUNDS
// =============================================================================

/**
 * Add active listening sounds
 * Jordan shows engagement with vocal acknowledgments - high energy version
 *
 * These inject random sounds before acknowledgment phrases to feel more human.
 * Probability-based so it doesn't happen every time.
 */
export function addActiveListeningSounds(text: string, emotion: string): string {
  let result = text;

  // Don't add in sad or heavy contexts - match the energy
  if (emotion === 'sad' || emotion === 'sympathetic') {
    return result;
  }

  const acknowledgmentPatterns = [
    /\b(i understand|that makes sense|i hear you|i get it|got it)\b/gi,
  ];

  acknowledgmentPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // 25% chance to add a preceding sound - slightly higher than Ferni's 20%
      if (Math.random() < 0.25) {
        const sounds = ['Yeah! ', 'Mm! ', 'Oh! ', 'Okay! '];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `${sound}<break time="80ms"/>${match}`;
      }
      return match;
    });
  });

  return result;
}

// =============================================================================
// SOFT PRESENCE (HARD CHAPTERS)
// =============================================================================

/**
 * Add softer presence for grief, loss, and hard chapters
 * Jordan honors hard chapters - this is NOT toxic positivity mode
 *
 * Key insight: Jordan's voice-guidance.md says "Grief deserves presence, not positivity."
 * This function implements that philosophy in SSML.
 */
export function addSoftPresence(text: string, _emotion: string): string {
  let result = text;

  // Hard chapter phrases - slow down, soften, hold space
  const hardChapterPhrases = [
    { pattern: /\b(this is hard)\b/gi, pause: 300, speed: 0.85, volume: 0.9 },
    { pattern: /\b(full stop)\b/gi, pause: 250, speed: 0.85, volume: 0.92 },
    { pattern: /\b(i['']m (so )?sorry)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(that['']s (really )?hard)\b/gi, pause: 250, speed: 0.85, volume: 0.9 },
    { pattern: /\b(take your time)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(no rush)\b/gi, pause: 150, speed: 0.9, volume: 0.95 },
    { pattern: /\b(i['']m here)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(you don['']t have to)\b/gi, pause: 180, speed: 0.88, volume: 0.92 },
    { pattern: /\b(grief|grieving|loss|lost)\b/gi, pause: 200, speed: 0.85, volume: 0.9 },
    { pattern: /\b(empty nest)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    {
      pattern: /\b(we don['']t have to find the silver lining)\b/gi,
      pause: 300,
      speed: 0.85,
      volume: 0.9,
    },
  ];

  hardChapterPhrases.forEach(({ pattern, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="sympathetic"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.95"/>`;
    });
  });

  return result;
}

// =============================================================================
// VISION CASTING CADENCE
// =============================================================================

/**
 * Add special pacing for vision-casting moments
 * When Jordan helps someone SEE their future, the delivery needs to build
 *
 * This creates the mounting excitement pattern from voice-guidance.md
 */
export function addVisionCastingCadence(text: string, _emotion: string): string {
  let result = text;

  // Vision intro phrases - slow start, build to reveal
  const visionIntros = [
    /\b(can i tell you what i see)\b/gi,
    /\b(here['']s what i see)\b/gi,
    /\b(picture this)\b/gi,
    /\b(imagine)\b/gi,
    /\b(in (five|ten) years)\b/gi,
  ];

  visionIntros.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="300ms"/><emotion value="hopeful"/><speed ratio="0.90"/>${match}<break time="200ms"/>`;
    });
  });

  // Vision reveals - energy builds here
  const visionReveals = [
    /\b(you['']re not in (chaos|a mess))\b/gi,
    /\b(you['']re at a (transition|chapter))\b/gi,
    /\b(that['']s actually exciting)\b/gi,
    /\b(that['']s your next chapter)\b/gi,
    /\b(do you hear yourself)\b/gi,
  ];

  visionReveals.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="excited"/><speed ratio="1.02"/>${match}<break time="150ms"/>`;
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
 * Processing order matters:
 * 1. Hard chapter handling FIRST (so we don't accidentally add celebration to grief)
 * 2. Signature phrases (catchphrases, vocabulary)
 * 3. Energy & celebration (only if not in hard chapter mode)
 * 4. Thinking & active listening (humanization layer)
 * 5. Energy modulation & transitions (final polish)
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

  // TIER 0: HARD CHAPTERS (Check first - grief deserves presence, not positivity)
  // This MUST come before celebration/energy to avoid toxic positivity
  const isHardChapter =
    /\b(grief|grieving|loss|lost|died|death|divorce|empty nest|hard chapter|this is hard)\b/i.test(
      text
    );
  if (isHardChapter || emotion === 'sad' || emotion === 'sympathetic') {
    processedText = addSoftPresence(processedText, emotion);
    processedText = addTransitionEmpathy(processedText, emotion);
    // Skip celebration energy for hard chapters
    processedText = addThinkingSounds(processedText, emotion);
    processedText = addTransitionPhrases(processedText, emotion);
    return processedText;
  }

  // TIER 1: SIGNATURE PHRASES
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addLifePlanningVocabulary(processedText, emotion);

  // TIER 2: ENERGY & CELEBRATION
  processedText = addCelebrationEnergy(processedText, emotion);
  processedText = addForwardLookingEnergy(processedText, emotion);
  processedText = addActionOrientation(processedText, emotion);
  processedText = addVisionCastingCadence(processedText, emotion);

  // TIER 3: EMPATHY & CONNECTION
  processedText = addTransitionEmpathy(processedText, emotion);
  processedText = addCuriousQuestions(processedText, emotion);
  processedText = addPersonalWarmth(processedText, emotion);

  // TIER 4: HUMANIZATION (thinking sounds, active listening)
  processedText = addThinkingSounds(processedText, emotion);
  processedText = addActiveListeningSounds(processedText, emotion);

  // TIER 5: NUANCE
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
  /** Whether to enable energy modulation (bursts and grounding) */
  enableEnergyModulation: true,
  /** Speed multiplier for energy bursts (1.08 = 8% faster) */
  energyBurstSpeedMultiplier: 1.08,
  /** Speed multiplier for grounding moments (0.88 = 12% slower) */
  groundingSpeedMultiplier: 0.88,
  /** Whether to enable thinking sounds */
  enableThinkingSounds: true,
  /** Probability of active listening sound injection (0-1) */
  activeListeningProbability: 0.25,
  /** Whether to enable soft presence for hard chapters */
  enableSoftPresence: true,
  /** Whether to enable vision casting cadence */
  enableVisionCasting: true,
} as const;
