/**
 * The adaptive echo window (echo-window.ts, moved out of transcript-handler) was
 * loaded with a bare require(), which throws under plain Node ESM (how the agent
 * runs), so every call fell back to the fixed 2000ms window and echo learning
 * never recorded. These run the real modules under plain ESM, where vitest can't
 * paper over it: the transcript handler that uses the window, and the window.
 */
import { describe, expect, it } from 'vitest';
import { runPlainEsm } from '../../../tests/helpers/plain-esm.js';

const PROBE = `
await import('./src/agents/voice-agent/transcript-handler.ts');
const echo = await import('./src/agents/voice-agent/echo-window.ts');
const { getSpeechCoordinator } = await import('./src/speech/coordination/index.ts');
const before = getSpeechCoordinator().getAdaptiveTiming().avgEchoDelayMs;
const question = echo.getEchoPreventionCooldownMs(4000, 'could you check the news?');
const shortAck = echo.getEchoPreventionCooldownMs(4000, 'mm');
echo.recordEchoDetectionForLearning('esm-test', 100);
const after = getSpeechCoordinator().getAdaptiveTiming().avgEchoDelayMs;
report({ question, shortAck, before, after });
`;

describe('adaptive echo window under plain ESM', () => {
  it('uses the adaptive window and records echo when REQUIRE_FIX_VOICE=true', () => {
    expect(runPlainEsm(PROBE, { REQUIRE_FIX_VOICE: 'true' })).toEqual({
      // Content-aware bypass: a question gets the 300ms minimum, not 2000ms.
      question: 300,
      // Timing path: 500ms default echo delay * 1.5 + 15% of a 4000ms utterance.
      shortAck: 1350,
      before: 500,
      after: 100,
    });
  });

  it('keeps the fixed 2000ms window and records nothing when the flag is off', () => {
    expect(runPlainEsm(PROBE, { REQUIRE_FIX_VOICE: '' })).toEqual({
      question: 2000,
      shortAck: 2000,
      before: 500,
      after: 500,
    });
  });
});
