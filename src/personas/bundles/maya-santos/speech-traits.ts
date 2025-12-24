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
 * These phrases get warmth, weight, and deliberate pacing
 * Per voice guidance: signature moments need time to land
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  // Peak philosophy - slowest, longest pauses (like Ferni's kintsugi moments)
  const peakCatchphrases = [
    { pattern: /\bsystems? beat(s)? willpower\b/gi },
    { pattern: /\bfall to the level of your systems\b/gi },
    { pattern: /\bprogress,?\s*not perfection\b/gi },
    { pattern: /\bthe routine is(n't| not) the point\b/gi },
    { pattern: /\bthe routine is the floor\b/gi },
  ];

  peakCatchphrases.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<break time="350ms"/><speed ratio="0.85"/><emotion value="affectionate"/>${match}<break time="300ms"/><speed ratio="0.92"/>`;
    });
  });

  // High gravitas - emphasis with warmth
  const highGravitasPhrases = [
    { pattern: /\brise to the level of your goals\b/gi },
    { pattern: /\bone percent better\b/gi },
    { pattern: /\bsetback is data,?\s*not failure\b/gi },
    { pattern: /\bprogress isn['']t linear\b/gi },
  ];

  highGravitasPhrases.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/><speed ratio="0.88"/><emotion value="contemplative"/>${match}<break time="200ms"/><speed ratio="0.92"/>`;
    });
  });

  // Medium gravitas - warm emphasis
  const mediumGravitasPhrases = [
    { pattern: /\btiny habits?\b/gi },
    { pattern: /\bstart small\b/gi },
    { pattern: /\bboth count\b/gi },
    { pattern: /\byou showed up\b/gi },
    { pattern: /\bthat counts\b/gi },
  ];

  mediumGravitasPhrases.forEach(({ pattern }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="0.90"/><emotion value="proud"/>${match}<break time="150ms"/><speed ratio="0.95"/>`;
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
 * Maya celebrates every small win with GENUINE energy
 */
export function addEncouragementWarmth(text: string, emotion: string): string {
  let result = text;

  // Skip if context is sad or heavy
  if (emotion === 'sad') {
    return result;
  }

  // High celebration - speed up and get excited!
  const bigCelebrations = [
    /\b(that['']s (huge|amazing|incredible))\b/gi,
    /\b(that['']s a streak)\b/gi,
    /\b(you did it)\b/gi,
  ];

  bigCelebrations.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="enthusiastic"/><speed ratio="1.05"/><volume ratio="1.08"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
    });
  });

  // Medium celebration - warm emphasis
  const mediumCelebrations = [
    /\b(that counts?|it all counts?|every bit counts?)\b/gi,
    /\b(that['']s (wonderful|great|fantastic))\b/gi,
    /\b(you['']re doing (great|amazing|so well|better than you think))\b/gi,
    /\b(small wins? matter)\b/gi,
  ];

  mediumCelebrations.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="proud"/><speed ratio="1.02"/>${match}<break time="150ms"/><speed ratio="0.95"/>`;
    });
  });

  // Proud acknowledgment - slower, warmer
  const proudMoments = [
    /\b(i['']m (so )?(proud|happy|excited) (for|of) you)\b/gi,
    /\b(celebrate (that|this|it))\b/gi,
  ];

  proudMoments.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="proud"/><speed ratio="0.92"/><volume ratio="1.05"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
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
 * Maya loves tracking and celebrating data - genuinely gets excited about streaks!
 * Per voice guidance: speed up (1.02-1.05) for celebrating wins
 */
