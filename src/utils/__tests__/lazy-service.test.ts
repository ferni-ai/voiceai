/**
 * Lazy Service Tests
 *
 * Tests for deferred service loading.
 *
 * @module utils/__tests__/lazy-service.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { lazyService } from '../lazy-service.js';

describe('Lazy Service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('lazyService', () => {
    it('should not load service until called', async () => {
      const loader = vi.fn().mockResolvedValue({ name: 'TestService' });

      const getService = lazyService(loader);

      expect(loader).not.toHaveBeenCalled();

      await getService();

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should cache loaded service', async () => {
      const loader = vi.fn().mockResolvedValue({ name: 'TestService' });

      const getService = lazyService(loader);

      const first = await getService();
      const second = await getService();
      const third = await getService();

      expect(loader).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('should handle concurrent loading requests', async () => {
      let loadCount = 0;
      const loader = vi.fn().mockImplementation(async () => {
        loadCount++;
        await new Promise((r) => setTimeout(r, 50));
        return { id: loadCount };
      });

      const getService = lazyService(loader);

      // Request service 5 times concurrently
      const promises = Array.from({ length: 5 }, () => getService());
      const results = await Promise.all(promises);

      // Should only load once
      expect(loader).toHaveBeenCalledTimes(1);

      // All results should be the same instance
      const first = results[0];
      results.forEach((result) => {
        expect(result).toBe(first);
      });
    });

    it('should support preloading after delay', async () => {
      const loader = vi.fn().mockResolvedValue({ preloaded: true });

      lazyService(loader, { preloadDelay: 50, name: 'PreloadService' });

      expect(loader).not.toHaveBeenCalled();

      // Wait for preload
      await new Promise((r) => setTimeout(r, 100));

      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should not preload when delay is 0', async () => {
      const loader = vi.fn().mockResolvedValue({ preloaded: false });

      lazyService(loader, { preloadDelay: 0 });

      await new Promise((r) => setTimeout(r, 100));

      expect(loader).not.toHaveBeenCalled();
    });

    it('should handle loader errors', async () => {
      const loader = vi.fn().mockRejectedValue(new Error('Failed to load'));

      const getService = lazyService(loader);

      await expect(getService()).rejects.toThrow('Failed to load');
    });
  });
});
