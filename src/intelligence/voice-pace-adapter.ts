/**
 * Voice Pace Adapter
 * 
 * Learns and adapts to each user's preferred conversation rhythm.
 * 
 * Features:
 * - Track user's speaking pace (WPM)
 * - Learn pause preferences (how long they need to think)
 * - Adapt Jack's response length and pacing
 * - Detect when user is rushed vs relaxed
 * - Match energy levels
 * - Handle interruption patterns
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Speaking pace category
 */
export type PaceCategory = 'very_slow' | 'slow' | 'moderate' | 'fast' | 'very_fast';

/**
 * Energy level
 */
export type EnergyLevel = 'low' | 'moderate' | 'high';

/**
 * Conversation tempo
 */
export type ConversationTempo = 'relaxed' | 'normal' | 'brisk' | 'rushed';

/**
 * A single pace observation
 */
export interface PaceObservation {
  timestamp: Date;
  
  // User metrics
  userWPM: number;              // Words per minute
  userMessageLength: number;    // Words in message
  userResponseTime: number;     // Seconds to respond
  
  // Context
  topic: string;
  emotionalState: string;
  conversationMinute: number;   // How far into the conversation
  
  // User signals
  wasInterruption: boolean;
  askedToSlowDown: boolean;
  askedToSpeedUp: boolean;
  seemedRushed: boolean;
  seemedRelaxed: boolean;
}

/**
 * Learned pace preferences
 */
export interface LearnedPacePreferences {
  // Speaking characteristics
  avgWPM: number;
  wpmCategory: PaceCategory;
  wpmVariance: number;          // How much their pace varies
  
  // Response patterns
  avgResponseTime: number;      // Seconds
  avgMessageLength: number;     // Words
  prefersShortResponses: boolean;
  
  // Timing
  preferredPauseLength: number; // Seconds - how long Jack should pause
  needsThinkingTime: boolean;   // User takes time to formulate thoughts
  
  // Energy
  typicalEnergyLevel: EnergyLevel;
  energyVariesByTime: boolean;  // e.g., lower energy in morning
  
  // Tempo
  preferredTempo: ConversationTempo;
  toleratesLongResponses: boolean;
  
  // Patterns
  paceFasterWhenAnxious: boolean;
  paceSlowerWhenThinking: boolean;
  
  // Interruptions
  interruptionFrequency: 'rare' | 'occasional' | 'frequent';
  interruptsWhenExcited: boolean;
  
  // Adaptation settings for Jack
  recommendedJackWPM: number;
  recommendedJackPause: number;
  recommendedResponseLength: 'brief' | 'moderate' | 'detailed';
  
  // Stats
  totalObservations: number;
  lastUpdated: Date;
}

/**
 * Real-time pace state
 */
export interface CurrentPaceState {
  // Current session
  sessionStarted: Date;
  observationCount: number;
  
  // Current metrics
  currentUserWPM: number;
  currentEnergyLevel: EnergyLevel;
  currentTempo: ConversationTempo;
  
  // Signals
  isRushed: boolean;
  isRelaxed: boolean;
  hasRequestedPaceChange: boolean;
  
  // Recommended adaptations
  jackShouldSlowDown: boolean;
  jackShouldSpeedUp: boolean;
  jackShouldBeBrief: boolean;
  jackShouldElaborate: boolean;
}

// ============================================================================
// VOICE PACE ADAPTER
// ============================================================================

export class VoicePaceAdapter {
  private userId: string;
  private observations: PaceObservation[] = [];
  private currentState: CurrentPaceState;
  private sessionStart: Date;
  
  constructor(userId: string, existingObservations?: PaceObservation[]) {
    this.userId = userId;
    this.sessionStart = new Date();
    
    if (existingObservations) {
      this.observations = existingObservations;
    }
    
    this.currentState = this.initializeCurrentState();
  }
  
  /**
   * Initialize current state
   */
  private initializeCurrentState(): CurrentPaceState {
    const prefs = this.calculatePreferences();
    
    return {
      sessionStarted: this.sessionStart,
      observationCount: 0,
      currentUserWPM: prefs.avgWPM || 150,
      currentEnergyLevel: prefs.typicalEnergyLevel || 'moderate',
      currentTempo: prefs.preferredTempo || 'normal',
      isRushed: false,
      isRelaxed: false,
      hasRequestedPaceChange: false,
      jackShouldSlowDown: false,
      jackShouldSpeedUp: false,
      jackShouldBeBrief: false,
      jackShouldElaborate: false,
    };
  }
  
  // ============================================================================
  // OBSERVATION
  // ============================================================================
  
