/**
 * 🎭 Emotion Analyzer
 * 
 * Detects user emotional state from voice characteristics and text content.
 * Feeds the Narrative Director to enable emotionally-aware storytelling.
 * 
 * SOURCES:
 * 1. Voice prosody (pitch, energy, pace)
 * 2. Text sentiment (keywords, patterns)
 * 3. Behavioral signals (pauses, interruptions)
 * 
 * PHILOSOPHY:
 * - Err on the side of neutrality (don't over-detect)
 * - Privacy-first (no data stored, only real-time analysis)
 * - Confidence thresholds prevent false positives
 * 
 * @module @ferni/narrative/emotion
 */

import { createLogger } from '../utils/logger.js';
import { getVoiceAnalyzer, type VoiceMetrics } from '../services/voice-analyzer.service.js';

const log = createLogger('EmotionAnalyzer');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionCategory = 
  | 'happy'
  | 'sad'
  | 'frustrated'
  | 'anxious'
  | 'excited'
  | 'calm'
  | 'neutral';

export interface DetectedEmotion {
  /** Primary detected emotion */
  primary: EmotionCategory;
  
  /** Confidence level (0-1) */
  confidence: number;
  
  /** Secondary emotions with lower confidence */
  secondary: { emotion: EmotionCategory; confidence: number }[];
  
  /** Source of detection */
  source: 'voice' | 'text' | 'combined';
  
  /** Timestamp */
  timestamp: number;
}

export interface EmotionAnalyzerConfig {
  /** Minimum confidence to report emotion */
  minConfidence: number;
  
  /** Enable voice analysis */
  voiceAnalysis: boolean;
  
  /** Enable text analysis */
  textAnalysis: boolean;
  
  /** Smoothing window size (number of readings to average) */
  smoothingWindow: number;
  
  /** How often to emit emotion updates (ms) */
  emitInterval: number;
}

// ============================================================================
// SENTIMENT LEXICON
// ============================================================================

const EMOTION_KEYWORDS: Record<EmotionCategory, string[]> = {
  happy: [
    'happy', 'great', 'amazing', 'wonderful', 'fantastic', 'love', 'excited',
    'awesome', 'excellent', 'perfect', 'thrilled', 'delighted', 'joy', 'grateful',
    'blessed', 'fortunate', 'glad', 'pleased', 'cheerful', 'bright',
  ],
  sad: [
    'sad', 'unhappy', 'depressed', 'down', 'upset', 'crying', 'tears',
    'miserable', 'heartbroken', 'disappointed', 'hopeless', 'lonely', 'grief',
    'mourn', 'loss', 'hurt', 'pain', 'struggle', 'hard time',
  ],
  frustrated: [
    'frustrated', 'annoyed', 'angry', 'irritated', 'mad', 'furious', 'stuck',
    'cant', "can't", 'impossible', 'give up', 'hate', 'ugh', 'argh',
    'stupid', 'useless', 'broken', 'failed', 'failing', 'never works',
  ],
  anxious: [
    'anxious', 'worried', 'nervous', 'scared', 'afraid', 'fear', 'panic',
    'stress', 'stressed', 'overwhelming', 'overwhelmed', 'too much',
    'cant cope', "can't cope", 'what if', 'might happen', 'disaster',
  ],
  excited: [
    'excited', 'cant wait', "can't wait", 'pumped', 'stoked', 'hyped',
    'amazing news', 'finally', 'yes', 'woohoo', 'incredible', 'unbelievable',
    'dream come true', 'made it', 'did it', 'accomplished',
  ],
  calm: [
    'calm', 'peaceful', 'relaxed', 'serene', 'content', 'centered',
    'balanced', 'mindful', 'present', 'grounded', 'at ease', 'comfortable',
    'okay', 'fine', 'good', 'alright',
  ],
  neutral: [],
};

// Phrases that indicate emotional intensity
const INTENSITY_BOOSTERS = [
  'very', 'really', 'so', 'extremely', 'incredibly', 'absolutely',
  'totally', 'completely', 'utterly', 'super', 'seriously',
];

// ============================================================================
// EMOTION ANALYZER
// ============================================================================

export class EmotionAnalyzer {
  private config: EmotionAnalyzerConfig;
  private emotionHistory: DetectedEmotion[] = [];
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private lastEmittedEmotion: DetectedEmotion | null = null;
  private isRunning: boolean = false;
  
  // Voice metrics smoothing
  private voiceMetricsHistory: VoiceMetrics[] = [];
  
