/**
 * The memory flags a cohort or override may set (persona briefings, the handoff desk, the
 * remember tools, the facts dual write) reach their readers for one person only. Every module
 * is imported before any flag is set. In-call readers see the flag the way a call start puts
 * it in process.env (applyCallerFlags); the next caller, in no cohort, gets the agent's own
 * (off) again. The facts dual write runs after the call, when process.env already holds the
 * next caller's flags, so it must answer for the person it writes for.
 */
import type { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const builders = vi.hoisted(() => ({
  maya: vi.fn(async () => [{ content: 'maya brief', priority: 'high' }]),
  jordan: vi.fn(async () => [{ content: 'jordan brief', priority: 'high' }]),
  alex: vi.fn(async () => [{ content: 'alex brief', priority: 'high' }]),
  nayan: vi.fn(async () => [{ content: 'nayan brief', priority: 'high' }]),
  peter: vi.fn(async () => [{ content: 'peter brief', priority: 'high' }]),
}));
vi.mock('../../../intelligence/context-builders/personas/maya-coaching-insights/index.js', () => ({ buildMayaCoachingInsightsContext: builders.maya })); // prettier-ignore
vi.mock('../../../intelligence/context-builders/personas/jordan-milestone-insights/index.js', () => ({ buildJordanMilestoneInsightsContext: builders.jordan })); // prettier-ignore
vi.mock('../../../intelligence/context-builders/personas/alex-communication-insights/index.js', () => ({ buildAlexCommunicationInsightsContext: builders.alex })); // prettier-ignore
vi.mock('../../../intelligence/context-builders/personas/nayan-wisdom-insights/index.js', () => ({ buildNayanWisdomInsightsContext: builders.nayan })); // prettier-ignore
vi.mock('../../../intelligence/context-builders/personas/peter-research-insights/index.js', () => ({ buildPeterResearchInsightsContext: builders.peter })); // prettier-ignore

import { writeDesk } from '../../../agents/multi-agent/handoff-desk.js';
import { buildPersonaSpecificContextInjections } from '../../../agents/processors/injection-builders/intelligence-builders.js';
import type { PersonaSpecificContextInput } from '../../../agents/processors/injection-builders/types.js';
import { usePersonFlagLookup } from '../../../config/person-flag.js';
import { keepForRecall } from '../../../memory/dynamic/remembered-facts.js';
import { dualWriteFacts, type MappedFact } from '../../../memory/writer/facts-dual-write.js';
import type { FactProposal, ProposeResult } from '../../../memory/writer/memory-writer.js';
import {
  captureHandoffContext,
  clearHandoffArrivals,
} from '../../../tools/handoff/handoff-arrival.js';
import { notWrittenReply } from '../../../tools/domains/memory/honest-memory.js';
import { callerFlag } from '../caller-flag.js';
import {
  applyCallerFlags,
  applyFlags,
  envForCaller,
  forgetAgentValues,
  type Cohort,
  type CohortStore,
} from '../cohort-flags.js';

const IN_COHORT = 'uid-cohort-fixture';
const NOT_IN_IT = 'uid-no-cohort-fixture';
const FLAGS = [
  'PERSONA_BRIEFING_ALEX', 'PERSONA_BRIEFING_JORDAN', 'PERSONA_BRIEFING_MAYA',
  'PERSONA_BRIEFING_NAYAN', 'PERSONA_BRIEFING_PETER_HANDOFF', 'HANDOFF_DESK',
  'REMEMBER_TO_RECALL', 'MEMORY_TOOLS_HONEST', 'FACTS_DUAL_WRITE', 'MEMORY_FACTS',
]; // prettier-ignore

let cohortFlags: Record<string, string> = {};
const cohort = (): Cohort => ({ id: 'memory-first', enabled: true, flags: cohortFlags });
const store: CohortStore = {
  cohortsFor: async (u) => (u === IN_COHORT ? [cohort()] : []),
  overridesFor: async () => ({}),
  sampledCohorts: async () => [],
};

/** A call starts for this caller; for IN_COHORT, their cohort now sets `flags`. */
async function callStartsFor(userId: string, flags: Record<string, string> = {}): Promise<void> {
  if (userId === IN_COHORT) cohortFlags = flags;
  await applyCallerFlags(userId, { store }); // process.env, as at a real call start
}

beforeEach(() => {
  cohortFlags = {};
  vi.stubEnv('COHORT_FLAGS', 'on');
  vi.stubEnv('AGENT_MAX_JOBS_PER_WORKER', '');
  for (const flag of FLAGS) vi.stubEnv(flag, '');
  for (const b of Object.values(builders)) b.mockClear();
  clearHandoffArrivals();
});

afterEach(() => {
  applyFlags({}); // the agent's own values back
  forgetAgentValues();
  usePersonFlagLookup(async () => undefined);
  vi.unstubAllEnvs();
});

const personaTurn = (userId: string, personaId: string, turnCount = 0, sessionId = 's-brief') =>
  buildPersonaSpecificContextInjections({
    services: { userId, sessionId },
    userData: {},
    persona: { id: personaId },
    userText: 'hi',
    analysis: {},
    turnCount,
  } as unknown as PersonaSpecificContextInput);

describe('persona briefings, set by a cohort after import (intelligence-builders.ts)', () => {
  it.each([
    ['PERSONA_BRIEFING_MAYA', 'maya-santos', builders.maya],
    ['PERSONA_BRIEFING_JORDAN', 'jordan-taylor', builders.jordan],
    ['PERSONA_BRIEFING_ALEX', 'alex-chen', builders.alex],
    ['PERSONA_BRIEFING_NAYAN', 'nayan-patel', builders.nayan],
  ])('%s briefs %s only for the caller whose cohort set it', async (flag, persona, builder) => {
    await callStartsFor(IN_COHORT, { [flag]: 'on' });
    expect(await personaTurn(IN_COHORT, persona)).toHaveLength(1);
    expect(builder).toHaveBeenCalledTimes(1);

    await callStartsFor(NOT_IN_IT);
    expect(await personaTurn(NOT_IN_IT, persona)).toEqual([]);
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it("PERSONA_BRIEFING_PETER_HANDOFF briefs Peter's arrival turn only for that caller", async () => {
    await callStartsFor(IN_COHORT, { PERSONA_BRIEFING_PETER_HANDOFF: 'on' });
    captureHandoffContext({}, 's-peter-on', 'peter-john');
    expect(await personaTurn(IN_COHORT, 'peter-john', 3, 's-peter-on')).toHaveLength(1);

    await callStartsFor(NOT_IN_IT);
    captureHandoffContext({}, 's-peter-off', 'peter-john');
    expect(await personaTurn(NOT_IN_IT, 'peter-john', 3, 's-peter-off')).toEqual([]);
    expect(builders.peter).toHaveBeenCalledTimes(1);
  });
});

describe('HANDOFF_DESK, set by a cohort after import', () => {
  it('the leaving persona writes a desk only on the call whose caller has it (writeDesk)', async () => {
    const leaving = { personaId: 'ferni', session: undefined };
    await callStartsFor(IN_COHORT, { HANDOFF_DESK: 'on' });
    expect(writeDesk(leaving, 'maya-santos')).not.toBeNull();

    await callStartsFor(NOT_IN_IT);
    expect(writeDesk(leaving, 'maya-santos')).toBeNull();
  });
});

describe('REMEMBER_TO_RECALL and MEMORY_TOOLS_HONEST, set by a cohort after import', () => {
  it.each(['REMEMBER_TO_RECALL', 'MEMORY_TOOLS_HONEST'])(
    '%s opens the remembered-fact writer for that caller only (keepForRecall)',
    async (flag) => {
      // An empty fact stops just past the flag check, before any store or model.
      await callStartsFor(IN_COHORT, { [flag]: 'on' });
      expect(await keepForRecall(IN_COHORT, { fact: ' ' })).toEqual({ kind: 'refused', reason: 'empty' }); // prettier-ignore

      await callStartsFor(NOT_IN_IT);
      expect(await keepForRecall(NOT_IN_IT, { fact: ' ' })).toEqual({ kind: 'refused', reason: 'off' }); // prettier-ignore
    }
  );

  it('MEMORY_TOOLS_HONEST changes what the remember tool says, for that caller only', async () => {
    await callStartsFor(IN_COHORT, { MEMORY_TOOLS_HONEST: 'on' });
    expect(notWrittenReply()).not.toBe("I'll remember that.");

    await callStartsFor(NOT_IN_IT);
    expect(notWrittenReply()).toBe("I'll remember that.");
  });
});

describe('FACTS_DUAL_WRITE and MEMORY_FACTS, read after the call for the person written for', () => {
  // The writer is stubbed: only whether it is asked, and for whom, is under test here.
  const proposal = { sourceKey: 'k' } as unknown as FactProposal;
  const mapped = (): MappedFact[] => [{ op: 'add', proposal }];
  const added: ProposeResult = { ok: true, op: 'add' } as unknown as ProposeResult;
  const propose = vi.fn(async () => added);
  const db = {} as unknown as Firestore;
  const getDb = (): Firestore => db;

  beforeEach(() => {
    propose.mockClear();
    // As the agent process wires it (agents/person-flag-register.ts), with the test's cohorts.
    usePersonFlagLookup((u, f) => callerFlag(u, f, { store }));
  });

  it("the deep-extraction path (personFlagOn) writes for the ended call's caller, not the next", async () => {
    await callStartsFor(IN_COHORT, { FACTS_DUAL_WRITE: 'on', MEMORY_FACTS: 'on' });
    await callStartsFor(NOT_IN_IT); // the next call has started; process.env is theirs

    const counts = await dualWriteFacts(IN_COHORT, 'dynamic_facts', mapped, { getDb, propose });
    expect(counts).toMatchObject({ add: 1 });
    expect(propose).toHaveBeenCalledTimes(1);

    expect(await dualWriteFacts(NOT_IN_IT, 'dynamic_facts', mapped, { getDb, propose })).toBeNull();
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it('a cohort with the dual write but not the facts store proposes nothing', async () => {
    cohortFlags = { FACTS_DUAL_WRITE: 'on' };
    expect(await dualWriteFacts(IN_COHORT, 'dynamic_facts', mapped, { getDb, propose })).toBeNull();
    expect(propose).not.toHaveBeenCalled();
  });

  it("the world-facts path (envForCaller, register.ts) carries the person's own values", async () => {
    cohortFlags = { FACTS_DUAL_WRITE: 'on', MEMORY_FACTS: 'on' };
    const env = await envForCaller(IN_COHORT, { store });
    expect(await dualWriteFacts(IN_COHORT, 'world_facts', mapped, { getDb, propose, env })).toMatchObject({ add: 1 }); // prettier-ignore

    const other = await envForCaller(NOT_IN_IT, { store });
    expect(await dualWriteFacts(NOT_IN_IT, 'world_facts', mapped, { getDb, propose, env: other })).toBeNull(); // prettier-ignore
    expect(propose).toHaveBeenCalledTimes(1);
  });
});
