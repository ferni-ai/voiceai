import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalInsightsRefreshJob } from '../../../tasks/scheduled/personal-insights-job.js';
import {
  registerBoundariesPort,
  registerImportantDatesPort,
  resetIntegrationPorts,
} from '../integrations.js';
import { invalidatePersonalInsightsCache } from '../pipeline.js';
import { MemoryStore, NOW, fact, sources, summary } from './fixtures.js';

beforeEach(() => {
  resetIntegrationPorts();
  registerImportantDatesPort(null);
  registerBoundariesPort(null);
  invalidatePersonalInsightsCache();
});
afterEach(() => resetIntegrationPorts());

describe('PersonalInsightsRefreshJob', () => {
  it('refreshes each recently active user, and skips them on a dry run', async () => {
    const store = new MemoryStore(
      sources({
        facts: [fact('Mom', 'name', 'Linda')],
        summaries: [summary('c1', 1, { mainTopics: ['Garden'] })],
      })
    );
    const findUsers = vi.fn().mockResolvedValue(['u1', 'u2']);
    const job = new PersonalInsightsRefreshJob(findUsers, { store, llm: null, now: () => NOW });
    const result = await job.run();
    expect(findUsers).toHaveBeenCalledWith(14, 500);
    expect(result.usersRefreshed).toBe(2);
    expect(store.bundle).not.toBeNull();

    const dry = await new PersonalInsightsRefreshJob(findUsers, { store, llm: null }).run({
      dryRun: true,
    });
    expect(dry.usersRefreshed).toBe(0);
    expect(dry.skippedCount).toBe(2);
  });
});

describe('live-path helpers', () => {
  it('never waits longer than the budget for the bundle', async () => {
    const { sessionInsightsSection } =
      await import('../../../agents/multi-agent/personal-insights-context.js');
    const slow = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1000);
    });
    const started = Date.now();
    expect(await sessionInsightsSection(slow, 'Maya', 20)).toBe('');
    expect(Date.now() - started).toBeLessThan(500);
    expect(await sessionInsightsSection(null, 'Maya')).toBe('');
  });

  it('adds a person note from transcript events and cleans up', async () => {
    const store = new MemoryStore(
      sources({ facts: [fact('Mom', 'name', 'Linda'), fact('Linda', 'hobby', 'gardening')] })
    );
    const { refreshPersonalInsights } = await import('../pipeline.js');
    // Warms the people cache the live helper reads from.
    await refreshPersonalInsights('u1', { store, llm: null, now: () => Date.now() });
    const { installPersonRecall } =
      await import('../../../agents/multi-agent/personal-insights-context.js');
    const handlers = new Map<string, (e: unknown) => void>();
    const events = {
      on: (name: string, h: (e: unknown) => void) => handlers.set(name, h),
      off: (name: string) => handlers.delete(name),
    };
    const notes: string[] = [];
    const stop = installPersonRecall('u1', events, (n) => notes.push(n))!;
    await new Promise((r) => {
      setTimeout(r, 10);
    });
    handlers.get('user_input_transcribed')!({ transcript: 'Linda called me today' });
    expect(notes[0]).toMatch(/gardening/);
    stop();
    expect(handlers.size).toBe(0);
    expect(installPersonRecall('anonymous', events, () => undefined)).toBeNull();
  });
});
