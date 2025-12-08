/**
 * Ferni Haptics Service
 * 
 * Touch feedback vocabulary for emotional connection.
 * "Touch makes digital feel human."
 * 
 * @module @ferni/haptics
 */

import { createLogger } from '../utils/logger.js';
// PersonaId type inline to avoid import issues
type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

const log = createLogger('Haptics');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionType = 'happy' | 'sad' | 'anxious' | 'frustrated' | 'thoughtful' | 'excited' | 'neutral';

export interface HapticConfig {
  /** Master enable/disable */
  enabled: boolean;
  
  /** Intensity multiplier (0-1) */
  intensityMultiplier: number;
  
  /** Use simplified patterns (accessibility) */
  simplifiedMode: boolean;
  
  /** Respect system haptic settings */
  respectSystemSettings: boolean;
}

export interface HapticPattern {
  name: string;
  events: HapticEvent[];
  totalDuration: number;
}

export interface HapticEvent {
  type: 'transient' | 'continuous';
  startTime: number;       // ms from pattern start
  duration?: number;       // ms, for continuous
  intensity: number;       // 0-1
  sharpness?: number;      // 0-1 (iOS only)
}

// ============================================================================
// HAPTIC PATTERNS
// ============================================================================

export const HAPTIC_PATTERNS: Record<string, HapticPattern> = {
  // ==========================================================================
  // BASIC PATTERNS
  // ==========================================================================
  
  tap: {
    name: 'tap',
    totalDuration: 15,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
    ],
  },
  
  softTap: {
    name: 'softTap',
    totalDuration: 15,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.25 },
    ],
  },
  
  doubleTap: {
    name: 'doubleTap',
    totalDuration: 80,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
      { type: 'transient', startTime: 50, intensity: 0.5 },
    ],
  },
  
  press: {
    name: 'press',
    totalDuration: 50,
    events: [
      { type: 'continuous', startTime: 0, duration: 50, intensity: 0.6 },
    ],
  },
  
  bump: {
    name: 'bump',
    totalDuration: 30,
    events: [
      { type: 'continuous', startTime: 0, duration: 30, intensity: 0.7 },
    ],
  },
  
  // ==========================================================================
  // FERNI SIGNATURE PATTERNS
  // ==========================================================================
  
  ferniBreath: {
    name: 'ferniBreath',
    totalDuration: 300,
    events: [
      { type: 'continuous', startTime: 0, duration: 300, intensity: 0.25, sharpness: 0.1 },
    ],
  },
  
  warmWelcome: {
    name: 'warmWelcome',
    totalDuration: 600,
    events: [
      { type: 'continuous', startTime: 0, duration: 200, intensity: 0.3 },
      { type: 'continuous', startTime: 250, duration: 200, intensity: 0.25 },
      { type: 'transient', startTime: 500, intensity: 0.4 },
    ],
  },
  
  heartbeat: {
    name: 'heartbeat',
    totalDuration: 300,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.6 },
      { type: 'transient', startTime: 100, intensity: 0.5 },
    ],
  },
  
  // ==========================================================================
  // CELEBRATION PATTERNS
  // ==========================================================================
  
  sparkle: {
    name: 'sparkle',
    totalDuration: 300,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
      { type: 'transient', startTime: 80, intensity: 0.3 },
      { type: 'transient', startTime: 150, intensity: 0.3 },
      { type: 'transient', startTime: 220, intensity: 0.2 },
    ],
  },
  
  celebration: {
    name: 'celebration',
    totalDuration: 500,
    events: [
      { type: 'continuous', startTime: 0, duration: 150, intensity: 0.7 },
      { type: 'transient', startTime: 200, intensity: 0.5 },
      { type: 'transient', startTime: 280, intensity: 0.4 },
      { type: 'transient', startTime: 350, intensity: 0.3 },
      { type: 'transient', startTime: 420, intensity: 0.2 },
    ],
  },
  
  milestone: {
    name: 'milestone',
    totalDuration: 700,
    events: [
      { type: 'continuous', startTime: 0, duration: 200, intensity: 0.5 },
      { type: 'continuous', startTime: 200, duration: 300, intensity: 0.8 },
      { type: 'transient', startTime: 550, intensity: 0.4 },
      { type: 'transient', startTime: 620, intensity: 0.3 },
    ],
  },
  
  // ==========================================================================
  // EMOTIONAL PATTERNS
  // ==========================================================================
  
  empathy: {
    name: 'empathy',
    totalDuration: 500,
    events: [
      { type: 'continuous', startTime: 0, duration: 500, intensity: 0.3, sharpness: 0.1 },
    ],
  },
  
  presence: {
    name: 'presence',
    totalDuration: 800,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
      { type: 'transient', startTime: 300, intensity: 0.4 },
      { type: 'transient', startTime: 500, intensity: 0.5 },
      { type: 'transient', startTime: 700, intensity: 0.4 },
    ],
  },
  
  support: {
    name: 'support',
    totalDuration: 600,
    events: [
      { type: 'continuous', startTime: 0, duration: 600, intensity: 0.35, sharpness: 0.2 },
    ],
  },
  
  calm: {
    name: 'calm',
    totalDuration: 400,
    events: [
      { type: 'continuous', startTime: 0, duration: 400, intensity: 0.2, sharpness: 0.05 },
    ],
  },
  
  // ==========================================================================
  // INTERACTION FEEDBACK
  // ==========================================================================
  
  buttonPress: {
    name: 'buttonPress',
    totalDuration: 15,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5 },
    ],
  },
  
  toggleOn: {
    name: 'toggleOn',
    totalDuration: 20,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.5, sharpness: 0.6 },
    ],
  },
  
  toggleOff: {
    name: 'toggleOff',
    totalDuration: 15,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.3, sharpness: 0.4 },
    ],
  },
  
  scrollSnap: {
    name: 'scrollSnap',
    totalDuration: 10,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.2 },
    ],
  },
  
  // ==========================================================================
  // ERROR/WARNING
  // ==========================================================================
  
  error: {
    name: 'error',
    totalDuration: 250,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.6 },
      { type: 'transient', startTime: 80, intensity: 0.4 },
      { type: 'transient', startTime: 160, intensity: 0.3 },
    ],
  },
  
  warning: {
    name: 'warning',
    totalDuration: 100,
    events: [
      { type: 'transient', startTime: 0, intensity: 0.4 },
      { type: 'transient', startTime: 60, intensity: 0.3 },
    ],
  },
};

