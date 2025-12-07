/**
 * 🎯 Emotion Triggers
 * 
 * Analyzes voice metrics and text content to determine appropriate emotions.
 * Maps real-time audio analysis and NLP cues to the emotion state machine.
 * 
 * Integration Points:
 * - Voice Activity Detection (VAD) → listening/speaking states
 * - Audio Analysis → pitch, volume, speaking rate
 * - Text Analysis → sentiment, keywords, punctuation
 * - TTS Hints → emotion tags from backend
 */

import { createLogger } from '../utils/logger.js';
import { setEmotion, flashEmotion, type EmotionId } from './emotion-state.js';

const log = createLogger('EmotionTriggers');

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMetrics {
  /** Volume level 0-1 */
  volume: number;
  /** Pitch in Hz (typical human: 85-255 Hz) */
  pitch: number;
  /** How much pitch varies (higher = more expressive) */
  pitchVariance: number;
  /** Words per minute estimate */
  speakingRate: number;
  /** Seconds since last speech */
  silenceDuration: number;
  /** Whether voice is currently active */
  isActive: boolean;
}

export interface TextAnalysisResult {
  emotion: EmotionId;
  confidence: number;
  keywords: string[];
}

// ============================================================================
// KEYWORD PATTERNS
// ============================================================================

const EMOTION_PATTERNS: Record<EmotionId, RegExp[]> = {
  happy: [
    /\b(great|wonderful|amazing|love|excited|happy|glad|awesome|fantastic|brilliant)\b/i,
    /\b(yay|woohoo|hurray|yes!|perfect|excellent)\b/i,
    /😊|😄|😃|🎉|❤️|💚/,
    /!{2,}/, // Multiple exclamation marks
  ],
  excited: [
    /\b(incredible|unbelievable|mind-?blowing|can't wait|so excited)\b/i,
    /\b(omg|oh my god|wow|whoa|holy)\b/i,
    /!{3,}/, // Three or more exclamation marks
    /🔥|🚀|💥|⚡|🎊/,
  ],
  curious: [
    /\b(interesting|tell me more|curious|wonder|how does|why does|what if)\b/i,
    /\b(fascinating|intriguing|hmm|huh)\b/i,
    /\?{2,}/, // Multiple question marks
    /🤔|💭|🧐/,
  ],
  thinking: [
    /\b(let me think|consider|perhaps|maybe|possibly|i think|i believe)\b/i,
    /\b(hmm+|umm+|well\.\.\.)\b/i,
    /\.{3,}/, // Ellipsis thinking
  ],
  calm: [
    /\b(don't worry|it's okay|relax|breathe|calm|peaceful|serene)\b/i,
    /\b(take your time|no rush|all good|no problem)\b/i,
    /🧘|☮️|🕊️|🌿/,
  ],
  sad: [
    /\b(sorry to hear|understand|difficult|hard|challenging|struggle|tough)\b/i,
    /\b(unfortunately|sadly|i'm sorry|that's rough|that sucks)\b/i,
    /😢|😔|💔|😞/,
  ],
  frustrated: [
    /\b(frustrated|annoyed|irritated|stuck|can't figure|doesn't work)\b/i,
    /\b(ugh|argh|dammit|seriously)\b/i,
    /😤|😠|🤦/,
  ],
  neutral: [],
  listening: [],
  speaking: [],
};

// Intensity boosters - words that amplify the emotion
const INTENSITY_BOOSTERS = [
  /\b(really|very|so|extremely|incredibly|absolutely|totally)\b/i,
  /\b(super|mega|ultra)\b/i,
  /!+/, // Exclamation marks
];

// ============================================================================
// VOICE ANALYSIS
// ============================================================================

/**
 * Analyze voice metrics and suggest an emotion
 */
export function analyzeVoice(metrics: VoiceMetrics): EmotionId {
  // Not speaking - return listening or neutral
  if (!metrics.isActive) {
    return metrics.silenceDuration > 2 ? 'thinking' : 'listening';
  }
  
  // High volume + high pitch variance = excited
  if (metrics.volume > 0.7 && metrics.pitchVariance > 50) {
    return 'excited';
  }
  
  // Low volume + low pitch = calm or sad
  if (metrics.volume < 0.3) {
    if (metrics.pitch < 150) {
      return metrics.silenceDuration > 2 ? 'thinking' : 'calm';
    }
  }
  
  // Fast speaking rate = excited or frustrated
  if (metrics.speakingRate > 180) {
    return metrics.pitchVariance > 30 ? 'excited' : 'frustrated';
  }
  
  // Slow speaking rate with pauses = thinking
  if (metrics.speakingRate < 100 && metrics.silenceDuration > 1) {
    return 'thinking';
  }
  
  // Moderate volume + moderate variance = engaged/happy
  if (metrics.volume > 0.4 && metrics.pitchVariance > 20) {
    return 'happy';
  }
  
  return 'neutral';
}

// ============================================================================
// TEXT ANALYSIS
// ============================================================================

/**
 * Analyze text content for emotion cues
 */
export function analyzeText(text: string): TextAnalysisResult {
  const matchedKeywords: string[] = [];
  let bestMatch: EmotionId = 'neutral';
  let bestScore = 0;
  
  // Check each emotion's patterns
  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    let score = 0;
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        score += matches.length;
        matchedKeywords.push(...matches);
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = emotion as EmotionId;
    }
  }
  
  // Check for intensity boosters
  let intensity = 0;
  for (const booster of INTENSITY_BOOSTERS) {
    const matches = text.match(booster);
    if (matches) {
      intensity += matches.length * 0.2;
    }
  }
  
  // Calculate confidence (0-1)
  const confidence = Math.min(1, (bestScore * 0.3 + intensity) / 2);
  
  return {
    emotion: bestMatch,
    confidence,
    keywords: [...new Set(matchedKeywords)],
  };
}

