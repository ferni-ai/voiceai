/**
 * 🎬 Animation System
 * 
 * GSAP-powered animation orchestration for Ferni with character-quality motion.
 * 
 * @example
 * ```typescript
 * import { createFerniOrchestrator, getFerniOrchestrator } from './animation';
 * 
 * // Initialize with avatar elements
 * const orchestrator = createFerniOrchestrator({
 *   container: document.querySelector('.avatar-container')!,
 *   avatar: document.querySelector('#coachAvatar')!,
 *   ring: document.querySelector('#avatarRing')!,
 *   glow: document.querySelector('.avatar-glow'),
 * });
 * 
 * // Start animations
 * orchestrator.start();
 * 
 * // Play reactions
 * orchestrator.react('nod');
 * orchestrator.react('bounce');
 * orchestrator.react('celebrate');
 * 
 * // Set emotions
 * orchestrator.setEmotion('happy');
 * orchestrator.flashEmotion('excited', 2000);
 * ```
 */

export {
  // Main orchestrator
  FerniOrchestrator,
  createFerniOrchestrator,
  getFerniOrchestrator,
  
  // Types
  type AvatarElements,
  type ReactionType,
  type OrchestratorOptions,
} from './ferni-orchestrator.js';

// Re-export emotion system for convenience
export {
  setEmotion,
  flashEmotion,
  subscribeToEmotion,
  EMOTIONS,
  type EmotionId,
  type EmotionState,
} from '../emotion/index.js';