// ============================================================================
// PERSONA HAPTIC PROFILES
// ============================================================================

interface PersonaHapticProfile {
  speaking: HapticPattern;
  acknowledgment: HapticPattern;
  signature: HapticPattern;
  intensityModifier: number;
}

const PERSONA_HAPTICS: Record<PersonaId, PersonaHapticProfile> = {
  ferni: {
    speaking: HAPTIC_PATTERNS.ferniBreath!,
    acknowledgment: HAPTIC_PATTERNS.doubleTap!,
    signature: HAPTIC_PATTERNS.warmWelcome!,
    intensityModifier: 1.0,
  },
  jack: {
    speaking: { ...HAPTIC_PATTERNS.ferniBreath!, events: HAPTIC_PATTERNS.ferniBreath!.events.map(e => ({ ...e, intensity: e.intensity * 0.8 })) },
    acknowledgment: HAPTIC_PATTERNS.tap!,
    signature: HAPTIC_PATTERNS.presence!,
    intensityModifier: 0.85,
  },
  peter: {
    speaking: { ...HAPTIC_PATTERNS.ferniBreath!, totalDuration: 200, events: HAPTIC_PATTERNS.ferniBreath!.events.map(e => ({ ...e, duration: 200, intensity: e.intensity * 1.1 })) },
    acknowledgment: HAPTIC_PATTERNS.doubleTap!,
    signature: HAPTIC_PATTERNS.sparkle!,
    intensityModifier: 1.1,
  },
  alex: {
    speaking: HAPTIC_PATTERNS.ferniBreath!,
    acknowledgment: HAPTIC_PATTERNS.softTap!,
    signature: HAPTIC_PATTERNS.empathy!,
    intensityModifier: 0.9,
  },
  maya: {
    speaking: { ...HAPTIC_PATTERNS.tap!, events: [{ type: 'transient', startTime: 0, intensity: 0.4 }] },
    acknowledgment: HAPTIC_PATTERNS.tap!,
    signature: HAPTIC_PATTERNS.tap!,
    intensityModifier: 1.0,
  },
  jordan: {
    speaking: HAPTIC_PATTERNS.sparkle!,
    acknowledgment: HAPTIC_PATTERNS.doubleTap!,
    signature: HAPTIC_PATTERNS.celebration!,
    intensityModifier: 1.15,
  },
  nayan: {
    speaking: HAPTIC_PATTERNS.ferniBreath!,
    acknowledgment: HAPTIC_PATTERNS.presence!,
    signature: HAPTIC_PATTERNS.milestone!,
    intensityModifier: 0.95,
  },
};

