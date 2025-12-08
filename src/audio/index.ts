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
  type MusicState,
  type SessionMusicEntry,
  type OnTrackEndedCallback,
  type OnMusicStateChangeCallback,
  type OnMidSongMomentCallback,
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
  getDJTrackChangePhrase,
  getDJDropPhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getSessionCallbackPhrase,
  getMusicStoppedPhrase,
} from './ambient-music.js';

// Session sounds (stingers, game sounds, etc.)
export {
  getSessionSounds,
  resetSessionSounds,
  playSessionSound,
  getVerbalSound,
  VERBAL_SOUNDS,
  type SessionSoundType,
} from './session-sounds.js';

// DJ Booth - Full audio orchestration (ducking, timing, talk-over)
export {
  DJBooth,
  initializeDJBooth,
  getDJBooth,
  resetDJBooth,
  type DJBoothConfig,
  type DJBoothState,
} from './dj-booth.js';
