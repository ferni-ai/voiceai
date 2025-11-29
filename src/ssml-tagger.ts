/**
 * Enhanced Intelligent SSML Tagger - Human-Like Natural Speech
 *
 * Fully implements Cartesia Sonic-3 SSML tags:
 * - Speed: <speed ratio="0.6-1.5"/>
 * - Volume: <volume ratio="0.5-2.0"/>
 * - Emotion: <emotion value="angry|sad|surprised|curious|affectionate"/> (beta)
 * - Break: <break time="500ms"/> or <break time="1s"/>
 * - Spell: <spell>ABC123</spell>
 *
 * Plus financial pronunciation dictionary for SEC, FINRA, 401K, etc.
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */

// Financial pronunciations are protected from corruption using Unicode markers.
// This approach is simpler than segment-based transformation and handles all cases.

// ============================================================================
// FINANCIAL PRONUNCIATION DICTIONARY
// Ensures correct pronunciation of financial terms, acronyms, and numbers
// ============================================================================

type PronunciationEntry = {
  pattern: RegExp;
  replacement: string;
  description?: string;
};

/**
 * Financial terms pronunciation dictionary
 * Maps terms to their phonetic "sounds-like" pronunciations
 */
const FINANCIAL_PRONUNCIATIONS: PronunciationEntry[] = [
  // Retirement accounts
  { pattern: /\b401\s*[Kk]\b/g, replacement: 'four oh one K', description: 'Retirement account' },
  { pattern: /\b401\s*\(k\)\b/gi, replacement: 'four oh one K', description: 'Retirement account' },
  { pattern: /\b403\s*[Bb]\b/g, replacement: 'four oh three B', description: 'Nonprofit retirement' },
  { pattern: /\b457\s*[Bb]?\b/g, replacement: 'four fifty seven', description: 'Government retirement' },
  { pattern: /\bIRA\b/g, replacement: 'I R A', description: 'Individual Retirement Account' },
  { pattern: /\bRoth\s+IRA\b/gi, replacement: 'Roth I R A', description: 'After-tax retirement' },
  { pattern: /\bSEP[\s-]?IRA\b/gi, replacement: 'sep I R A', description: 'Self-employed retirement' },
  { pattern: /\bSIMPLE[\s-]?IRA\b/gi, replacement: 'simple I R A', description: 'Small business retirement' },
  
  // Regulatory bodies
  { pattern: /\bSEC\b/g, replacement: 'S E C', description: 'Securities and Exchange Commission' },
  { pattern: /\bFINRA\b/g, replacement: 'fin-rah', description: 'Financial Industry Regulatory Authority' },
  { pattern: /\bFDIC\b/g, replacement: 'F D I C', description: 'Federal Deposit Insurance Corporation' },
  { pattern: /\bFed\b/g, replacement: 'Fed', description: 'Federal Reserve' },
  { pattern: /\bFOMC\b/g, replacement: 'F O M C', description: 'Federal Open Market Committee' },
  { pattern: /\bCFPB\b/g, replacement: 'C F P B', description: 'Consumer Financial Protection Bureau' },
  { pattern: /\bOCC\b/g, replacement: 'O C C', description: 'Office of the Comptroller' },
  { pattern: /\bSIPC\b/g, replacement: 'S I P C', description: 'Securities Investor Protection' },
  
  // Indices and markets
  { pattern: /\bS&P\s*500\b/gi, replacement: 'S and P five hundred', description: 'Stock index' },
  { pattern: /\bS&P\b/gi, replacement: 'S and P', description: 'Standard and Poors' },
  { pattern: /\bDJIA\b/g, replacement: 'Dow Jones Industrial Average', description: 'Dow index' },
  { pattern: /\bDow\s+Jones\b/gi, replacement: 'Dow Jones', description: 'Market index' },
  { pattern: /\bNASDAQ\b/gi, replacement: 'NASDAQ', description: 'Tech exchange' },
  { pattern: /\bNYSE\b/g, replacement: 'N Y S E', description: 'New York Stock Exchange' },
  { pattern: /\bVIX\b/g, replacement: 'vix', description: 'Volatility index' },
  { pattern: /\bETF\b/g, replacement: 'E T F', description: 'Exchange Traded Fund' },
  { pattern: /\bETFs\b/g, replacement: 'E T Fs', description: 'Exchange Traded Funds' },
  { pattern: /\bREIT\b/g, replacement: 'reet', description: 'Real Estate Investment Trust' },
  { pattern: /\bREITs\b/g, replacement: 'reets', description: 'Real Estate Investment Trusts' },
  
  // Fund types
  { pattern: /\bVTI\b/g, replacement: 'V T I', description: 'Vanguard Total Stock' },
  { pattern: /\bVOO\b/g, replacement: 'V O O', description: 'Vanguard S&P 500' },
  { pattern: /\bVTSAX\b/g, replacement: 'V T sax', description: 'Vanguard Total Stock Admiral' },
  { pattern: /\bVFIAX\b/g, replacement: 'V F I ax', description: 'Vanguard 500 Admiral' },
  { pattern: /\bVBTLX\b/g, replacement: 'V B T L X', description: 'Vanguard Bond' },
  { pattern: /\bVXUS\b/g, replacement: 'V X U S', description: 'Vanguard International' },
  
  // Financial metrics
  { pattern: /\bP\/E\b/g, replacement: 'P E ratio', description: 'Price to Earnings' },
  { pattern: /\bEPS\b/g, replacement: 'E P S', description: 'Earnings Per Share' },
  { pattern: /\bROI\b/g, replacement: 'R O I', description: 'Return on Investment' },
  { pattern: /\bROE\b/g, replacement: 'R O E', description: 'Return on Equity' },
  { pattern: /\bNAV\b/g, replacement: 'N A V', description: 'Net Asset Value' },
  { pattern: /\bAUM\b/g, replacement: 'A U M', description: 'Assets Under Management' },
  { pattern: /\bTER\b/g, replacement: 'T E R', description: 'Total Expense Ratio' },
  { pattern: /\bYTD\b/g, replacement: 'year to date', description: 'Year to Date' },
  { pattern: /\bQoQ\b/g, replacement: 'quarter over quarter', description: 'Quarter comparison' },
  { pattern: /\bYoY\b/g, replacement: 'year over year', description: 'Year comparison' },
  { pattern: /\bCAPM\b/g, replacement: 'cap M', description: 'Capital Asset Pricing Model' },
  { pattern: /\bEBITDA\b/g, replacement: 'E bit dah', description: 'Earnings metric' },
  
  // Account types
  { pattern: /\bHSA\b/g, replacement: 'H S A', description: 'Health Savings Account' },
  { pattern: /\bFSA\b/g, replacement: 'F S A', description: 'Flexible Spending Account' },
  { pattern: /\bESA\b/g, replacement: 'E S A', description: 'Education Savings Account' },
  { pattern: /\b529\b/g, replacement: 'five twenty nine', description: 'Education savings plan' },
  { pattern: /\bUGMA\b/g, replacement: 'U G M A', description: 'Uniform Gifts to Minors' },
  { pattern: /\bUTMA\b/g, replacement: 'U T M A', description: 'Uniform Transfers to Minors' },
  
  // Trading terms
  { pattern: /\bIPO\b/g, replacement: 'I P O', description: 'Initial Public Offering' },
  { pattern: /\bSPAC\b/g, replacement: 'spac', description: 'Special Purpose Acquisition' },
  { pattern: /\bDCA\b/g, replacement: 'D C A', description: 'Dollar Cost Averaging' },
  { pattern: /\bCDs\b/g, replacement: 'C Ds', description: 'Certificates of Deposit' },
  { pattern: /\bCD\b/g, replacement: 'C D', description: 'Certificate of Deposit' },
  { pattern: /\bAPY\b/g, replacement: 'A P Y', description: 'Annual Percentage Yield' },
  { pattern: /\bAPR\b/g, replacement: 'A P R', description: 'Annual Percentage Rate' },
  
  // Basis points and percentages
  { pattern: /\b(\d+)\s*bps\b/gi, replacement: '$1 basis points', description: 'Basis points' },
  { pattern: /\b(\d+)\s*bp\b/gi, replacement: '$1 basis points', description: 'Basis point' },
  
  // Money amounts (for clearer pronunciation)
  { pattern: /\$(\d+)k\b/gi, replacement: '$1 thousand dollars', description: 'Thousands' },
  { pattern: /\$(\d+)m\b/gi, replacement: '$1 million dollars', description: 'Millions' },
  { pattern: /\$(\d+)b\b/gi, replacement: '$1 billion dollars', description: 'Billions' },
  { pattern: /\$(\d+)t\b/gi, replacement: '$1 trillion dollars', description: 'Trillions' },
  
  // Common Bogle/Vanguard terms
  { pattern: /\bVanguard\b/g, replacement: 'Vanguard', description: 'Company name' },
  { pattern: /\bBogle\b/g, replacement: 'Bogul', description: 'Name pronunciation' },
  { pattern: /\bindex\s+fund/gi, replacement: 'index fund', description: 'Investment type' },
  { pattern: /\bexpense\s+ratio/gi, replacement: 'expense ratio', description: 'Fund cost metric' },
];

/**
 * Apply financial pronunciation dictionary to text
 */
// Unique markers to protect financial pronunciations from SSML corruption
const FINANCIAL_START = '\uE001';  // Private use Unicode character
const FINANCIAL_END = '\uE002';

function applyFinancialPronunciations(text: string): string {
  let result = text;
  for (const { pattern, replacement } of FINANCIAL_PRONUNCIATIONS) {
    // Wrap replacements with protection markers
    result = result.replace(pattern, `${FINANCIAL_START}${replacement}${FINANCIAL_END}`);
  }
  return result;
}