// ============================================================================
// HAPTICS SERVICE
// ============================================================================

export class HapticsService {
  private config: HapticConfig;
  private platform: 'ios' | 'android' | 'web' | 'unsupported';
  private currentPersona: PersonaId = 'ferni';
  
  // Web Vibration API
  private vibrator?: Navigator['vibrate'];
  
  constructor(config: Partial<HapticConfig> = {}) {
    this.config = {
      enabled: true,
      intensityMultiplier: 1,
      simplifiedMode: false,
      respectSystemSettings: true,
      ...config,
    };
    
    this.platform = this.detectPlatform();
    this.initializePlatform();
    
    log.info('Haptics service initialized', { platform: this.platform, enabled: this.config.enabled });
  }
  
  // ==========================================================================
  // PLATFORM DETECTION
  // ==========================================================================
  
  private detectPlatform(): 'ios' | 'android' | 'web' | 'unsupported' {
    if (typeof window === 'undefined') return 'unsupported';
    
    const ua = navigator.userAgent;
    
    // Check for native iOS (would be injected by native wrapper)
    if ((window as unknown as Record<string, unknown>).webkit?.messageHandlers?.haptics) {
      return 'ios';
    }
    
    // Check for native Android (would be injected by native wrapper)
    if ((window as unknown as Record<string, unknown>).FerniAndroid?.haptics) {
      return 'android';
    }
    
    // Check for Web Vibration API
    if ('vibrate' in navigator) {
      return 'web';
    }
    
    return 'unsupported';
  }
  
  private initializePlatform(): void {
    switch (this.platform) {
      case 'web':
        this.vibrator = navigator.vibrate.bind(navigator);
        break;
      // iOS and Android would call native methods
    }
  }
  
  // ==========================================================================
  // CORE METHODS
  // ==========================================================================
  
  /**
   * Check if haptics are supported and enabled
   */
  isAvailable(): boolean {
    return this.config.enabled && this.platform !== 'unsupported';
  }
  
  /**
   * Play a haptic pattern by name
   */
  play(patternName: string, options: { intensity?: number } = {}): void {
    if (!this.isAvailable()) return;
    
    const pattern = HAPTIC_PATTERNS[patternName];
    if (!pattern) {
      log.warn('Unknown haptic pattern', { patternName });
      return;
    }
    
    const intensity = (options.intensity ?? 1) * this.config.intensityMultiplier;
    this.executePattern(pattern, intensity);
    
    log.debug('Playing haptic', { pattern: patternName, intensity });
  }
  
  /**
   * Play a pattern using raw pattern data
   */
  playPattern(pattern: HapticPattern, options: { intensity?: number } = {}): void {
    if (!this.isAvailable()) return;
    
    const intensity = (options.intensity ?? 1) * this.config.intensityMultiplier;
    this.executePattern(pattern, intensity);
  }
  
  /**
   * Play haptic for current persona's event
   */
  playForPersona(event: 'speaking' | 'acknowledgment' | 'signature', personaId?: PersonaId): void {
    if (!this.isAvailable()) return;
    
    const persona = personaId || this.currentPersona;
    const profile = PERSONA_HAPTICS[persona];
    
    const pattern = profile[event];
    const intensity = profile.intensityModifier * this.config.intensityMultiplier;
    
    this.executePattern(pattern, intensity);
    
    log.debug('Playing persona haptic', { event, persona, intensity });
  }
  
  /**
   * Play haptic for emotional context
   */
  playForEmotion(event: 'acknowledgment' | 'support', emotion: EmotionType): void {
    if (!this.isAvailable()) return;
    
    const emotionPatterns: Record<EmotionType, string> = {
      happy: 'sparkle',
      excited: 'celebration',
      neutral: 'tap',
      thoughtful: 'softTap',
      sad: 'empathy',
      anxious: 'calm',
      frustrated: 'support',
    };
    
    const patternName = event === 'support' ? emotionPatterns[emotion] : 'empathy';
    this.play(patternName);
  }
  
