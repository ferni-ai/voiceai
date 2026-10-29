import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import { callerFlag } from '../caller-flag.js';
import {
  applyCallerFlags,
  COHORT_FLAGS,
  forgetAgentValues,
  missingPrerequisites,
  type Cohort,
  type CohortStore,
} from '../cohort-flags.js';

const store = (cohorts: Record<string, Cohort[]>): CohortStore => ({
  cohortsFor: async (u) => cohorts[u] ?? [],
  overridesFor: async () => ({}),
  sampledCohorts: async () => [],
});

describe('COHORT_FLAGS', () => {
  // Every entry was checked read by read (the comments in cohort-flags.ts name each
  // site). Adding one without that check, or dropping one, must fail here.
  it('is exactly the switches whose reads are safe per caller', () => {
    expect([...COHORT_FLAGS].sort()).toEqual(
      [
        'SEMANTIC_RECALL', 'RECALL_PEOPLE', 'RECALL_EPISODES', 'RECALL_RARE_WORDS',
        'FACT_SUPERSESSION', 'EXTRACTION_CONTEXT', 'OPENER_FOLLOW_UP', 'LIVE_SUMMARIES',
        'COACH_FOLLOW_THROUGH', 'LIFE_MOVES_ON', 'CANDOR', 'WEB_SEARCH', 'WORLD_MODEL_TEMPORAL',
        'WORLD_FACTS_IN_CALL', 'POST_CALL_CHECKIN', 'FOLLOW_THROUGH_TEXTS',
        'OUTREACH_PONDERED_NOTES', 'CALL_WRAP_UP', 'WRAP_UP', 'SHORT_GOODBYE', 'PHONE_GOODBYE',
        'HAPPY_EXITS', 'HANDOFF_TALK_THROUGH', 'NAME_CORRECTION', 'ROOM_GUESTS',
        'BARGE_IN_ACK_WORDS', 'FRIEND_FOLLOWUPS', 'INSIDE_JOKES', 'HANDOFF_FULL_TOOLS',
        'TEAM_VOICES', 'FERNI_PERSONA_SLIP_GUARD', 'DIRECTOR_PERSONA_AWARE', 'DATES_THAT_MATTER',
        'PROACTIVE_CHANNELS', 'WEEKLY_PREDICTION', 'WELLBEING_AFTER_CALL', 'TOOLS_REAL_CALL_USER',
        'COACH_WINS',
        'FRIEND_CELEBRATIONS', 'REVIVED_INTELLIGENCE', 'CALL_JOURNAL', 'FOLLOW_THROUGH_IMPORT',
        'PONDERING', 'HANDOFF_FIRST_FIX', 'MORNING_BRIEF', 'TOOLS_SAME_TURN',
        'FOLLOW_THROUGH_OPENER', 'NAMED_TUNE', 'GOOD_NEWS_BIGGER', 'ALEX_CHIEF_OF_STAFF',
        'WEB_PUSH_DELIVERY', 'PERSONA_VOICE', 'TURN_LENGTH', 'TURN_TEXTURE',
        'REMINDER_SMS_DEFAULT', 'REMINDER_IN_APP_PUSH', 'FAMILY_TABLE', 'OPEN_LOOPS_IN_CONTEXT',
        'IOS_PUSH', 'FIRST_CALL_INTRO', 'RECALL_VECTOR_INDEX', 'SPECIALIST_TOOLS', 'CUSTOM_AGENT_LIVE',
        'FOCUS_HOLD', 'OUTREACH_SERVER_CONFIRM', 'COMMITMENT_SINGLE_WRITER',
        'ACTION_CLAIM_STREAM', 'PREEMPT_STABLE_CONTEXT', 'CACHE_WARM_PRIMARY',
        'HANDOFF_CACHE_WARM', 'FORGET_DELETES',
      ].sort() // prettier-ignore
    );
  });

  it('follow-up texts need the import, pondered notes need pondering', () => {
    expect(missingPrerequisites({ FOLLOW_THROUGH_TEXTS: 'on' })).toEqual([
      'FOLLOW_THROUGH_TEXTS needs FOLLOW_THROUGH_IMPORT',
    ]);
    expect(missingPrerequisites({ OUTREACH_PONDERED_NOTES: 'on' })).toEqual([
      'OUTREACH_PONDERED_NOTES needs PONDERING',
    ]);
  });
});

describe('callerFlag (the agent’s per-person lookup)', () => {
  beforeEach(() => forgetAgentValues());

  it('is the ended call’s caller’s value, not the next caller’s in process.env', async () => {
    const s = store({ mom: [{ id: 'mom', enabled: true, flags: { COACH_WINS: 'on' } }] });
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    await applyCallerFlags('mom', { store: s, env });
    expect(env.COACH_WINS).toBe('on');
    // Seth's call ended; mom's call has started and applied her flags.
    expect(await callerFlag('seth', 'COACH_WINS', { store: s, env })).toBe('off');
    expect(await callerFlag('mom', 'COACH_WINS', { store: s, env })).toBe('on');
  });
});

describe('missingPrerequisites', () => {
  it('names a memory switch turned on without what it builds on', () => {
    expect(missingPrerequisites({ RECALL_EPISODES: 'on' })).toEqual([
      'RECALL_EPISODES needs SEMANTIC_RECALL',
    ]);
    expect(missingPrerequisites({ RECALL_VECTOR_INDEX: 'on' })).toEqual([
      'RECALL_VECTOR_INDEX needs SEMANTIC_RECALL',
    ]);
    expect(missingPrerequisites({ WORLD_FACTS_IN_CALL: 'on' })).toEqual([
      'WORLD_FACTS_IN_CALL needs WORLD_MODEL_TEMPORAL',
    ]);
    expect(
      missingPrerequisites({
        SEMANTIC_RECALL: 'on',
        RECALL_EPISODES: 'on',
        WORLD_MODEL_TEMPORAL: 'on',
        WORLD_FACTS_IN_CALL: 'on',
      })
    ).toEqual([]);
  });
});