/**
 * Blend voice and text analysis to determine final emotion
 */
export function determineEmotion(
  voice: VoiceMetrics | null,
  text: string | null
): EmotionId {
  const voiceEmotion = voice ? analyzeVoice(voice) : null;
  const textAnalysis = text ? analyzeText(text) : null;
  
  // Text takes priority for explicit emotions (high confidence)
  if (textAnalysis && textAnalysis.confidence > 0.6 && textAnalysis.emotion !== 'neutral') {
    log.debug('Emotion from text:', textAnalysis.emotion, textAnalysis.keywords);
    return textAnalysis.emotion;
  }
  
  // Fall back to voice analysis
  if (voiceEmotion && voiceEmotion !== 'neutral') {
    log.debug('Emotion from voice:', voiceEmotion);
    return voiceEmotion;
  }
  
  // Use text with lower confidence
  if (textAnalysis && textAnalysis.emotion !== 'neutral') {
    return textAnalysis.emotion;
  }
  
  // Default
  return voiceEmotion ?? 'neutral';
}

// ============================================================================
// TTS EMOTION HINTS
// ============================================================================

/**
 * Map TTS emotion hints (from backend) to emotion IDs
 */
const TTS_EMOTION_MAP: Record<string, EmotionId> = {
  // Standard TTS hints
  'cheerful': 'happy',
  'friendly': 'happy',
  'excited': 'excited',
  'empathetic': 'sad',
  'calm': 'calm',
  'serious': 'thinking',
  'curious': 'curious',
  'angry': 'frustrated',
  'sad': 'sad',
  'neutral': 'neutral',
  
  // OpenAI voice hints
  'alloy': 'neutral',
  'echo': 'calm',
  'fable': 'curious',
  'onyx': 'thinking',
  'nova': 'happy',
  'shimmer': 'excited',
};

/**
 * Process TTS emotion hint from backend
 */
export function processTTSHint(hint: string): void {
  const emotion = TTS_EMOTION_MAP[hint.toLowerCase()];
  if (emotion) {
    log.debug('TTS emotion hint:', hint, '→', emotion);
    setEmotion(emotion);
  }
}

// ============================================================================
// EMOTION TRIGGER CONTROLLER
// ============================================================================

class EmotionTriggerController {
  private voiceMetrics: VoiceMetrics = {
    volume: 0,
    pitch: 150,
    pitchVariance: 20,
    speakingRate: 120,
    silenceDuration: 0,
    isActive: false,
  };
  
  private lastSpeechTime = 0;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  
  /**
   * Start monitoring and updating emotions
   */
  start(): void {
    // Update silence duration periodically
    this.updateInterval = setInterval(() => {
      if (!this.voiceMetrics.isActive) {
        this.voiceMetrics.silenceDuration = (Date.now() - this.lastSpeechTime) / 1000;
      }
    }, 500);
    
    log.debug('Emotion trigger controller started');
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  /**
   * Update voice metrics from audio analysis
   */
  updateVoiceMetrics(metrics: Partial<VoiceMetrics>): void {
    const wasActive = this.voiceMetrics.isActive;
    
    this.voiceMetrics = {
      ...this.voiceMetrics,
      ...metrics,
    };
    
    if (metrics.isActive && !wasActive) {
      // Speech started
      this.voiceMetrics.silenceDuration = 0;
    } else if (!metrics.isActive && wasActive) {
      // Speech ended
      this.lastSpeechTime = Date.now();
    }
    
    // Trigger emotion analysis
    const emotion = analyzeVoice(this.voiceMetrics);
    if (emotion !== 'neutral') {
      setEmotion(emotion);
    }
  }
  
  /**
   * Process incoming text for emotion cues
   */
  processText(text: string): void {
    const analysis = analyzeText(text);
    
    if (analysis.confidence > 0.5 && analysis.emotion !== 'neutral') {
      log.debug('Text emotion detected:', analysis.emotion, analysis.keywords);
      
      // Flash the emotion briefly if confidence is moderate
      if (analysis.confidence < 0.8) {
        flashEmotion(analysis.emotion, 3000);
      } else {
        setEmotion(analysis.emotion);
      }
    }
  }
  
  /**
   * Set speaking state
   */
  setSpeaking(isSpeaking: boolean): void {
    if (isSpeaking) {
      setEmotion('speaking');
    } else {
      setEmotion('neutral');
    }
  }
  
  /**
   * Set listening state
   */
  setListening(isListening: boolean): void {
    if (isListening) {
      setEmotion('listening');
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const emotionTriggers = new EmotionTriggerController();

// ============================================================================
// EXPORTS
// ============================================================================

export default emotionTriggers;