  /**
   * Play celebration haptic
   */
  celebrate(magnitude: 'small' | 'medium' | 'large'): void {
    if (!this.isAvailable()) return;
    
    const patterns: Record<string, string> = {
      small: 'sparkle',
      medium: 'celebration',
      large: 'milestone',
    };
    
    const intensities: Record<string, number> = {
      small: 0.8,
      medium: 1,
      large: 1.2,
    };
    
    this.play(patterns[magnitude], { intensity: intensities[magnitude] });
  }
  
  // ==========================================================================
  // PLATFORM EXECUTION
  // ==========================================================================
  
  private executePattern(pattern: HapticPattern, intensityMultiplier: number): void {
    switch (this.platform) {
      case 'ios':
        this.executeIOS(pattern, intensityMultiplier);
        break;
      case 'android':
        this.executeAndroid(pattern, intensityMultiplier);
        break;
      case 'web':
        this.executeWeb(pattern, intensityMultiplier);
        break;
    }
  }
  
  private executeIOS(pattern: HapticPattern, intensityMultiplier: number): void {
    // Call native iOS haptic engine via webkit bridge
    const webkit = (window as unknown as Record<string, unknown>).webkit as {
      messageHandlers?: { haptics?: { postMessage: (data: unknown) => void } };
    };
    
    webkit?.messageHandlers?.haptics?.postMessage({
      pattern: pattern.name,
      events: pattern.events.map(e => ({
        ...e,
        intensity: e.intensity * intensityMultiplier,
      })),
    });
  }
  
  private executeAndroid(pattern: HapticPattern, intensityMultiplier: number): void {
    // Call native Android haptic engine
    const android = (window as unknown as Record<string, unknown>).FerniAndroid as {
      haptics?: { play: (pattern: string, events: string) => void };
    };
    
    android?.haptics?.play(
      pattern.name,
      JSON.stringify(pattern.events.map(e => ({
        ...e,
        intensity: Math.round(e.intensity * intensityMultiplier * 255),
      })))
    );
  }
  
  private executeWeb(pattern: HapticPattern, intensityMultiplier: number): void {
    if (!this.vibrator) return;
    
    // Web Vibration API is limited - convert to simple pattern
    const vibrationPattern: number[] = [];
    let currentTime = 0;
    
    for (const event of pattern.events) {
      // Add pause before this event
      if (event.startTime > currentTime) {
        vibrationPattern.push(event.startTime - currentTime);
      }
      
      // Add vibration duration (scaled by intensity)
      const duration = event.type === 'continuous' 
        ? (event.duration || 50) 
        : 15;
      const scaledDuration = Math.round(duration * event.intensity * intensityMultiplier);
      vibrationPattern.push(Math.max(10, scaledDuration));
      
      currentTime = event.startTime + duration;
    }
    
    try {
      this.vibrator(vibrationPattern);
    } catch (e) {
      log.warn('Web vibration failed', { error: e });
    }
  }
  
  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================
  
  /**
   * Set current persona context
   */
  setPersona(personaId: PersonaId): void {
    this.currentPersona = personaId;
  }
  
  /**
   * Enable/disable haptics
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    log.info('Haptics enabled changed', { enabled });
  }
  
  /**
   * Set intensity multiplier
   */
  setIntensity(multiplier: number): void {
    this.config.intensityMultiplier = Math.max(0, Math.min(1, multiplier));
    log.info('Haptics intensity changed', { multiplier: this.config.intensityMultiplier });
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<HapticConfig>): void {
    this.config = { ...this.config, ...config };
    log.info('Haptics config updated', { enabled: this.config.enabled });
  }
  
  /**
   * Get current configuration
   */
  getConfig(): HapticConfig {
    return { ...this.config };
  }
  
  /**
   * Get platform info
   */
  getPlatformInfo(): { platform: string; supported: boolean } {
    return {
      platform: this.platform,
      supported: this.platform !== 'unsupported',
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let hapticsInstance: HapticsService | null = null;

/**
 * Get the haptics service singleton
 */
export function getHapticsService(config?: Partial<HapticConfig>): HapticsService {
  if (!hapticsInstance) {
    hapticsInstance = new HapticsService(config);
  }
  return hapticsInstance;
}

/**
 * Reset the haptics service (for testing)
 */
export function resetHapticsService(): void {
  hapticsInstance = null;
}