/**
 * Remove protection markers after all SSML processing is complete
 */
function removeProtectionMarkers(text: string): string {
  return text.replace(new RegExp(`${FINANCIAL_START}|${FINANCIAL_END}`, 'g'), '');
}

// ============================================================================
// EMOTIONAL KEYWORDS - Full Cartesia Sonic-3 Emotion Support
// Supported emotions: angry, sad, surprised, curious, affectionate
// @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags#emotion-beta
// ============================================================================

const EMOTION_KEYWORDS: Record<string, string> = {
  // Affectionate/Warm (Jack's default warm personality)
  proud: 'affectionate',
  love: 'affectionate',
  care: 'affectionate',
  friend: 'affectionate',
  grateful: 'affectionate',
  appreciate: 'affectionate',
  wonderful: 'affectionate',
  beautiful: 'affectionate',
  amazing: 'affectionate',
  fantastic: 'affectionate',
  'so proud': 'affectionate',
  'i believe': 'affectionate',
  'i care': 'affectionate',
  'my friend': 'affectionate',
  'dear friend': 'affectionate',
  warmth: 'affectionate',
  blessing: 'affectionate',
  blessed: 'affectionate',
  cherish: 'affectionate',
  treasure: 'affectionate',
  'means so much': 'affectionate',
  'close to my heart': 'affectionate',
  family: 'affectionate',
  grandkids: 'affectionate',
  grandchildren: 'affectionate',
  'my boy': 'affectionate',
  'my girl': 'affectionate',
  'young man': 'affectionate',
  'young lady': 'affectionate',
  
  // Curious/Inquisitive (engaging questions)
  'tell me': 'curious',
  'what is': 'curious',
  'how do': 'curious',
  'why did': 'curious',
  'let me ask': 'curious',
  wonder: 'curious',
  curious: 'curious',
  'i wonder': 'curious',
  'what does': 'curious',
  'help me understand': 'curious',
  'what happened': 'curious',
  'how did': 'curious',
  interesting: 'curious',
  fascinated: 'curious',
  'tell me more': 'curious',
  'go on': 'curious',
  'and then': 'curious',
  
  // Sad/Empathetic (responding to difficult topics)
  sorry: 'sad',
  loss: 'sad',
  grief: 'sad',
  difficult: 'sad',
  hard: 'sad',
  struggle: 'sad',
  'i understand': 'sad',
  'i am sorry': 'sad',
  'my condolences': 'sad',
  'that is heavy': 'sad',
  'that hurts': 'sad',
  painful: 'sad',
  suffering: 'sad',
  heartbreak: 'sad',
  tragedy: 'sad',
  'passed away': 'sad',
  death: 'sad',
  died: 'sad',
  'hard times': 'sad',
  'tough times': 'sad',
  regret: 'sad',
  mistake: 'sad',
  failure: 'sad',
  'let you down': 'sad',
  disappointed: 'sad',
  
  // Surprised (genuine reactions)
  'oh!': 'surprised',
  'wow': 'surprised',
  'really?': 'surprised',
  'no way': 'surprised',
  'that is surprising': 'surprised',
  'can you believe': 'surprised',
  incredible: 'surprised',
  unbelievable: 'surprised',
  remarkable: 'surprised',
  extraordinary: 'surprised',
  'i had no idea': 'surprised',
  'never expected': 'surprised',
  astonishing: 'surprised',
  'goodness': 'surprised',
  'my word': 'surprised',
  
  // Angry/Passionate (Bogle's crusader moments against Wall Street)
  'will not': 'angry',
  'should not': 'angry',
  'this is wrong': 'angry',
  'unacceptable': 'angry',
  'stealing': 'angry',
  'greed': 'angry',
  'exploitation': 'angry',
  'outrageous': 'angry',
  'disgrace': 'angry',
  'shameful': 'angry',
  'wall street': 'angry', // Jack's famous Wall Street criticism
  'high fees': 'angry',
  'rip off': 'angry',
  'ripping off': 'angry',
  'taking advantage': 'angry',
  'industry': 'angry', // When talking about fund industry abuses
  'mutual fund industry': 'angry',
  'active management': 'angry', // Jack's criticism of active funds
  'manager': 'angry', // Fund managers taking fees
};

// Thinking sounds that indicate natural hesitation and reflection
const THINKING_SOUNDS = [
  /\b(well|hmm|ah|oh|um|uh|you know|i mean|actually|let me think|hmm)\b/gi,
];

// Reflection phrases that suggest contemplation
const REFLECTION_PHRASES = [
  /\b(let me think|let me see|hmm|well|you know|i mean|actually|i suppose|i guess)\b/gi,
  /\b(that is interesting|that is a good question|that makes me think|i wonder)\b/gi,
  /\b(now that i think about it|come to think of it|on reflection|thinking about it)\b/gi,
  /\b(you know what|here is the thing|the thing is|what i mean is)\b/gi,
];

// Contemplative pauses - places where we naturally pause to think
const CONTEMPLATIVE_PAUSE_PHRASES = [
  /\b(i think|i believe|i feel|i know|i see|i understand|i realize)\b/gi,
  /\b(that is|which means|in other words|to put it another way)\b/gi,
  /\b(remember|think about|consider|imagine|picture this)\b/gi,
];

// Transition phrases that benefit from micro-pauses
const TRANSITION_PHRASES = [
  /\b(but|however|although|though|meanwhile|furthermore|moreover|additionally|also|plus)\b/gi,
  /\b(so|then|now|well|okay|alright|right|see|look|listen)\b/gi,
];

// Phrases that suggest natural breath points
const BREATH_POINTS = [
  /\b(after all|in fact|as a result|for example|that is|which means)\b/gi,
  /\b(i think|i believe|i feel|i know|i see|i understand)\b/gi,
];

// Contrastive patterns (not X, but Y)
const CONTRASTIVE_PATTERNS = [
  /\b(not\s+\w+,\s*but\s+\w+)/gi,
  /\b(rather than|instead of|as opposed to)\b/gi,
];

// Parenthetical indicators
const PARENTHETICAL_PATTERNS = [
  /\([^)]+\)/g,
  /—[^—]+—/g,
  /–[^–]+–/g,
];

// List patterns (detect numbered/bulleted lists)
const LIST_PATTERNS = [
  /\b(\d+[\.\)]\s+[^.!?]+)/g,
  /\b([•·-]\s+[^.!?]+)/g,
];

// Acronym patterns (all caps, 2-5 letters)
const ACRONYM_PATTERN = /\b[A-Z]{2,5}\b/g;

// Number patterns (for slower, clearer pronunciation)
const NUMBER_PATTERNS = [
  /\b\d+[.,]\d+%/g, // Percentages
  /\$\d+[.,]?\d*\s*(million|billion|thousand|k|m|b)?/gi, // Money
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, // Dates
];

// Words that suggest slower, more thoughtful pacing
const SLOW_PACE_KEYWORDS = [
  'think', 'consider', 'remember', 'reflect', 'important', 'crucial',
  'serious', 'difficult', 'challenging', 'loss', 'grief', 'sorry',
  'understand', 'empathy', 'compassion', 'wisdom', 'philosophy',
];

// Words that suggest faster, more enthusiastic pacing
const FAST_PACE_KEYWORDS = [
  'excited', 'great', 'wonderful', 'fantastic', 'yes!', 'exactly',
  'absolutely', 'definitely', 'celebrate', 'success', 'win', 'victory',
];

// Words/phrases that suggest emphasis (louder volume)
const EMPHASIS_KEYWORDS = [
  'important', 'crucial', 'critical', 'must', 'essential', 'vital',
  'never', 'always', 'absolutely', 'definitely', 'this matters',
  'pay attention', 'listen', 'remember this',
];

// Phrases that suggest whispers (softer volume)
const WHISPER_KEYWORDS = [
  'secret', 'confidential', 'just between us', 'let me tell you',
  'i want to share', 'intimate', 'personal', 'private',
];

// Phrases that suggest laughter - expanded for more natural humor
const LAUGHTER_PATTERNS = [
  /you know/i,
  /that is funny/i,
  /ha ha/i,
  /heh/i,
  /chuckle/i,
  /laugh/i,
  /that is great/i,
  /that is wonderful/i,
  /that is amazing/i,
  /good one/i,
  /nice one/i,
  /i love that/i,
  /that reminds me/i,
  /oh boy/i,
  /oh my/i,
  /can you believe/i,
  /imagine that/i,
  /isn't that something/i,
  /that is something/i,
];

