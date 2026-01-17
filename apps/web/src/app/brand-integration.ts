/**
 * Brand System Integration
 * 
 * Wires the brand system (audio, haptics, glow, rituals) into the main app.
 * This module handles initialization and event dispatching.
 * 
 * @module @ferni/brand-integration
 */

import { createLogger } from '../utils/logger.js';
import {
  initializeBrandSystem,
  getGlowController,
  preloadPersonaSounds,
  preloadCelebrationSounds,
} from '../services/brand-system.js';
import { getAvatarStateService, initAvatarStateService } from '../services/avatar-state.service.js';
import { getVoiceAnalyzer } from '../services/voice-analyzer.service.js';
import { getToastManager } from '../ui/whisper.ui.js';

const log = createLogger('BrandIntegration');

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let hasUserInteracted = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize brand system after user interaction
 * Call this on first click/tap/keypress
 */
export async function initBrandSystem(): Promise<void> {
  if (isInitialized) return;
  
  try {
    // Find avatar elements
    const avatarElement = document.getElementById('coachAvatar');
    const glowElement = document.getElementById('avatarRing');
    const containerElement = document.getElementById('coach');
    
    // Initialize brand system
    await initializeBrandSystem({
      attachGlowTo: glowElement ?? undefined,
      autoWireLifecycle: true,
    });
    
    // Initialize avatar state service if avatar exists
    if (avatarElement) {
      initAvatarStateService({
        avatarElement,
        glowElement: glowElement ?? undefined,
        containerElement: containerElement ?? undefined,
        voiceSync: true,
        hapticsEnabled: true,
      });
    }
    
    // Initialize toast manager
    getToastManager();
    
    // Preload celebration sounds
    await preloadCelebrationSounds();
    
    isInitialized = true;
    log.info('Brand system initialized');
    
  } catch (error) {
    log.error('Failed to initialize brand system', error);
  }
}

/**
 * Set up listener for first user interaction
 * Brand system requires user gesture for audio context
 */
export function setupUserInteractionListener(): void {
  if (hasUserInteracted) return;
  
  const handleFirstInteraction = async () => {
    if (hasUserInteracted) return;
    hasUserInteracted = true;
    
    // Remove listeners
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('touchstart', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
    
    // Initialize brand system
    await initBrandSystem();
  };
  
  document.addEventListener('click', handleFirstInteraction, { once: true });
  document.addEventListener('touchstart', handleFirstInteraction, { once: true });
  document.addEventListener('keydown', handleFirstInteraction, { once: true });
  
  log.debug('User interaction listener set up');
}

// ============================================================================
// EVENT DISPATCHERS
// ============================================================================

/**
 * Dispatch connection established event
 */
export function dispatchConnected(): void {
  document.dispatchEvent(new CustomEvent('ferni:connected'));
}

/**
 * Dispatch disconnection event
 */
export function dispatchDisconnected(): void {
  document.dispatchEvent(new CustomEvent('ferni:disconnected'));
}

/**
 * Dispatch persona switch event
 */
export function dispatchPersonaSwitch(personaId: string, personaName?: string): void {
  document.dispatchEvent(new CustomEvent('ferni:switch-persona', {
    detail: { personaId, personaName },
  }));
  
  // Update avatar state service
  const avatarState = getAvatarStateService();
  if (avatarState) {
    avatarState.setPersona(personaId as Parameters<typeof avatarState.setPersona>[0]);
  }
  
  // Preload persona sounds
  void preloadPersonaSounds(personaId);
}

/**
 * Dispatch handoff event
 */
export function dispatchHandoff(from: string, to: string, toName?: string): void {
  document.dispatchEvent(new CustomEvent('ferni:handoff', {
    detail: { from, to, toName },
  }));
}

/**
 * Dispatch small win event
 */
export function dispatchSmallWin(message?: string): void {
  document.dispatchEvent(new CustomEvent('ferni:small-win', {
    detail: { message },
  }));
}

/**
 * Dispatch big win event
 */
export function dispatchBigWin(message?: string): void {
  document.dispatchEvent(new CustomEvent('ferni:big-win', {
    detail: { message },
  }));
}

/**
 * Dispatch milestone event
 */
export function dispatchMilestone(name: string): void {
  document.dispatchEvent(new CustomEvent('ferni:milestone', {
    detail: { name },
  }));
}

/**
 * Dispatch streak event
 */
export function dispatchStreak(count: number): void {
  document.dispatchEvent(new CustomEvent('ferni:streak', {
    detail: { count },
  }));
}

/**
 * Dispatch team unlock event
 */
export function dispatchTeamUnlock(personaId: string, personaName: string): void {
  document.dispatchEvent(new CustomEvent('ferni:team-unlock', {
    detail: { personaId, personaName },
  }));
}

/**
 * Dispatch deep moment event
 */
export function dispatchDeepMoment(emotion?: string): void {
  document.dispatchEvent(new CustomEvent('ferni:deep-moment', {
    detail: { emotion },
  }));
}

/**
 * Dispatch thinking of you event
 */
export function dispatchThinkingOfYou(): void {
  document.dispatchEvent(new CustomEvent('ferni:thinking-of-you'));
}

// ============================================================================
// VOICE SYNC
// ============================================================================

/**
 * Start voice analysis for synesthesia
 */
export async function startVoiceSync(audioStream?: MediaStream): Promise<void> {
  try {
    const analyzer = getVoiceAnalyzer();
    
    if (audioStream) {
      await analyzer.startFromStream(audioStream);
    } else {
      await analyzer.startMicrophone();
    }
    
    // Connect to avatar state
    const avatarState = getAvatarStateService();
    analyzer.onUpdate((metrics) => {
      if (avatarState) {
        avatarState.updateVoiceAmplitude(metrics.smoothedAmplitude);
      }
      
      // Update glow controller
      const glow = getGlowController();
      glow.updateVoiceAmplitude(metrics.smoothedAmplitude);
    });
    
    log.info('Voice sync started');
    
  } catch (error) {
    log.warn('Failed to start voice sync', error);
  }
}

/**
 * Stop voice analysis
 */
export function stopVoiceSync(): void {
  const analyzer = getVoiceAnalyzer();
  analyzer.stop();
  log.info('Voice sync stopped');
}

// ============================================================================
// AVATAR STATE
// ============================================================================

/**
 * Set avatar to listening state
 */
export function setAvatarListening(): void {
  const avatarState = getAvatarStateService();
  if (avatarState) {
    void avatarState.setListening();
  }
}

/**
 * Set avatar to speaking state
 */
export function setAvatarSpeaking(): void {
  const avatarState = getAvatarStateService();
  if (avatarState) {
    void avatarState.setSpeaking();
  }
}

/**
 * Set avatar to thinking state
 */
export function setAvatarThinking(): void {
  const avatarState = getAvatarStateService();
  if (avatarState) {
    void avatarState.setThinking();
  }
}

/**
 * Set avatar to idle state
 */
export function setAvatarIdle(): void {
  const avatarState = getAvatarStateService();
  if (avatarState) {
    void avatarState.setIdle();
  }
}

/**
 * Play avatar reaction
 */
export function playAvatarReaction(type: 'nod' | 'shake' | 'bounce' | 'pulse'): void {
  const avatarState = getAvatarStateService();
  if (avatarState) {
    void avatarState.playReaction(type);
  }
}

// ============================================================================
// TOAST HELPERS
// ============================================================================

export { toast } from '../ui/whisper.ui.js';

// ============================================================================
// EXPORTS
// ============================================================================

export {
  isInitialized as isBrandSystemInitialized,
};

