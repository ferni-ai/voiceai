/**
 * Every job ends its CALL_MEMORY_TRACE (call-memory-trace.ts), and the job is
 * not over until the trace's last sample is logged: in a per-call process the
 * process exits right after the job, so an unawaited finish would be cut off.
 */
import { describe, expect, it, vi } from 'vitest';

const trace = vi.hoisted(() => ({ jobs: [] as string[], release: () => {}, finished: false }));

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));
vi.mock('../../shared/call-memory-trace.js', () => ({
  traceCallMemory: (jobId: string) => {
    trace.jobs.push(jobId);
    return () =>
      new Promise<void>((resolve) => {
        trace.release = () => {
          trace.finished = true;
          resolve();
        };
      });
  },
}));

const { runJobInProcess } = await import('../job-executor.js');

describe('runJobInProcess: memory trace', () => {
  it('starts the trace for the job and waits for its finish before the job ends', async () => {
    const info = {
      job: { id: 'AJ_trace_test', room: { name: 'eval-trace-test' } },
      acceptArgs: {},
      url: 'ws://localhost:7880',
      token: 'token',
    } as unknown as Parameters<typeof runJobInProcess>[0];
    let ended = false;
    const job = runJobInProcess(info, () => undefined).finally(() => {
      ended = true;
    });
    await vi.waitFor(() => expect(trace.jobs).toEqual(['AJ_trace_test']));
    await new Promise((r) => setTimeout(r, 50));
    expect(ended).toBe(false); // the job waits on the trace's finish
    trace.release();
    await job;
    expect(trace.finished).toBe(true);
  });
});
