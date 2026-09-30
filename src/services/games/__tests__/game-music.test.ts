/**
 * Game song bank: games must always get enough rounds, even with iTunes down.
 */
import { describe, expect, it, vi } from 'vitest';

const itunes = vi.hoisted(() => ({ findTrack: vi.fn() }));
vi.mock('../../itunes.js', () => ({ findTrack: itunes.findTrack, searchItunes: vi.fn() }));
vi.mock('../../../audio/music-player.js', () => ({ getMusicPlayer: vi.fn() }));

const { getRandomGameSongs } = await import('../game-music.js');

describe('getRandomGameSongs', () => {
  it('tops up from the built-in list when iTunes is unreachable', async () => {
    itunes.findTrack.mockRejectedValue(new Error('ENOTFOUND itunes.apple.com'));

    const songs = await getRandomGameSongs(8);

    expect(songs).toHaveLength(8);
    expect(new Set(songs.map((s) => s.name)).size).toBe(8);
    for (const song of songs) {
      expect(song.name).toBeTruthy();
      expect(song.artist).toBeTruthy();
    }
  });

  it('only fills the gap when iTunes returns some songs', async () => {
    itunes.findTrack.mockImplementation(async (query: string) =>
      query.startsWith('Bohemian')
        ? {
            found: true,
            track: { name: 'Bohemian Rhapsody', artist: 'Queen', previewUrl: 'https://p/1.m4a' },
          }
        : { found: false }
    );

    const songs = await getRandomGameSongs(5);

    expect(songs).toHaveLength(5);
    const names = songs.map((s) => s.name);
    expect(names.filter((n) => n === 'Bohemian Rhapsody')).toHaveLength(1);
    expect(songs.find((s) => s.name === 'Bohemian Rhapsody')?.previewUrl).toBe('https://p/1.m4a');
  });
});
