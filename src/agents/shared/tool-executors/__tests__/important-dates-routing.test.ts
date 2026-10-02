/**
 * The JSON-workaround dispatcher (json-function-executor routeToTool →
 * routeToToolModular) reaches the important-date tools through their executor.
 */
import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ fn: string; args: unknown; ctx: unknown }> = [];
vi.mock('../../../../tools/domains/family/special-dates-tool.js', async (orig) => {
  const real =
    await orig<typeof import('../../../../tools/domains/family/special-dates-tool.js')>();
  const record = (fn: string) => async (args: unknown, ctx: unknown) => {
    calls.push({ fn, args, ctx });
    return `${fn} ok`;
  };
  return {
    ...real,
    rememberSpecialDate: record('rememberSpecialDate'),
    listSpecialDates: record('listSpecialDates'),
    stopDateReminders: record('stopDateReminders'),
  };
});

import { getToolDomain, routeToToolModular } from '../index.js';

describe('important-date tool routing', () => {
  it.each(['rememberSpecialDate', 'listSpecialDates', 'stopDateReminders'])(
    '%s has a route',
    (name) => {
      expect(getToolDomain(name)).toBe('important-dates');
    }
  );

  it('passes validated args with the caller identity and persona', async () => {
    const ctx = { userId: 'u1', personaId: 'maya', sessionId: 's1' };
    expect(
      await routeToToolModular('rememberSpecialDate', { kind: 'anniversary', date: 'June 12' }, ctx)
    ).toBe('rememberSpecialDate ok');
    expect(await routeToToolModular('listSpecialDates', { withinDays: 7 }, ctx)).toBe(
      'listSpecialDates ok'
    );
    expect(await routeToToolModular('stopDateReminders', { which: 'taxes' }, ctx)).toBe(
      'stopDateReminders ok'
    );
    expect(calls[0]).toEqual({
      fn: 'rememberSpecialDate',
      args: { kind: 'anniversary', date: 'June 12' },
      ctx: { userId: 'u1', personaId: 'maya', sessionId: 's1' },
    });
  });

  it('asks again on malformed args instead of guessing', async () => {
    const out = await routeToToolModular(
      'rememberSpecialDate',
      { kind: 'party' },
      { userId: 'u1' }
    );
    expect(out).toMatch(/didn't quite catch/);
  });
});
