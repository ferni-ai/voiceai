/**
 * Expression arbiter core: priorities, minimum dwell and hysteresis.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  MIN_DWELL_MS,
  createExpressionArbiter,
  type ExpressionPriority,
} from '../../src/app/expression-arbiter.js';

function setup() {
  let t = 0;
  const shown: string[] = [];
  const arbiter = createExpressionArbiter(() => t);
  const ask = (key: string, priority: ExpressionPriority, holdMs?: number) =>
    arbiter.request({ source: 'test', priority, key, holdMs, show: () => shown.push(key) });
  return { arbiter, shown, ask, advance: (ms: number) => (t += ms) };
}

describe('expression arbiter', () => {
  it('shows the first request', () => {
    const { ask, shown } = setup();
    expect(ask('happy', 'reaction', 1000)).toBe(true);
    expect(shown).toEqual(['happy']);
  });

  it('drops an equal-priority request inside the minimum dwell', () => {
    const { ask, shown, advance } = setup();
    ask('happy', 'reaction', 500);
    advance(MIN_DWELL_MS - 1);
    expect(ask('curious', 'reaction', 500)).toBe(false);
    expect(shown).toEqual(['happy']);
  });

  it('lets an equal-priority request through once the dwell ends', () => {
    const { ask, shown, advance } = setup();
    ask('happy', 'reaction', 500);
    advance(MIN_DWELL_MS);
    expect(ask('curious', 'reaction', 500)).toBe(true);
    expect(shown).toEqual(['happy', 'curious']);
  });

  it('keeps the face for the whole hold when it is longer than the dwell', () => {
    const { ask, advance } = setup();
    ask('holdingSpace', 'reaction', 4000);
    advance(3000);
    expect(ask('happy', 'reaction', 1000)).toBe(false);
  });

  it('drops a lower priority while a higher one owns the face', () => {
    const { ask, advance } = setup();
    ask('empathetic', 'safety', 5000);
    advance(2000);
    expect(ask('present', 'replyTone')).toBe(false);
    expect(ask('happy', 'reaction', 1000)).toBe(false);
    expect(ask('micro:noticing', 'ambient', 600)).toBe(false);
  });

  it('lets a higher priority preempt at once', () => {
    const { ask, shown } = setup();
    ask('micro:noticing', 'ambient', 600);
    expect(ask('happy', 'reaction', 1000)).toBe(true);
    expect(ask('present', 'replyTone')).toBe(true);
    expect(ask('empathetic', 'safety', 5000)).toBe(true);
    expect(shown).toEqual(['micro:noticing', 'happy', 'present', 'empathetic']);
  });

  it('does not replay the expression that is still resting on the face', () => {
    const { ask, shown, advance } = setup();
    ask('present', 'replyTone');
    advance(10_000);
    expect(ask('present', 'reaction', 3000)).toBe(false);
    expect(ask('happy', 'reaction', 1000)).toBe(true);
    expect(shown).toEqual(['present', 'happy']);
  });

  it('shows the same expression again once its hold has ended', () => {
    const { ask, advance } = setup();
    ask('happy', 'reaction', 1500);
    advance(1500);
    expect(ask('happy', 'reaction', 1500)).toBe(true);
  });

  it('does not take the face when show throws, and reset forgets the owner', () => {
    const { arbiter, ask } = setup();
    const failed = arbiter.request({
      source: 'test',
      priority: 'safety',
      key: 'x',
      show: () => {
        throw new Error('boom');
      },
    });
    expect(failed).toBe(false);
    expect(ask('happy', 'ambient', 1000)).toBe(true);
    arbiter.reset();
    expect(ask('curious', 'ambient', 1000)).toBe(true);
  });
});
