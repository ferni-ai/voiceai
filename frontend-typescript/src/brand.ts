/**
 * Ferni Brand System - Complete Export
 * 
 * One-stop import for all brand system components:
 * - Services (audio, haptics, glow, rituals, voice analysis)
 * - UI Components (celebration, empty states, toast, skeleton)
 * - Integration helpers (event dispatchers, initialization)
 * 
 * Usage:
 * ```typescript
 * import { 
 *   initializeBrandSystem, 
 *   toast, 
 *   celebrate,
 *   dispatchSmallWin,
 * } from './brand.js';
 * ```
 * 
 * @module @ferni/brand
 */

// ============================================================================
// SERVICES
// ============================================================================

export {
  // Audio Engine
  FerniAudioEngine,
  getFerniAudioEngine,
  resetFerniAudioEngine,
  type AudioConfig,
  type SoundCategory,
  type SoundDefinition,
  type PlayOptions,
  
  // Haptics
  HapticsService,
  HAPTIC_PATTERNS,
  type HapticConfig,
  type HapticPattern,
  type HapticEvent,
  type EmotionType,
  
  // Glow Controller
  GlowController,
  getGlowController,
  resetGlowController,
  type GlowConfig,
  type GlowState,
  
  // Ritual Engine
  RitualEngine,
  getRitualEngine,
  resetRitualEngine,
  wireRitualEngineToApp,
  triggerRitual,
  appWake,
  connectionStart,
  connectionEnd,
  personaEntrance,
  smallWin as ritualSmallWin,
  bigWin as ritualBigWin,
  milestone as ritualMilestone,
  streak as ritualStreak,
  teamUnlock as ritualTeamUnlock,
  deepMoment,
  thinkingOfYou,
  type RitualType,
  type RitualContext,
  
  // Avatar State
  AvatarStateService,
  getAvatarStateService,
  initAvatarStateService,
  resetAvatarStateService,
  type AvatarState,
  type AvatarStateConfig,
  
  // Voice Analyzer
  VoiceAnalyzer,
  getVoiceAnalyzer,
  resetVoiceAnalyzer,
  type VoiceMetrics,
  type AnalyzerConfig,
  
  // Brand System (unified)
  initializeBrandSystem,
  brandAppWake,
  preloadPersonaSounds,
  preloadCelebrationSounds,
} from './services/index.js';

// ============================================================================
// UI COMPONENTS
// ============================================================================

export {
  // Celebration
  CelebrationUI,
  getCelebrationUI,
  resetCelebrationUI,
  celebrate,
  smallWin,
  bigWin,
  milestone,
  streak,
  teamUnlock,
  type CelebrationType,
  type CelebrationConfig,
  
  // Empty States
  EmptyStateUI,
  getEmptyStateUI,
  type EmptyStateType,
  type EmptyStateConfig,
  
  // Toast
  ToastManager,
  getToastManager,
  resetToastManager,
  showToast,
  dismissToast,
  dismissAllToasts,
  toast,
  type ToastType,
  type ToastConfig,
  
  // Skeleton
  SkeletonUI,
  getSkeletonUI,
  skeleton,
  type SkeletonVariant,
  type SkeletonConfig,
} from './ui/brand-ui.js';

// ============================================================================
// APP INTEGRATION
// ============================================================================

export {
  // Initialization
  initBrandSystem,
  setupUserInteractionListener,
  isBrandSystemInitialized,
  
  // Event Dispatchers
  dispatchConnected,
  dispatchDisconnected,
  dispatchPersonaSwitch,
  dispatchHandoff,
  dispatchSmallWin,
  dispatchBigWin,
  dispatchMilestone,
  dispatchStreak,
  dispatchTeamUnlock,
  dispatchDeepMoment,
  dispatchThinkingOfYou,
  
  // Voice Sync
  startVoiceSync,
  stopVoiceSync,
  
  // Avatar State Helpers
  setAvatarListening,
  setAvatarSpeaking,
  setAvatarThinking,
  setAvatarIdle,
  playAvatarReaction,
} from './app/brand-integration.js';

