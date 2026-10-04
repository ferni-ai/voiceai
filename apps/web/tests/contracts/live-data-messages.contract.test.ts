/**
 * Live-call data-message contract: agent → web.
 *
 * Each case runs a REAL backend sender (the generic data-message sender, the
 * FrontendPublisher, or an exported emitter) against a room double whose
 * publishData decodes the bytes and hands them to the web's REAL
 * handleDataMessage, as connection.service does. Assertions are on the visible
 * effect the web produces (window events, avatar expressions, UI calls).
 *
 * Before the envelope fix, payloads with their own `type` replaced the message
 * type, so behavior signals, trust hints, avatar cues and speech states reached
 * the web as unknown messages and did nothing.
 */

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Code under test schedules timers at import (luxo-expressions auto-init, 100 ms)
// and while handling messages (hold-space end, delayed expressions). Real timers
// would fire after the file finishes and jsdom is torn down ("document is not
// defined"). Fake them from before the first import and drop them after each test.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

import {
  buildHandoffUIMessage,
  createDataMessageSender,
  type DataMessageRoom,
} from '../../../../src/agents/shared/data-message-envelope.js';
import { FrontendPublisher } from '../../../../src/agents/realtime/frontend-publisher.js';
import { emitBehaviorSignal } from '../../../../src/agents/realtime/behavior-event-dispatcher.js';
import { dispatchSpeechStart } from '../../../../src/agents/realtime/speech-state-dispatcher.js';
import { buildProactiveOutreachPayload } from '../../../../src/agents/voice-agent/proactive-outreach-message.js';
import { DEFAULT_RESPONSE_TEMPLATES } from '../../../../src/intelligence/triggers/anticipatory-trigger-engine.js';

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { handoffService } from '../../src/services/index.js';
import { initProgressiveFeatures } from '../../src/services/progressive-features.service.js';
import { trustSignalHelpers } from '../../src/ui/trust-signals.ui.js';
import type { DataMessage } from '../../src/types/events.js';
import { ferni } from '../../src/ui/better-than-human.ui.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import { proactiveOutreachUI } from '../../src/ui/proactive-outreach.ui.js';

/** Room double: what the agent publishes is delivered to the web's handler. */
function roomWiredToWeb(): DataMessageRoom & { localParticipant: { identity: string } } {
  return {
    localParticipant: {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        handleDataMessage(JSON.parse(new TextDecoder().decode(data)) as DataMessage);
      },
    },
  };
}

function captureWindowEvent(name: string): Array<Record<string, unknown>> {
  const seen: Array<Record<string, unknown>> = [];
  const listener = (e: Event): void => {
    seen.push((e as CustomEvent<Record<string, unknown>>).detail);
  };
  window.addEventListener(name, listener);
  cleanups.push(() => window.removeEventListener(name, listener));
  return seen;
}

const cleanups: Array<() => void> = [];

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe('behavior_signal', () => {
  it('emitBehaviorSignal through the generic sender shifts the avatar mode', async () => {
    const modeChanges = captureWindowEvent('ferni:behavior-mode-change');
    await emitBehaviorSignal(
      { type: 'mode_shift', mode: 'deep_listening', reason: 'test', timestamp: Date.now() },
      createDataMessageSender(roomWiredToWeb())
    );
    expect(modeChanges).toEqual([
      expect.objectContaining({ mode: 'deep_listening', reason: 'test' }),
    ]);
  });

  it('a tool-tracking hold_space signal starts holding space', async () => {
    const holds = captureWindowEvent('ferni:behavior-hold-space');
    await createDataMessageSender(roomWiredToWeb())('behavior_signal', {
      type: 'hold_space',
      duration: 1500,
      timestamp: Date.now(),
    });
    expect(holds).toEqual([expect.objectContaining({ duration: 1500 })]);
  });

  it('FrontendPublisher.sendData delivers a processing_start signal', async () => {
    const processing = captureWindowEvent('ferni:behavior-processing-start');
    const publisher = new FrontendPublisher(roomWiredToWeb());
    await publisher.sendData('behavior_signal', { type: 'processing_start', expression: 'hmm' });
    expect(processing).toEqual([expect.objectContaining({ expression: 'hmm' })]);
  });
});

describe('trust_signal', () => {
  it("the turn handler's avatar hint plays a micro-expression", async () => {
    const play = vi.spyOn(ferni, 'playMicroExpression').mockImplementation(() => undefined);
    await createDataMessageSender(roomWiredToWeb())('trust_signal', {
      type: 'emotional_mismatch_detected',
      avatarHint: 'attentive',
    });
    expect(play).toHaveBeenCalledWith('concern_flash');
  });

  it("the trust-signal emitter's card reaches the trust signals UI", async () => {
    const cards = captureWindowEvent('ferni:backend-trust-signal');
    const publisher = new FrontendPublisher(roomWiredToWeb());
    await publisher.sendData('trust_signal', {
      signalType: 'growth',
      title: 'Ferni noticed',
      message: 'You handled that differently than last month.',
    });
    expect(cards).toEqual([
      expect.objectContaining({
        type: 'growth',
        message: 'You handled that differently than last month.',
      }),
    ]);
  });
});

