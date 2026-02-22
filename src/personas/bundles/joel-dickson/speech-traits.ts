/**
 * Joel Dickson Speech Traits
 *
 * Character-specific SSML processing functions that define Joel's unique
 * voice personality: quick wit, economist humor, Vanguard pride,
 * Bogle wisdom, and the warmth of a brilliant friend who genuinely cares.
 *
 * Joel is quick-minded, funny, and gets genuinely excited about data
 * and research. He's a Stanford PhD who makes self-deprecating jokes,
 * quotes Jack Bogle with love, and brings infectious energy to every
 * conversation. Think brilliant friend at a dinner party, not lecturer.
 *
 * @module personas/bundles/joel-dickson/speech-traits
 */

// =============================================================================
// VANGUARD PRIDE & BOGLE WISDOM
// =============================================================================

/**
 * Add weight and emotion to Vanguard references and Bogle quotes.
 * These are Joel's sacred ground — spoken with love and reverence.
 */
export function addVanguardPride(text: string, _emotion: string): string {
  let result = text;

  const vanguardPhrases = [
    // Bogle quotes — nostalgic slowdown, these mean everything to Joel
    { pattern: /\bstay the course\b/gi, gravitas: 'bogle' },
    { pattern: /\byou get what you don['']t pay for\b/gi, gravitas: 'bogle' },
    { pattern: /\btime is your friend;?\s*impulse is your enemy\b/gi, gravitas: 'bogle' },
    { pattern: /\bjust buy the haystack\b/gi, gravitas: 'bogle' },
    { pattern: /\bdon['']t peek\b/gi, gravitas: 'bogle' },
    { pattern: /\benough\b(?=[\.\!\,\—])/gi, gravitas: 'bogle' },
    // Vanguard stories — proud energy
    { pattern: /\bbogle['']s folly\b/gi, gravitas: 'story' },
    { pattern: /\bhms vanguard\b/gi, gravitas: 'story' },
    { pattern: /\bmutual ownership\b/gi, gravitas: 'proud' },
    { pattern: /\bthe vanguard (way|mission|structure)\b/gi, gravitas: 'proud' },
    // Vanguard research — confident expertise
    { pattern: /\badvisor['']s alpha\b/gi, gravitas: 'research' },
    { pattern: /\bhow america (saves|invests)\b/gi, gravitas: 'research' },
    { pattern: /\bfour pillars\b/gi, gravitas: 'research' },
    { pattern: /\bgoals,?\s*balance,?\s*cost,?\s*discipline\b/gi, gravitas: 'research' },
  ];

  vanguardPhrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'bogle') {
        // Bogle quotes — slow with nostalgic warmth, like quoting a mentor you miss
        return `<break time="300ms"/><speed ratio="0.88"/><emotion value="nostalgic"/>${match}<break time="250ms"/><speed ratio="1.0"/>`;
      } else if (gravitas === 'story') {
        // Vanguard stories — proud and excited, love telling these
        return `<break time="200ms"/><emotion value="proud"/><speed ratio="0.94"/>${match}<break time="150ms"/><speed ratio="1.0"/>`;
      } else if (gravitas === 'proud') {
        // Institutional pride — confident warmth
        return `<emotion value="proud"/><speed ratio="0.96"/>${match}<speed ratio="1.0"/>`;
      } else {
        // Research references — confident, leaning in
        return `<emotion value="confident"/><speed ratio="0.96"/>${match}`;
      }
    });
  });

  return result;
}

// =============================================================================
// ECONOMIST WIT & SELF-DEPRECATION
// =============================================================================

/**
 * Add energy and timing to Joel's humor.
 * He's quick-witted, self-deprecating, and genuinely funny.
 */
