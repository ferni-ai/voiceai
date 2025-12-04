/**
 * UI Components - Central Export
 * 
 * A comprehensive UI system that rivals Apple and Google.
 */

// Core UI Components
export { coachUI, initCoachUI, updatePersonaDisplay, updateConnectionState, updateAudioState, setVisualizationVolume, flashAvatar, setDimmed } from './coach.ui.js';
export { teamUI, initTeamUI, setActiveTeamMember, setRosterVisible, dispose as disposeTeamUI } from './team.ui.js';
export { messageUI, initMessageUI, showMessage, clearMessage, setHelperText, dispose as disposeMessageUI } from './message.ui.js';
export { waveformUI, initWaveformUI, start as startWaveform, stop as stopWaveform, setVolume as setWaveformVolume, dispose as disposeWaveformUI } from './waveform.ui.js';
export { controlsUI, initControlsUI, setConnecting, dispose as disposeControlsUI } from './controls.ui.js';
export { spotifyUI, initSpotifyUI, showSpotifyStatus, hideSpotifyStatus } from './spotify.ui.js';

// Avatar-Based Feedback (No Text Toasts)
export { avatarFeedback, initAvatarFeedback } from './avatar-feedback.ui.js';

// Enhanced UI Features
export { keyboardUI, initKeyboardUI, setConnected as setKeyboardConnected } from './keyboard.ui.js';
export { transcriptUI, initTranscriptUI } from './transcript.ui.js';
export { thinkingUI, initThinkingUI } from './thinking.ui.js';
export { connectionQualityUI, initConnectionQualityUI } from './connection-quality.ui.js';

// World-class Toast System (Sonner-inspired)
export {
  toastUI,
  toast,
  toastSuccess,
  toastError,
  toastWarning,
  toastInfo,
  toastLoading,
  dismiss as dismissToast,
  dismissAll as dismissAllToasts,
  update as updateToast,
  promise as toastPromise,
} from './toast.ui.js';
export type { ToastType, ToastOptions } from './toast.ui.js';

// Premium Experience
export { soundUI, initSoundUI } from './sound.ui.js';
export { gesturesUI, initGesturesUI } from './gestures.ui.js';
export { celebrationsUI, initCelebrationsUI } from './celebrations.ui.js';
export { statsUI, initStatsUI } from './stats.ui.js';
export { presenceUI, initPresenceUI } from './presence.ui.js';
export { rippleUI, initRippleUI } from './ripple.ui.js';
export { easterEggsUI, initEasterEggsUI } from './easter-eggs.ui.js';
export { agentParticlesUI, initAgentParticles } from './agent-particles.ui.js';

// 🎬 Animation Orchestrator - Pixar-quality coordinated animations
export { 
  animationOrchestrator, 
  initAnimationOrchestrator,
  runPageLoadSequence,
  animatePersonaTransition,
  playPixarReaction,
} from './animation-orchestrator.ui.js';

// ✨ Micro-Interactions - Pixar-quality button & interactive effects
export {
  microInteractionsUI,
  initMicroInteractions,
} from './micro-interactions.ui.js';

// 🔤 Kinetic Typography - Pixar-quality text animations
export {
  kineticTypographyUI,
  initKineticTypography,
  revealText,
  typewriterEffect,
  scrambleReveal,
  animateNameHandoff,
} from './kinetic-typography.ui.js';

// 🌌 Ambient Effects - Pixar-quality visual atmosphere
export {
  ambientEffectsUI,
  initAmbientEffects,
  startAurora,
  stopAurora,
  startParticles,
  stopParticles,
} from './ambient-effects.ui.js';

// ⏳ Loading States - Pixar-quality loading experiences
export {
  loadingStatesUI,
  initLoadingStates,
  startWarmthPulse,
  stopWarmthPulse,
  playLuxoBounce,
  createDustParticles,
} from './loading-states.ui.js';

// 🔧 Admin Dashboard
export {
  initAdminDashboard,
  injectAdminStyles,
} from './admin.ui.js';

// Types
export type { ControlCallbacks } from './controls.ui.js';
export type { ConnectionQuality } from './connection-quality.ui.js';
