import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const track = (name: string) => vi.fn(() => void calls.push(name));

vi.mock('../../../memory/dynamic/async-events-config.js', () => ({
  configureAsyncEvents: track('configureAsyncEvents'),
}));
vi.mock('../../../memory/dynamic/index.js', () => ({
  configureSyncService: track('configureSyncService'),
  startDeepExtractionWorker: track('startDeepExtractionWorker'),
}));
vi.mock('../../../memory/knowledge-graph/index.js', () => ({
  initializeKnowledgeCapture: vi.fn(async () => void calls.push('initializeKnowledgeCapture')),
}));
vi.mock('../../../services/async-events/index.js', () => ({ memoryAsyncEvents: {} }));
vi.mock('../../session/index.js', () => ({
  startRegistryOrphanCleanup: track('startRegistryOrphanCleanup'),
  stopRegistryOrphanCleanup: vi.fn(() => {
    calls.push('stopRegistryOrphanCleanup');
    throw new Error('boom');
  }),
}));
vi.mock('../../shared/crash-analytics.js', () => ({
  initCrashAnalytics: track('initCrashAnalytics'),
}));
vi.mock('../../shared/openai-health-monitor.js', () => ({
  startOrphanCleanup: track('startOrphanCleanup'),
  stopOrphanCleanup: track('stopOrphanCleanup'),
}));
vi.mock('../../shared/session-closing-tracker.js', () => ({
  startClosingTrackerCleanup: track('startClosingTrackerCleanup'),
  stopClosingTrackerCleanup: track('stopClosingTrackerCleanup'),
}));

const { startProcessRuntime } = await import('../process-runtime.js');

describe('startProcessRuntime', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('starts everything a process that runs calls needs, once, events before the worker', async () => {
    startProcessRuntime(() => undefined);
    await Promise.resolve();
    for (const name of [
      'initCrashAnalytics',
      'configureAsyncEvents',
      'startDeepExtractionWorker',
      'initializeKnowledgeCapture',
      'configureSyncService',
      'startOrphanCleanup',
      'startRegistryOrphanCleanup',
      'startClosingTrackerCleanup',
    ])
      expect(
        calls.filter((c) => c === name),
        name
      ).toHaveLength(1);
    expect(calls.indexOf('configureAsyncEvents')).toBeLessThan(
      calls.indexOf('startDeepExtractionWorker')
    );
  });

  it('stop() stops every cleanup even when one throws, and logs the failure', () => {
    const logs: string[] = [];
    const runtime = startProcessRuntime((msg) => void logs.push(msg));
    calls.length = 0;
    runtime.stop();
    expect(calls).toEqual([
      'stopOrphanCleanup',
      'stopRegistryOrphanCleanup',
      'stopClosingTrackerCleanup',
    ]);
    expect(logs).toContain('Session cleanup registry failed to stop');
  });
});