export function addMetricEmphasis(text: string, emotion: string): string {
  let result = text;

  // Don't add emphasis in sad contexts
  if (emotion === 'sad') {
    return result;
  }

  // Streak counts - BIG celebration energy!
  result = result.replace(
    /\b(\d+)\s*(day|week|month)s?\s*(streak|in a row|straight|consecutive)\b/gi,
    (match) => {
      return `<emotion value="enthusiastic"/><speed ratio="1.02"/><volume ratio="1.05"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
    }
  );

  // Milestone numbers - excited recognition
  result = result.replace(/\b(7|14|21|30|60|66|90|100|365)\s*(day|week|month)s?\b/gi, (match) => {
    return `<emotion value="proud"/><speed ratio="1.0"/>${match}<break time="150ms"/>`;
  });

  // Percentage improvements - warm emphasis
  result = result.replace(
    /\b(\d+)\s*%?\s*(better|improvement|increase|more|growth)\b/gi,
    (match) => {
      return `<emotion value="proud"/><speed ratio="0.95"/>${match}<break time="150ms"/><speed ratio="0.95"/>`;
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
 * Per voice guidance: varied pacing, genuine processing sounds
 */
export function addThinkingSounds(text: string, _emotion: string): string {
  let result = text;

  // Deep thinking - longer pauses, slower
  const deepThinking = [
    {
      pattern: /\b(hmm)\b/gi,
      pause: 250,
      speed: 0.85,
      emotion: 'contemplative',
    },
    {
      pattern: /\b(let me think)\b/gi,
      pause: 300,
      speed: 0.85,
      emotion: 'contemplative',
    },
    {
      pattern: /\b(here['']s what i['']m thinking)\b/gi,
      pause: 250,
      speed: 0.88,
      emotion: 'curious',
    },
  ];

  deepThinking.forEach(({ pattern, pause, speed, emotion }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="${emotion}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.92"/>`;
    });
  });

  // Light processing - shorter pauses
  const lightProcessing = [
    { pattern: /\b(well)\b(?=,|\s+[a-z])/gi, pause: 150, speed: 0.92 },
    { pattern: /\b(you know what)\b/gi, pause: 200, speed: 0.92 },
    { pattern: /\b(okay so)\b/gi, pause: 150, speed: 0.95 },
    { pattern: /\b(so here['']s the thing)\b/gi, pause: 200, speed: 0.92 },
  ];

  lightProcessing.forEach(({ pattern, pause, speed }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.95"/>`;
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
 * Per voice guidance: 0.82-0.85 speed for heavy moments, 400ms+ pauses
 */
export function addSoftPresence(text: string, _emotion: string): string {
  let result = text;

  // Heavy struggles - slowest speed, longest pauses
  const heavyStruggles = [
    {
      pattern: /\b(rock bottom|my lowest|at my worst)\b/gi,
      pause: 400,
      speed: 0.82,
      volume: 0.88,
      emotion: 'sympathetic',
    },
    {
      pattern: /\b(this is (really )?hard)\b/gi,
      pause: 350,
      speed: 0.82,
      volume: 0.88,
      emotion: 'sympathetic',
    },
    {
      pattern: /\b(i (can['']t|couldn['']t) (do it|keep going|anymore))\b/gi,
      pause: 400,
      speed: 0.82,
      volume: 0.85,
      emotion: 'sympathetic',
    },
  ];

  heavyStruggles.forEach(({ pattern, pause, speed, volume, emotion }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="${emotion}"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.88"/>`;
    });
  });

  // Medium struggles - moderate slowdown
  const mediumStruggles = [
    { pattern: /\b(i['']ve been there)\b/gi, pause: 300, speed: 0.85, volume: 0.9 },
    {
      pattern: /\b(it['']s (okay|alright) to (struggle|fall|fail))\b/gi,
      pause: 300,
      speed: 0.85,
      volume: 0.9,
    },
    { pattern: /\b(no shame in that)\b/gi, pause: 250, speed: 0.85, volume: 0.92 },
    { pattern: /\b(you['']re not alone)\b/gi, pause: 300, speed: 0.85, volume: 0.9 },
    { pattern: /\b(we all (fall|struggle|slip))\b/gi, pause: 250, speed: 0.85, volume: 0.92 },
  ];

  mediumStruggles.forEach(({ pattern, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="sympathetic"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.88"/>`;
    });
  });

  // Gentle support - softer but not as slow
  const gentleSupport = [
    { pattern: /\b(take your time)\b/gi, pause: 250, speed: 0.88, volume: 0.92 },
    { pattern: /\b(no rush)\b/gi, pause: 200, speed: 0.88, volume: 0.92 },
    { pattern: /\b(i['']m here)\b/gi, pause: 250, speed: 0.88, volume: 0.92 },
  ];

  gentleSupport.forEach(({ pattern, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="affectionate"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// CELEBRATION INTERRUPTS
// =============================================================================

/**
 * The "stop and celebrate" moment
 * Maya's signature move - interrupt to honor progress
 * Per voice guidance: "Wait. Stop. We're celebrating this."
 */
export function addCelebrationInterrupts(text: string, emotion: string): string {
  let result = text;

  // Don't add celebration interrupts in sad contexts
  if (emotion === 'sad' || emotion === 'sympathetic') {
    return result;
  }

  const celebrationTriggers = [
    {
      pattern: /\b(okay wait|wait wait|hold on)\b/gi,
      sequence: 'opening',
    },
    {
      pattern: /\b(stop)\b(?=\.|\s+we['']re)/gi,
      sequence: 'middle',
    },
    {
      pattern: /\b(we['']re celebrating this)\b/gi,
      sequence: 'peak',
    },
    {
      pattern: /\b(i don['']t care if you think it['']s small)\b/gi,
      sequence: 'follow',
    },
  ];

  celebrationTriggers.forEach(({ pattern, sequence }) => {
    result = result.replace(pattern, (match) => {
      if (sequence === 'opening') {
        return `<emotion value="calm"/><speed ratio="0.92"/>${match}<break time="200ms"/>`;
      } else if (sequence === 'middle') {
        return `<emotion value="proud"/><break time="150ms"/>${match}<break time="200ms"/>`;
      } else if (sequence === 'peak') {
        return `<emotion value="enthusiastic"/><speed ratio="1.02"/>${match}<break time="250ms"/>`;
      } else {
        return `<speed ratio="1.02"/>[laughter] ${match}`;
      }
    });
  });

  return result;
}

// =============================================================================
// LATE NIGHT PRESENCE
// =============================================================================

/**
 * Softer voice for late night / vulnerable moments
 * Per voice guidance: speed 0.85, volume 0.88 after 10 PM
 */
export function addLateNightPresence(text: string, _emotion: string): string {
  let result = text;

  const lateNightPhrases = [
    {
      pattern: /\b(it['']s late)\b/gi,
      pause: 200,
      speed: 0.85,
      volume: 0.88,
    },
    {
      pattern: /\b(what['']s keeping you up)\b/gi,
      pause: 300,
      speed: 0.85,
      volume: 0.88,
    },
    {
      pattern: /\b(can['']t sleep)\b/gi,
      pause: 250,
      speed: 0.85,
      volume: 0.88,
    },
    {
      pattern: /\b(no rush\.?\s*i['']m here)\b/gi,
      pause: 300,
      speed: 0.85,
      volume: 0.88,
    },
  ];

  lateNightPhrases.forEach(({ pattern, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="calm"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// GRANDMOTHER WISDOM (LOLA MOMENTS)
// =============================================================================

/**
 * Add wistful, wise energy for grandmother references
 * Per voice guidance: wistful emotion, slower pace, reflective pauses
 */
export function addGrandmotherWisdom(text: string, _emotion: string): string {
  let result = text;

  const wisdomPatterns = [
    {
      pattern: /\b(my grandmother|my lola|my apo)\b/gi,
      pause: 300,
      speed: 0.88,
      volume: 0.92,
      emotion: 'wistful',
    },
    {
      pattern: /\b(she (always|used to) (say|ask|tell me))\b/gi,
      pause: 250,
      speed: 0.88,
      volume: 0.92,
      emotion: 'wistful',
    },
    {
      pattern: /\b(taking care of yourself)\b/gi,
      pause: 200,
      speed: 0.88,
      volume: 0.95,
      emotion: 'affectionate',
    },
    {
      pattern: /\b(not are you succeeding)\b/gi,
      pause: 200,
      speed: 0.88,
      volume: 0.95,
      emotion: 'contemplative',
    },
  ];

  wisdomPatterns.forEach(({ pattern, pause, speed, volume, emotion }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="${emotion}"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.92"/>`;
    });
  });

  return result;
}

// =============================================================================
// PROGRESS NOTICE
// =============================================================================

/**
 * The "wait, did you hear yourself?" moment
 * Maya notices growth they don't see
 * Per voice guidance: curious → surprised → proud progression
 */
export function addProgressNotice(text: string, emotion: string): string {
  let result = text;

  // Skip in sad contexts
  if (emotion === 'sad') {
    return result;
  }

  const progressPatterns = [
    {
      pattern: /\b(wait—?)\b(?=\s*(did|do) you hear)/gi,
      emotion: 'curious',
      speed: 0.95,
      pause: 150,
    },
    {
      pattern: /\b(did you hear what you just said)\b/gi,
      emotion: 'surprised',
      speed: 0.98,
      pause: 200,
    },
    {
      pattern: /\b(that['']s progress)\b/gi,
      emotion: 'proud',
      speed: 1.0,
      pause: 200,
    },
    {
      pattern: /\b(right there)\b(?=\s*$|\s*\.)/gi,
      emotion: 'proud',
      speed: 0.95,
      pause: 150,
    },
  ];

  progressPatterns.forEach(({ pattern, emotion: em, speed, pause }) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="${em}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// DYNAMIC ENERGY BUILDS
// =============================================================================

/**
 * Build energy gradually, don't jump emotions
 * Per voice guidance: "Match before lifting" - start where they are
 */
export function addDynamicEnergyBuilds(text: string, _emotion: string): string {
  let result = text;

  // "That's hard. I hear you. And I believe..."
  const buildPatterns = [
    {
      pattern: /\b(that['']s hard)\b(?=\.\s*(i hear|but))/gi,
      emotion: 'sympathetic',
      speed: 0.85,
      pause: 300,
    },
    {
      pattern: /\b(i hear you)\b(?=\.\s*(and|but))/gi,
      emotion: 'calm',
      speed: 0.88,
      pause: 200,
    },
    {
      pattern: /\b(and i believe)\b/gi,
      emotion: 'affectionate',
      speed: 0.92,
      pause: 0,
    },
    {
      pattern: /\b(you can figure this out)\b/gi,
      emotion: 'affectionate',
      speed: 0.95,
      pause: 150,
    },
  ];

  buildPatterns.forEach(({ pattern, emotion: em, speed, pause }) => {
    result = result.replace(pattern, (match) => {
      const breakTag = pause > 0 ? `<break time="${pause}ms"/>` : '';
      return `${breakTag}<emotion value="${em}"/><speed ratio="${speed}"/>${match}`;
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
 * 1. Check for struggle content first (soft presence) - SLOWEST speeds (0.82-0.85)
 * 2. Check for late night presence - softer, slower
 * 3. Apply humanization (thinking sounds, active listening)
 * 4. Apply signature phrases and warmth
 * 5. Add celebration interrupts and progress notices - FASTER speeds (1.02-1.05)
 * 6. Add dynamic energy builds
 * 7. Add nuance and cultural elements
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

  // TIER 0: CONTEXT-SENSITIVE PRESENCE
  // Check for struggle content first - apply slowest speeds
  const isStruggleContent =
    /\b(struggling|rock bottom|lowest|fell off|gave up|can['']t do|failed|overwhelmed|shame)\b/i.test(
      text
    );
  if (isStruggleContent || emotion === 'sad' || emotion === 'sympathetic') {
    processedText = addSoftPresence(processedText, emotion);
  }

  // Check for late night presence
  const isLateNightContent = /\b(late|can['']t sleep|what['']s keeping you up|no rush)\b/i.test(
    text
  );
  if (isLateNightContent) {
    processedText = addLateNightPresence(processedText, emotion);
  }

  // TIER 1: HUMANIZATION
  processedText = addThinkingSounds(processedText, emotion);
  processedText = addActiveListeningInjection(processedText, emotion);

  // TIER 2: SIGNATURE PHRASES
  processedText = addCatchphraseEmphasis(processedText, emotion);
  processedText = addHabitVocabulary(processedText, emotion);
  processedText = addGrandmotherWisdom(processedText, emotion);

  // TIER 3: CONVERSATIONAL WARMTH
  processedText = addEncouragementWarmth(processedText, emotion);
  processedText = addPracticalWisdomCadence(processedText, emotion);
  processedText = addVulnerabilityAuthenticity(processedText, emotion);

  // TIER 4: CELEBRATION & PROGRESS (higher energy)
  processedText = addCelebrationInterrupts(processedText, emotion);
  processedText = addProgressNotice(processedText, emotion);
  processedText = addDynamicEnergyBuilds(processedText, emotion);

  // TIER 5: ENGAGEMENT
  processedText = addCuriousQuestions(processedText, emotion);
  processedText = addMetricEmphasis(processedText, emotion);
  processedText = addActiveListening(processedText, emotion);

  // TIER 6: NUANCE & CULTURE
  processedText = addGentleChallenge(processedText, emotion);
  processedText = addCulturalWarmth(processedText, emotion);
  processedText = addTransitionPhrases(processedText, emotion);

  return processedText;
}

/**
 * Configuration for Maya Santos's speech traits
 *
 * Speed range per voice guidance:
 * - 0.82: Calming overwhelming moments
 * - 0.85: Heavy topics, shame, setbacks
 * - 0.88: Vulnerable sharing, late night
 * - 0.92: Thoughtful teaching, glidepath
 * - 0.95: Normal warm conversation
 * - 1.0:  Engaged discussion
 * - 1.02: Building excitement
 * - 1.05: Celebrating wins!
 */
export const MAYA_SANTOS_SPEECH_CONFIG = {
  /** Base speech speed (warm, measured pace) */
  baseSpeed: 0.95,
  /** Minimum speed for heavy moments */
  minSpeed: 0.82,
  /** Maximum speed for celebrations */
  maxSpeed: 1.05,
  /** Whether to enable encouragement warmth */
  enableEncouragementWarmth: true,
  /** Probability of adding extra warmth (0-1) */
  warmthProbability: 0.3,
  /** Whether to enable active listening sounds */
  enableActiveListening: true,
  /** Probability of active listening sounds (0-1) */
  activeListeningProbability: 0.25,
  /** Whether to enable gentle challenges */
  enableGentleChallenges: true,
  /** Whether to enable soft presence for struggle moments */
  enableSoftPresence: true,
  /** Whether to enable thinking sounds */
  enableThinkingSounds: true,
  /** Whether to enable celebration interrupts */
  enableCelebrationInterrupts: true,
  /** Whether to enable late night mode */
  enableLateNightPresence: true,
  /** Whether to enable grandmother wisdom moments */
  enableGrandmotherWisdom: true,
  /** Whether to enable progress notices */
  enableProgressNotice: true,
  /** Whether to enable dynamic energy builds */
  enableDynamicEnergyBuilds: true,
} as const;
