/**
 * Emotion Detection Service
 * 
 * Detects user emotions from text to enable emotional mirroring and adaptive responses.
 */

import { getLogger } from '../utils/logger.js';

const logger = getLogger().child({ service: 'EmotionDetection' });

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
    'overwhelmed', 'stressed', 'can\'t handle', 'too much', 'drowning',
    'falling apart', 'breaking down', 'can\'t cope', 'at my limit',
    'panic', 'panicking', 'freaking out', 'losing it'
  ],
  excited: [
    'excited', 'amazing', 'can\'t wait', 'so happy', 'thrilled',
    'best day', 'finally', 'awesome', 'incredible', 'pumped',
    'stoked', 'yay', 'woohoo', 'fantastic', 'love it'
  ],
  sad: [
    'sad', 'down', 'depressed', 'lost', 'empty', 'hopeless',
    'crying', 'tears', 'heartbroken', 'devastated', 'miserable',
    'lonely', 'alone', 'hurting', 'grief'
  ],
  angry: [
    'angry', 'furious', 'mad', 'pissed', 'rage', 'hate',
    'unfair', 'ridiculous', 'bullshit', 'unbelievable'
  ],
  anxious: [
    'anxious', 'worried', 'nervous', 'scared', 'afraid',
    'terrified', 'what if', 'worst case', 'fear', 'dread'
  ],
  happy: [
    'happy', 'good', 'great', 'wonderful', 'pleased',
    'content', 'joy', 'blessed', 'grateful', 'thankful'
  ],
  frustrated: [
    'frustrated', 'annoyed', 'irritated', 'stuck', 'ugh',
    'not working', 'can\'t figure', 'giving up', 'pointless'
  ],
  confused: [
    'confused', 'don\'t understand', 'lost', 'makes no sense',
    'what do you mean', 'help me understand', 'unclear'
  ],
  grateful: [
    'thank you', 'thanks', 'grateful', 'appreciate',
    'means a lot', 'so helpful', 'you\'re the best'
  ],
  neutral: []
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

// ============================================================================
// Core Detection
// ============================================================================

/**
 * Detect emotion from user text
 */
export function detectEmotion(text: string): EmotionResult {
  const lowercaseText = text.toLowerCase();
  const detectedEmotions: { emotion: EmotionCategory; count: number; keywords: string[] }[] = [];

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
        keywords: foundKeywords
      });
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
      keywords: []
    };
  }

  const primary = detectedEmotions[0];
  const secondary = detectedEmotions[1];

  // Calculate confidence based on keyword count and text length
  const textWords = text.split(/\s+/).length;
  const keywordDensity = primary.count / Math.max(textWords, 1);
  const confidence = Math.min(0.4 + keywordDensity * 3 + (primary.count > 2 ? 0.2 : 0), 0.95);

  return {
    primary: primary.emotion,
    secondary: secondary?.emotion,
    confidence,
    energy,
    keywords: primary.keywords
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
  return (
    (result.primary === 'excited' || result.primary === 'happy') &&
    result.energy === 'high'
  );
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
        pauseMultiplier: 0.8 
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
      averageEnergy: 'medium'
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
  const negativeEmotions: EmotionCategory[] = ['distressed', 'sad', 'angry', 'anxious', 'frustrated'];

  const firstHalf = emotions.slice(0, Math.floor(emotions.length / 2));
  const secondHalf = emotions.slice(Math.floor(emotions.length / 2));

  const firstHalfPositive = firstHalf.filter(e => positiveEmotions.includes(e.primary)).length;
  const secondHalfPositive = secondHalf.filter(e => positiveEmotions.includes(e.primary)).length;
  const firstHalfNegative = firstHalf.filter(e => negativeEmotions.includes(e.primary)).length;
  const secondHalfNegative = secondHalf.filter(e => negativeEmotions.includes(e.primary)).length;

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

