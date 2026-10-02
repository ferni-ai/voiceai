/**
 * Dynamic Domain Executor Tests
 *
 * Pins that every DOMAIN_MODULES path resolves and that domain tools without a
 * specialized executor are routable. A wrong relative prefix once made every
 * import fail silently, leaving the fallback with zero tools.
 *
 * @module agents/shared/tool-executors/__tests__/dynamic-domain-executor.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  getDynamicDomainLoadReport,
  isDynamicTool,
  resetDynamicExecutor,
} from '../dynamic-domain-executor.js';

// Importing ~47 domain modules cold takes a while
const LOAD_TIMEOUT_MS = 120_000;

describe('dynamicDomainExecutor', () => {
  beforeAll(async () => {
    resetDynamicExecutor();
    await getDynamicDomainLoadReport();
  }, LOAD_TIMEOUT_MS);

  it('imports every configured domain module', async () => {
    const report = await getDynamicDomainLoadReport();

    expect(report.configured.length).toBeGreaterThan(0);
    expect(report.failed).toEqual({});
    expect([...report.loaded].sort()).toEqual([...report.configured].sort());
  });

  it.each([
    ['family', 'toggleFamilyCheckin'],
    ['career', 'assessCareerSatisfaction'],
    ['grief', 'processGrief'],
  ])('routes %s tool %s', async (_domain, toolId) => {
    expect(await isDynamicTool(toolId)).toBe(true);
  });

  it('matches tool ids case-insensitively', async () => {
    expect(await isDynamicTool('TOGGLEFAMILYCHECKIN')).toBe(true);
  });

  it('does not route unknown tool ids', async () => {
    expect(await isDynamicTool('notARealToolAnywhere')).toBe(false);
  });
});
