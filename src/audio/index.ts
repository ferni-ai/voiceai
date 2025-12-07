/**
 * Audio Module
 *
 * Handles all audio-related functionality including:
 * - Background music playback into calls via LiveKit BackgroundAudioPlayer
 * - Audio ducking when agent speaks
 * - Volume control
 * - Spotify preview streaming
 * - Ambient/thinking music for silences
 */

export {
  CallMusicPlayer,
  getMusicPlayer,
  resetMusicPlayer,
  initializeMusicPlayer,
  type MusicTrack,
  type MusicPlayerState,
  type OnTrackEndedCallback,
  type OnMusicStateChangeCallback,
} from './music-player.js';

// Ambient music for silences
export {
  playAmbientMusic,
  stopAmbientMusic,
  isAmbientMusicEnabled,
  getAmbientTracks,
  getRandomAmbientTrack,
  getAmbientMusicEndedPhrase,
  getDJOutroPhrase,
  getMusicStoppedPhrase,
} from './ambient-music.js';
