/**
 * No life event of a crisis turn. A birthday or a graduation named on a line the crisis read
 * replaced, guided or soft-checked is not saved, so no follow-up check-in is ever scheduled for
 * it and the caller's line is not stored. The same line on a pass turn saves as before. A turn
 * with no crisis field counts as a crisis turn (crisisReadTurn fails closed).
 *
 * Real handler, real life-event store; only the logger and the semantic index are stubbed.
 * All text is fictional.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  log: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const indexLifeEvent = vi.fn();
vi.mock(
  '../../../services/data-layer/integrations/trust-integration.js',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    indexLifeEvent: (...args: unknown[]) => indexLifeEvent(...args),
  })
);

import { recordTrustSystemsData } from '../trust-recording-handler.js';
import { recordTurnTrustData, type LearningContext } from '../turn-learning.js';
import { crisisReadTurn } from '../crisis-turn-memory.js';
import {
  getEventsNeedingFollowUp,
  getUserEvents,
  setUserEvents,
} from '../../../services/trust-systems/life-events.js';
import type { CrisisDetection } from '../../processors/types.js';

const BIRTHDAY =
  "i don't see the point anymore. my birthday is tomorrow and i won't be around for it";
const GRADUATION = 'my graduation is next friday and honestly i just want everything to stop';

const read = (
  fields: Pick<CrisisDetection, 'isCrisis' | 'shouldOverrideLLM' | 'softCheck'>
): CrisisDetection => ({
  severity: 0,
  indicators: [],
  ...fields,
});
const PASS = read({ isCrisis: false, shouldOverrideLLM: false });
const REPLACE = read({ isCrisis: true, shouldOverrideLLM: true });
const GUIDE = read({ isCrisis: true, shouldOverrideLLM: false });
const SOFT = read({ isCrisis: false, shouldOverrideLLM: false, softCheck: true });

const result = { emotional: { primary: 'sadness', intensity: 0.8 }, context: {} };

let n = 0;
async function turn(userText: string, crisis: CrisisDetection | undefined): Promise<string> {
  const userId = `syn-life-event-${++n}`;
  setUserEvents(userId, []);
  await recordTrustSystemsData({ userId, userText, result, crisisTurn: crisisReadTurn(crisis) });
  return userId;
}

describe('life events on a crisis turn', () => {
  beforeEach(() => indexLifeEvent.mockClear());

  it.each([
    ['replace', REPLACE],
    ['guide', GUIDE],
    ['soft check-in', SOFT],
    ['missing crisis field', undefined],
  ])(
    'a birthday on a %s turn: nothing saved, no check-in, nothing indexed',
    async (_name, crisis) => {
      const userId = await turn(BIRTHDAY, crisis);
      expect(getUserEvents(userId)).toEqual([]);
      expect(getEventsNeedingFollowUp(userId)).toEqual([]);
      expect(indexLifeEvent).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['replace', REPLACE],
    ['guide', GUIDE],
    ['soft check-in', SOFT],
    ['missing crisis field', undefined],
  ])('a graduation on a %s turn: nothing saved, nothing indexed', async (_name, crisis) => {
    const userId = await turn(GRADUATION, crisis);
    expect(getUserEvents(userId)).toEqual([]);
    expect(indexLifeEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['birthday', BIRTHDAY],
    ['graduation', GRADUATION],
  ])(
    'the same %s line on a pass turn saves the event with its check-in, as before',
    async (_name, line) => {
      const userId = await turn(line, PASS);
      const saved = getUserEvents(userId);
      expect(saved).toHaveLength(1);
      expect(saved[0].followUp.afterCheckIn).toBe(true);
      expect(indexLifeEvent).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['crisis', true, 0],
    ['pass', false, 1],
  ])(
    'the turn recorder passes the %s verdict through to the life-event gate',
    async (_name, crisisTurn, saved) => {
      const userId = `syn-life-event-${++n}`;
      setUserEvents(userId, []);
      const ctx: LearningContext = {
        userId,
        sessionId: `syn-session-${n}`,
        personaId: 'ferni',
        turnCount: 1,
        userText: BIRTHDAY,
        emotionalResult: { primary: 'sadness', intensity: 0.8, distressLevel: 0.6 },
        injections: [],
        turnResult: result,
        crisisTurn,
      };
      expect(await recordTurnTrustData(ctx)).toBe(true);
      expect(getUserEvents(userId)).toHaveLength(saved);
    }
  );
});
