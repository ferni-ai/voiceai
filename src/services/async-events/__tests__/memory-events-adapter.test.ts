/**
 * The memory layer listens through safeOnEvent and expects the job it was
 * sent. The bus hands handlers an envelope ({type, timestamp, data}), and the
 * adapter passed that envelope through: the deep extraction worker read
 * job.fastCaptureHints off the envelope and crashed on every live turn.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureAsyncEvents,
  resetAsyncEventsConfig,
  safeEmitEvent,
  safeOnEvent,
} from '../../../memory/dynamic/async-events-config.js';
import { memoryAsyncEvents } from '../index.js';

afterEach(() => resetAsyncEventsConfig());

describe('memoryAsyncEvents', () => {
  it('delivers the emitted job itself to memory-layer listeners', async () => {
    configureAsyncEvents(memoryAsyncEvents);
    const received: unknown[] = [];
    safeOnEvent('memory:deep-extraction', (job) => received.push(job));

    const job = { jobId: 'j1', userId: 'u', fastCaptureHints: { mentionedEntities: [] } };
    expect(safeEmitEvent('memory:deep-extraction', job)).toBe(true);

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual(job);
  });
});
