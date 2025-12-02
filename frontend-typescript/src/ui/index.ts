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

// Enhanced UI Features
export { keyboardUI, initKeyboardUI, setConnected as setKeyboardConnected } from './keyboard.ui.js';
export { transcriptUI, initTranscriptUI } from './transcript.ui.js';
export { thinkingUI, initThinkingUI } from './thinking.ui.js';
export { connectionQualityUI, initConnectionQualityUI } from './connection-quality.ui.js';

// Premium Experience
export { soundUI, initSoundUI } from './sound.ui.js';
export { gesturesUI, initGesturesUI } from './gestures.ui.js';
export { celebrationsUI, initCelebrationsUI } from './celebrations.ui.js';
export { statsUI, initStatsUI } from './stats.ui.js';
export { presenceUI, initPresenceUI } from './presence.ui.js';
export { rippleUI, initRippleUI } from './ripple.ui.js';
export { easterEggsUI, initEasterEggsUI } from './easter-eggs.ui.js';
export { agentParticlesUI, initAgentParticles } from './agent-particles.ui.js';

// Types
export type { ControlCallbacks } from './controls.ui.js';
export type { ConnectionQuality } from './connection-quality.ui.js';

