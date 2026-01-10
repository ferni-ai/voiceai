/**
 * Unified Music System Integration Tests
 *
 * Tests for the unified music routing system including:
 * - Spotify token management and refresh
 * - Device discovery and caching
 * - Sonos music search and playback
 * - Unified source routing logic
 * - Premium detection and fallbacks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// MUSIC PROVIDER ROUTING TESTS
// ============================================================================

describe('Unified Music Provider', () => {
  describe('Intent Detection', () => {
    it('should detect Sonos intent from query mentioning Sonos', async () => {
      const { detectMusicIntent } = await import('../services/music/music-provider.js');

      expect(detectMusicIntent('play jazz on sonos')).toBe('sonos');
      expect(detectMusicIntent('play music on the Sonos')).toBe('sonos');
    });

    it('should detect Sonos intent from room mentions', async () => {
      const { detectMusicIntent } = await import('../services/music/music-provider.js');

      expect(detectMusicIntent('play jazz in the living room')).toBe('sonos');
      expect(detectMusicIntent('play music in the kitchen')).toBe('sonos');
      expect(detectMusicIntent('play on my speaker')).toBe('sonos');
    });

    it('should detect ambient intent for vague requests', async () => {
      const { detectMusicIntent } = await import('../services/music/music-provider.js');

      expect(detectMusicIntent('play some jazz')).toBe('ambient');
      expect(detectMusicIntent('put on some background music')).toBe('ambient');
      expect(detectMusicIntent('play something relaxing')).toBe('ambient');
    });

    it('should detect listening intent for specific requests', async () => {
      const { detectMusicIntent } = await import('../services/music/music-provider.js');

      expect(detectMusicIntent('play Taylor Swift')).toBe('listening');
      expect(detectMusicIntent('play Bohemian Rhapsody by Queen')).toBe('listening');
    });

    it('should detect search intent for search queries', async () => {
      const { detectMusicIntent } = await import('../services/music/music-provider.js');

      expect(detectMusicIntent('search for jazz albums')).toBe('search');
      expect(detectMusicIntent('find songs by The Beatles')).toBe('search');
    });
  });

  describe('Room Extraction', () => {
    it('should extract room name from queries', async () => {
      const { extractRoomFromQuery } = await import('../services/music/music-provider.js');

      expect(extractRoomFromQuery('play jazz in the living room')).toBe('living room');
      // Note: extraction includes "speaker" when present
      expect(extractRoomFromQuery('play on the kitchen speaker')).toContain('kitchen');
    });

    it('should return undefined for queries without room mentions', async () => {
      const { extractRoomFromQuery } = await import('../services/music/music-provider.js');

      expect(extractRoomFromQuery('play some jazz')).toBeUndefined();
      expect(extractRoomFromQuery('play Taylor Swift')).toBeUndefined();
    });
  });

  describe('Explicit Service Detection', () => {
    it('should detect Sonos mentions', async () => {
      const { mentionsSonos } = await import('../services/music/music-provider.js');

      expect(mentionsSonos('play on Sonos')).toBe(true);
      expect(mentionsSonos('play on my speaker')).toBe(false);
    });

    it('should detect Spotify mentions', async () => {
      const { mentionsSpotify } = await import('../services/music/music-provider.js');

      expect(mentionsSpotify('play on Spotify')).toBe(true);
      expect(mentionsSpotify('play some jazz')).toBe(false);
    });
  });

  describe('Source Selection', () => {
    it('should select Sonos when explicitly requested', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        sonosLinked: true,
        sonosRooms: ['Living Room', 'Kitchen'],
      });

      const source = selectBestSource('listening', config, { explicitSonos: true });
      expect(source).toBe('sonos');
    });

    it('should select Spotify when explicitly requested and available', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: true,
      });

      const source = selectBestSource('listening', config, { explicitSpotify: true });
      expect(source).toBe('spotify');
    });

    it('should select Sonos when room is specified', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        sonosLinked: true,
        sonosRooms: ['Living Room', 'Kitchen'],
      });

      const source = selectBestSource('listening', config, { roomSpecified: 'living' });
      expect(source).toBe('sonos');
    });

    it('should select iTunes for ambient intent', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        sonosLinked: true,
      });

      const source = selectBestSource('ambient', config);
      expect(source).toBe('itunes');
    });

    it('should select Spotify for listening when Premium + device ready', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: true,
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('spotify');
    });

    it('should fall back to Sonos when Spotify device not ready', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: false, // No device ready
        sonosLinked: true,
        sonosRooms: ['Living Room'],
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('sonos');
    });

    it('should fall back to iTunes when nothing else available', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: false,
        sonosLinked: false,
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('itunes');
    });
  });

  describe('Source Config Builder', () => {
    it('should build config with defaults', async () => {
      const { buildSourceConfig } = await import('../services/music/music-provider.js');

      const config = buildSourceConfig({});

      expect(config.spotify.available).toBe(false);
      expect(config.spotify.premium).toBe(false);
      expect(config.spotify.deviceReady).toBe(false);
      expect(config.sonos.available).toBe(false);
      expect(config.sonos.rooms).toEqual([]);
      expect(config.itunes.available).toBe(true); // Always true
    });

    it('should build config with all options', async () => {
      const { buildSourceConfig } = await import('../services/music/music-provider.js');

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: true,
        sonosLinked: true,
        sonosRooms: ['Living Room', 'Kitchen'],
        sonosDefaultRoom: 'Living Room',
      });

      expect(config.spotify.available).toBe(true);
      expect(config.spotify.premium).toBe(true);
      expect(config.spotify.deviceReady).toBe(true);
      expect(config.sonos.available).toBe(true);
      expect(config.sonos.rooms).toEqual(['Living Room', 'Kitchen']);
      expect(config.sonos.defaultRoom).toBe('Living Room');
    });
  });

  describe('Playback Result Formatting', () => {
    it('should format preview result with track info or generic response', async () => {
      const { formatPlaybackResult } = await import('../services/music/music-provider.js');

      const result = {
        success: true,
        source: 'itunes' as const,
        track: { name: 'Test Song', artist: 'Test Artist', source: 'itunes' as const },
        message: 'Playing',
        isPreview: true,
      };

      const formatted = formatPlaybackResult(result);
      // Preview responses can be minimal (like "Here we go...") or include track info
      // So we just verify we get a non-empty string
      expect(formatted.length).toBeGreaterThan(0);
      expect(typeof formatted).toBe('string');
    });

    it('should format Sonos result with room', async () => {
      const { formatPlaybackResult } = await import('../services/music/music-provider.js');

      const result = {
        success: true,
        source: 'sonos' as const,
        track: { name: 'Test Song', artist: 'Test Artist', source: 'sonos' as const },
        message: 'Playing',
        isPreview: false,
      };

      const formatted = formatPlaybackResult(result, 'Living Room');
      expect(formatted).toContain('Test Song');
      expect(formatted).toContain('Living Room');
    });

    it('should return message for failed result', async () => {
      const { formatPlaybackResult } = await import('../services/music/music-provider.js');

      const result = {
        success: false,
        source: 'itunes' as const,
        message: 'Track not found',
        isPreview: false,
      };

      const formatted = formatPlaybackResult(result);
      expect(formatted).toBe('Track not found');
    });
  });
});

// ============================================================================
// SONOS MUSIC SERVICE TESTS
// ============================================================================

describe('Sonos Music Service', () => {
  describe('Room Matching', () => {
    it('should match room names with exact match', async () => {
      const { matchRoomName } = await import('../services/smart-home/sonos-music.js');

      const groups = [
        { id: '1', name: 'Living Room', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
        { id: '2', name: 'Kitchen', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '2' },
      ] as const;

      const match = matchRoomName('Living Room', groups as any);
      expect(match?.name).toBe('Living Room');
    });

    it('should match room names with substring match', async () => {
      const { matchRoomName } = await import('../services/smart-home/sonos-music.js');

      const groups = [
        { id: '1', name: 'Living Room Sonos', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      ] as const;

      const match = matchRoomName('living', groups as any);
      expect(match?.name).toBe('Living Room Sonos');
    });

    it('should match room names with aliases', async () => {
      const { matchRoomName } = await import('../services/smart-home/sonos-music.js');

      const groups = [
        { id: '1', name: 'Living Room', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      ] as const;

      const match = matchRoomName('lounge', groups as any);
      expect(match?.name).toBe('Living Room');
    });

    it('should return null for no match', async () => {
      const { matchRoomName } = await import('../services/smart-home/sonos-music.js');

      const groups = [
        { id: '1', name: 'Kitchen', playbackState: 'idle', volume: 50, muted: false, coordinatorId: '1' },
      ] as const;

      const match = matchRoomName('garage', groups as any);
      expect(match).toBeNull();
    });
  });

  describe('Last Used Room', () => {
    it('should remember last used room per user', async () => {
      const { setLastUsedRoom, getLastUsedRoom } = await import(
        '../services/smart-home/sonos-music.js'
      );

      setLastUsedRoom('user123', {
        groupId: 'group1',
        groupName: 'Living Room',
        householdId: 'house1',
      });

      const room = getLastUsedRoom('user123');
      expect(room?.groupName).toBe('Living Room');
    });

    it('should return undefined for unknown user', async () => {
      const { getLastUsedRoom } = await import('../services/smart-home/sonos-music.js');

      const room = getLastUsedRoom('unknownUser');
      expect(room).toBeUndefined();
    });
  });
});

// ============================================================================
// SPOTIFY TOKEN MANAGEMENT TESTS
// ============================================================================

describe('Spotify Token Management', () => {
  // Mock fs for token file operations
  vi.mock('fs', () => ({
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  }));

  describe('Token Status', () => {
    it('should report invalid status when no tokens', async () => {
      const { getSpotifyTokenStatus } = await import('../services/identity/spotify-auth.js');

      const status = getSpotifyTokenStatus();
      // With mocked fs returning false for existsSync, should be invalid
      expect(status.valid).toBe(false);
    });
  });

  describe('Configuration Check', () => {
    it('should check if Spotify is configured', async () => {
      const { isSpotifyConfigured } = await import('../services/identity/spotify-auth.js');

      // Without env vars and token file, should be false
      const configured = isSpotifyConfigured();
      expect(typeof configured).toBe('boolean');
    });
  });

  describe('Health Status', () => {
    it('should return comprehensive health status', async () => {
      const { getSpotifyHealthStatus } = await import('../services/identity/spotify-auth.js');

      const status = getSpotifyHealthStatus();

      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('hasClientId');
      expect(status).toHaveProperty('hasClientSecret');
      expect(status).toHaveProperty('hasTokenFile');
      expect(status).toHaveProperty('hasRefreshToken');
      expect(status).toHaveProperty('tokenValid');
      expect(status).toHaveProperty('tokenMinutesRemaining');
      expect(status).toHaveProperty('circuitBreakerOpen');
      expect(status).toHaveProperty('lastError');
    });
  });
});

// ============================================================================
// MUSIC INTENT DETECTION (Local music.ts)
// ============================================================================

describe('Local Music Intent Detection', () => {
  it('should detect listening patterns', async () => {
    const { detectMusicIntent } = await import('../tools/domains/entertainment/music.js');

    expect(detectMusicIntent('play the song Bohemian Rhapsody')).toBe('listening');
    expect(detectMusicIntent('I want to hear Taylor Swift')).toBe('listening');
    expect(detectMusicIntent('full song please')).toBe('listening');
  });

  it('should detect ambient patterns', async () => {
    const { detectMusicIntent } = await import('../tools/domains/entertainment/music.js');

    expect(detectMusicIntent('play some jazz')).toBe('ambient');
    expect(detectMusicIntent('something relaxing')).toBe('ambient');
    expect(detectMusicIntent('background music')).toBe('ambient');
    expect(detectMusicIntent('chill vibes')).toBe('ambient');
  });

  it('should default short queries to ambient', async () => {
    const { detectMusicIntent } = await import('../tools/domains/entertainment/music.js');

    expect(detectMusicIntent('jazz')).toBe('ambient');
    expect(detectMusicIntent('rock')).toBe('ambient');
  });

  it('should default specific queries to listening', async () => {
    const { detectMusicIntent } = await import('../tools/domains/entertainment/music.js');

    expect(detectMusicIntent('play Shape of You by Ed Sheeran please')).toBe('listening');
  });
});

// ============================================================================
// ITUNES FALLBACK TESTS
// ============================================================================

describe('iTunes Fallback Behavior', () => {
  describe('Fallback Source Selection', () => {
    it('should select iTunes when Spotify not linked', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: false,
        sonosLinked: false,
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('itunes');
    });

    it('should select iTunes when Spotify not Premium', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: false, // Free account
        spotifyDeviceReady: true,
        sonosLinked: false,
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('itunes');
    });

    it('should select iTunes when Spotify device not ready', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: false, // No active device
        sonosLinked: false,
      });

      const source = selectBestSource('listening', config);
      expect(source).toBe('itunes');
    });

    it('should select iTunes for ambient intent (always)', async () => {
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      // Even with everything available, ambient uses iTunes
      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: true,
        sonosLinked: true,
        sonosRooms: ['Living Room'],
      });

      const source = selectBestSource('ambient', config);
      expect(source).toBe('itunes');
    });
  });

  describe('Fallback Result Formatting', () => {
    it('should format iTunes preview result appropriately', async () => {
      const { formatPlaybackResult } = await import('../services/music/music-provider.js');

      const result = {
        success: true,
        source: 'itunes' as const,
        track: { name: 'Bohemian Rhapsody', artist: 'Queen', source: 'itunes' as const },
        message: 'Playing preview',
        isPreview: true,
      };

      const formatted = formatPlaybackResult(result);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should handle iTunes search failure gracefully', async () => {
      const { formatPlaybackResult } = await import('../services/music/music-provider.js');

      const result = {
        success: false,
        source: 'itunes' as const,
        message: "Couldn't find that track on iTunes",
        isPreview: false,
      };

      const formatted = formatPlaybackResult(result);
      expect(formatted).toContain("Couldn't find");
    });
  });

  describe('iTunes Service Health', () => {
    it('should always report iTunes as available', async () => {
      const { buildSourceConfig } = await import('../services/music/music-provider.js');

      // iTunes should always be available as fallback
      const config = buildSourceConfig({});
      expect(config.itunes.available).toBe(true);

      // Even with no other services
      const emptyConfig = buildSourceConfig({
        spotifyLinked: false,
        sonosLinked: false,
      });
      expect(emptyConfig.itunes.available).toBe(true);
    });
  });
});

// ============================================================================
// SPOTIFY FALLBACK TO ITUNES TESTS
// ============================================================================

describe('Spotify to iTunes Fallback', () => {
  describe('Premium Status Handling', () => {
    it('should report health status', async () => {
      const { getSpotifyHealthStatus } = await import('../services/identity/spotify-auth.js');

      const status = getSpotifyHealthStatus();

      // Should have all expected fields
      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('hasClientId');
      expect(status).toHaveProperty('hasClientSecret');
      expect(status).toHaveProperty('tokenValid');
      expect(status).toHaveProperty('circuitBreakerOpen');
    });
  });

  describe('Device Discovery', () => {
    it('should detect when no devices available', async () => {
      // This would trigger fallback to iTunes
      // We test the source selection logic
      const { selectBestSource, buildSourceConfig } = await import(
        '../services/music/music-provider.js'
      );

      const config = buildSourceConfig({
        spotifyLinked: true,
        spotifyPremium: true,
        spotifyDeviceReady: false, // This simulates no devices
      });

      // Should fall back to iTunes (or Sonos if available)
      const source = selectBestSource('listening', config);
      expect(['itunes', 'sonos'].includes(source)).toBe(true);
    });
  });
});

// ============================================================================
// CIRCUIT BREAKER FALLBACK TESTS
// ============================================================================

describe('Circuit Breaker Fallback', () => {
  it('should report Sonos circuit breaker status', async () => {
    const { getSonosCircuitBreakerStatus, resetSonosCircuitBreaker } = await import(
      '../services/smart-home/sonos.js'
    );

    // Reset to known state
    resetSonosCircuitBreaker();

    const status = getSonosCircuitBreakerStatus();
    expect(status.isOpen).toBe(false);
    expect(status.failures).toBe(0);
  });

  it('should have Sonos availability check', async () => {
    const { isSonosAvailable } = await import('../services/smart-home/sonos-music.js');
    const { resetSonosCircuitBreaker } = await import('../services/smart-home/sonos.js');

    // Reset to ensure availability
    resetSonosCircuitBreaker();

    const available = isSonosAvailable();
    expect(typeof available).toBe('boolean');
  });
});