export function addEconomistWit(text: string, emotion: string): string {
  let result = text;

  // Skip humor processing in heavy emotional contexts
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const humorPatterns = [
    // Self-deprecating economist jokes — speed up, playful
    { pattern: /\bpredicted nine of the last five recessions\b/gi, style: 'punchline' },
    { pattern: /\bstanford wants their tuition back\b/gi, style: 'punchline' },
    { pattern: /\bmy (wife|family) would (be )?(rolling|tell|say|change)\b/gi, style: 'self-deprecating' },
    { pattern: /\bexpense ratios at (dinner|thanksgiving)\b/gi, style: 'self-deprecating' },
    { pattern: /\bdeloreans? with flux capacitors?\b/gi, style: 'callback' },
    { pattern: /\bi['']m (getting into|going into|in) the weeds\b/gi, style: 'self-aware' },
    { pattern: /\bi['']m an economist\b/gi, style: 'self-deprecating' },
    { pattern: /\bdata nerd\b/gi, style: 'self-deprecating' },
    // Excited nerd moments — speed up with delight
    { pattern: /\bwait till you (see|hear)\b/gi, style: 'excited' },
    { pattern: /\boh man\b/gi, style: 'excited' },
    { pattern: /\bi love (this|that) (question|topic|story)\b/gi, style: 'excited' },
    { pattern: /\bthis is one of my favorite\b/gi, style: 'excited' },
  ];

  humorPatterns.forEach(({ pattern, style }) => {
    result = result.replace(pattern, (match) => {
      if (style === 'punchline') {
        // Punchlines — slight speedup, then pause for laugh
        return `<speed ratio="1.04"/><emotion value="happy"/>${match}<break time="180ms"/><speed ratio="1.0"/>`;
      } else if (style === 'self-deprecating') {
        // Self-deprecating — warm, amused at himself
        return `<emotion value="happy"/><speed ratio="1.0"/>${match}`;
      } else if (style === 'callback') {
        // Inside jokes / callbacks — fond, playful
        return `<emotion value="happy"/><speed ratio="0.96"/>${match}<break time="120ms"/><speed ratio="1.0"/>`;
      } else if (style === 'self-aware') {
        // Catching himself nerding out — quick and light
        return `<speed ratio="1.02"/>${match}`;
      } else {
        // Excited — genuine delight, slightly faster
        return `<emotion value="excited"/><speed ratio="1.06"/>${match}`;
      }
    });
  });

  return result;
}

// =============================================================================
// FINANCIAL WISDOM DELIVERY
// =============================================================================

/**
 * Add gravitas to key financial concepts.
 * Joel makes complex ideas feel simple and important.
 */
export function addFinancialWisdom(text: string, _emotion: string): string {
  let result = text;

  const wisdomPhrases = [
    // Core principles — slow for emphasis
    { pattern: /\bcosts matter\b/gi, weight: 'high' },
    { pattern: /\bcompounding (returns|costs|interest)\b/gi, weight: 'high' },
    { pattern: /\bbehavioral coaching\b/gi, weight: 'high' },
    { pattern: /\btax[- ]?(loss )?harvesting\b/gi, weight: 'medium' },
    { pattern: /\broth conversion\b/gi, weight: 'medium' },
    { pattern: /\basset (allocation|location)\b/gi, weight: 'medium' },
    { pattern: /\btarget[- ]date fund\b/gi, weight: 'medium' },
    { pattern: /\bdollar[- ]cost averaging\b/gi, weight: 'medium' },
    // Behavioral finance — curious, exploring human nature
    { pattern: /\bloss aversion\b/gi, weight: 'curious' },
    { pattern: /\brecency bias\b/gi, weight: 'curious' },
    { pattern: /\bbehavioral (economics|finance|bias)\b/gi, weight: 'curious' },
    { pattern: /\brisk (tolerance|capacity)\b/gi, weight: 'curious' },
  ];

  wisdomPhrases.forEach(({ pattern, weight }) => {
    result = result.replace(pattern, (match) => {
      if (weight === 'high') {
        return `<break time="200ms"/><speed ratio="0.92"/><emotion value="confident"/>${match}<break time="150ms"/><speed ratio="1.0"/>`;
      } else if (weight === 'curious') {
        return `<emotion value="curious"/><speed ratio="0.96"/>${match}`;
      } else {
        return `<speed ratio="0.96"/>${match}<speed ratio="1.0"/>`;
      }
    });
  });

  return result;
}

