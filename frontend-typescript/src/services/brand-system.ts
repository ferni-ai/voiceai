/**
 * Ferni Brand System
 * 
 * Central export for all brand-related services and utilities.
 * This is the main entry point for the world-class brand experience.
 * 
 * @module @ferni/brand
 */

// ============================================================================
// AUDIO
// ============================================================================

export {
  FerniAudioEngine,
  getFerniAudioEngine,
  resetFerniAudioEngine,
  type AudioConfig,
  type SoundCategory,
  type SoundDefinition,
  type PlayOptions,
} from './ferni-audio.service.js';

// ============================================================================
// HAPTICS
// ============================================================================

export {
  HapticsService,
  HAPTIC_PATTERNS,
  type HapticConfig,
  type HapticPattern,
  type HapticEvent,
  type EmotionType,
} from './haptics.service.js';

// ============================================================================
// GLOW
// ============================================================================

export {
  GlowController,
  getGlowController,
  resetGlowController,
  type GlowConfig,
  type GlowState,
} from './glow-controller.service.js';

// ============================================================================
// RITUAL ENGINE
// ============================================================================

export {
  RitualEngine,
  getRitualEngine,
  resetRitualEngine,
  wireRitualEngineToApp,
  triggerRitual,
  appWake,
  connectionStart,
  connectionEnd,
  personaEntrance,
  smallWin,
  bigWin,
  milestone,
  streak,
  teamUnlock,
  deepMoment,
  thinkingOfYou,
  type RitualType,
  type RitualContext,
} from './ritual-engine.service.js';

// ============================================================================
// CELEBRATION UI
// ============================================================================

export {
  CelebrationUI,
  getCelebrationUI,
  resetCelebrationUI,
  celebrate,
  smallWin as celebrateSmallWin,
  bigWin as celebrateBigWin,
  milestone as celebrateMilestone,
  streak as celebrateStreak,
  teamUnlock as celebrateTeamUnlock,
  type CelebrationType,
  type CelebrationConfig,
} from '../ui/celebration.ui.js';

// ============================================================================
// EMPTY STATES
// ============================================================================

export {
  EmptyStateUI,
  getEmptyStateUI,
  type EmptyStateType,
  type EmptyStateConfig,
} from '../ui/empty-state.ui.js';

// ============================================================================
// CONVENIENCE INITIALIZATION
// ============================================================================

import { getFerniAudioEngine } from './ferni-audio.service.js';
import { getGlowController } from './glow-controller.service.js';
import { getRitualEngine, wireRitualEngineToApp } from './ritual-engine.service.js';
import { getCelebrationUI } from '../ui/celebration.ui.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BrandSystem');

/**
 * Initialize the entire brand system
 * Call this after first user interaction (for audio context)
 */
export async function initializeBrandSystem(options: {
  attachGlowTo?: HTMLElement;
  autoWireLifecycle?: boolean;
} = {}): Promise<void> {
  log.info('Initializing Ferni brand system...');
  
  try {
    // Initialize audio engine
    const audio = getFerniAudioEngine();
    await audio.initialize();
    
    // Initialize glow controller
    const glow = getGlowController();
    if (options.attachGlowTo) {
      glow.attach(options.attachGlowTo);
    }
    
    // Initialize ritual engine
    const ritual = getRitualEngine();
    await ritual.initialize();
    
    // Initialize celebration UI (auto-creates container)
    getCelebrationUI();
    
    // Wire to app lifecycle if requested
    if (options.autoWireLifecycle !== false) {
      wireRitualEngineToApp();
    }
    
    log.info('Brand system initialized successfully');
    
  } catch (error) {
    log.error('Failed to initialize brand system', error);
    throw error;
  }
}

/**
 * Trigger the app wake ritual (first open of day)
 */
export async function brandAppWake(): Promise<void> {
  const ritual = getRitualEngine();
  await ritual.appWake();
}

// ============================================================================
// PRELOAD HELPERS
// ============================================================================

/**
 * Preload sounds for a specific persona
 */
export async function preloadPersonaSounds(personaId: string): Promise<void> {
  const audio = getFerniAudioEngine();
  await audio.preloadGroup([
    `persona.${personaId}`,
    `handoff.to${personaId.charAt(0).toUpperCase() + personaId.slice(1)}`,
  ]);
}

/**
 * Preload celebration sounds
 */
export async function preloadCelebrationSounds(): Promise<void> {
  const audio = getFerniAudioEngine();
  await audio.preloadGroup([
    'celebration.small',
    'celebration.big',
    'celebration.milestone',
    'celebration.streak',
    'celebration.teamUnlock',
  ]);
}

