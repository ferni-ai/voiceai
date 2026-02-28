/**
 * Emotion Detection Service
 *
 * Detects user emotions from text to enable emotional mirroring and adaptive responses.
 */

import { getLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

const logger = getLogger().child({ service: 'EmotionDetection' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// Types
// ============================================================================

export type EmotionCategory =
  | 'distressed'
  | 'excited'
  | 'sad'
  | 'angry'
  | 'anxious'
  | 'happy'
  | 'frustrated'
  | 'confused'
  | 'grateful'
  | 'neutral';

export type EnergyLevel = 'low' | 'medium' | 'high';

export interface EmotionResult {
  primary: EmotionCategory;
  secondary?: EmotionCategory;
  confidence: number;
  energy: EnergyLevel;
  keywords: string[];
}

// ============================================================================
// Keyword Maps
// ============================================================================

const EMOTION_KEYWORDS: Record<EmotionCategory, string[]> = {
  distressed: [
    'overwhelmed',
    'stressed',
    "can't handle",
    'too much',
    'drowning',
    'falling apart',
    'breaking down',
    "can't cope",
    'at my limit',
    'panic',
    'panicking',
    'freaking out',
    'losing it',
    'spiraling',
    'going crazy',
    'out of control',
    'suffocating',
    'trapped',
  ],
  excited: [
    'excited',
    'amazing',
    "can't wait",
    'so happy',
    'thrilled',
    'best day',
    'finally',
    'awesome',
    'incredible',
    'pumped',
    'stoked',
    'yay',
    'woohoo',
    'fantastic',
    'love it',
    'omg',
    'oh my god',
    'unbelievable',
    'ecstatic',
    'over the moon',
    'on cloud nine',
    'so good',
    'best thing ever',
  ],
  sad: [
    'sad',
    'down',
    'depressed',
    'lost',
    'empty',
    'hopeless',
    'crying',
    'tears',
    'heartbroken',
    'devastated',
    'miserable',
    'lonely',
    'alone',
    'hurting',
    'grief',
    'grieving',
    'miss',
    'missing',
    'sigh',
    'heavy heart',
    'broken',
    'shattered',
    'numb',
    'hollow',
    'dark',
    'darkness',
    'rough',
    'tough time',
    'hard time',
    'struggling',
    // BETTER THAN HUMAN: Loneliness/isolation patterns
    'no one to talk to',
    'no one around',
    'only notification',
    'another friday night',
    'weekend alone',
    'isolated',
    'disconnected',
    'no friends',
    'no one cares',
    'forgotten',
    'invisible',
    'silence is loud',
  ],
  angry: [
    'angry',
    'furious',
    'mad',
    'pissed',
    'rage',
    'hate',
    'unfair',
    'ridiculous',
    'bullshit',
    'unbelievable',
    'livid',
    'enraged',
    'outraged',
    'fuming',
    'seething',
    "can't believe",
    'so wrong',
    'makes me sick',
    'disgusted',
    'infuriating',
  ],
  anxious: [
    'anxious',
    'worried',
    'nervous',
    'scared',
    'afraid',
    'terrified',
    'what if',
    'worst case',
    'fear',
    'dread',
    'uneasy',
    'on edge',
    'restless',
    'racing thoughts',
    'heart racing',
    "can't sleep",
    "can't relax",
    'tense',
    'apprehensive',
    'uncertain',
    'insecure',
  ],
  happy: [
    'happy',
    'good',
    'great',
    'wonderful',
    'pleased',
    'content',
    'joy',
    'blessed',
    'grateful',
    'thankful',
    'cheerful',
    'delighted',
    'joyful',
    'loving',
    'at peace',
    'peaceful',
    'calm',
    'relaxed',
    'satisfied',
    'fulfilled',
  ],
  frustrated: [
    'frustrated',
    'annoyed',
    'irritated',
    'stuck',
    'ugh',
    'not working',
    "can't figure",
    'giving up',
    'pointless',
    'argh',
    'grr',
    'fed up',
    'had enough',
    'sick of',
    'tired of',
    'exasperated',
    'at wits end',
    "doesn't work",
    'keeps failing',
    'broken',
  ],
  confused: [
    'confused',
    "don't understand",
    'lost',
    'makes no sense',
    'what do you mean',
    'help me understand',
    'unclear',
    'puzzled',
    'bewildered',
    'perplexed',
    'baffled',
    "don't get it",
    'huh',
    'wait what',
  ],
  grateful: [
    'thank you',
    'thanks',
    'grateful',
    'appreciate',
    'means a lot',
    'so helpful',
    "you're the best",
    'thankful',
    'blessed',
    'appreciate you',
    'so kind',
    'touched',
    'moved',
    'heartwarming',
  ],
  neutral: [],
};

// Emoji patterns that indicate emotion
const EMOJI_EMOTION_MAP: Record<string, EmotionCategory> = {
  // Happy/Excited
  '😊': 'happy',
  '😀': 'happy',
  '😁': 'happy',
  '🥰': 'happy',
  '❤️': 'happy',
  '💜': 'happy',
  '🎉': 'excited',
  '🥳': 'excited',
  '😍': 'excited',
  '🤩': 'excited',
  '✨': 'excited',
  // Sad
  '😢': 'sad',
  '😭': 'sad',
  '💔': 'sad',
  '😔': 'sad',
  '😞': 'sad',
  '🥺': 'sad',
  // Angry
  '😠': 'angry',
  '😡': 'angry',
  '🤬': 'angry',
  '💢': 'angry',
  // Anxious
  '😰': 'anxious',
  '😨': 'anxious',
  '😱': 'anxious',
  '😬': 'anxious',
  // Frustrated
  '😤': 'frustrated',
  '🙄': 'frustrated',
  '😒': 'frustrated',
  // Grateful
  '🙏': 'grateful',
  // Distressed
  '😩': 'distressed',
  '😫': 'distressed',
};

const HIGH_ENERGY_PATTERNS = [
  /!{2,}/, // Multiple exclamation marks
  /[A-Z]{3,}/, // ALL CAPS
  /so (excited|happy|pumped|thrilled)/i,
  /can't (wait|believe)/i,
  /oh my (god|gosh)/i,
];

const LOW_ENERGY_PATTERNS = [
  /\.{3,}/, // Trailing dots
  /sigh/i,
  /tired/i,
  /exhausted/i,
  /drained/i,
  /i don't know/i,
  /whatever/i,
];

// Semantic patterns for BETTER THAN HUMAN detection
// These catch natural expressions that keyword matching might miss
const SEMANTIC_PATTERNS: Array<{ pattern: RegExp; emotion: EmotionCategory; weight: number }> = [
  // Excited - catch achievement announcements
  { pattern: /\bi\s+got\s+(the\s+)?(job|offer|in|accepted)/i, emotion: 'excited', weight: 2 },
  { pattern: /\bwe\s+did\s+it/i, emotion: 'excited', weight: 2 },
  { pattern: /\b(so|really)\s+(excited|happy|thrilled)/i, emotion: 'excited', weight: 1.5 },
  { pattern: /\bcan'?t\s+believe\s+(it|this)/i, emotion: 'excited', weight: 1.5 },
  { pattern: /!{2,}/g, emotion: 'excited', weight: 1 },
  { pattern: /\boh\s+my\s+(god|gosh)/i, emotion: 'excited', weight: 1.5 },

  // Anxious - catch worry expressions
  { pattern: /\bwhat\s+if\b/i, emotion: 'anxious', weight: 2 },
  { pattern: /\bworr(y|ied|ying)\b/i, emotion: 'anxious', weight: 1.5 },
  { pattern: /\bkeeps?\s+(me\s+)?up\s+(at\s+night)?/i, emotion: 'anxious', weight: 1.5 },
  { pattern: /\bcan'?t\s+stop\s+(thinking|worrying)/i, emotion: 'anxious', weight: 2 },
  { pattern: /\bracing\s+thoughts/i, emotion: 'anxious', weight: 2 },

  // Frustrated - catch frustration expressions
  { pattern: /\bnothing\s+(ever\s+)?works/i, emotion: 'frustrated', weight: 2 },
  { pattern: /\btold\s+(them|you)\s+\w*\s*times/i, emotion: 'frustrated', weight: 2 },
  { pattern: /\bare\s+you\s+(kidding|serious)/i, emotion: 'frustrated', weight: 1.5 },
  { pattern: /\bsick\s+(and\s+tired\s+)?of/i, emotion: 'frustrated', weight: 2 },
  { pattern: /\b(ugh+|argh+)\b/i, emotion: 'frustrated', weight: 1 },

  // Sad - catch loneliness and loss expressions
  { pattern: /\bnobody\s+(cares|notices|understands)/i, emotion: 'sad', weight: 2 },
  { pattern: /\bfeel(ing)?\s+(so\s+)?(alone|empty|lost)/i, emotion: 'sad', weight: 2 },
  { pattern: /\btoo\s+quiet/i, emotion: 'sad', weight: 1 },
  { pattern: /\bjust\s+want\s+to\s+(cry|disappear)/i, emotion: 'sad', weight: 2 },

  // Angry - catch anger expressions
  { pattern: /\bare\s+you\s+(kidding|serious)\s+me/i, emotion: 'angry', weight: 2 },
  { pattern: /\bhow\s+(dare|could)\s+(you|they)/i, emotion: 'angry', weight: 2 },
  { pattern: /\bthis\s+is\s+(insane|ridiculous|crazy)/i, emotion: 'angry', weight: 1.5 },
  { pattern: /[A-Z]{4,}/g, emotion: 'angry', weight: 0.5 }, // ALL CAPS words

  // Distressed - catch overwhelm expressions
  {
    pattern: /\b(completely|totally)\s+(overwhelmed|exhausted)/i,
    emotion: 'distressed',
    weight: 2,
  },
  { pattern: /\bi\s+can'?t\s+(do\s+)?(this|it)\s*(anymore)?/i, emotion: 'distressed', weight: 2 },
  { pattern: /\bfalling\s+apart/i, emotion: 'distressed', weight: 2 },
  { pattern: /\b(feels?\s+like\s+)?i'?m\s+drowning/i, emotion: 'distressed', weight: 2 },
];

// ============================================================================
// Core Detection
// ============================================================================

/**
 * Detect emotion from user text
 */
export function detectEmotion(text: string): EmotionResult {
  const lowercaseText = text.toLowerCase();
  const detectedEmotions: Array<{ emotion: EmotionCategory; count: number; keywords: string[] }> =
    [];

  // Check each emotion category
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    const foundKeywords: string[] = [];
    let count = 0;

    for (const keyword of keywords) {
      if (lowercaseText.includes(keyword.toLowerCase())) {
        count++;
        foundKeywords.push(keyword);
      }
    }

    if (count > 0) {
      detectedEmotions.push({
        emotion: emotion as EmotionCategory,
        count,
        keywords: foundKeywords,
      });
    }
  }

  // Check for emoji-indicated emotions
  for (const [emoji, emotion] of Object.entries(EMOJI_EMOTION_MAP)) {
    if (text.includes(emoji)) {
      const existing = detectedEmotions.find((e) => e.emotion === emotion);
      if (existing) {
        existing.count += 1;
        existing.keywords.push(emoji);
      } else {
        detectedEmotions.push({
          emotion,
          count: 1,
          keywords: [emoji],
        });
      }
    }
  }

  // Check for ALL CAPS intensity (boost existing emotions or detect frustration/excitement)
  const capsWords = text.match(/\b[A-Z]{2,}\b/g) || [];
  if (capsWords.length > 0) {
    // ALL CAPS often indicates strong emotion
    const capsText = capsWords.join(' ').toLowerCase();
    // Check if caps words match emotion keywords
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (capsText.includes(keyword.toLowerCase())) {
          const existing = detectedEmotions.find((e) => e.emotion === (emotion as EmotionCategory));
          if (existing) {
            existing.count += 2; // Extra weight for emphasized words
          } else {
            detectedEmotions.push({
              emotion: emotion as EmotionCategory,
              count: 2,
              keywords: [keyword.toUpperCase()],
            });
          }
        }
      }
    }
    // If no specific emotion in caps, could indicate frustration or excitement
    if (detectedEmotions.length === 0 && capsWords.length >= 2) {
      // Multiple caps words with no detected emotion suggests frustrated or excited
      detectedEmotions.push({
        emotion: 'frustrated',
        count: 1,
        keywords: capsWords,
      });
    }
  }

  // BETTER THAN HUMAN: Check semantic patterns for nuanced detection
  for (const { pattern, emotion, weight } of SEMANTIC_PATTERNS) {
    if (pattern.test(text)) {
      const existing = detectedEmotions.find((e) => e.emotion === emotion);
      if (existing) {
        existing.count += weight;
      } else {
        detectedEmotions.push({
          emotion,
          count: weight,
          keywords: [`[semantic]`],
        });
      }
    }
  }

  // Sort by count (most keywords matched = primary emotion)
  detectedEmotions.sort((a, b) => b.count - a.count);

  // Determine energy level
  const energy = detectEnergyLevel(text);

  // If no emotions detected, return neutral
  if (detectedEmotions.length === 0) {
    return {
      primary: 'neutral',
      confidence: 0.5,
      energy,
      keywords: [],
    };
  }

  const primary = detectedEmotions[0];
  const secondary = detectedEmotions[1];

  // Calculate confidence based on keyword count and text length
  // 🦀 Rust-accelerated word counting
  const textWords = RUST_COUNTING_AVAILABLE ? countWordsRust(text) : text.split(/\s+/).length;
  const keywordDensity = primary.count / Math.max(textWords, 1);
  // Boost confidence for emoji matches (they're very intentional)
  const hasEmoji = primary.keywords.some((k) => k.length <= 2 && /[\u{1F300}-\u{1F9FF}]/u.test(k));
  const emojiBoost = hasEmoji ? 0.15 : 0;
  const confidence = Math.min(
    0.4 + keywordDensity * 3 + (primary.count > 2 ? 0.2 : 0) + emojiBoost,
    0.95
  );

  return {
    primary: primary.emotion,
    secondary: secondary?.emotion,
    confidence,
    energy,
    keywords: primary.keywords,
  };
}

/**
 * Detect energy level from text
 */
function detectEnergyLevel(text: string): EnergyLevel {
  let highScore = 0;
  let lowScore = 0;

  // Check high energy patterns
  for (const pattern of HIGH_ENERGY_PATTERNS) {
    if (pattern.test(text)) {
      highScore++;
    }
  }

  // Check low energy patterns
  for (const pattern of LOW_ENERGY_PATTERNS) {
    if (pattern.test(text)) {
      lowScore++;
    }
  }

  // Count exclamation marks
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 2) highScore++;
  if (exclamations === 0 && text.length > 50) lowScore++;

  // Determine level
  if (highScore > lowScore && highScore >= 2) return 'high';
  if (lowScore > highScore && lowScore >= 2) return 'low';
  return 'medium';
}

/**
 * Check if user seems distressed (high priority detection)
 */
export function isUserDistressed(text: string): boolean {
  const result = detectEmotion(text);
  return (
    result.primary === 'distressed' ||
    result.primary === 'anxious' ||
    (result.primary === 'sad' && result.confidence > 0.6)
  );
}

/**
 * Check if user seems excited (for matching energy)
 */
export function isUserExcited(text: string): boolean {
  const result = detectEmotion(text);
  return (result.primary === 'excited' || result.primary === 'happy') && result.energy === 'high';
}

/**
 * Get appropriate response style based on detected emotion
 */
export function getResponseStyle(emotion: EmotionResult): {
  pace: 'slow' | 'normal' | 'fast';
  tone: 'gentle' | 'warm' | 'enthusiastic' | 'supportive';
  pauseMultiplier: number;
} {
  switch (emotion.primary) {
    case 'distressed':
    case 'anxious':
    case 'sad':
      return { pace: 'slow', tone: 'gentle', pauseMultiplier: 1.5 };

    case 'excited':
    case 'happy':
      return {
        pace: emotion.energy === 'high' ? 'fast' : 'normal',
        tone: 'enthusiastic',
        pauseMultiplier: 0.8,
      };

    case 'angry':
    case 'frustrated':
      return { pace: 'normal', tone: 'supportive', pauseMultiplier: 1.2 };

    case 'confused':
      return { pace: 'slow', tone: 'warm', pauseMultiplier: 1.3 };

    case 'grateful':
      return { pace: 'normal', tone: 'warm', pauseMultiplier: 1.0 };

    default:
      return { pace: 'normal', tone: 'warm', pauseMultiplier: 1.0 };
  }
}

/**
 * Analyze conversation for emotional patterns over time
 */
export function analyzeConversationEmotion(messages: string[]): {
  dominantEmotion: EmotionCategory;
  emotionalArc: 'improving' | 'declining' | 'stable';
  averageEnergy: EnergyLevel;
} {
  if (messages.length === 0) {
    return {
      dominantEmotion: 'neutral',
      emotionalArc: 'stable',
      averageEnergy: 'medium',
    };
  }

  const emotions = messages.map(detectEmotion);

  // Count dominant emotion
  const emotionCounts = new Map<EmotionCategory, number>();
  for (const e of emotions) {
    emotionCounts.set(e.primary, (emotionCounts.get(e.primary) || 0) + 1);
  }

  let dominantEmotion: EmotionCategory = 'neutral';
  let maxCount = 0;
  for (const [emotion, count] of emotionCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantEmotion = emotion;
    }
  }

  // Determine emotional arc (compare first half to second half)
  const positiveEmotions: EmotionCategory[] = ['excited', 'happy', 'grateful'];
  const negativeEmotions: EmotionCategory[] = [
    'distressed',
    'sad',
    'angry',
    'anxious',
    'frustrated',
  ];

  const firstHalf = emotions.slice(0, Math.floor(emotions.length / 2));
  const secondHalf = emotions.slice(Math.floor(emotions.length / 2));

  const firstHalfPositive = firstHalf.filter((e) => positiveEmotions.includes(e.primary)).length;
  const secondHalfPositive = secondHalf.filter((e) => positiveEmotions.includes(e.primary)).length;
  const firstHalfNegative = firstHalf.filter((e) => negativeEmotions.includes(e.primary)).length;
  const secondHalfNegative = secondHalf.filter((e) => negativeEmotions.includes(e.primary)).length;

  let emotionalArc: 'improving' | 'declining' | 'stable' = 'stable';
  if (secondHalfPositive > firstHalfPositive && secondHalfNegative < firstHalfNegative) {
    emotionalArc = 'improving';
  } else if (secondHalfNegative > firstHalfNegative && secondHalfPositive < firstHalfPositive) {
    emotionalArc = 'declining';
  }

  // Average energy
  const energyMap = { low: 0, medium: 1, high: 2 };
  const avgEnergy = emotions.reduce((sum, e) => sum + energyMap[e.energy], 0) / emotions.length;
  const averageEnergy: EnergyLevel = avgEnergy < 0.7 ? 'low' : avgEnergy > 1.3 ? 'high' : 'medium';

  return { dominantEmotion, emotionalArc, averageEnergy };
}

// Export as service object
export const EmotionDetectionService = {
  detect: detectEmotion,
  isDistressed: isUserDistressed,
  isExcited: isUserExcited,
  getResponseStyle,
  analyzeConversation: analyzeConversationEmotion,
};

export default EmotionDetectionService;
