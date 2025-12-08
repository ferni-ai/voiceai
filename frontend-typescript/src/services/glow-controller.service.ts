/**
 * Glow Controller Service
 * 
 * Manages the organic, breathing glow effect around avatars and UI elements.
 * Creates the signature "breathing" feel that makes Ferni feel alive.
 * 
 * @module @ferni/glow
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('GlowController');

// ============================================================================
// TYPES
// ============================================================================

type PersonaId = 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

export interface GlowConfig {
  /** Base glow color (CSS color) */
  color: string;
  
  /** Glow spread radius in pixels */
  spread: number;
  
  /** Glow blur radius in pixels */
  blur: number;
  
  /** Base opacity (0-1) */
  opacity: number;
  
  /** Breathing cycle duration in ms */
  breathingDuration: number;
  
  /** Breathing amplitude (0-1, how much opacity varies) */
  breathingAmplitude: number;
  
  /** Whether to sync with voice/audio */
  syncWithVoice: boolean;
}

export interface GlowState {
  isBreathing: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  currentIntensity: number;
  currentColor: string;
}

type GlowMode = 'idle' | 'breathing' | 'speaking' | 'listening' | 'thinking' | 'celebrating';

// ============================================================================
// PERSONA GLOW PROFILES
// ============================================================================

const PERSONA_GLOW_PROFILES: Record<PersonaId, Partial<GlowConfig>> = {
  ferni: {
    color: '#4a6741',
    spread: 20,
    blur: 40,
    opacity: 0.4,
    breathingDuration: 5000,
    breathingAmplitude: 0.15,
  },
  jack: {
    color: '#9a7b5a',
    spread: 25,
    blur: 50,
    opacity: 0.35,
    breathingDuration: 6000,
    breathingAmplitude: 0.12,
  },
  peter: {
    color: '#3a6b73',
    spread: 18,
    blur: 35,
    opacity: 0.45,
    breathingDuration: 4000,
    breathingAmplitude: 0.2,
  },
  alex: {
    color: '#5a6b8a',
    spread: 22,
    blur: 45,
    opacity: 0.38,
    breathingDuration: 5000,
    breathingAmplitude: 0.14,
  },
  maya: {
    color: '#a67a6a',
    spread: 20,
    blur: 40,
    opacity: 0.4,
    breathingDuration: 4500,
    breathingAmplitude: 0.16,
  },
  jordan: {
    color: '#c4856a',
    spread: 22,
    blur: 45,
    opacity: 0.45,
    breathingDuration: 3500,
    breathingAmplitude: 0.22,
  },
  nayan: {
    color: '#8a7a6a',
    spread: 24,
    blur: 48,
    opacity: 0.36,
    breathingDuration: 5500,
    breathingAmplitude: 0.13,
  },
};

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: GlowConfig = {
  color: '#4a6741',
  spread: 20,
  blur: 40,
  opacity: 0.4,
  breathingDuration: 5000,
  breathingAmplitude: 0.15,
  syncWithVoice: true,
};

// ============================================================================
// GLOW CONTROLLER
// ============================================================================

export class GlowController {
  private element: HTMLElement | null = null;
  private config: GlowConfig;
  private state: GlowState;
  private mode: GlowMode = 'idle';
  
  private animationFrame: number | null = null;
  private breathingStartTime: number = 0;
  
  // Voice sync
  private voiceAmplitude: number = 0;
  private voiceAmplitudeSmoothed: number = 0;
  private readonly voiceSmoothingFactor = 0.15;
  
  constructor(config: Partial<GlowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isBreathing: false,
      isSpeaking: false,
      isListening: false,
      isThinking: false,
      currentIntensity: 0,
      currentColor: this.config.color,
    };
    
    log.debug('GlowController initialized', { config: this.config });
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  /**
   * Attach to a DOM element
   */
  attach(element: HTMLElement): void {
    this.element = element;
    this.applyGlow();
    log.debug('Attached to element', { element: element.className });
  }
  
  /**
   * Detach from current element
   */
  detach(): void {
    this.stopAnimation();
    if (this.element) {
      this.element.style.boxShadow = '';
      this.element.style.filter = '';
    }
    this.element = null;
  }
  
  /**
   * Start breathing animation
   */
  startBreathing(): void {
    if (this.mode === 'breathing' || this.mode === 'speaking') return;
    
    this.mode = 'breathing';
    this.state.isBreathing = true;
    this.breathingStartTime = performance.now();
    this.animate();
    
    log.debug('Started breathing');
  }
  
