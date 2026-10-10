import { describe, expect, it, vi } from 'vitest';

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));

const runner = await import('../job-runner.js');

describe('job runner', () => {
  it('runs calls in-process unless AGENT_JOB_EXECUTOR=process', () => {
    expect(runner.jobExecutorMode({})).toBe('inproc');
    expect(runner.jobExecutorMode({ AGENT_JOB_EXECUTOR: 'inproc' })).toBe('inproc');
    expect(runner.jobExecutorMode({ AGENT_JOB_EXECUTOR: 'process' })).toBe('process');
  });

  it('keeps one warmed child by default, any non-negative whole number on request', () => {
    expect(runner.idleProcesses({})).toBe(1);
    expect(runner.idleProcesses({ AGENT_IDLE_PROCESSES: '2' })).toBe(2);
    expect(runner.idleProcesses({ AGENT_IDLE_PROCESSES: '0' })).toBe(0);
    expect(runner.idleProcesses({ AGENT_IDLE_PROCESSES: '-1' })).toBe(1);
    expect(runner.idleProcesses({ AGENT_IDLE_PROCESSES: 'lots' })).toBe(1);
  });

  it('in-process: no pool, nothing running, own load, and an unknown termination is reported', () => {
    runner.startJobRunner(() => undefined, 'inproc');
    expect(runner.activeJobCount()).toBe(0);
    expect(runner.activeJobIds()).toEqual([]);
    expect(runner.workerLoad(0.42)).toBe(0.42);
    expect(runner.terminateJob('AJ_nope', 'livekit_termination')).toBe(false);
  });
});