  constructor(config: Partial<EmotionAnalyzerConfig> = {}) {
    this.config = {
      minConfidence: 0.5,
      voiceAnalysis: true,
      textAnalysis: true,
      smoothingWindow: 5,
      emitInterval: 2000,
      ...config,
    };
    
    log.debug('EmotionAnalyzer created', { config: this.config });
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  /**
   * Start emotion analysis
   */
  start(): void {
    if (this.isRunning) return;
    
    // Set up voice analysis subscription
    if (this.config.voiceAnalysis) {
      const voiceAnalyzer = getVoiceAnalyzer();
      voiceAnalyzer.onUpdate((metrics) => {
        this.processVoiceMetrics(metrics);
      });
    }
    
    // Set up periodic emission
    this.emitTimer = setInterval(() => {
      this.emitCurrentEmotion();
    }, this.config.emitInterval);
    
    this.isRunning = true;
    log.info('Emotion analyzer started');
  }
  
  /**
   * Stop emotion analysis
   */
  stop(): void {
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
    
    this.isRunning = false;
    log.info('Emotion analyzer stopped');
  }
  
  // ==========================================================================
  // VOICE ANALYSIS
  // ==========================================================================
  
  private processVoiceMetrics(metrics: VoiceMetrics): void {
    // Add to history
    this.voiceMetricsHistory.push(metrics);
    if (this.voiceMetricsHistory.length > this.config.smoothingWindow) {
      this.voiceMetricsHistory.shift();
    }
    
    // Analyze voice characteristics
    const voiceEmotion = this.analyzeVoiceCharacteristics();
    if (voiceEmotion) {
      this.addToHistory(voiceEmotion);
    }
  }
  
  private analyzeVoiceCharacteristics(): DetectedEmotion | null {
    if (this.voiceMetricsHistory.length < 3) return null;
    
    // Average metrics
    const avgAmplitude = this.average(this.voiceMetricsHistory.map(m => m.amplitude));
    const avgEnergy = this.voiceMetricsHistory.filter(m => m.isSpeaking).length / this.voiceMetricsHistory.length;
    const energyLevel = this.voiceMetricsHistory[this.voiceMetricsHistory.length - 1]?.energyLevel || 'normal';
    
    // Map voice characteristics to emotions
    let primary: EmotionCategory = 'neutral';
    let confidence = 0.3;
    
    if (energyLevel === 'excited') {
      // High energy could be excitement or frustration
      if (avgAmplitude > 0.6) {
        primary = 'excited';
        confidence = 0.6 + (avgAmplitude * 0.2);
      }
    } else if (energyLevel === 'calm') {
      primary = 'calm';
      confidence = 0.5;
    } else if (avgEnergy < 0.3 && avgAmplitude < 0.2) {
      // Low energy, low amplitude could be sadness
      primary = 'sad';
      confidence = 0.4;
    }
    
    // Don't report low-confidence voice emotions
    if (confidence < this.config.minConfidence) {
      return null;
    }
    
    return {
      primary,
      confidence,
      secondary: [],
      source: 'voice',
      timestamp: Date.now(),
    };
  }
  
  // ==========================================================================
  // TEXT ANALYSIS
  // ==========================================================================
  
  /**
   * Analyze text for emotional content
   */
  analyzeText(text: string): DetectedEmotion {
    const lowercaseText = text.toLowerCase();
    const words = lowercaseText.split(/\s+/);
    
    // Count emotion keywords
    const emotionScores: Record<EmotionCategory, number> = {
      happy: 0,
      sad: 0,
      frustrated: 0,
      anxious: 0,
      excited: 0,
      calm: 0,
      neutral: 0,
    };
    
    // Check for intensity boosters
    const hasIntensityBooster = INTENSITY_BOOSTERS.some(booster => 
      lowercaseText.includes(booster)
    );
    const intensityMultiplier = hasIntensityBooster ? 1.3 : 1.0;
    
    // Score each emotion
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS) as [EmotionCategory, string[]][]) {
      for (const keyword of keywords) {
        if (lowercaseText.includes(keyword)) {
          emotionScores[emotion] += 1 * intensityMultiplier;
        }
      }
    }
    
    // Find primary emotion
    let primary: EmotionCategory = 'neutral';
    let maxScore = 0;
    const secondary: { emotion: EmotionCategory; confidence: number }[] = [];
    
    for (const [emotion, score] of Object.entries(emotionScores) as [EmotionCategory, number][]) {
      if (score > maxScore) {
        if (maxScore > 0) {
          secondary.push({ 
            emotion: primary, 
            confidence: this.scoreToConfidence(maxScore, words.length),
          });
        }
        maxScore = score;
        primary = emotion;
      } else if (score > 0) {
        secondary.push({ 
          emotion, 
          confidence: this.scoreToConfidence(score, words.length),
        });
      }
    }
    
    // Calculate confidence based on keyword density
    const confidence = this.scoreToConfidence(maxScore, words.length);
    