  /**
   * Stop all animations
   */
  stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.mode = 'idle';
    this.state.isBreathing = false;
  }
  
  // ==========================================================================
  // MODES
  // ==========================================================================
  
  /**
   * Set speaking mode (voice sync)
   */
  setSpeaking(isSpeaking: boolean): void {
    this.state.isSpeaking = isSpeaking;
    
    if (isSpeaking) {
      this.mode = 'speaking';
      this.animate();
    } else if (this.state.isBreathing) {
      this.mode = 'breathing';
    } else {
      this.mode = 'idle';
    }
    
    log.debug('Speaking mode', { isSpeaking });
  }
  
  /**
   * Set listening mode
   */
  setListening(isListening: boolean): void {
    this.state.isListening = isListening;
    
    if (isListening && !this.state.isSpeaking) {
      this.mode = 'listening';
      this.animate();
    } else if (this.state.isSpeaking) {
      this.mode = 'speaking';
    } else if (this.state.isBreathing) {
      this.mode = 'breathing';
    } else {
      this.mode = 'idle';
    }
    
    log.debug('Listening mode', { isListening });
  }
  
  /**
   * Set thinking mode
   */
  setThinking(isThinking: boolean): void {
    this.state.isThinking = isThinking;
    
    if (isThinking) {
      this.mode = 'thinking';
      this.animate();
    } else if (this.state.isSpeaking) {
      this.mode = 'speaking';
    } else if (this.state.isListening) {
      this.mode = 'listening';
    } else if (this.state.isBreathing) {
      this.mode = 'breathing';
    } else {
      this.mode = 'idle';
    }
    
    log.debug('Thinking mode', { isThinking });
  }
  
  /**
   * Trigger celebration pulse
   */
  celebrate(duration: number = DURATION.CELEBRATION): void {
    const previousMode = this.mode;
    this.mode = 'celebrating';
    
    // Pulse effect
    this.animateCelebration(duration).then(() => {
      this.mode = previousMode;
    });
    
    log.debug('Celebration triggered', { duration });
  }
  
  // ==========================================================================
  // VOICE SYNC
  // ==========================================================================
  
  /**
   * Update voice amplitude (0-1)
   */
  updateVoiceAmplitude(amplitude: number): void {
    this.voiceAmplitude = Math.max(0, Math.min(1, amplitude));
    
    // Smooth the amplitude
    this.voiceAmplitudeSmoothed += 
      (this.voiceAmplitude - this.voiceAmplitudeSmoothed) * this.voiceSmoothingFactor;
  }
  
  // ==========================================================================
  // PERSONA SWITCHING
  // ==========================================================================
  
  /**
   * Switch to a persona's glow profile
   */
  switchPersona(personaId: PersonaId, transitionDuration: number = DURATION.SLOW): void {
    const profile = PERSONA_GLOW_PROFILES[personaId];
    if (!profile) {
      log.warn('Unknown persona', { personaId });
      return;
    }
    
    // Animate color transition
    this.transitionConfig(profile, transitionDuration);
    
    log.info('Switched persona glow', { personaId });
  }
  
  /**
   * Transition to new config with animation
   */
  private transitionConfig(newConfig: Partial<GlowConfig>, duration: number): void {
    const startConfig = { ...this.config };
    const startTime = performance.now();
    
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out quad
      const eased = 1 - Math.pow(1 - progress, 2);
      
      // Interpolate numeric values
      if (newConfig.spread !== undefined) {
        this.config.spread = startConfig.spread + (newConfig.spread - startConfig.spread) * eased;
      }
      if (newConfig.blur !== undefined) {
        this.config.blur = startConfig.blur + (newConfig.blur - startConfig.blur) * eased;
      }
      if (newConfig.opacity !== undefined) {
        this.config.opacity = startConfig.opacity + (newConfig.opacity - startConfig.opacity) * eased;
      }
      if (newConfig.breathingDuration !== undefined) {
        this.config.breathingDuration = startConfig.breathingDuration + 
          (newConfig.breathingDuration - startConfig.breathingDuration) * eased;
      }
      if (newConfig.breathingAmplitude !== undefined) {
        this.config.breathingAmplitude = startConfig.breathingAmplitude + 
          (newConfig.breathingAmplitude - startConfig.breathingAmplitude) * eased;
      }
      
      // Color transition
      if (newConfig.color !== undefined) {
        this.config.color = this.interpolateColor(startConfig.color, newConfig.color, eased);
        this.state.currentColor = this.config.color;
      }
      
      this.applyGlow();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
  
  // ==========================================================================
  // ANIMATION LOOP
  // ==========================================================================
  
  private animate(): void {
    if (this.animationFrame !== null) return;
    
    const tick = (now: number) => {
      if (this.mode === 'idle') {
        this.animationFrame = null;
        return;
      }
      
      this.updateState(now);
      this.applyGlow();
      
      this.animationFrame = requestAnimationFrame(tick);
    };
    
    this.animationFrame = requestAnimationFrame(tick);
  }
  
  private updateState(now: number): void {
    switch (this.mode) {
      case 'breathing':
        this.updateBreathing(now);
        break;
      case 'speaking':
        this.updateSpeaking();
        break;
      case 'listening':
        this.updateListening(now);
        break;
      case 'thinking':
        this.updateThinking(now);
        break;
    }
  }
  
  private updateBreathing(now: number): void {
    const elapsed = now - this.breathingStartTime;
    const phase = (elapsed % this.config.breathingDuration) / this.config.breathingDuration;
    
    // Sinusoidal breathing (ease in/out)
    const breathValue = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    
    this.state.currentIntensity = this.config.opacity + 
      (breathValue * this.config.breathingAmplitude * 2 - this.config.breathingAmplitude);
  }
  
  private updateSpeaking(): void {
    if (this.config.syncWithVoice) {
      // Voice-synced intensity
      const baseIntensity = this.config.opacity;
      const voiceBoost = this.voiceAmplitudeSmoothed * 0.4;
      this.state.currentIntensity = Math.min(1, baseIntensity + voiceBoost);
    } else {
      this.state.currentIntensity = this.config.opacity * 1.3;
    }
  }
  
  private updateListening(now: number): void {
    // Subtle pulse when listening
    const elapsed = now - this.breathingStartTime;
    const phase = (elapsed % 2000) / 2000;
    const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    
    this.state.currentIntensity = this.config.opacity * (0.8 + pulse * 0.2);
  }
  
  private updateThinking(now: number): void {
    // Faster, more active pulse
    const elapsed = now - this.breathingStartTime;
    const phase = (elapsed % 1500) / 1500;
    const pulse = (Math.sin(phase * Math.PI * 4) + 1) / 2;
    
    this.state.currentIntensity = this.config.opacity * (0.9 + pulse * 0.3);
  }
  
  private async animateCelebration(duration: number): Promise<void> {
    return new Promise(resolve => {
      const startTime = performance.now();
      const startIntensity = this.state.currentIntensity;
      const peakIntensity = Math.min(1, this.config.opacity * 2);
      
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = elapsed / duration;
        
        if (progress >= 1) {
          this.state.currentIntensity = startIntensity;
          this.applyGlow();
          resolve();
          return;
        }
        
        // Peak at 30%, then decay
        const peakPoint = 0.3;
        if (progress < peakPoint) {
          const riseProgress = progress / peakPoint;
          this.state.currentIntensity = startIntensity + 
            (peakIntensity - startIntensity) * this.easeOutQuad(riseProgress);
        } else {
          const decayProgress = (progress - peakPoint) / (1 - peakPoint);
          this.state.currentIntensity = peakIntensity + 
            (startIntensity - peakIntensity) * this.easeOutQuad(decayProgress);
        }
        
        this.applyGlow();
        requestAnimationFrame(tick);
      };
      
      requestAnimationFrame(tick);
    });
  }
  
  // ==========================================================================
  // RENDERING
  // ==========================================================================
  
  private applyGlow(): void {
    if (!this.element) return;
    
    const { spread, blur } = this.config;
    const intensity = this.state.currentIntensity;
    const color = this.state.currentColor;
    
    // Create layered box-shadow for depth
    const shadows = [
      `0 0 ${blur * 0.5}px ${spread * 0.5}px ${this.colorWithAlpha(color, intensity * 0.3)}`,
      `0 0 ${blur}px ${spread}px ${this.colorWithAlpha(color, intensity * 0.5)}`,
      `0 0 ${blur * 1.5}px ${spread * 1.2}px ${this.colorWithAlpha(color, intensity * 0.2)}`,
    ];
    
    this.element.style.boxShadow = shadows.join(', ');
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private colorWithAlpha(hexColor: string, alpha: number): string {
    // Parse hex color
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  private interpolateColor(color1: string, color2: string, t: number): string {
    const c1 = this.parseHex(color1);
    const c2 = this.parseHex(color2);
    
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  private parseHex(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }
  
  private easeOutQuad(t: number): number {
    return 1 - Math.pow(1 - t, 2);
  }
  
  // ==========================================================================
  // GETTERS
  // ==========================================================================
  
  getState(): GlowState {
    return { ...this.state };
  }
  
  getConfig(): GlowConfig {
    return { ...this.config };
  }
  
  getMode(): GlowMode {
    return this.mode;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let glowControllerInstance: GlowController | null = null;

export function getGlowController(config?: Partial<GlowConfig>): GlowController {
  if (!glowControllerInstance) {
    glowControllerInstance = new GlowController(config);
  }
  return glowControllerInstance;
}

export function resetGlowController(): void {
  if (glowControllerInstance) {
    glowControllerInstance.detach();
  }
  glowControllerInstance = null;
}

