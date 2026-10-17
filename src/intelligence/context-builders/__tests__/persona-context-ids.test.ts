/**
 * Context builders key on the canonical persona ids (personas/persona-ids).
 *
 * Calendar awareness was keyed on 'maya-patel' / 'nayan-kumar', so Maya and
 * Nayan got no calendar context. Persona memory mapped 'nayan-patel' to the
 * Bogle memories (index-fund callbacks for Nayan) while 'john-bogle' got none.
 * Domain fluency mapped 'peter-chen' / 'jordan-rivers' / 'nayan-kumar', so
 * Peter, Jordan and Nayan fell back to Ferni's fluencies.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { createLogger: vi.fn(() => logger), getLogger: vi.fn(() => logger) };
});

const isConnected = vi.fn();
const getDayOverview = vi.fn();
vi.mock('../../../services/calendar/calendar-service.js', () => ({
  isConnected: (...a: unknown[]) => isConnected(...a),
  getDayOverview: (...a: unknown[]) => getDayOverview(...a),
}));
vi.mock('../../../services/calendar/calendar-intelligence.js', () => ({
  detectCalendarAlerts: async () => [],
}));
vi.mock('../../../services/calendar/ambient-calendar-awareness.js', () => ({
  getAmbientCalendarContext: async () => ({
    nextMeeting: { event: null, minutesUntil: null },
    justEndedMeeting: { event: null },
  }),
  generateAmbientContextInjection: () => null,
  shouldInterruptForCalendar: () => false,
}));
vi.mock('../../../services/calendar/calendar-load-service.js', () => ({
  getCalendarLoadFactors: async () => ({ weeklyMeetingHours: 35 }),
  getCalendarLoadSummary: async () => null,
}));
vi.mock('../../../services/calendar/recovery-protection.js', () => ({
  detectRecoveryNeeds: async () => [],
  buildRecoveryContext: async () => null,
}));

const getFerniMemories = vi.fn();
const getBogleMemories = vi.fn();
vi.mock('../../../services/memory/persona-memories.js', () => ({
  getFerniMemories: (...a: unknown[]) => getFerniMemories(...a),
  getBogleMemories: (...a: unknown[]) => getBogleMemories(...a),
  getPeterMemories: async () => [],
  getMayaMemories: async () => [],
  getJordanMemories: async () => [],
  getAlexMemories: async () => [],
  getImportantDates: async () => [],
  getWatchlist: async () => [],
}));

import { CANONICAL_IDS } from '../../../personas/persona-ids.js';
import { buildCalendarAwarenessContext } from '../awareness/calendar-awareness.js';
import { getPersonaDomainFluencies } from '../awareness/domain-awareness.js';
import { buildPersonaMemoryContext, normalizePersonaId } from '../personas/persona-memory.js';
import type { ContextBuilderInput } from '../index.js';

const clearDay = {
  date: new Date(),
  events: [],
  totalMeetings: 0,
  totalMeetingMinutes: 0,
  freeTimeMinutes: 480,
  isOverloaded: false,
  hasBackToBack: false,
};

describe('calendar awareness by canonical persona id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isConnected.mockResolvedValue(true);
    getDayOverview.mockResolvedValue(clearDay);
  });

  it('gives Maya her habit-schedule context and lite wellbeing awareness', async () => {
    const ctx = await buildCalendarAwarenessContext('u1', CANONICAL_IDS.BUDGETER);
    expect(ctx.contextInjection).toContain('[SCHEDULE: Clear day');
    expect(ctx.betterThanHumanInjection).toContain('burnout risk');
  });

  it('gives Nayan his life-rhythm context and lite wellbeing awareness', async () => {
    const ctx = await buildCalendarAwarenessContext('u1', CANONICAL_IDS.SAGE);
    expect(ctx.contextInjection).toContain('[LIFE RHYTHM: Empty calendar');
    expect(ctx.betterThanHumanInjection).toContain('burnout risk');
  });

  it('no longer answers to the wrong ids', async () => {
    for (const wrong of ['maya-patel', 'nayan-kumar']) {
      const ctx = await buildCalendarAwarenessContext('u1', wrong);
      expect(ctx.contextInjection).toBeNull();
    }
    expect(isConnected).not.toHaveBeenCalled();
  });
});

describe('persona memory by canonical persona id', () => {
  const input = (personaId: string): ContextBuilderInput =>
    ({
      services: { personaId },
      userProfile: { id: 'u1', relationshipStage: 'trusted_advisor' },
      userData: { turnCount: 0, name: 'Sam' },
    }) as unknown as ContextBuilderInput;

  beforeEach(() => {
    vi.clearAllMocks();
    getBogleMemories.mockResolvedValue([
      { id: 'f1', type: 'fund', name: 'Total Stock Market', ticker: 'VTSAX', tags: [] },
    ]);
    getFerniMemories.mockResolvedValue([
      { id: 'w1', type: 'win', name: 'finished the half marathon', tags: [] },
      { id: 't1', type: 'topic', name: 'moving closer to family', tags: [] },
      { id: 'j1', type: 'inside_joke', name: 'the haunted toaster', tags: [] },
    ]);
  });

  it('maps the canonical ids to their own memories', () => {
    expect(normalizePersonaId(CANONICAL_IDS.SAGE)).toBe('nayan');
    expect(normalizePersonaId(CANONICAL_IDS.JOHN_BOGLE)).toBe('bogle');
    expect(normalizePersonaId(CANONICAL_IDS.BUDGETER)).toBe('maya');
    expect(normalizePersonaId(CANONICAL_IDS.COMMUNICATOR)).toBe('alex');
  });

  it('gives Henry Caldwell the fund memories', async () => {
    const out = await buildPersonaMemoryContext(input(CANONICAL_IDS.JOHN_BOGLE));
    expect(getBogleMemories).toHaveBeenCalledWith('u1');
    expect(out.map((i) => i.content).join('\n')).toContain('VTSAX');
  });

  it('gives Nayan what matters in their life, never index-fund tickers or Ferni jokes', async () => {
    const out = await buildPersonaMemoryContext(input(CANONICAL_IDS.SAGE));
    const text = out.map((i) => i.content).join('\n');
    expect(getBogleMemories).not.toHaveBeenCalled();
    expect(text).toContain('finished the half marathon');
    expect(text).toContain('moving closer to family');
    expect(text).not.toContain('VTSAX');
    expect(text).not.toContain('haunted toaster');
  });
});

describe('domain fluency by canonical persona id', () => {
  it("gives each teammate their own fluencies, not Ferni's", () => {
    const ferni = getPersonaDomainFluencies(CANONICAL_IDS.COACH);
    for (const [id, short] of [
      [CANONICAL_IDS.RESEARCHER, 'peter'],
      [CANONICAL_IDS.PLANNER, 'jordan'],
      [CANONICAL_IDS.SAGE, 'nayan'],
      [CANONICAL_IDS.BUDGETER, 'maya'],
      [CANONICAL_IDS.COMMUNICATOR, 'alex'],
    ] as const) {
      expect(getPersonaDomainFluencies(id)).toBe(getPersonaDomainFluencies(short));
      expect(getPersonaDomainFluencies(id)).not.toBe(ferni);
    }
  });
});
