/**
 * The JSON-workaround dispatcher reaches the dream, goal and habit voice
 * operations (all backed by the canonical aspirations store).
 */
import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ fn: string; ctx: unknown; args: unknown }> = [];
vi.mock('../../../../services/aspirations/voice.js', () => {
  const record =
    (fn: string) =>
    async (ctx: unknown, args?: unknown): Promise<string> => {
      calls.push({ fn, ctx, args });
      return `${fn} ok`;
    };
  return {
    voiceRecordDream: record('voiceRecordDream'),
    voiceListDreams: record('voiceListDreams'),
    voiceCreateHabit: record('voiceCreateHabit'),
    voiceLogHabit: record('voiceLogHabit'),
    voiceListHabits: record('voiceListHabits'),
    voiceHabitStreak: record('voiceHabitStreak'),
    voiceSetStatus: record('voiceSetStatus'),
    voiceAddGoal: record('voiceAddGoal'),
    voiceListGoals: record('voiceListGoals'),
    voiceUpdateGoal: record('voiceUpdateGoal'),
  };
});

import { getToolDomain, routeToToolModular } from '../index.js';
import { REGISTERED_TOOLS } from '../../function-call-format.js';

const ctx = { userId: 'u1', sessionId: 's1', personaId: 'maya' };

describe('aspiration tool routing', () => {
  it.each([
    ['recordDream', 'aspirations'],
    ['checkDreams', 'aspirations'],
    ['logHabitCompletion', 'habits'],
    ['createHabit', 'habits'],
    ['updateGoal', 'productivity'],
  ])('%s routes to %s and is registered', (name, domain) => {
    expect(getToolDomain(name)).toBe(domain);
    expect(REGISTERED_TOOLS as readonly string[]).toContain(name);
  });

  it('passes identity, conversation and persona through', async () => {
    expect(await routeToToolModular('recordDream', { statement: 'live by the sea' }, ctx)).toBe(
      'voiceRecordDream ok'
    );
    expect(await routeToToolModular('logHabitCompletion', { habitName: 'run' }, ctx)).toBe(
      'voiceLogHabit ok'
    );
    expect(await routeToToolModular('updateGoal', { title: 'marathon', progress: 50 }, ctx)).toBe(
      'voiceUpdateGoal ok'
    );
    expect(await routeToToolModular('pauseHabit', { name: 'run' }, ctx)).toBe('voiceSetStatus ok');
    expect(calls[0]).toEqual({
      fn: 'voiceRecordDream',
      ctx: { userId: 'u1', conversationId: 's1', personaId: 'maya' },
      args: { statement: 'live by the sea' },
    });
    expect(calls[2].args).toEqual({ name: 'marathon', progress: 50 });
    expect(calls[3].args).toEqual({ name: 'run', status: 'paused', level: 'habit' });
  });

  it('asks instead of guessing on empty args', async () => {
    expect(await routeToToolModular('recordDream', {}, ctx)).toMatch(/What's the dream/);
    expect(await routeToToolModular('logHabitCompletion', {}, ctx)).toMatch(/Which habit/);
  });
});
