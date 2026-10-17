import { describe, expect, it, vi } from 'vitest';

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));

const { registeredAfterCallTasks } = await import('../../../services/session/after-call-tasks.js');

describe('job executor after-call registrations', () => {
  it('registers the follow-through import (FOLLOW_THROUGH_IMPORT) in every process that runs a call', async () => {
    expect(registeredAfterCallTasks()).not.toContain('follow-through-import');
    await import('../job-executor.js');
    expect(registeredAfterCallTasks()).toContain('follow-through-import');
  });
});
