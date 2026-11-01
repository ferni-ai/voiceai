/**
 * The handoff signal is per call and one-shot (#3044): true on the arriving
 * persona's first turn, false on the next, and never visible to another call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureHandoffContext,
  clearHandoffArrivals,
  getHandoffContext,
  takeHandoffArrival,
} from '../handoff-arrival.js';

afterEach(() => {
  clearHandoffArrivals();
  vi.useRealTimers();
});

describe('takeHandoffArrival', () => {
  it('is the handoff on the arriving persona first turn, then clears', () => {
    captureHandoffContext({ topics: ['email'], summary: 'draft a note' }, 'call-1', 'alex-chen');

    const first = takeHandoffArrival('call-1', 'alex-chen');
    expect(first?.summary).toBe('draft a note');
    expect(takeHandoffArrival('call-1', 'alex-chen')).toBeNull();
  });

  it('is only for the persona the call was handed to', () => {
    captureHandoffContext({ summary: 'habits' }, 'call-1', 'maya-santos');
    expect(takeHandoffArrival('call-1', 'alex-chen')).toBeNull();
    expect(takeHandoffArrival('call-1', 'maya-santos')?.summary).toBe('habits');
  });

  it('keeps two concurrent calls apart', () => {
    captureHandoffContext({ summary: 'call one' }, 'call-1', 'alex-chen');

    expect(takeHandoffArrival('call-2', 'alex-chen')).toBeNull();
    expect(getHandoffContext('call-2')).toBeNull();

    captureHandoffContext({ summary: 'call two' }, 'call-2', 'jordan-taylor');
    expect(takeHandoffArrival('call-1', 'alex-chen')?.summary).toBe('call one');
    expect(takeHandoffArrival('call-2', 'jordan-taylor')?.summary).toBe('call two');
  });

  it('keeps nothing without a session, and nothing past the arrival window', () => {
    captureHandoffContext({ summary: 'nowhere' }, undefined, 'alex-chen');
    expect(getHandoffContext(undefined)).toBeNull();

    vi.useFakeTimers();
    captureHandoffContext({ summary: 'stale' }, 'call-1', 'alex-chen');
    vi.advanceTimersByTime(61_000);
    expect(takeHandoffArrival('call-1', 'alex-chen')).toBeNull();
  });

  it('a newer handoff in the same call replaces the older one', () => {
    captureHandoffContext({ summary: 'to alex' }, 'call-1', 'alex-chen');
    captureHandoffContext({ summary: 'to maya' }, 'call-1', 'maya-santos');
    expect(takeHandoffArrival('call-1', 'alex-chen')).toBeNull();
    expect(takeHandoffArrival('call-1', 'maya-santos')?.summary).toBe('to maya');
  });
});