// Phrases that naturally invite laughter (warm, positive moments)
const LAUGHTER_INVITATIONS = [
  /\b(great|wonderful|fantastic|amazing|beautiful|perfect)\b/i,
  /\b(i love|i adore|that is|isn't that)\b/i,
  /\b(you know what|here is the thing|let me tell you)\b/i,
];

// Phrases that suggest sighs
const SIGH_PATTERNS = [
  /that is heavy/i,
  /i understand/i,
  /that hurts/i,
  /difficult/i,
  /hard to hear/i,
];

// Disfluency patterns - natural speech repairs and hesitations
const DISFLUENCY_PATTERNS = [
  /\b(i mean|actually|or rather|wait|hold on|let me|i think|i guess)\b/gi,
  /\b(um|uh|er|ah)\b/gi,
];

// Repetition patterns for emphasis
const REPETITION_PATTERNS = [
  /\b(no\s+no\s+no|yes\s+yes|absolutely\s+absolutely|definitely\s+definitely)\b/gi,
  /\b(never\s+never|always\s+always)\b/gi,
];

// Sarcasm indicators
const SARCASTIC_PATTERNS = [
  /\b(sure|obviously|of course|clearly|right|as if)\b/gi,
  /\b(what a surprise|how unexpected|imagine that)\b/gi,
  /\b(that is great|wonderful|fantastic)\b/gi, // When context suggests sarcasm
];

interface TaggingContext {
  emotion?: string;
  baseSpeed: number;
  baseVolume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
  hasLaughter: boolean;
  hasSigh: boolean;
  sentenceCount: number;
  avgSentenceLength: number;
}

/**
 * Detect emotion from text with more nuanced analysis
 */
function detectEmotion(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Check for emotion keywords (longer phrases first for specificity)
  const sortedKeywords = Object.entries(EMOTION_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [phrase, emotion] of sortedKeywords) {
    if (lowerText.includes(phrase)) {
      return emotion;
    }
  }
  
  // Default to affectionate for Bogle's warm personality
  return 'affectionate';
}

/**
 * Detect pacing with more sophisticated analysis
 * John speaks like a wise, seasoned grandfather - SLOW and deliberate
 */
function detectPacing(text: string): { speed: number; reason: string } {
  const lowerText = text.toLowerCase();
  
  // Check for slow pace indicators
  const slowMatches = SLOW_PACE_KEYWORDS.filter(kw => lowerText.includes(kw)).length;
  const fastMatches = FAST_PACE_KEYWORDS.filter(kw => lowerText.includes(kw)).length;
  
  // Check punctuation
  const hasQuestion = text.includes('?');
  const hasExclamation = text.includes('!');
  const hasEllipsis = text.includes('...') || text.includes('…');
  
  // Check sentence length (shorter = faster, longer = slower)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgSentenceLength = sentences.length > 0
    ? sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length
    : text.length;
  
  // Check for complex structures (clauses, lists)
  const hasComplexStructure = /(,|;|:|—|–)/.test(text);
  const clauseCount = (text.match(/,/g) || []).length;
  
  // Add randomness for natural pacing variation (±5%)
  const variation = 0.95 + (Math.random() * 0.10); // 0.95 to 1.05
  
  // Jack speaks deliberately but not TOO slow - warm grandfather, not sleepy
  // Cartesia speed range: 0.6 - 1.5 (we stay in the 0.68-0.85 range)
  
  if (hasEllipsis || slowMatches > fastMatches + 1) {
    return { speed: 0.68 * variation, reason: 'thoughtful' }; // Contemplative
  }
  
  if (hasExclamation && fastMatches > 0) {
    return { speed: 0.85 * variation, reason: 'enthusiastic' }; // Warm energy
  }
  
  if (hasQuestion) {
    return { speed: 0.78 * variation, reason: 'inquisitive' }; // Curious
  }
  
  if (avgSentenceLength > 120 || clauseCount > 3) {
    return { speed: 0.72 * variation, reason: 'complex' }; // Complex thoughts
  }
  
  if (hasComplexStructure && clauseCount > 1) {
    return { speed: 0.78 * variation, reason: 'structured' }; // Deliberate
  }
  
  // Default: Jack's warm, unhurried but not sluggish pace
  return { speed: 0.80 * variation, reason: 'conversational' };
}

/**
 * Detect volume with more nuanced analysis
 */
function detectVolume(text: string): { volume: number; hasEmphasis: boolean; hasWhisper: boolean } {
  const lowerText = text.toLowerCase();
  
  const hasEmphasis = EMPHASIS_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasWhisper = WHISPER_KEYWORDS.some(kw => lowerText.includes(kw));
  
  // Check for all caps (emphasis)
  const hasAllCaps = /[A-Z]{3,}/.test(text);
  
  // Check for contrastive patterns (often need emphasis)
  const hasContrast = CONTRASTIVE_PATTERNS.some(pattern => pattern.test(text));
  
  if (hasWhisper) {
    return { volume: 0.68, hasEmphasis: false, hasWhisper: true };
  }
  
  if (hasEmphasis || hasAllCaps || hasContrast) {
    return { volume: 1.18, hasEmphasis: true, hasWhisper: false };
  }
  
  return { volume: 1.0, hasEmphasis: false, hasWhisper: false };
}

/**
 * Detect vocal cues with enhanced laughter detection
 */
function detectVocalCues(text: string): { hasLaughter: boolean; hasSigh: boolean; laughterCount: number } {
  const hasLaughter = LAUGHTER_PATTERNS.some(pattern => pattern.test(text));
  const hasSigh = SIGH_PATTERNS.some(pattern => pattern.test(text));
  
  // Count laughter opportunities for more natural distribution
  const laughterCount = LAUGHTER_PATTERNS.reduce((count, pattern) => {
    const matches = text.match(pattern);
    return count + (matches ? matches.length : 0);
  }, 0);
  
  return { hasLaughter, hasSigh, laughterCount };
}

/**
 * Add thinking sounds and reflection at natural transition points
 */
function addThinkingSounds(text: string): string {
  let result = text;
  
  // Add "well" or "hmm" before contrastive transitions
  result = result.replace(/\b(but|however|although)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 20), offset);
    // Don't add if there's already a thinking sound nearby
    if (!/\b(well|hmm|ah|oh|um|uh)\b/i.test(before)) {
      return `well<break time="150ms"/>${match}`;
    }
    return match;
  });
  
  // Add reflection sounds before contemplative phrases
  REFLECTION_PHRASES.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 15), offset);
      // Don't duplicate if already present
      if (!/\b(well|hmm|ah|oh|um|uh|you know|i mean)\b/i.test(before)) {
        // Add a thinking sound before reflection phrases
        if (/\b(let me think|let me see|i wonder|that makes me think)\b/i.test(match)) {
          return `hmm<break time="200ms"/>${match}`;
        }
        return match;
      }
      return match;
    });
  });
  
  // Add natural hesitations before important statements with longer pauses
  result = result.replace(/\b(i think|i believe|i feel|i know|i see|i understand|i realize)\b/gi, (match) => {
    return `<break time="120ms"/>${match}<break time="150ms"/>`;
  });
  
  // Add "you know" or "I mean" before clarifications (natural speech patterns)
  result = result.replace(/\b(that is|which means|in other words|to put it another way)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 20), offset);
    if (!/\b(you know|i mean)\b/i.test(before)) {
      return `you know<break time="100ms"/>${match}`;
    }
    return match;
  });
  
  // Add contemplative pauses before deep thoughts
  CONTEMPLATIVE_PAUSE_PHRASES.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      return `<break time="180ms"/>${match}<break time="200ms"/>`;
    });
  });
  
  return result;
}

/**
 * Add natural pauses with variable timing based on context - enhanced for reflection
 */
