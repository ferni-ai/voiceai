import { describe, expect, it } from 'vitest';
import { registeredAfterCallTasks } from '../../services/session/after-call-tasks.js';

describe('after-call-register', () => {
  it('registers the post-call check-in task when the job executor loads it', async () => {
    await import('../after-call-register.js');
    expect(registeredAfterCallTasks()).toContain('after-call-checkin');
  });

  it('registers the persona growth writer (PERSONA_GROWTH)', async () => {
    await import('../after-call-register.js');
    expect(registeredAfterCallTasks()).toContain('persona-growth');
  });
});
