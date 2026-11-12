/**
 * Task-help distress (HUMANIZE_DISTRESS_CORROBORATION), through the real turn pieces.
 *
 * A bare "help" scores full distress in the emotion detector, so "help me plan dinner"
 * was sent to the avatar as concern level crisis (the web crisis-face hold and the iOS
 * crisis mark both start on it) and switched the turn to holding space. Each row runs
 * the detector, the turn's pattern crisis read, the cap, buildEmotionalState, then sends
 * the turn the way turn-handler.ts does (dispatchEmotionEvents, then dispatchAllTurnEvents)
 * and reads what reached the client.
 */

import { initializeLogger, type llm } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatchEmotionEvents } from '../../realtime/emotion-event-dispatcher.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { dispatchAllTurnEvents } from '../../voice-agent/turn-events.js';
import { EmotionDetector } from '../../../intelligence/detectors/emotion.js';
import { buildEmotionalState } from '../emotional-state-builder.js';
import { keepCapUnlessCrisis, readsHeavy, taskHelpDistressCapped } from '../task-help-distress.js';
import { hasCrisisSignal } from '../turn-processor/turn-crisis.js';
import type { TurnAnalysisResult, TurnContext } from '../types.js';

const FLAG = 'HUMANIZE_DISTRESS_CORROBORATION';

interface Sent {
  type: string;
  payload: Record<string, unknown>;
}

/** One turn through the real pieces; returns what the client was sent. */
async function runTurn(
  text: string,
  flag: 'on' | 'off'
): Promise<{
  capped: boolean;
  concerns: Array<Record<string, unknown>>;
  holdingSpace: boolean;
  heavy: boolean;
}> {
  vi.stubEnv(FLAG, flag);
  const emotion = new EmotionDetector().detect(text);
  const crisisSignal = hasCrisisSignal(detectCrisis(text));
  const capped = taskHelpDistressCapped({ text, emotion, crisisSignal });
  const ctx = { userText: text, userData: {} } as unknown as TurnContext;
  const analysis = { analysis: { emotion } } as unknown as TurnAnalysisResult;
  const emotionalState = buildEmotionalState(ctx, analysis, capped);

  const sent: Sent[] = [];
  const sendDataMessage = async (type: string, payload: Record<string, unknown>) => {
    sent.push({ type, payload });
  };
  // turn-handler.ts sends the turn's emotion events, then dispatchAllTurnEvents
  await dispatchEmotionEvents(
    { emotionalState, userId: 'user-sam', personaId: 'ferni' },
    sendDataMessage
  );
  const added: string[] = [];
  await dispatchAllTurnEvents({
    userId: 'user-sam',
    personaId: 'ferni',
    sessionId: 'session-1',
    turnCount: 3,
    emotionalResult: emotionalState,
    injections: [],
    sendDataMessage,
    turnCtx: {
      addMessage: ({ content }: { content: string }) => added.push(content),
    } as unknown as llm.ChatContext,
  });

  return {
    capped,
    concerns: sent
      .filter(
        (m) => m.type === 'humanization_signal' && m.payload.signalType === 'concern_detected'
      )
      .map((m) => m.payload),
    holdingSpace: sent.some(
      (m) => m.type === 'behavior_signal' && m.payload.mode === 'holding_space'
    ),
    heavy: added.some((c) => c.includes('topic_weight_heavy')),
  };
}

const BENIGN = [
  'I need help with an email',
  'can you help me plan dinner for Sam',
  'help me pick a gift for Riley',
  'help me write a great toast for Mia',
  'help me with my email',
];

const NEVER_LOWER = [
  "I can't cope, I'm breaking down",
  "I'm desperate and overwhelmed",
  "help, I can't do this anymore",
  "I'm desperate",
  "help, I'm desperate",
  'help',
  'please help me',
  'help me please',
  'somebody help',
  "help I'm scared",
  "help, my dad isn't breathing",
  "help me, I can't stop crying",
  // task-like wording the turn's pattern crisis read gives nothing for
  'help me make it stop',
  'help me get away from him',
  'help me get through tonight',
  'help me find a way to end it',
  'help me figure out how to say goodbye to everyone',
  'help me decide whether to keep going',
  'help me write a note so they understand why I did it',
  'help me with my dad',
  'help me finish it',
  'help me send a message to everyone saying goodbye',
  // task help, backed up: a negative emotion, distress left once "help" is out, a crisis read
  "help me write an email, I'm so sad",
  "help me pick a gift, I don't know what to do",
  "help me plan dinner, I can't do this anymore",
];

