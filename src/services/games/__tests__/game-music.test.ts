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
    // iTunes finds the first two lookups (queries are picked at random)
    let found = 0;
    itunes.findTrack.mockImplementation(async () => {
      found++;
      return found <= 2
        ? {
            found: true,
            track: {
              name: `Live Song ${found}`,
              artist: 'Band',
              previewUrl: `https://p/${found}.m4a`,
            },
          }
        : { found: false };
    });

    const songs = await getRandomGameSongs(5);

    expect(songs).toHaveLength(5);
    expect(new Set(songs.map((s) => s.name)).size).toBe(5);
    expect(songs.filter((s) => s.name.startsWith('Live Song'))).toEqual([
      expect.objectContaining({ name: 'Live Song 1', previewUrl: 'https://p/1.m4a' }),
      expect.objectContaining({ name: 'Live Song 2', previewUrl: 'https://p/2.m4a' }),
    ]);
  });
});
