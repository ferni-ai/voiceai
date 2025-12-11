/**
 * SSML Tagger Constants - Pattern definitions for speech processing
 */

import type { PronunciationEntry } from './types.js';

// ============================================================================
// FINANCIAL PRONUNCIATION DICTIONARY
// ============================================================================

/**
 * Financial terms pronunciation dictionary
 * Maps terms to their phonetic "sounds-like" pronunciations
 */
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

// Protection markers for financial pronunciations
export const FINANCIAL_START = '\uE001';
export const FINANCIAL_END = '\uE002';

// ============================================================================
// EMOTION KEYWORDS
// ============================================================================

export const EMOTION_KEYWORDS: Record<string, string> = {
  // Affectionate/Warm
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

  // Curious/Inquisitive
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

  // Sad/Empathetic
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

  // Surprised
  'oh!': 'surprised',
  wow: 'surprised',
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
  goodness: 'surprised',
  'my word': 'surprised',

  // Angry/Passionate
  'will not': 'angry',
  'should not': 'angry',
  'this is wrong': 'angry',
  unacceptable: 'angry',
  stealing: 'angry',
  greed: 'angry',
  exploitation: 'angry',
  outrageous: 'angry',
  disgrace: 'angry',
  shameful: 'angry',
  'wall street': 'angry',
  'high fees': 'angry',
  'rip off': 'angry',
  'ripping off': 'angry',
  'taking advantage': 'angry',
  industry: 'angry',
  'mutual fund industry': 'angry',
  'active management': 'angry',
  manager: 'angry',
};

// ============================================================================
// SPEECH PATTERNS
// ============================================================================

export const REFLECTION_PHRASES = [
  /\b(let me think|let me see|hmm|well|you know|i mean|actually|i suppose|i guess)\b/gi,
  /\b(that is interesting|that is a good question|that makes me think|i wonder)\b/gi,
  /\b(now that i think about it|come to think of it|on reflection|thinking about it)\b/gi,
  /\b(you know what|here is the thing|the thing is|what i mean is)\b/gi,
];

export const CONTEMPLATIVE_PAUSE_PHRASES = [
  /\b(i think|i believe|i feel|i know|i see|i understand|i realize)\b/gi,
  /\b(that is|which means|in other words|to put it another way)\b/gi,
  /\b(remember|think about|consider|imagine|picture this)\b/gi,
];

export const TRANSITION_PHRASES = [
  /\b(but|however|although|though|meanwhile|furthermore|moreover|additionally|also|plus)\b/gi,
  /\b(so|then|now|well|okay|alright|right|see|look|listen)\b/gi,
];

export const BREATH_POINTS = [
  /\b(after all|in fact|as a result|for example|that is|which means)\b/gi,
  /\b(i think|i believe|i feel|i know|i see|i understand)\b/gi,
];

export const CONTRASTIVE_PATTERNS = [
  /\b(not\s+\w+,\s*but\s+\w+)/gi,
  /\b(rather than|instead of|as opposed to)\b/gi,
];

export const ACRONYM_PATTERN = /\b[A-Z]{2,5}\b/g;

export const SLOW_PACE_KEYWORDS = [
  'think',
  'consider',
  'remember',
  'reflect',
  'important',
  'crucial',
  'serious',
  'difficult',
  'challenging',
  'loss',
  'grief',
  'sorry',
  'understand',
  'empathy',
  'compassion',
  'wisdom',
  'philosophy',
];

export const FAST_PACE_KEYWORDS = [
  'excited',
  'great',
  'wonderful',
  'fantastic',
  'yes!',
  'exactly',
  'absolutely',
  'definitely',
  'celebrate',
  'success',
  'win',
  'victory',
];

export const EMPHASIS_KEYWORDS = [
  'important',
  'crucial',
  'critical',
  'must',
  'essential',
  'vital',
  'never',
  'always',
  'absolutely',
  'definitely',
  'this matters',
  'pay attention',
  'listen',
  'remember this',
];

export const WHISPER_KEYWORDS = [
  'secret',
  'confidential',
  'just between us',
  'let me tell you',
  'i want to share',
  'intimate',
  'personal',
  'private',
];

export const LAUGHTER_PATTERNS = [
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

export const SIGH_PATTERNS = [
  /that is heavy/i,
  /i understand/i,
  /that hurts/i,
  /difficult/i,
  /hard to hear/i,
];
