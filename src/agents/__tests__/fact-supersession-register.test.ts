import { afterEach, describe, expect, it, vi } from 'vitest';

const supersede = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('../../memory/dynamic/fact-supersession.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../memory/dynamic/fact-supersession.js')>()),
  supersedeNewFacts: supersede,
}));

const cohortsFor = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: (name: string) => ({
      where: () => ({ get: async () => ({ docs: (await cohortsFor()).map((d) => ({ id: 'seth', data: () => d })) }) }), // prettier-ignore
      doc: () => ({ get: async () => ({ exists: false, data: () => undefined, name }) }),
    }),
  }),
}));

import '../after-call-register.js';
import { applyFlags, forgetAgentValues } from '../../services/platform/cohort-flags.js';
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
  applyFlags({}); // the agent's own values back
  forgetAgentValues();
  delete process.env.FACT_SUPERSESSION;
  delete process.env.COHORT_FLAGS;
  cohortsFor.mockReset();
  cohortsFor.mockResolvedValue([]);
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

  it("reads FACT_SUPERSESSION as the ended call had it, not as the next caller's cohort set it", async () => {
    process.env.COHORT_FLAGS = 'on';
    applyFlags({ FACT_SUPERSESSION: 'on' }); // the next caller's cohort, applied at their call start
    runAfterCallTasks(call); // u-eli is in no cohort
    await drainAfterCallTasks(1_000);
    expect(supersede).not.toHaveBeenCalled();

    applyFlags({}); // the next caller has none; u-eli's cohort turns it on
    cohortsFor.mockResolvedValue([{ enabled: true, flags: { FACT_SUPERSESSION: 'on' } }]);
    runAfterCallTasks(call);
    await drainAfterCallTasks(1_000);
    expect(supersede).toHaveBeenCalledWith('u-eli', expect.anything());
  });
});