function addNaturalPauses(text: string, baseSpeed: number): string {
  let result = text;
  
  // Variable pause after commas based on context (120-300ms)
  // Longer pause if followed by a clause or complex phrase, or for reflection
  result = result.replace(/,(\s+)/g, (match, space, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 40);
    const before = result.substring(Math.max(0, offset - 30), offset);
    const isComplex = /\b(which|that|who|when|where|because|since|although|while)\b/i.test(after);
    const isReflective = /\b(think|consider|remember|reflect|wonder|imagine)\b/i.test(before + after);
    const pauseTime = isReflective ? '280ms' : isComplex ? '220ms' : '140ms';
    return `,<break time="${pauseTime}"/>${space}`;
  });
  
  // Pauses after semicolons (280-400ms) - longer for reflection
  result = result.replace(/;(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    const isReflective = /\b(think|consider|remember|reflect)\b/i.test(before);
    const pauseTime = isReflective ? '380ms' : '300ms';
    return `;<break time="${pauseTime}"/>${space}`;
  });
  
  // Variable pauses after periods based on sentence importance and reflection (350-800ms)
  result = result.replace(/\.(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 50), offset);
    const isImportant = /\b(important|crucial|remember|listen|think|know|understand)\b/i.test(before);
    const isReflective = /\b(think|consider|remember|reflect|wonder|imagine|realize)\b/i.test(before);
    const isQuestion = /\?/.test(before);
    
    let pauseTime = '400ms';
    if (isReflective) {
      pauseTime = '650ms'; // Longer pause for reflection
    } else if (isImportant) {
      pauseTime = '580ms';
    } else if (isQuestion) {
      pauseTime = '450ms';
    }
    
    return `.<break time="${pauseTime}"/>${space}`;
  });
  
  // Longer pauses after questions (600-900ms) - gives time for response and reflection
  result = result.replace(/\?(\s+)/g, (match, space, offset) => {
    const before = result.substring(Math.max(0, offset - 40), offset);
    const isDeepQuestion = /\b(think|consider|wonder|imagine|reflect|understand)\b/i.test(before);
    const pauseTime = isDeepQuestion ? '850ms' : '650ms';
    return `?<break time="${pauseTime}"/>${space}`;
  });
  
  // Pauses after exclamation marks (300-450ms)
  result = result.replace(/!(\s+)/g, (match, space) => {
    return `!<break time="350ms"/>${space}`;
  });
  
  // Add micro-pauses before thinking sounds and transitions (enhanced)
  // IMPORTANT: Exclude matches inside protected financial pronunciation markers
  result = result.replace(/\b(well|you know|i mean|actually|hmm|ah|oh|um|uh)\b/gi, (match, word, offset) => {
    // Check if we're inside a protected region (between FINANCIAL_START and FINANCIAL_END)
    const before = result.substring(0, offset);
    const startCount = (before.match(new RegExp(FINANCIAL_START, 'g')) || []).length;
    const endCount = (before.match(new RegExp(FINANCIAL_END, 'g')) || []).length;
    if (startCount > endCount) {
      // We're inside a protected region, don't modify
      return match;
    }
    return `<break time="100ms"/>${match}`;
  });
  
  // Add longer contemplative pauses before reflection phrases
  REFLECTION_PHRASES.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/>${match}<break time="200ms"/>`;
    });
  });
  
  // Add breath pauses before important phrases (longer for reflection)
  BREATH_POINTS.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      const isReflective = /\b(think|consider|reflect|wonder)\b/i.test(before + match);
      const pauseTime = isReflective ? '250ms' : '200ms';
      return `<break time="${pauseTime}"/>${match}`;
    });
  });
  
  // Add pauses after transition phrases (longer for thoughtful transitions)
  TRANSITION_PHRASES.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const after = result.substring(offset + match.length, offset + match.length + 30);
      const isReflective = /\b(think|consider|remember|reflect)\b/i.test(after);
      const pauseTime = isReflective ? '220ms' : '170ms';
      return `${match}<break time="${pauseTime}"/>`;
    });
  });
  
  // Add longer pauses before "remember", "think about", "consider" - natural reflection points
  result = result.replace(/\b(remember|think about|consider|reflect on|imagine|picture)\b/gi, (match) => {
    return `<break time="300ms"/>${match}<break time="200ms"/>`;
  });
  
  // Add pause before long sentences (natural breathing simulation)
  result = result.replace(/^([A-Z][^.!?]{80,}[.!?])/gm, (match) => {
    return `<break time="250ms"/>${match}`;
  });
  
  return result;
}

/**
 * Add speed variations within sentences for natural rhythm
 */
function addSpeedVariations(text: string, baseSpeed: number): string {
  let result = text;
  
  // Slow down for emphasis phrases (more nuanced)
  const emphasisPhrases = [
    { pattern: /\b(this is important|remember this|pay attention|listen carefully)\b/gi, speed: baseSpeed * 0.82 },
    { pattern: /\b(i want you to|think about|consider this)\b/gi, speed: baseSpeed * 0.85 },
    { pattern: /\b(here is the thing|the truth is|let me tell you)\b/gi, speed: baseSpeed * 0.88 },
  ];
  
  for (const { pattern, speed } of emphasisPhrases) {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${speed.toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
    });
  }
  
  // Enhanced sentence-final lengthening - slow down last 2-3 words of important statements
  result = result.replace(/(\w+\s+\w+\s+\w+)([.!?])(\s+)/g, (match, lastWords, punct, space, offset) => {
    const before = result.substring(Math.max(0, offset - 80), offset);
    const isImportant = /\b(important|remember|know|understand|matters|crucial|vital)\b/i.test(before + lastWords);
    const isReflective = /\b(think|consider|reflect|wonder|realize)\b/i.test(before + lastWords);
    
    if (isImportant || isReflective) {
      // Slow down the last few words for emphasis
      const words = lastWords.trim().split(/\s+/);
      if (words.length >= 2) {
        const lastTwoWords = words.slice(-2).join(' ');
        const beforeLastTwo = words.slice(0, -2).join(' ');
        const speedRatio = isReflective ? 0.88 : 0.90;
        return `${beforeLastTwo ? beforeLastTwo + ' ' : ''}<speed ratio="${(baseSpeed * speedRatio).toFixed(2)}"/>${lastTwoWords}<break time="100ms"/>${punct}<speed ratio="${baseSpeed.toFixed(2)}"/><break time="450ms"/>${space}`;
      }
    }
    return match;
  });
  
  // Fallback for shorter sentences
  result = result.replace(/([.!?])(\s+)/g, (match, punct, space, offset) => {
    const before = result.substring(Math.max(0, offset - 50), offset);
    const isImportant = /\b(important|remember|know|understand|matters)\b/i.test(before);
    if (isImportant && punct === '.') {
      return `<speed ratio="${(baseSpeed * 0.92).toFixed(2)}"/>${punct}<speed ratio="${baseSpeed.toFixed(2)}"/><break time="450ms"/>${space}`;
    }
    return match;
  });
  
  // Enhanced list intonation - rising pitch on items, falling on final item
  const listMatches: Array<{ match: string; index: number; isLast: boolean }> = [];
  let listIndex = 0;
  
  result = result.replace(/(\d+[\.\)]\s+[^.!?]+)/g, (match, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 50);
    const isLast = !/(\d+[\.\)]\s+)/.test(after);
    listMatches.push({ match, index: listIndex++, isLast });
    return `__LIST_${listMatches.length - 1}__`;
  });
  
  // Replace list items with proper intonation
  listMatches.forEach(({ match, isLast }, idx) => {
    const speedRatio = isLast ? 0.95 : 1.05; // Rising on items, falling on final
    const pauseTime = isLast ? '300ms' : '250ms';
    result = result.replace(`__LIST_${idx}__`, `<speed ratio="${(baseSpeed * speedRatio).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/><break time="${pauseTime}"/>`);
  });
  
  // Handle bulleted lists similarly
  result = result.replace(/([•·-]\s+[^.!?]+)/g, (match, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 50);
    const isLast = !/([•·-]\s+)/.test(after);
    const speedRatio = isLast ? 0.95 : 1.05;
    const pauseTime = isLast ? '300ms' : '250ms';
    return `<speed ratio="${(baseSpeed * speedRatio).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/><break time="${pauseTime}"/>`;
  });
  
  return result;
}

/**
 * Add emotional shifts with smoother transitions
 */
function addEmotionalShifts(text: string, baseEmotion: string): string {
  // SIMPLIFIED: Adding per-word emotion tags causes cascading corruption issues
  // when subsequent functions modify the text. Instead, we rely on the base emotion
  // set at the start of the utterance and sentence-level emotion detection.
  // 
  // The emotion for the entire utterance is already set in the opening tags.
  // Fine-grained emotion shifts within single utterances are not well-supported
  // by TTS and can sound jarring anyway.
  return text;
}

/**
 * Handle parenthetical asides with volume/speed changes
 */
function handleParentheticals(text: string, baseSpeed: number, baseVolume: number): string {
  let result = text;
  
  // Handle parentheses
  result = result.replace(/\(([^)]+)\)/g, (match, content) => {
    return `<volume ratio="${(baseVolume * 0.85).toFixed(2)}"/><speed ratio="${(baseSpeed * 0.95).toFixed(2)}"/>(${content})<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
  });
  
  // Handle em dashes (asides)
  result = result.replace(/—([^—]+)—/g, (match, content) => {
    return `<break time="150ms"/><volume ratio="${(baseVolume * 0.9).toFixed(2)}"/>—${content}—<volume ratio="${baseVolume.toFixed(2)}"/><break time="150ms"/>`;
  });
  
  return result;
}

/**
 * Handle contrastive stress (not X, but Y)
 */
function handleContrastiveStress(text: string, baseSpeed: number, baseVolume: number): string {
  let result = text;
  
  // Emphasize the "but Y" part
  result = result.replace(/\bnot\s+(\w+),\s*but\s+(\w+)/gi, (match, neg, pos) => {
    return `not ${neg}, but <volume ratio="${(baseVolume * 1.15).toFixed(2)}"/><speed ratio="${(baseSpeed * 0.92).toFixed(2)}"/>${pos}<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
  });
  
  // Handle "rather than" patterns
  result = result.replace(/(\w+)\s+rather than\s+(\w+)/gi, (match, preferred, alternative) => {
    return `<volume ratio="${(baseVolume * 1.1).toFixed(2)}"/>${preferred}<volume ratio="${baseVolume.toFixed(2)}"/> rather than ${alternative}`;
  });
  
  return result;
}

/**
 * Handle numbers and dates with slower, clearer pronunciation
 */