    const result: DetectedEmotion = {
      primary,
      confidence,
      secondary: secondary.sort((a, b) => b.confidence - a.confidence).slice(0, 2),
      source: 'text',
      timestamp: Date.now(),
    };
    
    // Add to history
    this.addToHistory(result);
    
    // Emit if above threshold
    if (confidence >= this.config.minConfidence) {
      this.emitEmotion(result);
    }
    
    return result;
  }
  
  private scoreToConfidence(score: number, wordCount: number): number {
    // Higher score relative to word count = higher confidence
    // But cap it to avoid over-confidence on short texts
    const density = score / Math.max(wordCount, 5);
    return Math.min(0.9, 0.3 + (density * 2));
  }
  
  // ==========================================================================
  // COMBINED ANALYSIS
  // ==========================================================================
  
  /**
   * Get combined emotion from all sources
   */
  getCurrentEmotion(): DetectedEmotion {
    const recentEmotions = this.emotionHistory.slice(-10);
    
    if (recentEmotions.length === 0) {
      return {
        primary: 'neutral',
        confidence: 0.5,
        secondary: [],
        source: 'combined',
        timestamp: Date.now(),
      };
    }
    
    // Weight recent emotions more heavily
    const weightedScores: Record<EmotionCategory, number> = {
      happy: 0,
      sad: 0,
      frustrated: 0,
      anxious: 0,
      excited: 0,
      calm: 0,
      neutral: 0,
    };
    
    let totalWeight = 0;
    recentEmotions.forEach((emotion, index) => {
      const recencyWeight = (index + 1) / recentEmotions.length;
      const confidenceWeight = emotion.confidence;
      const weight = recencyWeight * confidenceWeight;
      
      weightedScores[emotion.primary] += weight;
      totalWeight += weight;
    });
    
    // Normalize
    if (totalWeight > 0) {
      for (const emotion of Object.keys(weightedScores) as EmotionCategory[]) {
        weightedScores[emotion] /= totalWeight;
      }
    }
    
    // Find primary
    let primary: EmotionCategory = 'neutral';
    let maxScore = 0;
    
    for (const [emotion, score] of Object.entries(weightedScores) as [EmotionCategory, number][]) {
      if (score > maxScore) {
        maxScore = score;
        primary = emotion;
      }
    }
    
    return {
      primary,
      confidence: maxScore,
      secondary: [],
      source: 'combined',
      timestamp: Date.now(),
    };
  }
  
  // ==========================================================================
  // EMISSION
  // ==========================================================================
  
  private addToHistory(emotion: DetectedEmotion): void {
    this.emotionHistory.push(emotion);
    if (this.emotionHistory.length > 50) {
      this.emotionHistory.shift();
    }
  }
  
  private emitCurrentEmotion(): void {
    const current = this.getCurrentEmotion();
    
    // Only emit if significantly different from last emission
    if (this.lastEmittedEmotion) {
      if (current.primary === this.lastEmittedEmotion.primary &&
          Math.abs(current.confidence - this.lastEmittedEmotion.confidence) < 0.2) {
        return;
      }
    }
    
    // Only emit if above threshold
    if (current.confidence < this.config.minConfidence) {
      return;
    }
    
    this.emitEmotion(current);
  }
  
  private emitEmotion(emotion: DetectedEmotion): void {
    this.lastEmittedEmotion = emotion;
    
    document.dispatchEvent(new CustomEvent('ferni:emotion-detected', {
      detail: emotion,
    }));
    
    log.debug('Emotion emitted', { 
      primary: emotion.primary, 
      confidence: emotion.confidence.toFixed(2),
    });
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private average(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  /**
   * Clear emotion history (for testing)
   */
  clearHistory(): void {
    this.emotionHistory = [];
    this.lastEmittedEmotion = null;
    this.voiceMetricsHistory = [];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let emotionAnalyzerInstance: EmotionAnalyzer | null = null;

export function getEmotionAnalyzer(config?: Partial<EmotionAnalyzerConfig>): EmotionAnalyzer {
  if (!emotionAnalyzerInstance) {
    emotionAnalyzerInstance = new EmotionAnalyzer(config);
  }
  return emotionAnalyzerInstance;
}

export function resetEmotionAnalyzer(): void {
  if (emotionAnalyzerInstance) {
    emotionAnalyzerInstance.stop();
  }
  emotionAnalyzerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const analyzeText = (text: string) => getEmotionAnalyzer().analyzeText(text);
export const getCurrentEmotion = () => getEmotionAnalyzer().getCurrentEmotion();
export const startEmotionAnalysis = () => getEmotionAnalyzer().start();
export const stopEmotionAnalysis = () => getEmotionAnalyzer().stop();

