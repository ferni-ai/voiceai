import { describe, expect, it } from 'vitest';
import { interruptionOverrides, phoneInterruptTuningOn } from '../interruption-config.js';

/** Env combinations the phone tuning must sit on top of (or leave alone). */
const ENVS: Record<string, string | undefined>[] = [
  {},
  { BARGE_IN_GUARD: 'on' },
  { NEVER_SILENT: 'on' },
  { INTERRUPTION_MODE: 'vad' },
  { BARGE_IN_GUARD: 'on', NEVER_SILENT: 'on', INTERRUPTION_MODE: 'vad' },
];

describe('interruption config', () => {
  it('uses the adaptive model with no word gate by default', () => {
    expect(interruptionOverrides({})).toEqual({ mode: 'adaptive', minWords: 0 });
  });
  it('INTERRUPTION_MODE=vad keeps the previous VAD barge-in', () => {
    expect(interruptionOverrides({ INTERRUPTION_MODE: 'vad' })).toEqual({ mode: 'vad' });
  });
  it('leaves LiveKit timing alone unless BARGE_IN_GUARD=on', () => {
    for (const v of [undefined, '', 'off', 'true']) {
      const o = interruptionOverrides({ BARGE_IN_GUARD: v });
      expect(o.minDuration).toBeUndefined();
      expect(o.falseInterruptionTimeout).toBeUndefined();
    }
  });
  it('BARGE_IN_GUARD=on needs half a second of speech and resumes a false pause after 1 s', () => {
    expect(interruptionOverrides({ BARGE_IN_GUARD: 'on' })).toEqual({
      mode: 'adaptive',
      minWords: 0,
      minDuration: 500,
      falseInterruptionTimeout: 1000,
    });
    expect(interruptionOverrides({ BARGE_IN_GUARD: 'on', INTERRUPTION_MODE: 'vad' })).toEqual({
      mode: 'vad',
      minDuration: 500,
      falseInterruptionTimeout: 1000,
    });
  });

  it('resumes a reply paused for noise after 1 s with NEVER_SILENT=on (resume-buffer.ts)', () => {
    expect(interruptionOverrides({ NEVER_SILENT: 'on' })).toEqual({
      mode: 'adaptive',
      minWords: 0,
      falseInterruptionTimeout: 1000,
    });
    expect(interruptionOverrides({ NEVER_SILENT: 'shadow' })).not.toHaveProperty(
      'falseInterruptionTimeout'
    );
  });

  it('PHONE_INTERRUPT_TUNING off: a phone caller gets byte-identical options', () => {
    for (const env of ENVS) {
      for (const value of [undefined, '', 'off', 'false']) {
        const flagged = { ...env, PHONE_INTERRUPT_TUNING: value };
        expect(JSON.stringify(interruptionOverrides(flagged, { phone: true }))).toBe(
          JSON.stringify(interruptionOverrides(env))
        );
      }
    }
  });
  it('PHONE_INTERRUPT_TUNING on: a phone caller needs 500 ms to pause, resumes after 1 s', () => {
    expect(interruptionOverrides({ PHONE_INTERRUPT_TUNING: 'on' }, { phone: true })).toEqual({
      mode: 'adaptive',
      minWords: 0,
      minDuration: 500,
      falseInterruptionTimeout: 1000,
      resumeFalseInterruption: true,
    });
    for (const env of ENVS) {
      const o = interruptionOverrides({ ...env, PHONE_INTERRUPT_TUNING: 'on' }, { phone: true });
      expect(o).toMatchObject({ minDuration: 500, falseInterruptionTimeout: 1000 });
      expect(o.mode).toBe(interruptionOverrides(env).mode);
    }
  });
  it('PHONE_INTERRUPT_TUNING on: web and app callers are unchanged', () => {
    for (const env of ENVS) {
      const flagged = { ...env, PHONE_INTERRUPT_TUNING: 'on' };
      for (const phone of [false, undefined]) {
        expect(interruptionOverrides(flagged, { phone })).toEqual(interruptionOverrides(env));
        expect(phoneInterruptTuningOn(phone, flagged)).toBe(false);
      }
      expect(interruptionOverrides(flagged)).toEqual(interruptionOverrides(env));
    }
    expect(phoneInterruptTuningOn(true, { PHONE_INTERRUPT_TUNING: 'on' })).toBe(true);
  });
});