function handleNumbers(text: string, baseSpeed: number): string {
  let result = text;
  
  // Slow down percentages
  result = result.replace(/(\d+[.,]\d+%)/g, (match) => {
    return `<speed ratio="${(baseSpeed * 0.92).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });
  
  // Slow down money amounts
  result = result.replace(/(\$\d+[.,]?\d*\s*(?:million|billion|thousand|k|m|b)?)/gi, (match) => {
    return `<speed ratio="${(baseSpeed * 0.90).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });
  
  // Slow down dates
  result = result.replace(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g, (match) => {
    return `<speed ratio="${(baseSpeed * 0.93).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });
  
  return result;
}

/**
 * Handle acronyms with spell tag for clarity
 */
function handleAcronyms(text: string): string {
  let result = text;

  // Detect and spell out acronyms (but not common words like "I", "A", "IT")
  const commonWords = /\b(I|A|IT|AM|IS|ARE|THE|AND|OR|BUT|TO|OF|IN|ON|AT|BY|FOR|WITH|FROM)\b/;

  result = result.replace(ACRONYM_PATTERN, (match, offset) => {
    // Skip if it's a common word or already in SSML
    if (commonWords.test(match) || match.length < 2) {
      return match;
    }

    // Check if already inside spell tags
    const before = result.substring(Math.max(0, offset - 20), offset);
    const after = result.substring(offset + match.length, offset + match.length + 20);
    if (/<spell>/i.test(before) && /<\/spell>/i.test(after)) {
      return match;
    }

    // Spell out acronyms for clarity
    return `<spell>${match.split('').join(' ')}</spell>`;
  });

  return result;
}

/**
 * Main tagging function with enhanced natural speech patterns
 */
/**
 * Clamp values to Cartesia's valid ranges
 * Speed: 0.6-1.5, Volume: 0.5-2.0
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */
function clampSpeed(speed: number): number {
  return Math.max(0.6, Math.min(1.5, speed));
}

function clampVolume(volume: number): number {
  return Math.max(0.5, Math.min(2.0, volume));
}

/**
 * Generate safe SSML speed tag with clamped value
 */
function speedTag(ratio: number): string {
  return `<speed ratio="${clampSpeed(ratio).toFixed(2)}"/>`;
}

/**
 * Generate safe SSML volume tag with clamped value
 */
function volumeTag(ratio: number): string {
  return `<volume ratio="${clampVolume(ratio).toFixed(2)}"/>`;
}

/**
 * Generate SSML break tag with time
 * @param time - Time in ms or s (e.g., "500ms" or "1s")
 */
function breakTag(time: string): string {
  return `<break time="${time}"/>`;
}

/**
 * Generate SSML emotion tag
 * Supported: angry, sad, surprised, curious, affectionate
 */
function emotionTag(emotion: string): string {
  return `<emotion value="${emotion}"/>`;
}

/**
 * Generate SSML spell tag for letter-by-letter pronunciation
 */
function spellTag(text: string): string {
  return `<spell>${text}</spell>`;
}

/**
 * Main SSML tagging function
 * Applies full Cartesia Sonic-3 SSML support with financial pronunciations
 */
export function tagTextWithSsml(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }
  
  // If already has SSML tags, return as-is
  if (text.includes('<')) {
    return text;
  }
  
  // STEP 0: Apply financial pronunciation dictionary FIRST
  // This ensures 401K becomes "four oh one K" before any other processing
  let processedText = applyFinancialPronunciations(text);
  
  // Analyze text (after pronunciation fixes)
  const emotion = detectEmotion(processedText);
  const { speed: rawSpeed, reason } = detectPacing(processedText);
  const { volume: rawVolume, hasEmphasis, hasWhisper } = detectVolume(processedText);
  const { hasLaughter, hasSigh, laughterCount } = detectVocalCues(processedText);
  
  // Clamp values to Cartesia's valid ranges
  const speed = clampSpeed(rawSpeed);
  const volume = clampVolume(rawVolume);
  
  // Build opening tags with clamped values
  let tagged = `<speed ratio="${speed.toFixed(2)}"/><volume ratio="${volume.toFixed(2)}"/>`;
  
  if (emotion) {
    tagged += `<emotion value="${emotion}"/>`;
  }
  
  // Add pauses at the start for emotional moments (replaces invalid vocal cues)
  if (hasSigh) {
    // Longer pause with softer volume for "sigh" effect
    tagged += '<volume ratio="0.85"/><break time="400ms"/><volume ratio="1.0"/>';
  }
  
  // Add warmth at start if positive emotion detected
  if (hasLaughter || (emotion === 'affectionate' && laughterCount > 0)) {
    // Slight uptick in emotion for warm start
    tagged += '<break time="200ms"/>';
  }
  
  // Process text through multiple enhancement layers
  // Note: processedText already has financial pronunciations applied, but has NO SSML tags yet
  //
  // PRODUCTION-QUALITY FIX:
  // Each transformation function now checks context to avoid double-tagging.
  // Functions that add <spell> tags check if text is already inside <spell> tags.
  // This prevents the cascading malformation bug.

  // Apply CURATED transformation pipeline
  // Re-enabled key Jack personality functions that add warmth and character.
  // Functions are applied in a specific order to minimize conflicts.
  // The protection marker system prevents corruption of financial pronunciations.

  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 1: CORE NATURAL SPEECH (Always safe)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addThinkingSounds(processedText);           // "hmm", "well", contemplative
  processedText = addNaturalPauses(processedText, speed);     // Commas, periods, breath points
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 2: JACK'S SIGNATURE PERSONALITY (Phrase-specific, no conflicts)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addCatchphraseEmphasis(processedText, emotion);     // "Stay the course"
  processedText = addHistoricalYearGravity(processedText);            // 1974, 1975, 2008
  processedText = addWisdomCadence(processedText, emotion);           // Life lessons
  processedText = addStorytellingMode(processedText, emotion);        // "I remember..."
  processedText = addHumbleDeflection(processedText, emotion);        // Modest responses
  processedText = addTricolonCadence(processedText, speed);           // "Goals, balance, cost"
  processedText = addQuotationVoiceShift(processedText, emotion);     // When quoting others
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 3: WARMTH & EMOTION (Re-enabled with caution)
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addNameWarmth(processedText, emotion);              // Warm when saying names
  processedText = addActiveListeningSounds(processedText, emotion);   // "mmhmm", "I see"
  processedText = addLaughterThroughout(processedText, emotion, laughterCount); // Gentle warmth
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIER 4: ELDERLY CHARACTER (Age-appropriate hesitations)  
  // ═══════════════════════════════════════════════════════════════════════════
  processedText = addWordFindingPauses(processedText, emotion);       // "what's the word..."
  processedText = addSelfCorrections(processedText, emotion);         // Rephrasing thoughts
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DISABLED: These cause cascading issues when text has SSML already
  // Can be re-enabled once we move to segment-based transformation
  // ═══════════════════════════════════════════════════════════════════════════
  // processedText = handleNumbers(processedText, speed);           // Conflicts with breaks
  // processedText = handleAcronyms(processedText);                 // Already handled by financial
  // processedText = handleParentheticals(processedText, speed, volume);
  // processedText = handleContrastiveStress(processedText, speed, volume);
  // processedText = addSpeedVariations(processedText, speed);      // Too aggressive
  // processedText = addEmotionalShifts(processedText, emotion);    // Causes tag nesting
  // processedText = addQuestionIntonation(processedText, speed);   // Conflicts
  // processedText = addConversationalMarkers(processedText, emotion);
  // processedText = addTopicTransitions(processedText);
  // processedText = addDisfluencies(processedText, emotion);
  // processedText = addRepetitionForEmphasis(processedText, emotion);
  // processedText = handleSarcasm(processedText, emotion);
  // processedText = addEmphasisCombinations(processedText, speed, volume);
  // processedText = addProsodyVariations(processedText, speed, volume, emotion);
  // processedText = addNaturalBreathing(processedText);            // Random, less predictable
  // processedText = addTrailingOff(processedText, emotion);
  // processedText = addThroatClearing(processedText, emotion);

  // CRITICAL: Remove protection markers around financial pronunciations
  processedText = removeProtectionMarkers(processedText);

  // CRITICAL: Sanitize malformed SSML before returning
  processedText = sanitizeSsml(processedText);

  tagged += processedText;
  
  return tagged;
}

/**
 * Sanitize malformed SSML output
 * Fixes corrupted tags where content was inserted into attribute values
 *
 * IMPORTANT: Use non-greedy quantifiers (*?) to avoid eating too much text.
 * The malformed tags look like: <break time="140ms<speed ratio="0.8"/>"/>
 */
function sanitizeSsml(text: string): string {
  let result = text;

  // ================================================
  // FIRST: Remove stage directions that LLM might generate
  // These are NOT SSML - they're text that should NOT be spoken
  // ================================================
  
  // Remove parenthetical actions: (sighs), (deep breath), (pauses), (laughs)
  result = result.replace(/\([^)]*(?:sigh|breath|pause|laugh|chuckle|smile|nod|think|clear|cough)[^)]*\)/gi, '');
  
  // Remove bracketed actions: [sighs], [thinking], [pauses]
  result = result.replace(/\[[^\]]*(?:sigh|breath|pause|laugh|chuckle|smile|nod|think|clear|cough)[^\]]*\]/gi, '');
  
  // Remove asterisk actions: *sighs*, *takes a breath*, *chuckles*
  result = result.replace(/\*[^*]*(?:sigh|breath|pause|laugh|chuckle|smile|nod|think|clear|cough)[^*]*\*/gi, '');
  
  // Remove common standalone stage directions
  result = result.replace(/\b(deep breath|long pause|brief pause|sighs heavily|clears throat)\b/gi, '');

  // ================================================
  // THEN: Fix malformed SSML tags
  // ================================================
  
  // Strategy: Find tags where the attribute value contains a < or >
  // These are definitely malformed. Use non-greedy matching.

  // Fix malformed break tags - the most common corruption
  // Match: <break time="anything_with_<_in_it"/>
  // Use [\s\S]*? for minimal matching that can cross lines
  result = result.replace(/<break\s+time="[^"<]*<[^"]*"\/>/g, '<break time="100ms"/>');

  // Fix malformed speed tags
  result = result.replace(/<speed\s+ratio="[^"<]*<[^"]*"\/>/g, '');

  // Fix malformed volume tags
  result = result.replace(/<volume\s+ratio="[^"<]*<[^"]*"\/>/g, '');

  // Fix malformed emotion tags
  result = result.replace(/<emotion\s+value="[^"<]*<[^"]*"\/>/g, '');

  // Clean up orphaned tag remnants (standalone '/>' not preceded by a quote)
  // Don't remove valid tag closings like '"/>
  result = result.replace(/(?<!")\s*\/>/g, '');

  // Clean up doubled-up tags that result from removals
  result = result.replace(/(<\w+[^>]*\/>)\1+/g, '$1');

  // Clean up excessive breaks
  result = result.replace(/(<break time="[^"]*"\/>){3,}/g, '<break time="200ms"/>');

  // Clean up multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  return result;
}

/**
 * Add natural breathing pauses throughout speech
 * Humans breathe! This makes Jack feel alive.
 * Uses <break> tags for natural pauses (valid Cartesia SSML)
 */
function addNaturalBreathing(text: string): string {
  let result = text;
  
  // Add pause before long sentences (>60 chars) - simulates breath
  result = result.replace(/([.!?]\s+)([A-Z][^.!?]{60,})/g, (match, punct, sentence) => {
    // 40% chance to add pause before long sentence
    if (Math.random() < 0.4) {
      return `${punct}<break time="250ms"/>${sentence}`;
    }
    return match;
  });
  
  // Add brief pauses after commas in long clauses (occasionally)
  result = result.replace(/,(\s+)([^,]{40,}?,)/g, (match, space, clause) => {
    // 25% chance
    if (Math.random() < 0.25) {
      return `,<break time="150ms"/>${space}${clause}`;
    }
    return match;
  });
  
  // Add pause before "well", "you know", "now" (natural pause points)
  result = result.replace(/\b(well|you know|now|look|listen)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    // Don't double up on breaks
    if (!/<break/i.test(before) && Math.random() < 0.35) {
      return `<break time="180ms"/>${match}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add self-corrections to make Jack sound like he's thinking out loud
 * Real people rephrase themselves!
 */
function addSelfCorrections(text: string, emotion: string): string {
  let result = text;
  
  // Don't add self-corrections if sad (too serious) or very short text
  if (emotion === 'sad' || text.length < 100) {
    return result;
  }
  
  // Occasionally add "I mean" or "well, actually" before clarifications
  const clarificationPatterns = [
    /\b(that is to say|in other words|what I mean is|to put it simply)\b/gi,
  ];
  
  clarificationPatterns.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      // 20% chance to add self-correction
      if (Math.random() < 0.2) {
        const corrections = [
          'well, actually—',
          'no, wait—',
          'hmm, let me rephrase—',
          "I mean—",
        ];
        const correction = corrections[Math.floor(Math.random() * corrections.length)];
        return `${correction}<break time="200ms"/>${match}`;
      }
      return match;
    });
  });
  
  // Add pause before corrections/contradictions
  result = result.replace(/\b(but actually|however|on second thought)\b/gi, (match) => {
    if (Math.random() < 0.25) {
      return `<break time="200ms"/>hmm—${match}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add trailing off for incomplete thoughts
 * Sometimes Jack doesn't finish a thought... and that's human
 */
function addTrailingOff(text: string, emotion: string): string {
  let result = text;
  
  // Only trail off occasionally and in appropriate contexts
  if (emotion === 'angry' || text.length < 80) {
    return result;
  }
  
  // Add trailing off after certain phrases
  const trailOffTriggers = [
    /\b(you know how it is|but anyway|that's life|such is life|well)\b([.!])/gi,
    /\b(i remember when|back in my day|years ago)\b/gi,
  ];
  
  trailOffTriggers.forEach(pattern => {
    result = result.replace(pattern, (match, phrase, punct) => {
      // 15% chance to trail off
      if (Math.random() < 0.15) {
        return `${phrase}...<break time="600ms"/>`;
      }
      return match;
    });
  });
  
  // Sometimes trail off before transitioning to new topic
  result = result.replace(/([.!?]\s+)(Anyway|But|So|Now)/g, (match, punct, transition) => {
    if (Math.random() < 0.12) {
      return `...<break time="500ms"/>${transition}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add pause before important points
 * Jack pauses before saying something significant (using valid Cartesia SSML)
 */
function addThroatClearing(text: string, emotion: string): string {
  let result = text;
  
  // Only for serious/important contexts
  if (emotion === 'sad') {
    return result;
  }
  
  // Add deliberate pause before important statements
  const importantMarkers = [
    /\b(here is the truth|the reality is|listen carefully|this is important|let me be clear)\b/gi,
    /\b(i want you to understand|remember this|never forget)\b/gi,
  ];
  
  importantMarkers.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      // 30% chance to add pause before important statement
      if (Math.random() < 0.3) {
        return `<break time="350ms"/>${match}`;
      }
      return match;
    });
  });
  
  return result;
}

/**
 * Add warmth/lift throughout the text at natural moments
 * Uses valid Cartesia SSML (emotion tags, pauses) instead of invalid [laughter]
 */
function addLaughterThroughout(text: string, emotion: string, laughterCount: number): string {
  let result = text;
  
  // Don't add warmth if sad/angry emotion
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }
  
  // Add warm pause after positive statements (but not too frequently)
  const positiveEndings = [
    /\b(that is great|that is wonderful|that is amazing|that is fantastic|i love that)\b/gi,
    /\b(isn't that something|can you believe|imagine that)\b/gi,
  ];
  
  positiveEndings.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      // Add warm pause after positive statements (30% chance to avoid overuse)
      if (Math.random() < 0.3) {
        return `${match}<break time="200ms"/>`;
      }
      return match;
    });
  });
  
  // Add slight pause after "you know" in warm contexts
  if (emotion === 'affectionate' && laughterCount === 0) {
    result = result.replace(/\byou know\b/gi, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      const after = result.substring(offset + match.length, offset + match.length + 30);
      // Add warm pause after "you know" if it's in a positive context (20% chance)
      if (/\b(great|wonderful|amazing|love|proud|care)\b/i.test(before + after) &&
          Math.random() < 0.2) {
        return `${match}<break time="180ms"/>`;
      }
      return match;
    });
  }
  
  return result;
}

