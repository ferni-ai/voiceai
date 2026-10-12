import { afterEach, describe, expect, it, vi } from 'vitest';

const supersede = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../../memory/dynamic/fact-supersession.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../memory/dynamic/fact-supersession.js')>()),
  supersedeNewFacts: supersede,
}));

import '../after-call-register.js';
import {
  drainAfterCallTasks,
  registeredAfterCallTasks,
  runAfterCallTasks,
} from '../../services/session/after-call-tasks.js';

const call = {
  userId: 'u-eli',
  sessionId: 's1',
  turns: [],
  startedAt: new Date('2026-10-11T18:00:00Z'),
};

afterEach(() => {
  delete process.env.FACT_SUPERSESSION;
  supersede.mockClear();
});

describe('fact supersession after a call', () => {
  it('is registered with the after-call tasks the job executor runs', () => {
    expect(registeredAfterCallTasks()).toContain('fact-supersession');
  });

  it('does nothing unless FACT_SUPERSESSION=on', async () => {
    runAfterCallTasks(call);
    await drainAfterCallTasks(1_000);
    expect(supersede).not.toHaveBeenCalled();

    process.env.FACT_SUPERSESSION = 'on';
    runAfterCallTasks(call);
    await drainAfterCallTasks(1_000);
    expect(supersede).toHaveBeenCalledWith(
      'u-eli',
      expect.objectContaining({ since: call.startedAt, llm: expect.any(Function) })
    );
  });
});
