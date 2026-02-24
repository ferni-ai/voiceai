/**
 * Domain Bridge Tests
 *
 * Tests the semantic → domain tool bridge that enables
 * semantic routing to execute real domain tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasDomainMapping,
  getDomainToolId,
  transformArguments,
  getAllMappings,
  registerMapping,
} from '../../domain-bridge/index.js';

describe('Domain Bridge', () => {
  // ============================================================================
  // MAPPING LOOKUP
  // ============================================================================

  describe('hasDomainMapping', () => {
    it('returns true for mapped music tools', () => {
      expect(hasDomainMapping('spotify_play')).toBe(true);
      expect(hasDomainMapping('spotify_pause')).toBe(true);
      expect(hasDomainMapping('spotify_skip')).toBe(true);
    });

    it('returns true for mapped weather tools', () => {
      expect(hasDomainMapping('weather_current')).toBe(true);
      expect(hasDomainMapping('weather_forecast')).toBe(true);
    });

    it('returns true for mapped handoff tools', () => {
      expect(hasDomainMapping('handoff')).toBe(true);
    });

    it('returns false for unmapped tools', () => {
      expect(hasDomainMapping('nonexistent_tool')).toBe(false);
      expect(hasDomainMapping('')).toBe(false);
    });
  });

  describe('getDomainToolId', () => {
    it('returns correct domain tool ID for music tools', () => {
      expect(getDomainToolId('spotify_play')).toBe('playMusic');
      expect(getDomainToolId('spotify_pause')).toBe('musicControl');
      expect(getDomainToolId('spotify_skip')).toBe('musicControl');
    });

    it('returns correct domain tool ID for weather tools', () => {
      expect(getDomainToolId('weather_current')).toBe('getWeather');
      expect(getDomainToolId('weather_forecast')).toBe('getWeatherForecast');
    });

    it('returns undefined for unmapped tools', () => {
      expect(getDomainToolId('nonexistent_tool')).toBeUndefined();
    });
  });

  // ============================================================================
  // ARGUMENT TRANSFORMATION
  // ============================================================================

  describe('transformArguments', () => {
    it('transforms spotify_play args to playMusic format', () => {
      const result = transformArguments('spotify_play', { query: 'jazz' });
      expect(result).toEqual({ query: 'jazz' });
    });

    it('falls back to genre if query not provided', () => {
      const result = transformArguments('spotify_play', { genre: 'rock' });
      expect(result).toEqual({ query: 'rock' });
    });

    it('falls back to mood if query and genre not provided', () => {
      const result = transformArguments('spotify_play', { mood: 'chill' });
      expect(result).toEqual({ query: 'chill' });
    });

    it('transforms spotify_pause to musicControl with pause action', () => {
      const result = transformArguments('spotify_pause', {});
      expect(result).toEqual({ action: 'pause' });
    });

    it('transforms spotify_skip to musicControl with skip action', () => {
      const result = transformArguments('spotify_skip', {});
      expect(result).toEqual({ action: 'skip' });
    });

    it('transforms weather_current args', () => {
      const result = transformArguments('weather_current', { location: 'New York' });
      expect(result).toEqual({ location: 'New York' });
    });

    it('transforms weather_forecast with default days', () => {
      const result = transformArguments('weather_forecast', { location: 'Paris' });
      expect(result).toEqual({ location: 'Paris', days: 5 });
    });

    it('preserves custom days for forecast', () => {
      const result = transformArguments('weather_forecast', { location: 'Tokyo', days: 3 });
      expect(result).toEqual({ location: 'Tokyo', days: 3 });
    });

    it('passes through args for unmapped tools', () => {
      const args = { foo: 'bar', baz: 123 };
      const result = transformArguments('nonexistent_tool', args);
      expect(result).toEqual(args);
    });
  });

  // ============================================================================
  // DYNAMIC REGISTRATION
  // ============================================================================

  describe('registerMapping', () => {
    it('registers new mappings', () => {
      // Register a test mapping
      registerMapping('test_semantic_tool', {
        domainToolId: 'testDomainTool',
        transformArgs: (args) => ({ ...args, transformed: true }),
      });

      expect(hasDomainMapping('test_semantic_tool')).toBe(true);
      expect(getDomainToolId('test_semantic_tool')).toBe('testDomainTool');

      const result = transformArguments('test_semantic_tool', { input: 'value' });
      expect(result).toEqual({ input: 'value', transformed: true });
    });
  });

  describe('getAllMappings', () => {
    it('returns all registered mappings', () => {
      const mappings = getAllMappings();

      expect(mappings.spotify_play).toBeDefined();
      expect(mappings.spotify_pause).toBeDefined();
      expect(mappings.weather_current).toBeDefined();
      expect(mappings.handoff).toBeDefined();
    });

    it('returns a copy (not the original object)', () => {
      const mappings1 = getAllMappings();
      const mappings2 = getAllMappings();

      expect(mappings1).toEqual(mappings2);
      expect(mappings1).not.toBe(mappings2);
    });
  });
});

describe('Domain Bridge - Integration Scenarios', () => {
  // ============================================================================
  // MUSIC SCENARIOS
  // ============================================================================

  describe('Music tool chain', () => {
    it('handles play → pause → skip sequence', () => {
      // Simulate typical music session
      const playArgs = transformArguments('spotify_play', { query: 'lo-fi beats' });
      expect(playArgs).toEqual({ query: 'lo-fi beats' });

      const pauseArgs = transformArguments('spotify_pause', {});
      expect(pauseArgs).toEqual({ action: 'pause' });

      const skipArgs = transformArguments('spotify_skip', {});
      expect(skipArgs).toEqual({ action: 'skip' });
    });

    it('handles various play request formats', () => {
      // User: "play jazz"
      expect(transformArguments('spotify_play', { query: 'jazz' })).toEqual({ query: 'jazz' });

      // User: "play something chill" (mood extracted)
      expect(transformArguments('spotify_play', { mood: 'chill' })).toEqual({ query: 'chill' });

      // User: "play Taylor Swift" (artist extracted)
      expect(transformArguments('spotify_play', { artist: 'Taylor Swift' })).toEqual({
        query: 'Taylor Swift',
      });

      // User: "play music" (no specifics)
      expect(transformArguments('spotify_play', {})).toEqual({ query: 'music' });
    });
  });

  // ============================================================================
  // WEATHER SCENARIOS
  // ============================================================================

  describe('Weather tool chain', () => {
    it('handles current weather with location', () => {
      const args = transformArguments('weather_current', { location: 'San Francisco' });
      expect(args).toEqual({ location: 'San Francisco' });
    });

    it('handles current weather without location', () => {
      const args = transformArguments('weather_current', {});
      expect(args).toEqual({ location: undefined });
    });

    it('handles forecast with custom days', () => {
      const args = transformArguments('weather_forecast', { location: 'Chicago', days: 7 });
      expect(args).toEqual({ location: 'Chicago', days: 7 });
    });

    it('handles info_news and info_search', () => {
      expect(getDomainToolId('info_news')).toBe('getNews');
      expect(getDomainToolId('info_search')).toBe('webSearch');
    });
  });

  // ============================================================================
  // HANDOFF SCENARIOS
  // ============================================================================

  describe('Handoff tool mapping', () => {
    it('maps handoff with persona transformation', () => {
      expect(getDomainToolId('handoff')).toBe('handoff');

      // Transforms to targetPersona
      const args = { targetPersona: 'maya', reason: 'habit help' };
      const result = transformArguments('handoff', args);
      expect(result.targetPersona).toBe('maya');
      expect(result.reason).toBe('habit help');
    });

    it('maps handoff_maya_implicit with default persona', () => {
      expect(getDomainToolId('handoff_maya_implicit')).toBe('handoff');

      // Always routes to maya for habit coaching
      const args = { topic: 'morning routine' };
      const result = transformArguments('handoff_maya_implicit', args);
      expect(result.targetPersona).toBe('maya');
      expect(result.reason).toBe('morning routine');
    });
  });
});