beforeAll(() => {
  initializeLogger({ pretty: false, level: 'silent' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('flag off: as main', () => {
  it.each(BENIGN)('benign "%s" still reads as crisis, holding space and heavy', async (text) => {
    const turn = await runTurn(text, 'off');
    expect(turn.capped).toBe(false);
    expect(turn.concerns.map((c) => c.concernLevel)).toEqual(['crisis', 'crisis']);
    expect(turn.holdingSpace).toBe(true);
    expect(turn.heavy).toBe(true);
  });

  it.each(NEVER_LOWER)('"%s" reads as crisis, holding space and heavy', async (text) => {
    const turn = await runTurn(text, 'off');
    expect(turn.concerns.map((c) => c.concernLevel)).toEqual(['crisis', 'crisis']);
    expect(turn.holdingSpace).toBe(true);
    expect(turn.heavy).toBe(true);
  });

  it('a line main reads as no concern stays that way', async () => {
    const turn = await runTurn('ayúdame con un correo', 'off');
    expect(turn.concerns).toEqual([]);
    expect(turn.holdingSpace).toBe(false);
  });
});

describe('flag on', () => {
  it.each(BENIGN)('benign "%s" goes no higher than elevated, light topic', async (text) => {
    const off = await runTurn(text, 'off');
    expect(off.concerns[0]?.concernLevel).toBe('crisis');

    const turn = await runTurn(text, 'on');
    expect(turn.capped).toBe(true);
    expect(turn.concerns.map((c) => c.concernLevel)).toEqual(['elevated']);
    expect(turn.holdingSpace).toBe(false);
    expect(turn.heavy).toBe(false);
  });

  it.each(NEVER_LOWER)('"%s" keeps crisis, holding space and heavy', async (text) => {
    const turn = await runTurn(text, 'on');
    expect(turn.capped).toBe(false);
    expect(turn.concerns.map((c) => c.concernLevel)).toEqual(['crisis']);
    expect(turn.holdingSpace).toBe(true);
    expect(turn.heavy).toBe(true);
  });

  it('a task-help line with a crisis read on the same turn keeps crisis', async () => {
    const text = "help me book a trip for Ana, I don't want to be here anymore";
    const emotion = new EmotionDetector().detect(text);
    expect(emotion.valence).not.toBe('negative');
    expect(hasCrisisSignal(detectCrisis(text))).toBe(true);
    // Without the crisis read this line would be capped: the read is what keeps it
    expect(taskHelpDistressCapped({ text, emotion, crisisSignal: false }, { [FLAG]: 'on' })).toBe(
      true
    );
    const turn = await runTurn(text, 'on');
    expect(turn.capped).toBe(false);
    expect(turn.concerns.map((c) => c.concernLevel)).toEqual(['crisis']);
    expect(turn.holdingSpace).toBe(true);
  });

  it('one turn sends one concern_detected (two on main)', async () => {
    expect((await runTurn('help', 'off')).concerns).toHaveLength(2);
    expect((await runTurn('help', 'on')).concerns).toHaveLength(1);
  });

  it.each(['ayúdame con un correo', 'estoy desesperada, ya no puedo más'])(
    '"%s", read as no concern on main, stays that way',
    async (text) => {
      const turn = await runTurn(text, 'on');
      expect(turn.concerns).toEqual([]);
      expect(turn.holdingSpace).toBe(false);
    }
  );
});

describe('the cap after the classifier', () => {
  it('a crisis signal in the final summary takes the cap off', () => {
    const capped = { distressLevel: 1, distressCapped: true };
    expect(keepCapUnlessCrisis(capped, false)).toBe(capped);
    const uncapped = keepCapUnlessCrisis(capped, true);
    expect(uncapped.distressCapped).toBeUndefined();
    expect(readsHeavy(uncapped.distressLevel, uncapped.distressCapped)).toBe(true);
  });
});
