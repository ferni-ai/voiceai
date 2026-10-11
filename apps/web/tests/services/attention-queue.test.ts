import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAttentionQueue,
  requestAttention,
  type AttentionQueueOptions,
} from '../../src/services/attention-queue.js';
import { CALM_IDLE_STORAGE_KEY } from '../../src/config/calm-idle.js';

function memoryStorage(): NonNullable<AttentionQueueOptions['storage']> {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  };
}

describe('attention queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows only one idle interruption per session', () => {
    const queue = createAttentionQueue({ settleMs: 100, isIdle: () => true, storage: null });
    const memory = vi.fn();
    const hint = vi.fn();
    queue.request('memory-lane', memory);
    queue.request('feature-hint', hint);
    vi.advanceTimersByTime(100);

    const late = vi.fn();
    expect(queue.request('ferni-birthday', late)).toBe('dropped');
    vi.advanceTimersByTime(1000);

    expect(memory.mock.calls.length + hint.mock.calls.length + late.mock.calls.length).toBe(1);
    expect(queue.spent()).toBe(1);
  });

  it('shows the highest-priority request of the pool, whatever the arrival order', () => {
    const queue = createAttentionQueue({ settleMs: 100, isIdle: () => true, storage: null });
    const timeOfDay = vi.fn();
    const hint = vi.fn();
    const checkin = vi.fn();
    queue.request('time-of-day', timeOfDay);
    queue.request('feature-hint', hint);
    queue.request('checkin', checkin);
    expect(checkin).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(checkin).toHaveBeenCalledTimes(1);
    expect(hint).not.toHaveBeenCalled();
    expect(timeOfDay).not.toHaveBeenCalled();
  });

  it('lets the granted source update what it shows', () => {
    const queue = createAttentionQueue({ settleMs: 100, isIdle: () => true, storage: null });
    const refresh = vi.fn();
    queue.request('proactive-messages', refresh);
    vi.advanceTimersByTime(100);
    expect(queue.request('proactive-messages', refresh)).toBe('shown');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not gate anything while a call is running', () => {
    const queue = createAttentionQueue({ settleMs: 100, isIdle: () => false, storage: null });
    const a = vi.fn();
    const b = vi.fn();
    expect(queue.request('memory-lane', a)).toBe('shown');
    expect(queue.request('feature-hint', b)).toBe('shown');
    expect(queue.spent()).toBe(0);
  });

  it('drops the pool when a call starts before it settles', () => {
    let idle = true;
    const queue = createAttentionQueue({ settleMs: 100, isIdle: () => idle, storage: null });
    const show = vi.fn();
    queue.request('memory-lane', show);
    idle = false;
    vi.advanceTimersByTime(100);
    expect(show).not.toHaveBeenCalled();
  });

  it('remembers the spent budget across a reload in the same tab', () => {
    const storage = memoryStorage();
    const first = createAttentionQueue({ settleMs: 100, isIdle: () => true, storage });
    first.request('memory-lane', vi.fn());
    vi.advanceTimersByTime(100);

    const reloaded = createAttentionQueue({ settleMs: 100, isIdle: () => true, storage });
    expect(reloaded.request('checkin', vi.fn())).toBe('dropped');
    expect(reloaded.request('memory-lane', vi.fn())).toBe('shown');
  });
});

describe('requestAttention and the calm-idle flag', () => {
  afterEach(() => localStorage.removeItem(CALM_IDLE_STORAGE_KEY));

  it('with the flag off, shows every request at once, as before', () => {
    const shows = [vi.fn(), vi.fn(), vi.fn()];
    requestAttention('memory-lane', shows[0]);
    requestAttention('feature-hint', shows[1]);
    requestAttention('time-of-day', shows[2]);
    shows.forEach((show) => expect(show).toHaveBeenCalledTimes(1));
  });

  it('with the flag on, holds idle requests for the queue', () => {
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    const show = vi.fn();
    requestAttention('memory-lane', show);
    expect(show).not.toHaveBeenCalled();
  });

  it('with the flag on, a hide-only refresh runs at once', () => {
    localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    const hide = vi.fn();
    requestAttention('proactive-messages', hide, false);
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
