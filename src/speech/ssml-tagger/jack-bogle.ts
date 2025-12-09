/**
 * Jack Bogle Character-Specific SSML Functions
 * Speech patterns unique to Jack's grandfatherly, wise persona
 */

/**
 * Add special treatment for Jack's signature catchphrases
 */
export function addCatchphraseEmphasis(text: string, _emotion: string): string {
  let result = text;

  const catchphrases = [
    { pattern: /\bstay the course\b/gi, gravitas: 'high' },
    { pattern: /\btime in the market\b/gi, gravitas: 'high' },
    { pattern: /\bdon't look for the needle,?\s*buy the haystack\b/gi, gravitas: 'high' },
    { pattern: /\benough\b/gi, gravitas: 'medium' },
    { pattern: /\bcosts matter\b/gi, gravitas: 'medium' },
    { pattern: /\bsimplicity\b/gi, gravitas: 'medium' },
    { pattern: /\bthe relentless rules of humble arithmetic\b/gi, gravitas: 'high' },
  ];

  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'high') {
        return `<break time="300ms"/><speed ratio="0.72"/><volume ratio="1.12"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/><break time="250ms"/>`;
      } else {
        return `<speed ratio="0.78"/>${match}<speed ratio="0.82"/>`;
      }
    });
  });

  return result;
}

/**
 * Add gravity to historically significant years
 */
export function addHistoricalYearGravity(text: string): string {
  let result = text;

  const significantYears: Record<string, string> = {
    '1974': 'founding',
    '1975': 'revolution',
    '1987': 'crash',
    '2000': 'bubble',
    '2008': 'crisis',
    '2009': 'recovery',
    '1929': 'historic',
  };

  Object.entries(significantYears).forEach(([year, _significance]) => {
    const pattern = new RegExp(`\\b(in\\s+)?${year}\\b`, 'gi');
    result = result.replace(pattern, (match) => {
      return `<break time="150ms"/><speed ratio="0.75"/><volume ratio="1.08"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/><break time="200ms"/>`;
    });
  });

  return result;
}

/**
 * Add gentle wisdom cadence for life lessons
 */
export function addWisdomCadence(text: string, _emotion: string): string {
  let result = text;

  const wisdomIntros = [
    /\b(here['']s (the thing|what i['']ve learned|the truth)|let me tell you something|i['']ve learned that|the secret is|what matters is|remember this)\b/gi,
    /\b(in my experience|over the years|after.*decades|looking back)\b/gi,
    /\b(the most important thing|what really matters|at the end of the day)\b/gi,
  ];

  wisdomIntros.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="350ms"/><speed ratio="0.72"/><emotion value="affectionate"/>${match}<break time="200ms"/>`;
    });
  });

  const wisdomConclusions = [
    /\b(and that['']s (the truth|what matters|all there is to it)|that['']s the key|that['']s (my|the) philosophy)\b/gi,
  ];

  wisdomConclusions.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/><speed ratio="0.70"/>${match}<speed ratio="0.82"/><break time="400ms"/>`;
    });
  });

  return result;
}

/**
 * Add storytelling mode for reminiscences
 */
export function addStorytellingMode(text: string, _emotion: string): string {
  let result = text;

  const storyTriggers = [
    /\b(i remember|back in|years ago|when i was|let me tell you|there was a time|one day|once upon)\b/gi,
    /\b(in 1974|in 1975|in 2008|in the crash|during the)\b/gi,
    /\b(my father|at vanguard|at wellington|the board)\b/gi,
  ];

  let isStory = false;
  storyTriggers.forEach((pattern) => {
    if (pattern.test(text)) {
      isStory = true;
    }
  });

  if (isStory) {
    result = result.replace(/\b(i remember|back in|years ago|when i was)\b/gi, (match) => {
      return `<speed ratio="0.75"/><break time="300ms"/>${match}<break time="200ms"/><speed ratio="0.82"/>`;
    });

    result = result.replace(/\b(and then|suddenly|but then|that's when)\b/gi, (match) => {
      return `<break time="400ms"/><speed ratio="0.78"/>${match}<break time="150ms"/>`;
    });

    result = result.replace(
      /\b(those were the days|simpler times|i miss|fond memories)\b/gi,
      (match) => {
        return `<emotion value="affectionate"/><speed ratio="0.75"/>${match}<break time="200ms"/>`;
      }
    );
  }

  return result;
}