/**
 * Add question intonation patterns - different handling for question types
 */
function addQuestionIntonation(text: string, baseSpeed: number): string {
  let result = text;
  
  // Rhetorical questions - slower, more contemplative
  const rhetoricalPatterns = [
    /\b(isn't that|don't you think|wouldn't you|doesn't it|can't you)\b/gi,
    /\b(how could|why would|what else)\b/gi,
  ];
  
  rhetoricalPatterns.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      return `<speed ratio="${(baseSpeed * 0.88).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
    });
  });
  
  // Real questions - faster, more curious
  result = result.replace(/\b(what|how|why|when|where|who|tell me|help me|can you|will you)\b/gi, (match, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 30);
    if (/\?/.test(after)) {
      return `<speed ratio="${(baseSpeed * 1.03).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
    }
    return match;
  });
  
  // Tag questions ("right?", "isn't it?") - softer, checking tone
  result = result.replace(/\b(right|isn't it|don't you|won't you|can't you)\s*\?/gi, (match) => {
    return `<volume ratio="0.92"/><speed ratio="${(baseSpeed * 0.95).toFixed(2)}"/>${match}<volume ratio="1.0"/><speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });
  
  return result;
}

/**
 * Add conversational markers for natural speech
 */
function addConversationalMarkers(text: string, emotion: string): string {
  let result = text;
  
  // Add "right?" at end of statements seeking agreement (affectionate/curious contexts)
  if (emotion === 'affectionate' || emotion === 'curious') {
    result = result.replace(/([^.!?])(\.)(\s+)([A-Z])/g, (match, before, punct, space, next, offset) => {
      const context = result.substring(Math.max(0, offset - 40), offset);
      const seeksAgreement = /\b(think|believe|feel|know|see|understand|agree)\b/i.test(context);
      
      if (seeksAgreement && Math.random() < 0.15) { // 15% chance to avoid overuse
        return `${before}, right?${space}${next}`;
      }
      return match;
    });
  }
  
  // Add "you know?" for checking understanding
  result = result.replace(/\b(understand|see|get it|follow)\b/gi, (match, offset) => {
    const after = result.substring(offset + match.length, offset + match.length + 20);
    if (!/\?/.test(after) && Math.random() < 0.1) { // 10% chance
      return `${match}, you know?`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add topic transition pauses - longer pauses when changing topics
 */
function addTopicTransitions(text: string): string {
  let result = text;
  
  // Topic shift markers
  const topicMarkers = [
    /\b(now|speaking of|by the way|on another note|changing gears|let me shift|moving on)\b/gi,
    /\b(also|additionally|furthermore|moreover|in addition)\b/gi,
  ];
  
  topicMarkers.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 10), offset);
      // Add longer pause before topic shifts
      if (!/<break time="[5-9]\d{2}ms"/.test(before)) {
        return `<break time="650ms"/>${match}`;
      }
      return match;
    });
  });
  
  // Detect new subject nouns (heuristic: capitalized words after periods)
  result = result.replace(/\.(\s+)([A-Z][a-z]+)/g, (match, space, nextWord, offset) => {
    const before = result.substring(Math.max(0, offset - 60), offset);
    const isNewTopic = !/\b(the|a|an|this|that|it|he|she|they|we|you)\b/i.test(before);
    
    if (isNewTopic && nextWord.length > 4) {
      return `.<break time="600ms"/>${space}${nextWord}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add disfluencies and self-corrections for natural speech
 */
function addDisfluencies(text: string, emotion: string): string {
  let result = text;
  
  // Don't add disfluencies in sad/angry contexts (too casual)
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }
  
  // Add "um" or "uh" before self-corrections (10% chance to avoid overuse)
  result = result.replace(/\b(actually|or rather|wait|hold on|let me)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 20), offset);
    // Don't add if already has disfluency nearby
    if (!/\b(um|uh|er|ah)\b/i.test(before) && Math.random() < 0.1) {
      const disfluency = Math.random() < 0.5 ? 'um' : 'uh';
      return `${disfluency}<break time="120ms"/>${match}`;
    }
    return match;
  });
  
  // Add "I-I-I mean" pattern for strong emphasis (5% chance)
  result = result.replace(/\b(i mean)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    const isEmphatic = /\b(important|crucial|remember|listen|think)\b/i.test(before);
    if (isEmphatic && Math.random() < 0.05) {
      return `I-I-I mean`;
    }
    return match;
  });
  
  // Add natural false starts before corrections
  result = result.replace(/\b(or rather|actually|wait|hold on)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 50), offset);
    // Check if there's a sentence break before (suggesting false start)
    if (/[.!?]\s+[A-Z]/.test(before) && Math.random() < 0.08) {
      const falseStart = before.match(/\b(\w+)\s*$/);
      if (falseStart && falseStart[1].length > 3) {
        return `${falseStart[1]}—<break time="150ms"/>${match}`;
      }
    }
    return match;
  });
  
  return result;
}

/**
 * Add repetition for emphasis (natural speech pattern)
 */