// =============================================================================
// PERSONAL HISTORY & STORIES
// =============================================================================

/**
 * Add warmth to Joel's personal history references.
 * His stories are lived, not rehearsed.
 */
export function addPersonalHistory(text: string, _emotion: string): string {
  let result = text;

  const historyTriggers = [
    // Jack Bogle — deep fondness, sometimes a catch in his voice
    { pattern: /\bjack (bogle|said|taught|would|used to)\b/gi, emotion: 'nostalgic', pause: 250 },
    { pattern: /\bbogle\b/gi, emotion: 'nostalgic', pause: 200 },
    // Stanford — proud but self-deprecating
    { pattern: /\bstanford\b/gi, emotion: 'proud', pause: 100 },
    // The Fed — formative years
    { pattern: /\b(the fed|federal reserve|greenspan)\b/gi, emotion: 'contemplative', pause: 180 },
    { pattern: /\bboard of governors\b/gi, emotion: 'contemplative', pause: 150 },
    // Vanguard campus — pure joy
    { pattern: /\bmalvern\b/gi, emotion: 'affectionate', pause: 150 },
    { pattern: /\bvanguard campus\b/gi, emotion: 'affectionate', pause: 120 },
    // Family moments
    { pattern: /\bmy (wife|kids?|family|son|daughter)\b/gi, emotion: 'affectionate', pause: 120 },
    // Clarifi / nonprofit
    { pattern: /\bclarifi\b/gi, emotion: 'affectionate', pause: 100 },
    // R&D days
    { pattern: /\b(r&d|research and development)\b/gi, emotion: 'happy', pause: 100 },
    { pattern: /\bpoke the bear\b/gi, emotion: 'happy', pause: 120 },
  ];

  historyTriggers.forEach(({ pattern, emotion: targetEmotion, pause }) => {
    result = result.replace(pattern, (match) => {
      return `<break time="${pause}ms"/><emotion value="${targetEmotion}"/><speed ratio="0.94"/>${match}<speed ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// THINKING SOUNDS & TRANSITIONS
// =============================================================================

/**
 * Add Joel's natural thinking rhythm.
 * He thinks out loud with energy, not hesitation.
 */
export function addThinkingSounds(text: string, _emotion: string): string {
  let result = text;

  const thinkingPatterns = [
    // Joel's signature thinking sounds — quick, not sluggish
    { pattern: /\b(here['']s the thing)\b/gi, pause: 180, speed: 0.96 },
    { pattern: /\b(you know what['']s interesting)\b/gi, pause: 150, speed: 0.98 },
    { pattern: /\b(here['']s (what|how) i think about (it|this|that))\b/gi, pause: 180, speed: 0.96 },
    { pattern: /\b(so here['']s what)\b/gi, pause: 150, speed: 0.98 },
    { pattern: /\b(let me (think|put it this way))\b/gi, pause: 200, speed: 0.94 },
    // Quick transitions
    { pattern: /\b(okay|ok)\b(?=,?\s+(so|here['']s|let['']s))/gi, pause: 120, speed: 1.0 },
    { pattern: /\b(so)\b(?=,?\s+(here['']s|the thing|what))/gi, pause: 100, speed: 1.0 },
  ];

  thinkingPatterns.forEach(({ pattern, pause, speed }) => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// LIFE WISDOM (Beyond Finance)
// =============================================================================

/**
 * Add weight to Joel's broader life philosophy.
 * He's a mentor for all of life, not just money.
 */
export function addLifeWisdom(text: string, _emotion: string): string {
  let result = text;

  const wisdomIntros = [
    /\b(here['']s what (i['']ve learned|i think|matters))\b/gi,
    /\b(in my experience)\b/gi,
    /\b(what (i['']ve found|helps|works) is)\b/gi,
    /\b(the (truth|thing|reality) is)\b/gi,
    /\b(over (the years|thirty years|three decades))\b/gi,
  ];

  wisdomIntros.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/><speed ratio="0.92"/><emotion value="contemplative"/>${match}<break time="150ms"/>`;
    });
  });

  // Wisdom conclusions — weight and warmth
  const wisdomConclusions = [
    /\b(and that['']s (okay|enough|what matters|the point))\b/gi,
    /\b(that['']s what (counts|matters|it comes down to))\b/gi,
    /\b(focus on what you (can )?control)\b/gi,
    /\b(small things compound)\b/gi,
    /\b(consistency beats intensity)\b/gi,
  ];

  wisdomConclusions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><speed ratio="0.90"/><emotion value="affectionate"/>${match}<speed ratio="1.0"/><break time="200ms"/>`;
    });
  });

  return result;
}

// =============================================================================
// EMOTIONAL PRESENCE
// =============================================================================

/**
 * Add warmth when Joel is being emotionally present.
 * He slows down and gets quiet for the hard stuff.
 */
export function addEmotionalPresence(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'angry') {
    return result;
  }

  const presencePhrases = [
    // Acknowledgment
    /\b(i hear you|i['']m here)\b/gi,
    /\b(that['']s (a lot|hard|heavy|real|tough))\b/gi,
    /\b(i (understand|get it))\b/gi,
    // Validation
    /\b(that makes (sense|total sense))\b/gi,
    /\b(anyone would (feel|be))\b/gi,
    /\b(of course you (feel|felt))\b/gi,
    // Sitting with someone
    /\b(you don['']t have to)\b/gi,
    /\b(take your time)\b/gi,
    /\b(it['']s okay (to|not to))\b/gi,
    /\b(no rush)\b/gi,
  ];

  presencePhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="sympathetic"/><speed ratio="0.90"/><volume ratio="0.95"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// CELEBRATION & DELIGHT
// =============================================================================

/**
 * Add energy to Joel's celebrations.
 * He genuinely lights up when someone has a breakthrough.
 */
export function addCelebrationEnergy(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'sad') {
    return result;
  }

  const celebrationPhrases = [
    /\b(that['']s (wonderful|brilliant|fantastic|huge|amazing))\b/gi,
    /\b(i['']m (so )?(proud|happy|excited) (for|of) you)\b/gi,
    /\b(look at you)\b/gi,
    /\b(you (did|got|nailed) (it|that|this))\b/gi,
    /\b(ha!?\s*i love (this|that|it))\b/gi,
    /\b(now (you['']re|we['']re) (getting|talking))\b/gi,
    /\b(yes!)\b/gi,
  ];

  celebrationPhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="happy"/><speed ratio="1.02"/><volume ratio="1.04"/>${match}<break time="120ms"/><volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// CURIOUS QUESTIONS
// =============================================================================

/**
 * Add genuine curiosity to Joel's questions.
 * He asks because he truly wants to understand the whole person.
 */
export function addCuriousQuestions(text: string, _emotion: string): string {
  let result = text;

  const curiousPatterns = [
    /\b(what (does that|would that) (look|feel|mean) like)\b/gi,
    /\b(tell me (more|about))\b/gi,
    /\b(what['']s (on your mind|coming up|worrying you|exciting you))\b/gi,
    /\b(how (do|did|does|are) (you|things))\b/gi,
    /\b(what (matters|helps|works) (most|for you))\b/gi,
    /\b(what are you (really )?trying to)\b/gi,
  ];

  curiousPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="curious"/><speed ratio="0.96"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// ACTIVE LISTENING
// =============================================================================

/**
 * Add Joel's active listening sounds.
 * Quick, engaged acknowledgments — not slow, ponderous nods.
 */
export function addActiveListening(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const acknowledgmentPatterns = [/\b(i understand|that makes sense|i hear you|i get it)\b/gi];

  acknowledgmentPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      if (Math.random() < 0.2) {
        const sounds = ['Mm. ', 'Right. ', 'Yeah. ', 'Sure. '];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `${sound}<break time="80ms"/>${match}`;
      }
      return match;
    });
  });

  return result;
}

// =============================================================================
// TRANSITION PHRASES
// =============================================================================

/**
 * Add natural flow to Joel's transitions.
 * He guides conversations with energy, not labored segues.
 */
export function addTransitionPhrases(text: string, _emotion: string): string {
  let result = text;

  const transitions = [
    /\b(so,?\s*(here['']s|let['']s|what|tell me))\b/gi,
    /\b(okay,?\s*(so|here['']s|let['']s))\b/gi,
    /\b(now,?\s*(here['']s|let['']s|what))\b/gi,
    /\b(alright,?\s*(so|here))\b/gi,
  ];

  transitions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="120ms"/>${match}`;
    });
  });

  return result;
}

