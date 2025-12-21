/**
 * Context Builder Loader E2E Tests
 *
 * These tests enforce that:
 * - The manifest only references real builder modules
 * - The loader can import every builder without failures
 *
 * This protects us from silent runtime degradation (missing modules, typos, etc.).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ensureBuildersLoaded,
  getAllBuilderModules,
  getLastLoadReport,
  reloadBuilders,
} from '../intelligence/context-builders/index.js';
import { BUILDER_IMPORTS } from '../intelligence/context-builders/core/builder-imports.js';

describe('context-builders loader (e2e)', () => {
  beforeAll(async () => {
    // Make any module-level randomness deterministic during imports.
    vi.spyOn(Math, 'random').mockReturnValue(0.05);

    await reloadBuilders();
    await ensureBuildersLoaded();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('manifest references only existing source modules', () => {
    const modules = getAllBuilderModules();

    const missing: string[] = [];
    for (const moduleName of modules) {
      // Check if the module has a corresponding import function in BUILDER_IMPORTS
      if (!BUILDER_IMPORTS[moduleName]) {
        missing.push(moduleName);
      }
    }

    expect(missing).toEqual([]);
  });

  it('loads all manifest modules without failures', () => {
    const modules = getAllBuilderModules();
    const report = getLastLoadReport();

    expect(report).not.toBeNull();
    expect(report?.failed).toEqual([]);
    expect(report?.loaded).toBe(modules.length);
    expect(report?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
