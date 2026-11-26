/**
 * A soul stats count that throws must never stop a crisis hold (ferni-verifier on
 * #4484): the hold starts, every hold-start listener runs, the safety face still
 * goes on, and nothing escapes to the data-message handler that called it. The
 * crisis path is real; the count and the face layers are spies.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const recordCrisisHold = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/soul-stats.service.js', () => ({
  soulStatsService: new Proxy(
    {},
    { get: (_t, key) => (key === 'recordCrisisHold' ? recordCrisisHold : vi.fn()) }
  ),
}));
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../src/utils/logger.js', () => ({ createLogger: () => log }));

const face = vi.hoisted(() => ({
  setVoiceEmotion: vi.fn(),
  luxoSetExpression: vi.fn(),
  ferniSetExpression: vi.fn(),
  resetRingToCalm: vi.fn(),
}));
vi.mock('../../src/ui/presence.ui.js', () => ({
  presenceUI: { setVoiceEmotion: face.setVoiceEmotion },
}));
vi.mock('../../src/ui/luxo-expressions.ui.js', () => ({ setExpression: face.luxoSetExpression }));
vi.mock('../../src/ui/ferni-expressions.ui.js', () => ({
  ferniExpressions: { setExpression: face.ferniSetExpression },
}));
vi.mock('../../src/ui/coach.ui.js', () => ({
  coachUI: { resetRingToCalm: face.resetRingToCalm },
}));

import { observeCrisisSignal } from '../../src/app/crisis-face.js';
import {
  holdCrisisFace,
  isCrisisFaceHeld,
  onCrisisHoldStart,
  releaseCrisisFace,
} from '../../src/ui/face/crisis-face-hold.js';
import type { DataMessage } from '../../src/types/events.js';

const stops: Array<() => void> = [];

beforeEach(() => {
  releaseCrisisFace();
  vi.clearAllMocks();
  recordCrisisHold.mockImplementation(() => {
    throw new Error('fictional count failure');
  });
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  releaseCrisisFace();
});

function listeners(n: number): Array<ReturnType<typeof vi.fn>> {
  return Array.from({ length: n }, () => {
    const listener = vi.fn();
    stops.push(onCrisisHoldStart(listener));
    return listener;
  });
}

describe('a crisis hold whose count throws', () => {
  it('holdCrisisFace does not throw, holds, and runs every hold-start listener', () => {
    const [comfort, queue, gaze] = listeners(3);
    expect(() => holdCrisisFace()).not.toThrow();
    expect(recordCrisisHold).toHaveBeenCalledTimes(1); // it was asked, and it threw
    expect(isCrisisFaceHeld()).toBe(true);
    expect(comfort).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledTimes(1);
    expect(gaze).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('Crisis hold not counted', {
      error: 'Error: fictional count failure',
    });
  });

  it('a crisis message still puts the safety face on every layer, and nothing escapes', () => {
    const [listener] = listeners(1);
    const crisis = { type: 'crisis_detected', severity: 0.9 } as unknown as DataMessage;
    expect(() => observeCrisisSignal(crisis)).not.toThrow();
    expect(isCrisisFaceHeld()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(face.setVoiceEmotion).toHaveBeenCalledWith('empathetic');
    expect(face.luxoSetExpression).toHaveBeenCalledWith('empathetic');
    expect(face.ferniSetExpression).toHaveBeenCalledWith('holdingSpace', expect.any(Number));
    expect(face.resetRingToCalm).toHaveBeenCalledTimes(1);
  });
});