  /**
   * Record a pace observation from user message
   */
  recordObservation(params: {
    userMessage: string;
    responseTimeSeconds: number;
    topic: string;
    emotionalState: string;
    wasInterruption?: boolean;
  }): PaceObservation {
    const words = params.userMessage.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    // Calculate WPM (assuming message took ~10% of response time to speak)
    const speakingTime = Math.max(params.responseTimeSeconds * 0.1, 1);
    const userWPM = Math.round((wordCount / speakingTime) * 60);
    
    // Detect signals from message content
    const lower = params.userMessage.toLowerCase();
    const askedToSlowDown = /\b(slow down|too fast|wait|hold on)\b/.test(lower);
    const askedToSpeedUp = /\b(get to the point|briefly|quick|hurry|short on time)\b/.test(lower);
    const seemedRushed = /\b(gotta go|quick question|running late|no time)\b/.test(lower) ||
                         params.responseTimeSeconds < 1;
    const seemedRelaxed = wordCount > 30 || /\b(anyway|so|well)\b/.test(lower);
    
    const observation: PaceObservation = {
      timestamp: new Date(),
      userWPM: Math.min(Math.max(userWPM, 50), 300),  // Clamp to reasonable range
      userMessageLength: wordCount,
      userResponseTime: params.responseTimeSeconds,
      topic: params.topic,
      emotionalState: params.emotionalState,
      conversationMinute: Math.floor(
        (Date.now() - this.sessionStart.getTime()) / 60000
      ),
      wasInterruption: params.wasInterruption || false,
      askedToSlowDown,
      askedToSpeedUp,
      seemedRushed,
      seemedRelaxed,
    };
    
    this.observations.push(observation);
    
    // Keep only last 500 observations
    if (this.observations.length > 500) {
      this.observations = this.observations.slice(-500);
    }
    
    // Update current state
    this.updateCurrentState(observation);
    
    getLogger().debug({
      wpm: observation.userWPM,
      length: wordCount,
      rushed: seemedRushed
    }, 'Pace observation recorded');
    
    return observation;
  }
  
  /**
   * Update current state based on new observation
   */
  private updateCurrentState(obs: PaceObservation): void {
    this.currentState.observationCount++;
    
    // Update WPM with exponential moving average
    const alpha = 0.3;
    this.currentState.currentUserWPM = Math.round(
      alpha * obs.userWPM + (1 - alpha) * this.currentState.currentUserWPM
    );
    
    // Update energy level
    if (obs.userWPM > 200 || obs.userMessageLength > 50) {
      this.currentState.currentEnergyLevel = 'high';
    } else if (obs.userWPM < 100 || obs.userMessageLength < 10) {
      this.currentState.currentEnergyLevel = 'low';
    } else {
      this.currentState.currentEnergyLevel = 'moderate';
    }
    
    // Update tempo
    if (obs.seemedRushed) {
      this.currentState.currentTempo = 'rushed';
      this.currentState.isRushed = true;
    } else if (obs.seemedRelaxed) {
      this.currentState.currentTempo = 'relaxed';
      this.currentState.isRelaxed = true;
    }
    
    // Handle explicit requests
    if (obs.askedToSlowDown) {
      this.currentState.hasRequestedPaceChange = true;
      this.currentState.jackShouldSlowDown = true;
      this.currentState.jackShouldSpeedUp = false;
    }
    if (obs.askedToSpeedUp) {
      this.currentState.hasRequestedPaceChange = true;
      this.currentState.jackShouldSpeedUp = true;
      this.currentState.jackShouldSlowDown = false;
      this.currentState.jackShouldBeBrief = true;
    }
    
    // Infer what Jack should do
    if (this.currentState.currentTempo === 'rushed') {
      this.currentState.jackShouldBeBrief = true;
    } else if (this.currentState.currentTempo === 'relaxed') {
      this.currentState.jackShouldElaborate = true;
    }
  }
  
  // ============================================================================
  // PREFERENCE CALCULATION
  // ============================================================================
  