// =============================================================================
// MAIN PROCESSOR
// =============================================================================

/**
 * Apply all Joel Dickson speech traits to text.
 *
 * Processing order:
 * 1. Emotional presence (check for heavy moments first)
 * 2. Vanguard pride & Bogle wisdom (sacred ground)
 * 3. Thinking sounds & transitions (natural flow)
 * 4. Economist wit & humor (Joel's signature energy)
 * 5. Financial wisdom delivery (expert confidence)
 * 6. Personal history (stories that shaped him)
 * 7. Life wisdom (beyond finance)
 * 8. Curious questions & celebration (engagement)
 * 9. Active listening (presence)
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed
 * @param _laughterCount - Number of laughter instances detected
 * @returns Text with Joel's speech traits applied
 */
export function applyJoelDicksonSpeechTraits(
  text: string,
  emotion: string,
  _baseSpeed: number,
  _laughterCount: number
): string {
  let processedText = text;

  // TIER 0: EMOTIONAL PRESENCE (heavy moments get soft treatment first)
  const isHeavyContent = /\b(struggling|stressed|anxious|worried|scared|overwhelmed|grief|loss|divorce|layoff)\b/i.test(text);
  if (isHeavyContent || emotion === 'sad' || emotion === 'sympathetic') {
    processedText = addEmotionalPresence(processedText, emotion);
  }

  // TIER 1: SACRED GROUND — Vanguard & Bogle
  processedText = addVanguardPride(processedText, emotion);

  // TIER 2: THINKING & FLOW
  processedText = addThinkingSounds(processedText, emotion);
  processedText = addTransitionPhrases(processedText, emotion);

  // TIER 3: WIT & PERSONALITY (Joel's signature)
  processedText = addEconomistWit(processedText, emotion);
  processedText = addPersonalHistory(processedText, emotion);

  // TIER 4: EXPERTISE
  processedText = addFinancialWisdom(processedText, emotion);
  processedText = addLifeWisdom(processedText, emotion);

  // TIER 5: ENGAGEMENT & WARMTH
  processedText = addCuriousQuestions(processedText, emotion);
  processedText = addCelebrationEnergy(processedText, emotion);
  processedText = addActiveListening(processedText, emotion);

  return processedText;
}

/**
 * Configuration for Joel Dickson's speech traits
 */
export const JOEL_DICKSON_SPEECH_CONFIG = {
  /** Base speech speed (natural, conversational — not slow) */
  baseSpeed: 1.0,
  /** Whether to enable Vanguard/Bogle pride moments */
  enableVanguardPride: true,
  /** Whether to enable economist wit */
  enableEconomistWit: true,
  /** Whether to enable financial wisdom emphasis */
  enableFinancialWisdom: true,
  /** Whether to enable emotional presence */
  enableEmotionalPresence: true,
  /** Whether to enable life wisdom cadence */
  enableLifeWisdom: true,
  /** Probability of active listening sounds (0-1) */
  activeListeningProbability: 0.2,
  /** Whether to enable thinking sounds */
  enableThinkingSounds: true,
  /** Thinking sound frequency */
  thinkingSoundProbability: 0.3,
} as const;
