/**
 * What callOnBehalf promises when a call is placed says what the delivery path
 * will actually do (CALL_RESULT_WATCHDOG), read from the delivery path's own
 * switches; off, none.
 */
import { describe, expect, it } from 'vitest';
import { callResultPromise } from '../call-result-promise.js';

const TELL = "I'll let you know how it goes.";
const APP = "You'll see how it went in the app.";

describe('callResultPromise', () => {
  it.each([
    [{}, undefined],
    [{ CALL_RESULT_LIVE_REPORT: 'on', CALL_RESULT_TEXT: 'on' }, undefined],
  ])(
    'flag off: no promise (callOnBehalf keeps its own line), whatever else is on (%o)',
    (env, want) => {
      expect(callResultPromise(env)).toBe(want);
    }
  );

  it.each([
    [{ CALL_RESULT_LIVE_REPORT: 'on' }, TELL],
    [{ CALL_RESULT_TEXT: 'on' }, TELL],
    [{ CALL_RESULT_LIVE_REPORT: 'on', CALL_RESULT_TEXT: 'on' }, TELL],
    [{}, APP],
    [{ CALL_RESULT_LIVE_REPORT: 'off', CALL_RESULT_TEXT: 'off' }, APP],
  ])('flag on: %o promises the matching line', (env, want) => {
    expect(callResultPromise({ CALL_RESULT_WATCHDOG: 'on', ...env })).toBe(want);
  });
});