  /**
   * Calculate learned preferences from observations
   */
  calculatePreferences(): LearnedPacePreferences {
    if (this.observations.length < 3) {
      return this.getDefaultPreferences();
    }
    
    // Calculate averages
    const wpmValues = this.observations.map(o => o.userWPM);
    const avgWPM = wpmValues.reduce((a, b) => a + b, 0) / wpmValues.length;
    
    const responseTimes = this.observations.map(o => o.userResponseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    const messageLengths = this.observations.map(o => o.userMessageLength);
    const avgMessageLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
    
    // Calculate variance
    const wpmVariance = Math.sqrt(
      wpmValues.reduce((sum, wpm) => sum + Math.pow(wpm - avgWPM, 2), 0) / wpmValues.length
    );
    
    // Categorize WPM
    let wpmCategory: PaceCategory = 'moderate';
    if (avgWPM < 100) wpmCategory = 'very_slow';
    else if (avgWPM < 130) wpmCategory = 'slow';
    else if (avgWPM < 170) wpmCategory = 'moderate';
    else if (avgWPM < 200) wpmCategory = 'fast';
    else wpmCategory = 'very_fast';
    
    // Determine energy level
    let typicalEnergyLevel: EnergyLevel = 'moderate';
    const highEnergyCount = this.observations.filter(
      o => o.userWPM > 180 || o.userMessageLength > 40
    ).length;
    const lowEnergyCount = this.observations.filter(
      o => o.userWPM < 110 || o.userMessageLength < 10
    ).length;
    
    if (highEnergyCount > this.observations.length * 0.5) {
      typicalEnergyLevel = 'high';
    } else if (lowEnergyCount > this.observations.length * 0.5) {
      typicalEnergyLevel = 'low';
    }
    
    // Determine preferred tempo
    const rushedCount = this.observations.filter(o => o.seemedRushed).length;
    const relaxedCount = this.observations.filter(o => o.seemedRelaxed).length;
    
    let preferredTempo: ConversationTempo = 'normal';
    if (rushedCount > this.observations.length * 0.6) {
      preferredTempo = 'rushed';  // Very often rushed
    } else if (rushedCount > this.observations.length * 0.4) {
      preferredTempo = 'brisk';
    } else if (relaxedCount > this.observations.length * 0.4) {
      preferredTempo = 'relaxed';
    }
    
    // Calculate interruption frequency
    const interruptions = this.observations.filter(o => o.wasInterruption).length;
    let interruptionFrequency: 'rare' | 'occasional' | 'frequent' = 'occasional';
    if (interruptions < this.observations.length * 0.1) {
      interruptionFrequency = 'rare';
    } else if (interruptions > this.observations.length * 0.3) {
      interruptionFrequency = 'frequent';
    }
    
    // Calculate recommendations for Jack
    const recommendedJackWPM = Math.round(avgWPM * 0.95);  // Slightly slower than user
    const recommendedJackPause = avgResponseTime > 3 ? 1.5 : 0.8;  // More pause if user takes time
    
    let recommendedResponseLength: 'brief' | 'moderate' | 'detailed' = 'moderate';
    if (preferredTempo === 'brisk' || preferredTempo === 'rushed' || avgMessageLength < 15) {
      recommendedResponseLength = 'brief';
    } else if (preferredTempo === 'relaxed' && avgMessageLength > 30) {
      recommendedResponseLength = 'detailed';
    }
    
    return {
      avgWPM: Math.round(avgWPM),
      wpmCategory,
      wpmVariance: Math.round(wpmVariance),
      
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      avgMessageLength: Math.round(avgMessageLength),
      prefersShortResponses: avgMessageLength < 20,
      
      preferredPauseLength: recommendedJackPause,
      needsThinkingTime: avgResponseTime > 4,
      
      typicalEnergyLevel,
      energyVariesByTime: wpmVariance > 30,
      
      preferredTempo,
      toleratesLongResponses: preferredTempo !== 'brisk' && preferredTempo !== 'rushed',
      
      paceFasterWhenAnxious: false,  // Would need emotional correlation analysis
      paceSlowerWhenThinking: avgResponseTime > 3,
      
      interruptionFrequency,
      interruptsWhenExcited: false,  // Would need more analysis
      
      recommendedJackWPM,
      recommendedJackPause,
      recommendedResponseLength,
      
      totalObservations: this.observations.length,
      lastUpdated: new Date(),
    };
  }
  
  /**
   * Get default preferences for new users
   */
  private getDefaultPreferences(): LearnedPacePreferences {
    return {
      avgWPM: 150,
      wpmCategory: 'moderate',
      wpmVariance: 20,
      
      avgResponseTime: 2,
      avgMessageLength: 20,
      prefersShortResponses: false,
      
      preferredPauseLength: 1.0,
      needsThinkingTime: false,
      
      typicalEnergyLevel: 'moderate',
      energyVariesByTime: false,
      
      preferredTempo: 'normal',
      toleratesLongResponses: true,
      
      paceFasterWhenAnxious: false,
      paceSlowerWhenThinking: false,
      
      interruptionFrequency: 'occasional',
      interruptsWhenExcited: false,
      
      recommendedJackWPM: 145,
      recommendedJackPause: 1.0,
      recommendedResponseLength: 'moderate',
      
      totalObservations: 0,
      lastUpdated: new Date(),
    };
  }
  
  // ============================================================================
  // ADAPTATION GUIDANCE
  // ============================================================================
  
  /**
   * Get current state
   */
  getCurrentState(): CurrentPaceState {
    return { ...this.currentState };
  }
  
  /**
   * Get SSML rate adjustment for TTS
   */
  getSSMLRateAdjustment(): string {
    const prefs = this.calculatePreferences();
    
    // Map WPM to SSML rate
    // Normal speaking rate is about 150 WPM
    const targetWPM = this.currentState.jackShouldSlowDown
      ? prefs.recommendedJackWPM * 0.85
      : this.currentState.jackShouldSpeedUp
        ? prefs.recommendedJackWPM * 1.1
        : prefs.recommendedJackWPM;
    
    // SSML rate: 0.5 = very slow, 1.0 = normal, 2.0 = very fast
    const rate = Math.max(0.7, Math.min(1.3, targetWPM / 150));
    
    return rate.toFixed(2);
  }
  
  /**
   * Get recommended response length in words
   */
  getRecommendedResponseLength(): { min: number; max: number } {
    const prefs = this.calculatePreferences();
    
    // Adjust for current state
    if (this.currentState.jackShouldBeBrief || this.currentState.isRushed) {
      return { min: 10, max: 30 };
    }
    
    if (this.currentState.jackShouldElaborate || this.currentState.isRelaxed) {
      return { min: 40, max: 100 };
    }
    
    switch (prefs.recommendedResponseLength) {
      case 'brief':
        return { min: 15, max: 40 };
      case 'detailed':
        return { min: 50, max: 120 };
      default:
        return { min: 25, max: 70 };
    }
  }
  
  /**
   * Get pace context for prompt injection
   */
  getPaceContext(): string {
    const prefs = this.calculatePreferences();
    const state = this.currentState;
    
    if (prefs.totalObservations < 5) {
      return '';  // Not enough data
    }
    
    const lines: string[] = [];
    
    // Current state adjustments
    if (state.jackShouldSlowDown) {
      lines.push('⚡ USER REQUESTED SLOWER PACE - speak more deliberately');
    }
    if (state.jackShouldSpeedUp || state.isRushed) {
      lines.push('⚡ USER IS RUSHED - be brief and direct');
    }
    
    // Learned preferences
    if (prefs.prefersShortResponses) {
      lines.push('• User prefers shorter responses');
    }
    if (prefs.needsThinkingTime) {
      lines.push('• User takes time to think - give them space');
    }
    if (prefs.preferredTempo === 'relaxed') {
      lines.push('• User enjoys leisurely conversation - no need to rush');
    }
    if (prefs.interruptionFrequency === 'frequent') {
      lines.push('• User often jumps in - keep responses modular');
    }
    
    // Energy matching
    if (prefs.typicalEnergyLevel === 'high') {
      lines.push('• High-energy user - match their enthusiasm');
    } else if (prefs.typicalEnergyLevel === 'low') {
      lines.push('• Calmer user - keep energy grounded');
    }
    
    return lines.length > 0 ? `[VOICE PACING]\n${lines.join('\n')}` : '';
  }
  
  /**
   * Get speech context for SSML generation
   */
  getSpeechContext(): {
    rate: string;
    pauseMultiplier: number;
    energy: EnergyLevel;
    shouldBeBrief: boolean;
  } {
    const prefs = this.calculatePreferences();
    
    return {
      rate: this.getSSMLRateAdjustment(),
      pauseMultiplier: prefs.needsThinkingTime ? 1.3 : 1.0,
      energy: this.currentState.currentEnergyLevel,
      shouldBeBrief: this.currentState.jackShouldBeBrief || this.currentState.isRushed,
    };
  }
  
  // ============================================================================
  // DATA ACCESS
  // ============================================================================
  
  /**
   * Get all observations for persistence
   */
  getObservations(): PaceObservation[] {
    return [...this.observations];
  }
  
  /**
   * Start a new session
   */
  startNewSession(): void {
    this.sessionStart = new Date();
    this.currentState = this.initializeCurrentState();
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const adapters = new Map<string, VoicePaceAdapter>();

export function getVoicePaceAdapter(
  userId: string,
  existingObservations?: PaceObservation[]
): VoicePaceAdapter {
  let adapter = adapters.get(userId);
  if (!adapter) {
    adapter = new VoicePaceAdapter(userId, existingObservations);
    adapters.set(userId, adapter);
  }
  return adapter;
}

export function removeVoicePaceAdapter(userId: string): void {
  adapters.delete(userId);
}

export default VoicePaceAdapter;

