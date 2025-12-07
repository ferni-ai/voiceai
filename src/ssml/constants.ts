/**
 * SSML Constants
 *
 * All constant definitions for the SSML tagger module.
 */

import type { PronunciationEntry } from './types.js';

// =============================================================================
// UNICODE MARKERS FOR FINANCIAL TERM PROTECTION
// =============================================================================

export const FINANCIAL_START = '\uE001';
export const FINANCIAL_END = '\uE002';

// =============================================================================
// FINANCIAL PRONUNCIATION DICTIONARY
// =============================================================================

export const FINANCIAL_PRONUNCIATIONS: PronunciationEntry[] = [
  // Retirement accounts
  { pattern: /\b401\s*[Kk]\b/g, replacement: 'four oh one K', description: 'Retirement account' },
  { pattern: /\b401\s*\(k\)\b/gi, replacement: 'four oh one K', description: 'Retirement account' },
  {
    pattern: /\b403\s*[Bb]\b/g,
    replacement: 'four oh three B',
    description: 'Nonprofit retirement',
  },
  {
    pattern: /\b457\s*[Bb]?\b/g,
    replacement: 'four fifty seven',
    description: 'Government retirement',
  },
  { pattern: /\bIRA\b/g, replacement: 'I R A', description: 'Individual Retirement Account' },
  { pattern: /\bRoth\s+IRA\b/gi, replacement: 'Roth I R A', description: 'After-tax retirement' },
  {
    pattern: /\bSEP[\s-]?IRA\b/gi,
    replacement: 'sep I R A',
    description: 'Self-employed retirement',
  },
  {
    pattern: /\bSIMPLE[\s-]?IRA\b/gi,
    replacement: 'simple I R A',
    description: 'Small business retirement',
  },

  // Regulatory bodies
  { pattern: /\bSEC\b/g, replacement: 'S E C', description: 'Securities and Exchange Commission' },
  {
    pattern: /\bFINRA\b/g,
    replacement: 'fin-rah',
    description: 'Financial Industry Regulatory Authority',
  },
  {
    pattern: /\bFDIC\b/g,
    replacement: 'F D I C',
    description: 'Federal Deposit Insurance Corporation',
  },
  { pattern: /\bFed\b/g, replacement: 'Fed', description: 'Federal Reserve' },
  { pattern: /\bFOMC\b/g, replacement: 'F O M C', description: 'Federal Open Market Committee' },
  {
    pattern: /\bCFPB\b/g,
    replacement: 'C F P B',
    description: 'Consumer Financial Protection Bureau',
  },
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

  // Money amounts
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

// =============================================================================
// EMOTION KEYWORDS
// =============================================================================

export const EMOTION_KEYWORDS: Record<string, string> = {
  // Angry
  angry: 'angry',
  frustrated: 'angry',
  annoyed: 'angry',
  irritated: 'angry',
  furious: 'angry',
  outraged: 'angry',
  incensed: 'angry',
  'fed up': 'angry',
  indignant: 'angry',
  exasperated: 'angry',

  // Sad
  sad: 'sad',
  upset: 'sad',
  disappointed: 'sad',
  heartbroken: 'sad',
  devastated: 'sad',
  melancholy: 'sad',
  somber: 'sad',
  down: 'sad',
  depressed: 'sad',
  gloomy: 'sad',
  mournful: 'sad',
  grieving: 'sad',
  sorrowful: 'sad',
  despondent: 'sad',
  miserable: 'sad',

  // Surprised
  surprised: 'surprised',
  shocked: 'surprised',
  amazed: 'surprised',
  astonished: 'surprised',
  stunned: 'surprised',
  startled: 'surprised',
  bewildered: 'surprised',
  incredulous: 'surprised',
  flabbergasted: 'surprised',

  // Curious
  curious: 'curious',
  interested: 'curious',
  intrigued: 'curious',
  fascinated: 'curious',
  wondering: 'curious',
  questioning: 'curious',
  inquisitive: 'curious',
  pondering: 'curious',
  contemplating: 'curious',
  inquiring: 'curious',

  // Affectionate
  affectionate: 'affectionate',
  loving: 'affectionate',
  caring: 'affectionate',
  warm: 'affectionate',
  tender: 'affectionate',
  fond: 'affectionate',
  devoted: 'affectionate',
  adoring: 'affectionate',
  sympathetic: 'affectionate',
  compassionate: 'affectionate',
  empathetic: 'affectionate',
  supportive: 'affectionate',
  understanding: 'affectionate',

  // Confident
  confident: 'confident',
  certain: 'confident',
  assured: 'confident',
  decisive: 'confident',
  determined: 'confident',
  resolute: 'confident',
  bold: 'confident',
  assertive: 'confident',

  // Calm/thoughtful
  calm: 'calm',
  peaceful: 'calm',
  serene: 'calm',
  relaxed: 'calm',
  tranquil: 'calm',
  thoughtful: 'thoughtful',
  reflective: 'thoughtful',
  pensive: 'thoughtful',
  contemplative: 'thoughtful',
  meditative: 'thoughtful',

  // Happy/enthusiastic
  happy: 'affectionate',
  joyful: 'affectionate',
  excited: 'surprised',
  thrilled: 'surprised',
  delighted: 'surprised',
  enthusiastic: 'surprised',
  elated: 'surprised',
  ecstatic: 'surprised',
  overjoyed: 'surprised',
  cheerful: 'affectionate',
  pleased: 'affectionate',
  grateful: 'affectionate',
  thankful: 'affectionate',
  content: 'affectionate',
  satisfied: 'affectionate',

  // Worried/anxious
  worried: 'sad',
  anxious: 'sad',
  concerned: 'curious',
  nervous: 'sad',
  apprehensive: 'sad',
  uneasy: 'sad',
  troubled: 'sad',
  stressed: 'sad',
  overwhelmed: 'sad',
};

// =============================================================================
// PAUSE AND TRANSITION PATTERNS
// =============================================================================

export const THINKING_SOUNDS = [
  /\b(well|hmm|ah|oh|um|uh|you know|i mean|actually|let me think|hmm)\b/gi,
];

export const REFLECTION_PHRASES = [
  /\b(you see|the thing is|here's the thing|i think|i believe|in my view|from my perspective)\b/gi,
  /\b(what i've found|what i've learned|over the years|in my experience)\b/gi,
  /\b(let me put it this way|to be honest|frankly|truth be told)\b/gi,
];

export const CONTEMPLATIVE_PAUSE_PHRASES = [
  /\b(now|so|but here's the thing|and yet|however|still|nonetheless)\b/gi,
  /\b(interestingly|curiously|remarkably|surprisingly|notably)\b/gi,
];

export const TRANSITION_PHRASES = [
  /\b(first of all|secondly|thirdly|finally|in conclusion|to summarize)\b/gi,
  /\b(on the other hand|alternatively|conversely|in contrast|meanwhile)\b/gi,
];

export const BREATH_POINTS = [
  /\.\s+(?=[A-Z])/g, // After periods before new sentences
  /\?\s+(?=[A-Z])/g, // After questions
  /!\s+(?=[A-Z])/g, // After exclamations
];

export const CONTRASTIVE_PATTERNS = [
  /\b(but|however|although|yet|still|nevertheless|nonetheless|on the other hand)\b/gi,
];

export const PARENTHETICAL_PATTERNS = [/\([^)]+\)/g, /—[^—]+—/g, /–[^–]+–/g];

export const LIST_PATTERNS = [/\b(\d+[\.\)]\s+[^.!?]+)/g, /\b([•·-]\s+[^.!?]+)/g];

export const ACRONYM_PATTERN = /\b[A-Z]{2,5}\b/g;

export const NUMBER_PATTERNS = [
  { pattern: /\b(\d{1,3}),(\d{3})\b/g, handler: 'largeNumber' },
  { pattern: /\b\d+\.\d+%\b/g, handler: 'percentage' },
  { pattern: /\$[\d,.]+/g, handler: 'currency' },
];

// =============================================================================
// PACING KEYWORDS
// =============================================================================

export const SLOW_PACE_KEYWORDS = [
  'important',
  'crucial',
  'essential',
  'fundamental',
  'key point',
  'remember',
  'never forget',
  'critical',
  'vital',
  'significant',
  'meaningful',
  'profound',
  'serious',
  'grave',
  'solemn',
  'thoughtful',
  'careful',
  'cautious',
  'deliberate',
  'methodical',
];

export const FAST_PACE_KEYWORDS = [
  'quickly',
  'immediately',
  'right away',
  'hurry',
  'fast',
  'rapid',
  'swift',
  'urgent',
  'pressing',
  'time-sensitive',
  'exciting',
  'amazing',
  'incredible',
  'fantastic',
  'brilliant',
];

// =============================================================================
// VOCAL CUE PATTERNS
// =============================================================================

export const EMPHASIS_KEYWORDS = [
  'very',
  'really',
  'truly',
  'absolutely',
  'definitely',
  'certainly',
  'incredibly',
  'extremely',
  'especially',
  'particularly',
  'never',
  'always',
  'must',
  'essential',
  'critical',
  'vital',
];

export const WHISPER_KEYWORDS = [
  'secret',
  'between us',
  'confidentially',
  'quietly',
  'privately',
  'discreetly',
  'off the record',
  "don't tell anyone",
  'just between',
  'hush',
];

export const LAUGHTER_PATTERNS = [
  /\bhaha\b/gi,
  /\bhehe\b/gi,
  /\blol\b/gi,
  /\brofl\b/gi,
  /\b(laughs?|laughing)\b/gi,
  /\bchuckle/gi,
  /\bgiggle/gi,
  /\b(that's|it's)\s+(hilarious|funny|amusing|ridiculous|absurd)\b/gi,
  /\b(can't|couldn't)\s+stop\s+laughing\b/gi,
  /\b(made|makes)\s+me\s+laugh\b/gi,
  /\b(cracking|cracks)\s+(me\s+)?up\b/gi,
  /\bhilarious(ly)?\b/gi,
  /\bfunny\s+(thing|part|story|enough)\b/gi,
  /\b(burst|bursting)\s+(out|into)\s+laugh/gi,
];

export const LAUGHTER_INVITATIONS = [
  'ha',
  'heh',
  'haha',
  'oh that reminds me of a funny...',
  'you know what makes me chuckle...',
  "I can't help but smile...",
];

export const SIGH_PATTERNS = [
  /\*sighs?\*/gi,
  /\b(sighs?|sighing)\b/gi,
  /\b(takes?\s+a\s+deep\s+breath)\b/gi,
  /\b(exhales?|exhaling)\b/gi,
  /\balas\b/gi,
  /\boh\s+well\b/gi,
  /\bah\s+well\b/gi,
];

export const DISFLUENCY_PATTERNS = [
  /\b(um|uh|er|ah|like|you know|i mean|sort of|kind of|basically|actually)\b/gi,
];

export const REPETITION_PATTERNS = [
  /\b(\w+)\s+\1\b/gi, // Immediate word repetition
];

export const SARCASTIC_PATTERNS = [
  /\b(oh\s+)?sure(ly)?[,.]?\b/gi,
  /\byeah\s+right\b/gi,
  /\boh\s+(great|wonderful|fantastic|brilliant)\b/gi,
  /\bwhat\s+a\s+(surprise|shock)\b/gi,
];
