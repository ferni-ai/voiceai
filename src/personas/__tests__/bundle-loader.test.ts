/**
 * Bundle Loader Unit Tests
 *
 * Tests the persona bundle loading system:
 * - Bundle loading from filesystem
 * - Cache management and invalidation
 * - Bundle search paths
 *
 * Note: Manifest structure uses manifest.identity.id for the persona ID
 *
 * @module personas/__tests__/bundle-loader.test
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadBundleById,
  getBundleSearchPaths,
  clearBundleCache,
  getCachedBundles,
  getBundleCacheStats,
} from '../bundles/loader.js';

// Helper to get bundle ID from manifest structure
function getBundleId(bundle: { manifest: { identity?: { id?: string } } }): string | undefined {
  return bundle.manifest.identity?.id;
}

describe('Bundle Loader', () => {
  beforeEach(() => {
    clearBundleCache();
  });

  afterEach(() => {
    clearBundleCache();
  });

  describe('loadBundleById', () => {
    it('should load ferni bundle', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      expect(getBundleId(bundle)).toBe('ferni');
      expect(bundle.manifest.identity?.name).toBeDefined();
    });

    it('should load all core persona bundles', async () => {
      const corePersonas = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of corePersonas) {
        const bundle = await loadBundleById(personaId);

        expect(bundle, `Bundle should load for ${personaId}`).not.toBeNull();
        if (!bundle) throw new Error(`Bundle should exist for ${personaId}`);
        expect(getBundleId(bundle)).toBe(personaId);
      }
    });

    it('should return null for unknown bundle ID', async () => {
      const result = await loadBundleById('unknown-persona');
      expect(result).toBeNull();
    });

    it('should cache loaded bundles', async () => {
      // First load
      const bundle1 = await loadBundleById('ferni');

      // Second load should be from cache
      const bundle2 = await loadBundleById('ferni');

      // Should be the same bundle instance
      expect(bundle2).toBe(bundle1);
    });

    it('should load bundle with required manifest fields', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      // Check required manifest fields (using correct structure)
      expect(bundle.manifest.identity?.id).toBeDefined();
      expect(bundle.manifest.identity?.name).toBeDefined();
      expect(bundle.manifest.version).toBeDefined();
      expect(bundle.manifest.identity?.description).toBeDefined();
    });

    it('should load bundle with voice configuration', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      expect(bundle.manifest.voice).toBeDefined();
      expect(bundle.manifest.voice.provider).toBeDefined();
      // Voice ID uses snake_case in manifest
      expect(bundle.manifest.voice.voice_id).toBeDefined();
    });
  });

  describe('getBundleSearchPaths', () => {
    it('should return array of search paths', () => {
      const paths = getBundleSearchPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should include default bundles directory', () => {
      const paths = getBundleSearchPaths();

      // Should include a path containing 'bundles'
      const hasBundlesPath = paths.some((p) => p.includes('bundles'));
      expect(hasBundlesPath).toBe(true);
    });
  });

  describe('clearBundleCache', () => {
    it('should clear entire cache when no id provided', async () => {
      // Load some bundles
      await loadBundleById('ferni');
      await loadBundleById('peter-john');

      expect(getCachedBundles().length).toBeGreaterThan(0);

      // Clear cache
      clearBundleCache();

      expect(getCachedBundles().length).toBe(0);
    });

    it('should clear specific bundle when id provided', async () => {
      // Clear cache first
      clearBundleCache();

      // Load some bundles
      await loadBundleById('ferni');
      await loadBundleById('peter-john');

      const beforeBundles = getCachedBundles();

      // Verify ferni is in cache
      const hasFerriBefore = beforeBundles.some((b) => getBundleId(b) === 'ferni');
      expect(hasFerriBefore).toBe(true);

      // Clear only ferni
      clearBundleCache('ferni');

      const afterBundles = getCachedBundles();
      const hasFerniAfter = afterBundles.some((b) => getBundleId(b) === 'ferni');

      // Ferni should be removed
      expect(hasFerniAfter).toBe(false);

      // Peter should still be in cache
      const hasPeterAfter = afterBundles.some((b) => getBundleId(b) === 'peter-john');
      expect(hasPeterAfter).toBe(true);
    });
  });

  describe('getCachedBundles', () => {
    it('should return empty array initially', () => {
      clearBundleCache();
      const bundles = getCachedBundles();

      expect(Array.isArray(bundles)).toBe(true);
      expect(bundles.length).toBe(0);
    });

    it('should return loaded bundles', async () => {
      await loadBundleById('ferni');
      await loadBundleById('peter-john');

      const bundles = getCachedBundles();

      // Should have at least 2 bundles
      expect(bundles.length).toBeGreaterThanOrEqual(2);

      // Check that we can find the loaded bundles using correct path
      const ferniBundle = bundles.find((b) => getBundleId(b) === 'ferni');
      const peterBundle = bundles.find((b) => getBundleId(b) === 'peter-john');

      expect(ferniBundle).toBeDefined();
      expect(peterBundle).toBeDefined();
    });
  });

  describe('getBundleCacheStats', () => {
    it('should return cache statistics', async () => {
      clearBundleCache();
      await loadBundleById('ferni');

      const stats = getBundleCacheStats();

      expect(stats.size).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(stats.entries)).toBe(true);
      expect(stats.entries.length).toBeGreaterThanOrEqual(1);

      // Find ferni entry
      const ferniEntry = stats.entries.find((e) => e.bundleId === 'ferni');
      expect(ferniEntry).toBeDefined();
      expect(ferniEntry?.loadedAt).toBeInstanceOf(Date);
      expect(ferniEntry?.lastAccessed).toBeInstanceOf(Date);
    });

    it('should show empty stats when cache is empty', () => {
      clearBundleCache();
      const stats = getBundleCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.entries.length).toBe(0);
    });
  });

  describe('Bundle content loading', () => {
    it('should have lazy loading accessors', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      // Check lazy loading accessors exist
      expect(typeof bundle.getStory).toBe('function');
      expect(typeof bundle.getAllStories).toBe('function');
      expect(typeof bundle.getStoriesByTrigger).toBe('function');
      expect(typeof bundle.getKnowledge).toBe('function');
      expect(typeof bundle.getBehaviors).toBe('function');
    });

    it('should load behaviors via accessor', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      // Load behaviors via accessor
      const behaviors = await bundle.getBehaviors();

      expect(behaviors).toBeDefined();
    });

    it('should have correct bundle structure', async () => {
      const bundle = await loadBundleById('ferni');

      expect(bundle).not.toBeNull();
      if (!bundle) throw new Error('Bundle should exist');
      // Check main structure
      expect(bundle.manifest).toBeDefined();
      expect(bundle.bundlePath).toBeDefined();
      expect(bundle.loadedAt).toBeInstanceOf(Date);
    });
  });
});