describe('trust_signal deploy skew (new agent, base web 9c88304e0)', () => {
  it("the card listener, unchanged since base, shows no card for the turn handler's hint-only signals", () => {
    initProgressiveFeatures();
    const helpers = Object.keys(trustSignalHelpers) as Array<keyof typeof trustSignalHelpers>;
    const spies = helpers.map((name) =>
      vi.spyOn(trustSignalHelpers, name).mockImplementation(() => undefined)
    );

    // What the base handleTrustSignal dispatched for every trust_signal: signalType
    // as `type`, title and message undefined for the hint-only signals.
    for (const type of [
      'emotional_mismatch_detected',
      'growth_reflection_available',
      'celebration_opportunity',
    ]) {
      window.dispatchEvent(
        new CustomEvent('ferni:backend-trust-signal', {
          detail: { type, title: undefined, message: undefined, personaId: 'ferni' },
        })
      );
    }
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

    // Control: a real card type does render.
    window.dispatchEvent(
      new CustomEvent('ferni:backend-trust-signal', {
        detail: { type: 'growth', message: 'You kept your word to yourself.' },
      })
    );
    expect(trustSignalHelpers.growthMoment).toHaveBeenCalledWith('You kept your word to yourself.');
  });
});

describe('avatar_cue', () => {
  it("an anticipatory cue (the engine's distress template) shows concern before the user finishes", async () => {
    const play = vi.spyOn(ferni, 'playMicroExpression').mockImplementation(() => undefined);
    await createDataMessageSender(roomWiredToWeb())('avatar_cue', {
      type: 'anticipatory_response',
      ...DEFAULT_RESPONSE_TEMPLATES.distress.nonVerbal,
      anticipatedOutcome: 'distress',
    });
    expect(play).toHaveBeenCalledWith('concern_flash');
    expect(play).toHaveBeenCalledWith('curious_lean'); // lean-in gesture
  });
});

describe('speech_state', () => {
  it('dispatchSpeechStart starts active listening', async () => {
    const listen = vi.spyOn(ferni, 'startActiveListening').mockImplementation(() => undefined);
    await dispatchSpeechStart(`contract-${Date.now()}`, createDataMessageSender(roomWiredToWeb()));
    expect(listen).toHaveBeenCalled();
  });
});

describe('proactive_outreach', () => {
  it('the outreach payload shows the "thinking of you" card', async () => {
    const show = vi.spyOn(proactiveOutreachUI, 'show').mockImplementation(() => undefined);
    await createDataMessageSender(roomWiredToWeb())(
      'proactive_outreach',
      buildProactiveOutreachPayload(
        { type: 'thinking_of_you', message: 'Was thinking about your interview.' },
        { id: 'ferni', name: 'Ferni' }
      )
    );
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'thinking_of_you',
        message: 'Was thinking about your interview.',
        personaId: 'ferni',
      })
    );
  });
});

describe('safety signals', () => {
  it('crisis_detected puts the avatar in protective presence', async () => {
    const empathy = vi.spyOn(ferniExpressions, 'empathy').mockImplementation(() => undefined);
    const breath = vi.spyOn(ferni, 'setBreathSyncStrength').mockImplementation(() => undefined);
    vi.spyOn(ferni, 'playMicroExpression').mockImplementation(() => undefined);
    await createDataMessageSender(roomWiredToWeb())('crisis_detected', {
      severity: 0.9,
      indicators: ['hopelessness'],
    });
    expect(empathy).toHaveBeenCalled();
    expect(breath).toHaveBeenCalledWith(0.7);
  });

  it('emotional_intervention holds space', async () => {
    const holdSpace = vi.spyOn(ferniExpressions, 'holdSpace').mockImplementation(() => undefined);
    vi.spyOn(ferni, 'playMicroExpression').mockImplementation(() => undefined);
    vi.spyOn(ferni, 'setBreathSyncStrength').mockImplementation(() => undefined);
    await createDataMessageSender(roomWiredToWeb())('emotional_intervention', {
      trajectory: 'spiral_down',
      shouldIntervene: true,
    });
    expect(holdSpace).toHaveBeenCalled();
  });
});

describe('handoff_progress', () => {
  it('progress heartbeats, flattened as the coordinator adapter publishes them, reach the handoff indicator', async () => {
    const progress: Array<{ target: string; elapsedMs: number; timeoutMs: number }> = [];
    cleanups.push(
      handoffService.onHandoffProgress((target, elapsedMs, timeoutMs) => {
        progress.push({ target, elapsedMs, timeoutMs });
      })
    );

    // The coordinator's handoff_progress event data (pinned by
    // src/tools/handoff/__tests__/handoff-progress-heartbeat.test.ts, which runs
    // a real handoff; the persona registry can't load from this suite's cwd).
    const heartbeat = {
      type: 'handoff_progress',
      data: {
        traceId: 'hndff_contract',
        target: 'maya-santos',
        phase: 'switching_voice',
        progress: 0.5,
        elapsedMs: 420,
        timeoutMs: 8000,
      },
    };
    // seq above anything the handoff service singleton has seen (it drops out-of-order events)
    const message = buildHandoffUIMessage(heartbeat, Number.MAX_SAFE_INTEGER - 1);
    expect(await handoffService.processDataMessage(message as unknown as DataMessage)).toBe(true);

    expect(progress).toEqual([{ target: 'maya-santos', elapsedMs: 420, timeoutMs: 8000 }]);
  });
});