function addRepetitionForEmphasis(text: string, emotion: string): string {
  let result = text;
  
  // Strong disagreement patterns
  result = result.replace(/\b(no|never|absolutely not|definitely not)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    const after = result.substring(offset + match.length, offset + match.length + 30);
    const isEmphatic = /\b(important|crucial|wrong|unacceptable|should not|will not)\b/i.test(before + after);
    
    if (isEmphatic && match.toLowerCase() === 'no' && Math.random() < 0.12) {
      return `no, no, no`;
    }
    if (isEmphatic && match.toLowerCase() === 'never' && Math.random() < 0.10) {
      return `never, never`;
    }
    return match;
  });
  
  // Strong agreement patterns
  result = result.replace(/\b(yes|absolutely|definitely|exactly)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 30), offset);
    const after = result.substring(offset + match.length, offset + match.length + 30);
    const isEmphatic = /\b(right|correct|exactly|perfect|great|wonderful)\b/i.test(before + after);
    
    if (isEmphatic && match.toLowerCase() === 'yes' && Math.random() < 0.10) {
      return `yes, yes`;
    }
    if (isEmphatic && (match.toLowerCase() === 'absolutely' || match.toLowerCase() === 'definitely') && Math.random() < 0.08) {
      return `${match}, ${match}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Detect and handle sarcasm with tone shifts
 */
function handleSarcasm(text: string, emotion: string): string {
  let result = text;
  
  // Detect sarcastic patterns
  const sarcasmIndicators = [
    /\b(sure|obviously|of course|clearly)\b/gi,
    /\b(what a surprise|how unexpected|imagine that)\b/gi,
  ];
  
  let hasSarcasm = false;
  sarcasmIndicators.forEach(pattern => {
    if (pattern.test(text)) {
      // Check context - sarcasm often appears with negative sentiment
      const hasNegativeContext = /\b(but|however|unfortunately|sadly|wrong|bad|terrible)\b/i.test(text);
      if (hasNegativeContext) {
        hasSarcasm = true;
      }
    }
  });
  
  if (hasSarcasm) {
    // Apply ironic tone shifts
    result = result.replace(/\b(sure|obviously|of course|clearly|what a surprise|how unexpected)\b/gi, (match) => {
      return `<emotion value="surprised"/><speed ratio="0.92"/><volume ratio="0.95"/>${match}<emotion value="${emotion}"/><speed ratio="1.0"/><volume ratio="1.0"/>`;
    });
  }
  
  // Detect sarcastic positive statements in negative contexts
  result = result.replace(/\b(that is great|wonderful|fantastic|perfect)\b/gi, (match, offset) => {
    const before = result.substring(Math.max(0, offset - 50), offset);
    const hasNegativeContext = /\b(but|however|unfortunately|wrong|bad|terrible|awful|horrible)\b/i.test(before);
    
    if (hasNegativeContext && Math.random() < 0.15) {
      return `<emotion value="surprised"/><speed ratio="0.90"/><volume ratio="0.92"/>${match}<emotion value="${emotion}"/><speed ratio="1.0"/><volume ratio="1.0"/>`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add emphasis combinations - combine speed + volume + spell for maximum impact
 */
function addEmphasisCombinations(text: string, baseSpeed: number, baseVolume: number): string {
  let result = text;
  
  // Find truly important words/phrases (ALL CAPS, key concepts)
  // Note: Quoted phrases are handled separately in addQuotationVoiceShift to avoid conflicts
  const emphasisPatterns = [
    /\b(ENOUGH|NEVER|ALWAYS|IMPORTANT|CRUCIAL|ESSENTIAL|VITAL)\b/g,
    /\b(index fund|low cost|compound|diversify|patience|simplicity)\b/gi, // Bogle key concepts
  ];

  emphasisPatterns.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const isAllCaps = /^[A-Z]{3,}$/.test(match);

      // Check if this match is already inside SSML tags
      const before = result.substring(Math.max(0, offset - 50), offset);
      const after = result.substring(offset + match.length, offset + match.length + 50);

      // Skip if already wrapped in spell tags or other SSML
      if (/<spell>/i.test(before) && /<\/spell>/i.test(after)) {
        return match;
      }

      if (isAllCaps) {
        // Maximum emphasis: slow + loud + spell
        return `<speed ratio="${(baseSpeed * 0.80).toFixed(2)}"/><volume ratio="${(baseVolume * 1.25).toFixed(2)}"/><spell>${match}</spell><speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
      } else {
        // Key concepts: slower + slightly louder
        return `<speed ratio="${(baseSpeed * 0.90).toFixed(2)}"/><volume ratio="${(baseVolume * 1.10).toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
      }
    });
  });
  
  return result;
}

/**
 * Enhanced prosody variations - vary emphasis within sentences dynamically
 */
function addProsodyVariations(text: string, baseSpeed: number, baseVolume: number, emotion: string): string {
  let result = text;
  
  // Vary emphasis on key words within sentences
  const keyWords = [
    /\b(important|crucial|essential|vital|critical|remember|know|understand)\b/gi,
    /\b(never|always|absolutely|definitely|exactly|precisely)\b/gi,
    /\b(index fund|low cost|compound interest|diversification|patience)\b/gi,
  ];
  
  keyWords.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 40), offset);
      const after = result.substring(offset + match.length, offset + match.length + 40);
      
      // Check if already has emphasis tags
      if (/<speed|<volume|<spell/.test(before + after)) {
        return match;
      }
      
      // Apply prosody variation: slightly slower + slightly louder
      const speedVariation = baseSpeed * 0.92;
      const volumeVariation = baseVolume * 1.08;
      
      return `<speed ratio="${speedVariation.toFixed(2)}"/><volume ratio="${volumeVariation.toFixed(2)}"/>${match}<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
    });
  });
  
  // Vary prosody for parenthetical asides (softer, faster)
  result = result.replace(/\(([^)]+)\)/g, (match, content, offset) => {
    const before = result.substring(Math.max(0, offset - 20), offset);
    // Don't double-process if already has tags
    if (/<volume|<speed/.test(before)) {
      return match;
    }
    return `(<speed ratio="${(baseSpeed * 0.95).toFixed(2)}"/><volume ratio="${(baseVolume * 0.88).toFixed(2)}"/>${content}<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>)`;
  });
  
  // Vary prosody for contrastive stress (emphasize the "but Y" part)
  result = result.replace(/\bnot\s+(\w+),\s*but\s+(\w+)\b/gi, (match, neg, pos) => {
    return `not ${neg}, but <speed ratio="${(baseSpeed * 0.90).toFixed(2)}"/><volume ratio="${(baseVolume * 1.12).toFixed(2)}"/>${pos}<speed ratio="${baseSpeed.toFixed(2)}"/><volume ratio="${baseVolume.toFixed(2)}"/>`;
  });
  
  // Vary prosody for lists - rising on items, falling on final
  // (This complements the existing list intonation)
  
  return result;
}

/**
 * Add storytelling mode for reminiscences
 * When Jack is telling a story, the pacing changes - more dramatic, more pauses
 */
function addStorytellingMode(text: string, emotion: string): string {
  let result = text;
  
  // Detect storytelling triggers
  const storyTriggers = [
    /\b(i remember|back in|years ago|when i was|let me tell you|there was a time|one day|once upon)\b/gi,
    /\b(in 1974|in 1975|in 2008|in the crash|during the)\b/gi,
    /\b(my father|at vanguard|at wellington|the board)\b/gi,
  ];
  
  let isStory = false;
  storyTriggers.forEach(pattern => {
    if (pattern.test(text)) {
      isStory = true;
    }
  });
  
  if (isStory) {
    // Slow down story openings with dramatic pause
    result = result.replace(/\b(i remember|back in|years ago|when i was)\b/gi, (match) => {
      return `<speed ratio="0.75"/><break time="300ms"/>${match}<break time="200ms"/><speed ratio="0.82"/>`;
    });
    
    // Add suspense before revelations in stories
    result = result.replace(/\b(and then|suddenly|but then|that's when)\b/gi, (match) => {
      return `<break time="400ms"/><speed ratio="0.78"/>${match}<break time="150ms"/>`;
    });
    
    // Add warmth to nostalgic moments
    result = result.replace(/\b(those were the days|simpler times|i miss|fond memories)\b/gi, (match) => {
      return `<emotion value="affectionate"/><speed ratio="0.75"/>${match}<break time="200ms"/>`;
    });
  }
  
  return result;
}

/**
 * Add active listening sounds
 * Real people say "mmhmm", "I see", "aha" when responding
 */
