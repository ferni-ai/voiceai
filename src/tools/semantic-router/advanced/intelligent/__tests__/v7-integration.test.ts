/**
 * FTIS Integration Tests
 *
 * Tests the FTIS hierarchical classifier integration:
 * - detectModelVersion() (v7 or none)
 * - Hierarchical classifier (when models present)
 */

import { describe, expect, it } from 'vitest';

// ============================================================================
// detectModelVersion() Tests
// ============================================================================

describe('detectFTISModels', () => {
  it('should return available or none based on model files', async () => {
    const { detectFTISModels } = await import('../hierarchical-classifier.js');
    const status = detectFTISModels();
    expect(['available', 'none']).toContain(status);
  });
});

// ============================================================================
// Hierarchical Classifier Tests (model-dependent, skip if absent)
// ============================================================================

describe('Hierarchical Classifier', () => {
  it('should export expected API surface', async () => {
    const mod = await import('../hierarchical-classifier.js');
    expect(typeof mod.initializeHierarchicalClassifier).toBe('function');
    expect(typeof mod.classifyHierarchical).toBe('function');
    expect(typeof mod.classifyHierarchicalSafe).toBe('function');
    expect(typeof mod.isHierarchicalClassifierAvailable).toBe('function');
    expect(typeof mod.getV7DomainLabels).toBe('function');
    expect(typeof mod.getV7MetaToolLabels).toBe('function');
    expect(typeof mod.shutdownHierarchicalClassifier).toBe('function');
  });

  it('should return null safely when not initialized', async () => {
    const { classifyHierarchicalSafe, shutdownHierarchicalClassifier } =
      await import('../hierarchical-classifier.js');
    shutdownHierarchicalClassifier();
    const result = classifyHierarchicalSafe('play some music');
    expect(result).toBeNull();
  });

  it('should report unavailable when not initialized', async () => {
    const { isHierarchicalClassifierAvailable, shutdownHierarchicalClassifier } =
      await import('../hierarchical-classifier.js');
    shutdownHierarchicalClassifier();
    expect(isHierarchicalClassifierAvailable()).toBe(false);
  });
});
