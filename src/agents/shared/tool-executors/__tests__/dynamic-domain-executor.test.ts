/**
 * The dynamic domain executor loads every domain it lists and routes their
 * tools. It used to build module paths one directory short
 * (`../../tools/...` from `agents/shared/tool-executors/`, i.e.
 * `agents/tools/...`), so every import failed quietly and no tool was found.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { getToolDefinitions as careerTools } from '../../../../tools/domains/career/index.js';
import { getToolDefinitions as griefTools } from '../../../../tools/domains/grief/index.js';
import {
  DYNAMIC_DOMAINS,
  dynamicDomainExecutor,
  getDynamicDomainLoadReport,
  getDynamicToolIds,
  isDynamicTool,
  resetDynamicExecutor,
} from '../dynamic-domain-executor.js';

beforeEach(() => resetDynamicExecutor());

describe('dynamic domain executor', () => {
  it('loads every listed domain module', async () => {
    await getDynamicToolIds();
    const report = getDynamicDomainLoadReport();
    expect(report.failed).toEqual([]);
    expect(report.loaded).toEqual([...DYNAMIC_DOMAINS]);
  }, 120_000);

  it('maps the tools of a domain to it and runs one', async () => {
    const ids = await getDynamicToolIds();
    const career = (await careerTools()).map((d) => d.id.toLowerCase());
    const grief = (await griefTools()).map((d) => d.id.toLowerCase());
    expect(career.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining([...career, ...grief]));
    expect(await isDynamicTool(career[0]!)).toBe(true);
    expect(await isDynamicTool('noSuchTool')).toBe(false);

    const result = await dynamicDomainExecutor.execute(
      'noSuchTool',
      {},
      { userId: 'u1', sessionId: 's1', personaId: 'ferni' }
    );
    expect(result).toBeNull();
  }, 120_000);
});