/**
 * Add humble deflection pattern
 */
export function addHumbleDeflection(text: string, _emotion: string): string {
  let result = text;

  const humblePhrases = [
    /\b(oh,?\s+i don['']t know about that|well,?\s+i just|it['']s not me,?\s+it['']s|i was just lucky|anyone could have|i had help)\b/gi,
    /\b(the credit (really )?goes to|i can['']t take credit|it was a team effort|i was in the right place)\b/gi,
  ];

  humblePhrases.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      return `<volume ratio="0.92"/><speed ratio="0.85"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/>`;
    });
  });

  return result;
}

/**
 * Handle Rule of Three (tricolon) - Jack loves lists of 3
 */
export function addTricolonCadence(text: string, baseSpeed: number): string {
  let result = text;

  const tricolonPattern = /\b(\w+),\s+(\w+),?\s+and\s+(\w+)\b/gi;

  result = result.replace(tricolonPattern, (_match, first, second, third) => {
    return `<speed ratio="${(baseSpeed * 1.02).toFixed(2)}"/>${first}<break time="180ms"/><speed ratio="${(baseSpeed * 1.0).toFixed(2)}"/>${second}<break time="200ms"/><speed ratio="${(baseSpeed * 0.92).toFixed(2)}"/>and ${third}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });

  result = result.replace(
    /\b(goals),?\s*(balance),?\s*(cost),?\s*and\s*(discipline)\b/gi,
    (_match) => {
      return `<break time="200ms"/><speed ratio="0.78"/>goals<break time="250ms"/>balance<break time="250ms"/>cost<break time="280ms"/>and discipline<speed ratio="0.82"/><break time="300ms"/>`;
    }
  );

  return result;
}

/**
 * Add voice shift when quoting others
 */
export function addQuotationVoiceShift(text: string, _emotion: string): string {
  let result = text;

  const quotePatterns = [
    /\b(my father (always )?said|my father told me|as my father put it)\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(kurt (vonnegut )?said|vonnegut (once )?said)\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(as (the saying goes|they say|someone once said))\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(einstein (once )?said|warren (buffett )?said)\s*[,:]?\s*["']([^"']+)["']/gi,
  ];

  quotePatterns.forEach((pattern) => {
    result = result.replace(pattern, (match, intro, _, quote) => {
      return `${intro}: <break time="300ms"/><emotion value="affectionate"/><speed ratio="0.75"/><volume ratio="0.95"/>"${quote}"<volume ratio="1.0"/><speed ratio="0.82"/><break time="200ms"/>`;
    });
  });

  result = result.replace(/"([^"]{20,})"(?!\s*[,:])/g, (match, quote) => {
    const isFinancialPronunciation =
      /\b(four|three|five|six|seven|eight|nine|oh|one|two)\s+(oh|hundred|thousand|million)?\s*[A-Z]?\b/i.test(
        quote
      );
    if (isFinancialPronunciation) {
      return match;
    }
    return `<break time="100ms"/><speed ratio="0.85"/><volume ratio="0.95"/>"${quote}"<volume ratio="1.0"/><speed ratio="0.88"/>`;
  });

  return result;
}

/**
 * Add warmth when saying names
 */
export function addNameWarmth(text: string, _emotion: string): string {
  let result = text;

  const namePatterns = [
    /\b(hello|hi|hey|well|now|listen|look),?\s+([A-Z][a-z]+)\b/gi,
    /\b([A-Z][a-z]+),?\s+(my friend|my boy|my girl|dear)\b/gi,
    /\btake care,?\s+([A-Z][a-z]+)\b/gi,
    /\bgoodbye,?\s+([A-Z][a-z]+)\b/gi,
  ];

  namePatterns.forEach((pattern) => {
    result = result.replace(pattern, (match, _before, name) => {
      if (name && /^[A-Z][a-z]+$/.test(name)) {
        return match.replace(
          name,
          `<emotion value="affectionate"/><speed ratio="0.85"/>${name}<speed ratio="0.88"/>`
        );
      }
      return match;
    });
  });

  return result;
}

/**
 * Add active listening sounds
 */
export function addActiveListeningSounds(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const acknowledgmentPatterns = [/\b(i understand|that makes sense|i hear you|i get it)\b/gi];

  acknowledgmentPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      if (!/\b(mmhmm|i see|aha|right|okay)\b/i.test(before) && Math.random() < 0.25) {
        const sounds = ['Mmhmm. ', 'I see. ', 'Aha. ', 'Right. '];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `${sound}<break time="150ms"/>${match}`;
      }
      return match;
    });
  });

  result = result.replace(/\b(that's interesting|tell me about|how did that)\b/gi, (match) => {
    if (Math.random() < 0.15) {
      return `<break time="100ms"/>mmhmm<break time="150ms"/>${match}`;
    }
    return match;
  });

  return result;
}

/**
 * Add warmth/lift throughout the text at natural moments
 */
export function addLaughterThroughout(text: string, emotion: string, laughterCount: number): string {
  let result = text;

  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }

  const positiveEndings = [
    /\b(that is great|that is wonderful|that is amazing|that is fantastic|i love that)\b/gi,
    /\b(isn't that something|can you believe|imagine that)\b/gi,
  ];

  positiveEndings.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      if (Math.random() < 0.3) {
        return `${match}<break time="200ms"/>`;
      }
      return match;
    });
  });

  if (emotion === 'affectionate' && laughterCount === 0) {
    result = result.replace(/\byou know\b/gi, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      const after = result.substring(offset + match.length, offset + match.length + 30);
      if (
        /\b(great|wonderful|amazing|love|proud|care)\b/i.test(before + after) &&
        Math.random() < 0.2
      ) {
        return `${match}<break time="180ms"/>`;
      }
      return match;
    });
  }

  return result;
}

/**
 * Add elderly word-finding pauses
 */
export function addWordFindingPauses(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'angry') {
    return result;
  }

  const complexWords = [
    /\b(diversification|rebalancing|compounding|allocation|volatility)\b/gi,
    /\b(sophisticated|fundamental|philosophy|perspective|circumstances)\b/gi,
  ];

  complexWords.forEach((pattern) => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 40), offset);
      if (!/<break/i.test(before) && Math.random() < 0.08) {
        const pauses = [
          `<break time="250ms"/>what's the word...<break time="200ms"/>${match}`,
          `<break time="200ms"/>oh, you know...<break time="150ms"/>${match}`,
          `<break time="180ms"/>hmm...<break time="150ms"/>${match}`,
        ];
        return pauses[Math.floor(Math.random() * pauses.length)];
      }
      return match;
    });
  });

  result = result.replace(
    /(<break time="[5-9]\d{2}ms"\/>)(\s*)([A-Z])/g,
    (match, breakTag, space, letter) => {
      if (Math.random() < 0.05) {
        return `${breakTag}${space}Now, where was I...<break time="200ms"/>${letter}`;
      }
      return match;
    }
  );

  return result;
}

/**
 * Add self-corrections to make Jack sound like he's thinking out loud
 */
export function addSelfCorrections(text: string, emotion: string): string {
  let result = text;

  if (emotion === 'sad' || text.length < 100) {
    return result;
  }

  const clarificationPatterns = [
    /\b(that is to say|in other words|what I mean is|to put it simply)\b/gi,
  ];

  clarificationPatterns.forEach((pattern) => {
    result = result.replace(pattern, (match) => {
      if (Math.random() < 0.2) {
        const corrections = ['well, actually—', 'no, wait—', 'hmm, let me rephrase—', 'I mean—'];
        const correction = corrections[Math.floor(Math.random() * corrections.length)];
        return `${correction}<break time="200ms"/>${match}`;
      }
      return match;
    });
  });

  result = result.replace(/\b(but actually|however|on second thought)\b/gi, (match) => {
    if (Math.random() < 0.25) {
      return `<break time="200ms"/>hmm—${match}`;
    }
    return match;
  });

  return result;
}