function addActiveListeningSounds(text: string, emotion: string): string {
  let result = text;
  
  // Don't add in sad/angry contexts
  if (emotion === 'sad' || emotion === 'angry') {
    return result;
  }
  
  // Add "mmhmm" or "I see" before acknowledgments
  const acknowledgmentPatterns = [
    /\b(i understand|that makes sense|i hear you|i get it)\b/gi,
  ];
  
  acknowledgmentPatterns.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 30), offset);
      // Don't add if already has listening sound
      if (!/\b(mmhmm|i see|aha|right|okay)\b/i.test(before) && Math.random() < 0.25) {
        const sounds = ['Mmhmm. ', 'I see. ', 'Aha. ', 'Right. '];
        const sound = sounds[Math.floor(Math.random() * sounds.length)];
        return `${sound}<break time="150ms"/>${match}`;
      }
      return match;
    });
  });
  
  // Add "go on" or "tell me more" after user shares something
  result = result.replace(/\b(that's interesting|tell me about|how did that)\b/gi, (match) => {
    if (Math.random() < 0.15) {
      return `<break time="100ms"/>mmhmm<break time="150ms"/>${match}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add elderly word-finding pauses
 * Occasional "what's the word..." moments make Jack feel real and aged
 */
function addWordFindingPauses(text: string, emotion: string): string {
  let result = text;
  
  // Don't add in urgent/angry contexts
  if (emotion === 'angry') {
    return result;
  }
  
  // Occasionally add word-finding pauses before certain words
  const complexWords = [
    /\b(diversification|rebalancing|compounding|allocation|volatility)\b/gi,
    /\b(sophisticated|fundamental|philosophy|perspective|circumstances)\b/gi,
  ];
  
  complexWords.forEach(pattern => {
    result = result.replace(pattern, (match, offset) => {
      const before = result.substring(Math.max(0, offset - 40), offset);
      // 8% chance - rare but noticeable
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
  
  // Add occasional "now where was I" after long pauses
  result = result.replace(/(<break time="[5-9]\d{2}ms"\/>)(\s*)([A-Z])/g, (match, breakTag, space, letter) => {
    if (Math.random() < 0.05) {
      return `${breakTag}${space}Now, where was I...<break time="200ms"/>${letter}`;
    }
    return match;
  });
  
  return result;
}

/**
 * Add special treatment for Jack's signature catchphrases
 * These are identity-defining phrases that deserve extra weight
 */
function addCatchphraseEmphasis(text: string, emotion: string): string {
  let result = text;
  
  // Jack's most famous catchphrases - slow, deliberate, wise
  const catchphrases = [
    { pattern: /\bstay the course\b/gi, gravitas: 'high' },
    { pattern: /\btime in the market\b/gi, gravitas: 'high' },
    { pattern: /\bdon't look for the needle,?\s*buy the haystack\b/gi, gravitas: 'high' },
    { pattern: /\benough\b/gi, gravitas: 'medium' }, // Context-dependent
    { pattern: /\bcosts matter\b/gi, gravitas: 'medium' },
    { pattern: /\bsimplicity\b/gi, gravitas: 'medium' },
    { pattern: /\bthe relentless rules of humble arithmetic\b/gi, gravitas: 'high' },
  ];
  
  catchphrases.forEach(({ pattern, gravitas }) => {
    result = result.replace(pattern, (match) => {
      if (gravitas === 'high') {
        // Maximum gravitas: slow down, pause before and after
        return `<break time="300ms"/><speed ratio="0.72"/><volume ratio="1.12"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/><break time="250ms"/>`;
      } else {
        // Medium gravitas: slight slowdown
        return `<speed ratio="0.78"/>${match}<speed ratio="0.82"/>`;
      }
    });
  });
  
  return result;
}

/**
 * Add gravity to historically significant years
 * 1974 (Vanguard founding), 1975 (first index fund), 2008 (financial crisis)
 */
function addHistoricalYearGravity(text: string): string {
  let result = text;
  
  const significantYears: Record<string, string> = {
    '1974': 'founding', // Vanguard founded
    '1975': 'revolution', // First index fund
    '1987': 'crash', // Black Monday
    '2000': 'bubble', // Dot-com bust
    '2008': 'crisis', // Financial crisis
    '2009': 'recovery', // Market bottom
    '1929': 'historic', // Great Depression
  };
  
  Object.entries(significantYears).forEach(([year, significance]) => {
    const pattern = new RegExp(`\\b(in\\s+)?${year}\\b`, 'gi');
    result = result.replace(pattern, (match) => {
      // Add weight to these years - they're not just numbers
      return `<break time="150ms"/><speed ratio="0.75"/><volume ratio="1.08"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/><break time="200ms"/>`;
    });
  });
  
  return result;
}

/**
 * Handle Rule of Three (tricolon) - Jack loves lists of 3
 * "Goals, balance, cost, and discipline" gets natural rhythm
 */
function addTricolonCadence(text: string, baseSpeed: number): string {
  let result = text;
  
  // Detect lists of 3 items (A, B, and C)
  const tricolonPattern = /\b(\w+),\s+(\w+),?\s+and\s+(\w+)\b/gi;
  
  result = result.replace(tricolonPattern, (match, first, second, third) => {
    // Rising intonation on first two, falling on third (natural list cadence)
    return `<speed ratio="${(baseSpeed * 1.02).toFixed(2)}"/>${first}<break time="180ms"/><speed ratio="${(baseSpeed * 1.0).toFixed(2)}"/>${second}<break time="200ms"/><speed ratio="${(baseSpeed * 0.92).toFixed(2)}"/>and ${third}<speed ratio="${baseSpeed.toFixed(2)}"/>`;
  });
  
  // Also handle the classic Bogle Four Principles pattern
  result = result.replace(/\b(goals),?\s*(balance),?\s*(cost),?\s*and\s*(discipline)\b/gi, (match) => {
    return `<break time="200ms"/><speed ratio="0.78"/>goals<break time="250ms"/>balance<break time="250ms"/>cost<break time="280ms"/>and discipline<speed ratio="0.82"/><break time="300ms"/>`;
  });
  
  return result;
}

/**
 * Add voice shift when quoting others
 * Jack often quotes Vonnegut, his father, historical figures
 */
function addQuotationVoiceShift(text: string, emotion: string): string {
  let result = text;
  
  // Detect quoted speech patterns
  const quotePatterns = [
    /\b(my father (always )?said|my father told me|as my father put it)\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(kurt (vonnegut )?said|vonnegut (once )?said)\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(as (the saying goes|they say|someone once said))\s*[,:]?\s*["']([^"']+)["']/gi,
    /\b(einstein (once )?said|warren (buffett )?said)\s*[,:]?\s*["']([^"']+)["']/gi,
  ];
  
  quotePatterns.forEach(pattern => {
    result = result.replace(pattern, (match, intro, _, quote) => {
      // Setup the quote with reverence, then shift voice slightly for the quote itself
      return `${intro}: <break time="300ms"/><emotion value="affectionate"/><speed ratio="0.75"/><volume ratio="0.95"/>"${quote}"<volume ratio="1.0"/><speed ratio="0.82"/><break time="200ms"/>`;
    });
  });
  
  // Generic quoted text gets slight voice shift
  // IMPORTANT: Skip financial pronunciations and short technical phrases (< 20 chars)
  result = result.replace(/"([^"]{20,})"(?!\s*[,:])/g, (match, quote) => {
    // Skip if this looks like a financial pronunciation (contains numbers/letters pattern)
    const isFinancialPronunciation = /\b(four|three|five|six|seven|eight|nine|oh|one|two)\s+(oh|hundred|thousand|million)?\s*[A-Z]?\b/i.test(quote);
    if (isFinancialPronunciation) {
      return match;
    }
    return `<break time="100ms"/><speed ratio="0.85"/><volume ratio="0.95"/>"${quote}"<volume ratio="1.0"/><speed ratio="0.88"/>`;
  });
  
  return result;
}

/**
 * Add gentle wisdom cadence for life lessons
 * When Jack imparts wisdom, the rhythm changes
 */
function addWisdomCadence(text: string, emotion: string): string {
  let result = text;
  
  // Wisdom-imparting phrases
  const wisdomIntros = [
    /\b(here['']s (the thing|what i['']ve learned|the truth)|let me tell you something|i['']ve learned that|the secret is|what matters is|remember this)\b/gi,
    /\b(in my experience|over the years|after.*decades|looking back)\b/gi,
    /\b(the most important thing|what really matters|at the end of the day)\b/gi,
  ];
  
  wisdomIntros.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      // Slow down, pause, lean in - this is wisdom time
      return `<break time="350ms"/><speed ratio="0.72"/><emotion value="affectionate"/>${match}<break time="200ms"/>`;
    });
  });
  
  // Life lesson conclusions
  const wisdomConclusions = [
    /\b(and that['']s (the truth|what matters|all there is to it)|that['']s the key|that['']s (my|the) philosophy)\b/gi,
  ];
  
  wisdomConclusions.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      return `<break time="250ms"/><speed ratio="0.70"/>${match}<speed ratio="0.82"/><break time="400ms"/>`;
    });
  });
  
  return result;
}

/**
 * Add humble deflection pattern
 * Jack deflects praise warmly - this is core to his character
 */
function addHumbleDeflection(text: string, emotion: string): string {
  let result = text;
  
  // Humble phrases Jack uses
  const humblePhrases = [
    /\b(oh,?\s+i don['']t know about that|well,?\s+i just|it['']s not me,?\s+it['']s|i was just lucky|anyone could have|i had help)\b/gi,
    /\b(the credit (really )?goes to|i can['']t take credit|it was a team effort|i was in the right place)\b/gi,
  ];
  
  humblePhrases.forEach(pattern => {
    result = result.replace(pattern, (match) => {
      // Softer, slightly embarrassed but warm
      return `<volume ratio="0.92"/><speed ratio="0.85"/>${match}<volume ratio="1.0"/><speed ratio="0.82"/>`;
    });
  });
  
  return result;
}

/**
 * Add warmth when saying names
 * Jack says names with affection - slightly slower, warmer tone
 */
function addNameWarmth(text: string, emotion: string): string {
  let result = text;
  
  // Common name patterns (capitalized words after direct address markers)
  const namePatterns = [
    /\b(hello|hi|hey|well|now|listen|look),?\s+([A-Z][a-z]+)\b/gi,
    /\b([A-Z][a-z]+),?\s+(my friend|my boy|my girl|dear)\b/gi,
    /\btake care,?\s+([A-Z][a-z]+)\b/gi,
    /\bgoodbye,?\s+([A-Z][a-z]+)\b/gi,
  ];
  
  namePatterns.forEach(pattern => {
    result = result.replace(pattern, (match, before, name) => {
      // Add warmth around the name
      if (name && /^[A-Z][a-z]+$/.test(name)) {
        return match.replace(name, `<emotion value="affectionate"/><speed ratio="0.85"/>${name}<speed ratio="0.88"/>`);
      }
      return match;
    });
  });
  
  return result;
}

/**
 * Batch tag multiple text fragments, maintaining context across them
 */
export function tagTextFragments(fragments: string[]): string[] {
  return fragments.map(tagTextWithSsml);
}
