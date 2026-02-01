/**
 * Music Domain Tool Executor
 *
 * Handles all music-related tools: playMusic, musicControl, musicInfo, suggestMusic
 *
 * @module agents/shared/tool-executors/music-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'MusicExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Unified API (recommended)
  'playmusic',
  'musiccontrol',
  'musicinfo',
  'suggestmusic',
  // FTIS V3 semantic tool IDs (from classifier) - route all to playMusicUnified
  'spotify_search',
  'spotify_play',
  'find_music',
  'play_music',
  'music_play',
  'itunes_play',
  // Legacy aliases (backward compatibility)
  'pausemusic',
  'pausecallmusic',
  'stopmusic',
  'stopcallmusic',
  'resumemusic',
  'resumecallmusic',
  'skipmusic',
  'nextsong',
  'skipsong',
] as const;

/**
 * Execute music-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Play music (handles multiple tool IDs from FTIS V3 classifier)
  // All these route to playMusicUnified which handles iTunes/Spotify intent detection
  const playMusicTools = [
    'playmusic',
    'spotify_search',
    'spotify_play',
    'find_music',
    'play_music',
    'music_play',
    'itunes_play',
  ];
  if (playMusicTools.includes(fnLower)) {
    const { playMusicUnified } = await import('../../../tools/domains/entertainment/music.js');
    const query = (args.query as string) || 'music';
    log.info({ query, toolId: fn }, '🎵 Playing music via playMusicUnified');
    return playMusicUnified(query);
  }

  // Music control actions
  if (fnLower === 'musiccontrol') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    const action = (args.action as string)?.toLowerCase();

    log.info({ action }, '🎵 Music control requested');

    switch (action) {
      case 'pause':
        musicPlayer.pause();
        return 'Music paused.';
      case 'resume':
      case 'play':
        await musicPlayer.resume();
        return 'Resuming the music.';
      case 'stop':
        musicPlayer.stop();
        return 'Music stopped.';
      case 'skip':
      case 'next':
        musicPlayer.skip();
        return 'Skipping to the next track.';
      case 'volume': {
        const level = args.level as number;
        if (level !== undefined) {
          musicPlayer.setVolume(level / 100);
          return `Volume set to ${level} percent.`;
        }
        return 'Please specify a volume level.';
      }
      default:
        return `I'm not sure how to ${action} the music. Try pause, play, stop, skip, or volume.`;
    }
  }

  // Music info
  if (fnLower === 'musicinfo') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    const action = (args.action as string)?.toLowerCase();

    if (action === 'playing' || !action) {
      const state = musicPlayer.getState();
      if (state.currentTrack) {
        return `Now playing "${state.currentTrack.name}" by ${state.currentTrack.artist}.`;
      }
      return 'Nothing is playing right now.';
    }

    if (action === 'suggest') {
      const { suggestAndPlayMusic } = await import('../../../tools/domains/entertainment/music.js');
      const mood = args.mood as string;
      if (mood) {
        return suggestAndPlayMusic(mood);
      }
      return 'What kind of mood are you in? I can suggest something fitting.';
    }

    return 'What would you like to know about the music?';
  }

  // Suggest music
  if (fnLower === 'suggestmusic') {
    const { suggestAndPlayMusic } = await import('../../../tools/domains/entertainment/music.js');
    const mood = args.mood as string;

    if (mood) {
      log.info({ mood }, '🎵 Suggesting music for mood');
      return suggestAndPlayMusic(mood);
    }
    return 'What mood are you in? I can suggest something fitting.';
  }

  // Legacy pause aliases
  if (fnLower === 'pausemusic' || fnLower === 'pausecallmusic') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy pause tool');
    musicPlayer.pause();
    return 'Music paused.';
  }

  // Legacy stop aliases
  if (fnLower === 'stopmusic' || fnLower === 'stopcallmusic') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy stop tool');
    musicPlayer.stop();
    return 'Music stopped.';
  }

  // Legacy resume aliases
  if (fnLower === 'resumemusic' || fnLower === 'resumecallmusic') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy resume tool');
    await musicPlayer.resume();
    return 'Resuming the music.';
  }

  // Legacy skip aliases
  if (fnLower === 'skipmusic' || fnLower === 'nextsong' || fnLower === 'skipsong') {
    const { getMusicPlayer } = await import('../../../audio/music-player.js');
    const musicPlayer = getMusicPlayer();
    log.info({ fn }, '🎵 Legacy skip tool');
    musicPlayer.skip();
    return 'Skipping to the next track.';
  }

  return null;
}

export const musicExecutor: DomainExecutor = {
  domain: 'music',
  handles: HANDLED_TOOLS,
  execute,
};

export default musicExecutor;
