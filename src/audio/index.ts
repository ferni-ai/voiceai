/**
 * Audio Module
 * 
 * Handles all audio-related functionality including:
 * - Background music playback into calls
 * - Audio ducking
 * - Volume control
 */

export { 
  CallMusicPlayer, 
  getMusicPlayer, 
  resetMusicPlayer,
  type MusicTrack,
  type MusicPlayerState,
} from './music-player.js';

