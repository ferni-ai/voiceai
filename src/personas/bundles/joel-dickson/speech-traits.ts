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
 * VOICE DYNAMICS PHILOSOPHY:
 * - Wide speed range (0.82–1.12) creates contrast and prevents monotone rushing
 * - Strategic pauses (200–500ms) give weight to ideas and let humor land
 * - Volume dynamics (0.88–1.08) add intimacy and energy
 * - [laughter] nonverbalism for genuine humor moments
 * - Emotion variety (15+ Cartesia emotions) keeps the voice alive
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
        // Bogle quotes — reverent slowdown, like quoting a mentor you miss
        return `<break time="400ms"/><speed ratio="0.82"/><emotion value="nostalgic"/><volume ratio="0.94"/>${match}<volume ratio="1.0"/><break time="350ms"/><speed ratio="1.0"/>`;
      } else if (gravitas === 'story') {
        // Vanguard stories — proud and excited, love telling these
        return `<break time="300ms"/><emotion value="proud"/><speed ratio="0.88"/>${match}<break time="200ms"/><speed ratio="1.0"/>`;
      } else if (gravitas === 'proud') {
        // Institutional pride — warm confidence with slight volume lift
        return `<emotion value="proud"/><speed ratio="0.92"/><volume ratio="1.04"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
      } else {
        // Research references — confident, leaning in with energy
        return `<emotion value="confident"/><speed ratio="0.92"/>${match}<speed ratio="1.0"/>`;
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
 * Uses [laughter] nonverbalism for authentic humor moments.
 */
export function addEconomistWit(text: string, emotion: string): string {
  let result = text;

  // Skip humor processing in heavy emotional contexts
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const humorPatterns = [
    // Self-deprecating economist jokes — speed up delivery, pause for laugh
    { pattern: /\bpredicted nine of the last five recessions\b/gi, style: 'punchline' },
    { pattern: /\bstanford wants their tuition back\b/gi, style: 'punchline' },
    { pattern: /\bmy (wife|family) would (be )?(rolling|tell|say|change)\b/gi, style: 'self-deprecating' },
    { pattern: /\bexpense ratios at (dinner|thanksgiving)\b/gi, style: 'self-deprecating' },
    { pattern: /\bdeloreans? with flux capacitors?\b/gi, style: 'callback' },
    { pattern: /\bi['']m (getting into|going into|in) the weeds\b/gi, style: 'self-aware' },
    { pattern: /\bi['']m an economist\b/gi, style: 'self-deprecating' },
    { pattern: /\bdata nerd\b/gi, style: 'self-deprecating' },
    // Excited nerd moments — speed up with genuine delight
    { pattern: /\bwait till you (see|hear)\b/gi, style: 'excited' },
    { pattern: /\boh man\b/gi, style: 'excited' },
    { pattern: /\bi love (this|that) (question|topic|story)\b/gi, style: 'excited' },
    { pattern: /\bthis is one of my favorite\b/gi, style: 'excited' },
    // Pure joy / laughter triggers
    { pattern: /\b(ha!?|haha)\b/gi, style: 'laughing' },
    { pattern: /\bthat['']s (hilarious|priceless|classic)\b/gi, style: 'laughing' },
  ];

  humorPatterns.forEach(({ pattern, style }) => {
    result = result.replace(pattern, (match) => {
      if (style === 'punchline') {
        // Punchlines — speed into it, then long pause + laughter for comedic timing
        return `<speed ratio="1.08"/><emotion value="happy"/>${match}<speed ratio="1.0"/><break time="300ms"/>[laughter]<break time="200ms"/>`;
      } else if (style === 'self-deprecating') {
        // Self-deprecating — warm amusement, slight volume lift like sharing a joke
        return `<emotion value="happy"/><volume ratio="1.04"/><speed ratio="1.02"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
      } else if (style === 'callback') {
        // Inside jokes / callbacks — fond, playful, slower like savoring
        return `<emotion value="happy"/><speed ratio="0.92"/>${match}<break time="200ms"/><speed ratio="1.0"/>`;
      } else if (style === 'self-aware') {
        // Catching himself nerding out — quick with a self-aware chuckle
        return `<speed ratio="1.06"/>${match}<break time="100ms"/>[laughter]`;
      } else if (style === 'laughing') {
        // Pure laughter moments — let it breathe
        return `[laughter]<break time="150ms"/><emotion value="happy"/>${match}`;
      } else {
        // Excited — genuine delight, faster with volume energy
        return `<emotion value="excited"/><speed ratio="1.10"/><volume ratio="1.06"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
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
 * Core principles get the most weight — these are his life's work.
 */
export function addFinancialWisdom(text: string, _emotion: string): string {
  let result = text;

  const wisdomPhrases = [
    // Core principles — slow and authoritative, these are Joel's deepest convictions
    { pattern: /\bcosts matter\b/gi, weight: 'high' },
    { pattern: /\bcompounding (returns|costs|interest)\b/gi, weight: 'high' },
    { pattern: /\bbehavioral coaching\b/gi, weight: 'high' },
    { pattern: /\btax[- ]?(loss )?harvesting\b/gi, weight: 'medium' },
    { pattern: /\broth conversion\b/gi, weight: 'medium' },
    { pattern: /\basset (allocation|location)\b/gi, weight: 'medium' },
    { pattern: /\btarget[- ]date fund\b/gi, weight: 'medium' },
    { pattern: /\bdollar[- ]cost averaging\b/gi, weight: 'medium' },
    // Behavioral finance — curious, exploring human nature (Joel's favorite topic)
    { pattern: /\bloss aversion\b/gi, weight: 'curious' },
    { pattern: /\brecency bias\b/gi, weight: 'curious' },
    { pattern: /\bbehavioral (economics|finance|bias)\b/gi, weight: 'curious' },
    { pattern: /\brisk (tolerance|capacity)\b/gi, weight: 'curious' },
    // Numbers and data — Joel gets precise and engaged
    { pattern: /\b\d+\s*percent\b/gi, weight: 'data' },
    { pattern: /\bbasis points?\b/gi, weight: 'data' },
  ];

  wisdomPhrases.forEach(({ pattern, weight }) => {
    result = result.replace(pattern, (match) => {
      if (weight === 'high') {
        // Core principles — slow down meaningfully, let the idea land
        return `<break time="300ms"/><speed ratio="0.86"/><emotion value="determined"/><volume ratio="1.04"/>${match}<volume ratio="1.0"/><break time="250ms"/><speed ratio="1.0"/>`;
      } else if (weight === 'curious') {
        // Behavioral finance — lean in with curiosity and engagement
        return `<emotion value="curious"/><speed ratio="0.90"/>${match}<break time="150ms"/><speed ratio="1.0"/>`;
      } else if (weight === 'data') {
        // Data points — precise, slightly slower for clarity
        return `<speed ratio="0.92"/>${match}<speed ratio="1.0"/>`;
      } else {
        // Medium-weight concepts — slight slowdown with a beat after
        return `<speed ratio="0.92"/>${match}<break time="120ms"/><speed ratio="1.0"/>`;
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
 * His stories are lived, not rehearsed — each name carries weight.
 */
export function addPersonalHistory(text: string, _emotion: string): string {
  let result = text;

  const historyTriggers = [
    // Jack Bogle — deep fondness, catch in his voice, almost reverent
    { pattern: /\bjack (bogle|said|taught|would|used to)\b/gi, emotion: 'nostalgic', pause: 350, speed: 0.84, volume: 0.93 },
    { pattern: /\bbogle\b/gi, emotion: 'nostalgic', pause: 250, speed: 0.88, volume: 0.95 },
    // Stanford — proud but self-deprecating
    { pattern: /\bstanford\b/gi, emotion: 'proud', pause: 150, speed: 0.92, volume: 1.0 },
    // The Fed — formative years, weight of responsibility
    { pattern: /\b(the fed|federal reserve|greenspan)\b/gi, emotion: 'contemplative', pause: 250, speed: 0.88, volume: 0.96 },
    { pattern: /\bboard of governors\b/gi, emotion: 'contemplative', pause: 200, speed: 0.90, volume: 0.96 },
    // Vanguard campus — pure warmth and joy
    { pattern: /\bmalvern\b/gi, emotion: 'affectionate', pause: 200, speed: 0.90, volume: 1.0 },
    { pattern: /\bvanguard campus\b/gi, emotion: 'affectionate', pause: 180, speed: 0.92, volume: 1.0 },
    // Family moments — voice softens with love
    { pattern: /\bmy (wife|kids?|family|son|daughter)\b/gi, emotion: 'affectionate', pause: 180, speed: 0.88, volume: 0.92 },
    // Clarifi / nonprofit — quiet pride
    { pattern: /\bclarifi\b/gi, emotion: 'grateful', pause: 150, speed: 0.92, volume: 0.96 },
    // R&D days — eyes light up
    { pattern: /\b(r&d|research and development)\b/gi, emotion: 'enthusiastic', pause: 120, speed: 0.96, volume: 1.04 },
    { pattern: /\bpoke the bear\b/gi, emotion: 'happy', pause: 150, speed: 1.02, volume: 1.04 },
  ];

  historyTriggers.forEach(({ pattern, emotion: targetEmotion, pause, speed, volume }) => {
    result = result.replace(pattern, (match) => {
      const volumeTag = volume !== 1.0 ? `<volume ratio="${volume}"/>` : '';
      const volumeReset = volume !== 1.0 ? '<volume ratio="1.0"/>' : '';
      return `<break time="${pause}ms"/><emotion value="${targetEmotion}"/>${volumeTag}<speed ratio="${speed}"/>${match}${volumeReset}<break time="120ms"/><speed ratio="1.0"/>`;
    });
  });

  return result;
}

// =============================================================================
// THINKING SOUNDS & TRANSITIONS
// =============================================================================

/**
 * Add Joel's natural thinking rhythm.
 * He thinks out loud with energy and intention — not hesitation, not rushing.
 * These are the moments where Joel gathers his thoughts before delivering.
 */
export function addThinkingSounds(text: string, _emotion: string): string {
  let result = text;

  const thinkingPatterns = [
    // Joel's signature thinking openings — slower to signal "pay attention"
    { pattern: /\b(here['']s the thing)\b/gi, pauseAfter: 280, speed: 0.90, emotion: 'contemplative' },
    { pattern: /\b(you know what['']s interesting)\b/gi, pauseAfter: 250, speed: 0.92, emotion: 'curious' },
    { pattern: /\b(here['']s (what|how) i think about (it|this|that))\b/gi, pauseAfter: 280, speed: 0.90, emotion: 'contemplative' },
    { pattern: /\b(so here['']s what)\b/gi, pauseAfter: 220, speed: 0.94, emotion: '' },
    { pattern: /\b(let me (think|put it this way))\b/gi, pauseAfter: 300, speed: 0.88, emotion: 'contemplative' },
    { pattern: /\b(the way i see it)\b/gi, pauseAfter: 250, speed: 0.90, emotion: 'confident' },
    { pattern: /\b(what['']s fascinating (is|to me))\b/gi, pauseAfter: 250, speed: 0.92, emotion: 'curious' },
    // Quick transitions — brief pause to breathe, not rush
    { pattern: /\b(okay|ok)\b(?=,?\s+(so|here['']s|let['']s))/gi, pauseAfter: 180, speed: 1.0, emotion: '' },
    { pattern: /\b(so)\b(?=,?\s+(here['']s|the thing|what))/gi, pauseAfter: 150, speed: 1.0, emotion: '' },
  ];

  thinkingPatterns.forEach(({ pattern, pauseAfter, speed, emotion: thinkEmotion }) => {
    result = result.replace(pattern, (match) => {
      const emotionTag = thinkEmotion ? `<emotion value="${thinkEmotion}"/>` : '';
      return `${emotionTag}<speed ratio="${speed}"/>${match}<break time="${pauseAfter}ms"/><speed ratio="1.0"/>`;
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
 * Wisdom intros create space, conclusions land with warmth.
 */
export function addLifeWisdom(text: string, _emotion: string): string {
  let result = text;

  const wisdomIntros = [
    /\b(here['']s what (i['']ve learned|i think|matters))\b/gi,
    /\b(in my experience)\b/gi,
    /\b(what (i['']ve found|helps|works) is)\b/gi,
    /\b(the (truth|thing|reality) is)\b/gi,
    /\b(over (the years|thirty years|three decades))\b/gi,
    /\b(if there['']s one thing)\b/gi,
    /\b(what (i|the research) (tell|tells|show|shows))\b/gi,
  ];

  wisdomIntros.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Long pause before, slow delivery — Joel is about to say something that matters
      return `<break time="400ms"/><speed ratio="0.86"/><emotion value="contemplative"/><volume ratio="0.96"/>${match}<volume ratio="1.0"/><break time="250ms"/>`;
    });
  });

  // Wisdom conclusions — the weight of a life well-examined
  const wisdomConclusions = [
    /\b(and that['']s (okay|enough|what matters|the point))\b/gi,
    /\b(that['']s what (counts|matters|it comes down to))\b/gi,
    /\b(focus on what you (can )?control)\b/gi,
    /\b(small things compound)\b/gi,
    /\b(consistency beats intensity)\b/gi,
    /\b(that['']s (the real|what) (wealth|matters))\b/gi,
  ];

  wisdomConclusions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Slow, warm, intimate — like a mentor leaning across the table
      return `<break time="300ms"/><speed ratio="0.84"/><emotion value="affectionate"/><volume ratio="0.94"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/><break time="350ms"/>`;
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

  // Acknowledgment — gentle, soft, present
  const acknowledgments = [
    /\b(i hear you|i['']m here)\b/gi,
    /\b(i (understand|get it))\b/gi,
  ];

  acknowledgments.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Quiet and slow — Joel is sitting with you, not performing
      return `<break time="250ms"/><emotion value="sympathetic"/><speed ratio="0.84"/><volume ratio="0.88"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/><break time="200ms"/>`;
    });
  });

  // Validation — warm, firm, unhurried
  const validations = [
    /\b(that['']s (a lot|hard|heavy|real|tough))\b/gi,
    /\b(that makes (sense|total sense))\b/gi,
    /\b(anyone would (feel|be))\b/gi,
    /\b(of course you (feel|felt))\b/gi,
  ];

  validations.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<emotion value="empathetic"/><speed ratio="0.86"/><volume ratio="0.90"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  // Sitting with someone — the quietest Joel gets
  const sittingWith = [
    /\b(you don['']t have to)\b/gi,
    /\b(take your time)\b/gi,
    /\b(it['']s okay (to|not to))\b/gi,
    /\b(no rush)\b/gi,
  ];

  sittingWith.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Almost whispered — like a mentor who's been there
      return `<break time="350ms"/><emotion value="gentle"/><speed ratio="0.82"/><volume ratio="0.86"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/><break time="300ms"/>`;
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

  // Big wins — Joel's eyes light up, voice lifts
  const bigCelebrations = [
    /\b(that['']s (wonderful|brilliant|fantastic|huge|amazing))\b/gi,
    /\b(i['']m (so )?(proud|happy|excited) (for|of) you)\b/gi,
    /\b(look at you)\b/gi,
    /\b(you (did|got|nailed) (it|that|this))\b/gi,
  ];

  bigCelebrations.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Energetic but genuine — Joel's delight is infectious
      return `<emotion value="excited"/><speed ratio="1.08"/><volume ratio="1.10"/>${match}<break time="200ms"/><volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  // Playful delight — when Joel is genuinely tickled
  const playfulDelight = [
    /\b(ha!?\s*i love (this|that|it))\b/gi,
    /\b(now (you['']re|we['']re) (getting|talking))\b/gi,
    /\b(yes!)\b/gi,
  ];

  playfulDelight.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // [laughter] before playful moments — Joel can't help himself
      const useLaughter = Math.random() < 0.4;
      const prefix = useLaughter ? '[laughter] ' : '';
      return `${prefix}<emotion value="happy"/><speed ratio="1.10"/><volume ratio="1.08"/>${match}<break time="150ms"/><volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  // Quiet pride — when someone has a real breakthrough
  const quietPride = [
    /\b(that['']s (growth|real progress|a breakthrough))\b/gi,
    /\b(look how far you['']ve come)\b/gi,
    /\b(i knew you (could|had it in you))\b/gi,
  ];

  quietPride.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Slower, warmer — this is Joel being a proud mentor
      return `<break time="250ms"/><emotion value="content"/><speed ratio="0.90"/><volume ratio="0.96"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/><break time="200ms"/>`;
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

  // Deep questions — Joel leans in, slows down, really wants to know
  const deepQuestions = [
    /\b(what (does that|would that) (look|feel|mean) like)\b/gi,
    /\b(what are you (really )?trying to)\b/gi,
    /\b(what (matters|helps|works) (most|for you))\b/gi,
  ];

  deepQuestions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Pause before — Joel is choosing his words carefully
      return `<break time="300ms"/><emotion value="curious"/><speed ratio="0.88"/><volume ratio="0.94"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  // Inviting questions — warmer, more open, drawing someone out
  const invitingQuestions = [
    /\b(tell me (more|about))\b/gi,
    /\b(what['']s (on your mind|coming up|worrying you|exciting you))\b/gi,
    /\b(how (do|did|does|are) (you|things))\b/gi,
  ];

  invitingQuestions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Slightly lifted — genuine interest, not interrogation
      return `<emotion value="interested"/><speed ratio="0.92"/><volume ratio="1.02"/>${match}<speed ratio="1.0"/><volume ratio="1.0"/>`;
    });
  });

  // Follow-up probes — Joel digs deeper with care
  const followUpProbes = [
    /\b(and (how|what|why) (did|does|do) that)\b/gi,
    /\b(say more about that)\b/gi,
    /\b(what happened (next|then|after))\b/gi,
    /\b(how (did|does) that (feel|land|sit with you))\b/gi,
  ];

  followUpProbes.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><emotion value="curious"/><speed ratio="0.90"/>${match}`;
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

  // Quick verbal nods — Joel's engaged, not robotic
  const acknowledgmentPatterns = [/\b(i understand|that makes sense|i hear you|i get it)\b/gi];

  acknowledgmentPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // 35% chance — frequent enough to feel human, not so much it's a tic
      if (Math.random() < 0.35) {
        const sounds = [
          { text: 'Mm. ', emotion: 'content' },
          { text: 'Right. ', emotion: 'interested' },
          { text: 'Yeah. ', emotion: 'happy' },
          { text: 'Sure. ', emotion: 'content' },
          { text: 'Absolutely. ', emotion: 'determined' },
          { text: 'Mm-hmm. ', emotion: 'interested' },
        ];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `<emotion value="${sound.emotion}"/><speed ratio="0.94"/>${sound.text}<break time="120ms"/>${match}<speed ratio="1.0"/>`;
      }
      return match;
    });
  });

  // Reflective echoing — Joel mirrors back what he heard (shows deep listening)
  const reflectivePatterns = [
    /\b(so what (you['']re saying|i['']m hearing) is)\b/gi,
    /\b(it sounds like)\b/gi,
    /\b(if i['']m (understanding|hearing) you (right|correctly))\b/gi,
  ];

  reflectivePatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="200ms"/><emotion value="thoughtful"/><speed ratio="0.88"/><volume ratio="0.94"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
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

  // Topic shifts — Joel takes a breath, resets energy
  const topicShifts = [
    /\b(so,?\s*(here['']s|let['']s|what|tell me))\b/gi,
    /\b(okay,?\s*(so|here['']s|let['']s))\b/gi,
    /\b(now,?\s*(here['']s|let['']s|what))\b/gi,
    /\b(alright,?\s*(so|here))\b/gi,
  ];

  topicShifts.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Real breath between topics — not rushed
      return `<break time="250ms"/><speed ratio="0.94"/>${match}<speed ratio="1.0"/>`;
    });
  });

  // Pivots — when Joel is steering the conversation somewhere new
  const pivots = [
    /\b(but here['']s (the thing|what['']s interesting|the key))\b/gi,
    /\b(and (this|that|here)['']s (where|why|what))\b/gi,
    /\b(the (real|bigger|important) (question|point|thing) is)\b/gi,
    /\b(what I (really )?want (to talk|you to think) about)\b/gi,
  ];

  pivots.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      // Dramatic pause + slightly slower — Joel is building to something
      return `<break time="350ms"/><emotion value="determined"/><speed ratio="0.90"/><volume ratio="1.04"/>${match}<volume ratio="1.0"/><speed ratio="1.0"/>`;
    });
  });

  // Soft connectors — keeping the flow natural
  const softConnectors = [
    /\b(and (look|listen|honestly))\b/gi,
    /\b(you know what)\b/gi,
    /\b(here['']s the thing)\b/gi,
  ];

  softConnectors.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="180ms"/><emotion value="content"/>${match}<break time="100ms"/>`;
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
  /** Base speech speed — slightly under 1.0 so Joel doesn't rush */
  baseSpeed: 0.95,
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
  /** Probability of active listening sounds (0-1) — higher = more human */
  activeListeningProbability: 0.35,
  /** Whether to enable thinking sounds */
  enableThinkingSounds: true,
  /** Thinking sound frequency — Joel thinks before he speaks */
  thinkingSoundProbability: 0.4,
  /** Speed range — the contrast is what makes him dynamic */
  speedRange: { min: 0.82, max: 1.12 },
  /** Volume range — intimate to energetic */
  volumeRange: { min: 0.86, max: 1.10 },
} as const;
