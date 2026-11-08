/**
 * The crisis face hold, through the real data-message path.
 *
 * A crisis message arrives the way the agent sends it (the real backend
 * sender, decoded and handed to the web's real handleDataMessage). From then
 * until the call ends, only the calm faces may show. Each row below tries
 * faces through a different writer: the lid expressions, the token faces and
 * their per-face animations, the legacy data-emotion eyes and glow, coach
 * reactions, agent emoji, reply tone, the expression arbiter and the face
 * engine. A refused face must not show on any layer; a calm face still can;
 * after the call ends every face works again.
 *
 * The calm list is written out here on purpose, so that adding a face to the
 * allow-list in config/crisis-faces.ts turns this test red until it is reviewed.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Code under test schedules timers at import and while handling messages. Fake
// them from before the first import, as the live data-message contract does.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

// The app reads GSAP from the CDN global (utils/gsap-setup.ts); hand it the real package.
vi.mock('../../src/utils/gsap-setup.js', async () => {
  const { gsap } = await import('gsap');
  return { gsap, default: gsap };
});

import {
  createDataMessageSender,
  type DataMessageRoom,
} from '../../../../src/agents/shared/data-message-envelope.js';

import { onCallEnded } from '../../src/app/call-end.js';
import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { EXPRESSIONS } from '../../src/config/avatar-expressions.js';
import type { DataMessage } from '../../src/types/events.js';
import { initCoachUI } from '../../src/ui/coach.ui.js';
import { DOME_POSES } from '../../src/ui/face/dome-poses.js';
import { currentFace, resetFaceEngine, setFace } from '../../src/ui/face/face-engine.js';
import { resolveFace } from '../../src/ui/face/face-model.js';
import { ferniExpressions } from '../../src/ui/ferni-expressions.ui.js';
import * as luxoExpressions from '../../src/ui/luxo-expressions.ui.js';
import { presenceUI } from '../../src/ui/presence.ui.js';

const CALM = ['holdingSpace', 'empathetic', 'attentive', 'listening'];
const isCalm = (name: string | null): boolean => name !== null && CALM.includes(name);

/** Agent emoji for the faces the crisis owner named: 😭 💋 🤑 🤫 🙄 🤢 🥺 😱 😠 💀 😈, plus a laugh and a party. */
const REFUSED_EMOJI = ['😭', '😢', '😘', '😍', '🤑', '🤫', '🤐', '🙄', '😒', '🤢', '🥺', '😱', '😠', '😡', '💀', '😈', '😂', '🎉', '✨'];

/** Room double: what the agent publishes is delivered to the web's handler. */
function roomWiredToWeb(): DataMessageRoom {
  return {
    localParticipant: {
      identity: 'agent',
      publishData: async (data: Uint8Array) => {
        handleDataMessage(JSON.parse(new TextDecoder().decode(data)) as DataMessage);
      },
    },
  } as DataMessageRoom;
}

async function send(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  await createDataMessageSender(roomWiredToWeb())(type, payload);
}

async function sendCrisis(): Promise<void> {
  await send('crisis_detected', { severity: 0.9, indicators: ['hopelessness'] });
}

const root = document.createElement('div');
root.innerHTML = `
  <div id="coach">
    <div class="avatar-container" data-emotion="neutral">
      <div id="avatarRing"></div>
      <div id="coachAvatar" class="ferni-avatar"><svg id="avatarEyes" class="avatar-eyes"></svg></div>
      <span id="avatarText"></span>
    </div>
    <span id="statusIndicator"></span>
  </div>
  <span id="personaName"></span>
  <span id="personaSubtitle"></span>`;
const byId = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#${id}`)!;
const avatarContainer = (): HTMLElement => root.querySelector<HTMLElement>('.avatar-container')!;
const coachEmotionClasses = (): string[] =>
  [...byId('coach').classList].filter((c) => c.startsWith('emotion-'));

/** What every face layer is showing now. */
function faceOnEveryLayer(): Record<string, string | null> {
  return {
    lids: ferniExpressions.getExpression(),
    tokenFace: luxoExpressions.getCurrentExpression(),
    perFaceAnimation: byId('coachAvatar').getAttribute('data-expression'),
    legacyEyes: avatarContainer().getAttribute('data-emotion'),
    glow: presenceUI.getVoiceEmotion(),
  };
}

function expectOnlyCalmFaces(): void {
  const notCalm = Object.entries(faceOnEveryLayer()).filter(([, face]) => !isCalm(face));
  expect(notCalm).toEqual([]);
}

const originalAnimate = Element.prototype.animate;

beforeAll(() => {
  Element.prototype.animate = function () {
    return {
      playState: 'finished',
      finished: new Promise(() => undefined),
      cancel: () => undefined,
      commitStyles: () => undefined,
    } as unknown as Animation;
  } as typeof Element.prototype.animate;
  document.body.appendChild(root);
  initCoachUI();
});

beforeEach(() => {
  // The shared setup empties the body before each test; the face modules keep
  // references to these nodes, so put the same ones back.
  document.body.appendChild(root);
});

afterEach(() => {
  onCallEnded();
  resetFaceEngine();
  vi.clearAllTimers();
});

afterAll(() => {
  Element.prototype.animate = originalAnimate;
  vi.useRealTimers();
});

describe('crisis face hold (face engine off, the default)', () => {
  it('a crisis message puts the safety face on every layer', async () => {
    await sendCrisis();
    expectOnlyCalmFaces();
  });

  it('holds past the old 4–5 s window, for as long as the call lasts', async () => {
    await sendCrisis();
    vi.advanceTimersByTime(6_000);
    ferniExpressions.setExpression('delighted');
    luxoExpressions.setExpression('winking');
    expectOnlyCalmFaces();

    vi.advanceTimersByTime(30 * 60_000);
    ferniExpressions.setExpression('happy');
    luxoExpressions.setExpression('delighted');
    expectOnlyCalmFaces();
  });

  it('refuses every lid face outside the allow-list', async () => {
    await sendCrisis();
    const shown = Object.keys(DOME_POSES)
      .filter((name) => !CALM.includes(name))
      .filter((name) => {
        ferniExpressions.setExpression(name as Parameters<typeof ferniExpressions.setExpression>[0]);
        return ferniExpressions.getExpression() === name;
      });
    expect(shown).toEqual([]);
    expectOnlyCalmFaces();
  });

  it('refuses every token face, and its per-face animation, sent as expression_update', async () => {
    await sendCrisis();
    const shown: string[] = [];
    for (const id of Object.keys(EXPRESSIONS).filter((name) => !CALM.includes(name))) {
      await send('expression_update', { expression: id, duration: 300 });
      const face = faceOnEveryLayer();
      if (face['tokenFace'] === id || face['perFaceAnimation'] === id || face['legacyEyes'] === id) {
        shown.push(id);
      }
    }
    expect(shown).toEqual([]);
    expectOnlyCalmFaces();
  });

  it('a per-face animation (delightedBounce, winkPop) never starts', async () => {
    await sendCrisis();
    for (const id of ['delighted', 'winking', 'crying'] as const) {
      luxoExpressions.setExpression(id);
      expect(byId('coachAvatar').getAttribute('data-expression')).not.toBe(id);
    }
    expectOnlyCalmFaces();
  });

  it('refuses the named emoji faces from the agent', async () => {
    await sendCrisis();
    for (const emoji of REFUSED_EMOJI) {
      await send('expression', { emoji });
      expectOnlyCalmFaces();
    }
  });

  it('keeps the legacy eyes, glow and coach reactions calm', async () => {
    await sendCrisis();
    const coachBefore = coachEmotionClasses();
    for (const emotion of ['happy', 'excited', 'anxious', 'frustrated', 'calm', 'neutral']) {
      await send('emotion', { emotion, confidence: 0.9, intensity: 0.9, timestamp: 1 });
    }
    presenceUI.setVoiceEmotion('happy');
    presenceUI.flashEmotion('excited', 1_000);
    expectOnlyCalmFaces();
    expect(coachEmotionClasses()).toEqual(coachBefore);
  });

  it('refuses laughter and reply-tone faces, with the expression arbiter off and on', async () => {
    localStorage.setItem('ferni:reply-tone', 'true');
    await sendCrisis();
    await send('laughter_detected', { laughType: 'hearty', confidence: 0.9 });
    await send('reply_tone', { emotion: 'affectionate', speed: 1.1 });
    expectOnlyCalmFaces();

    localStorage.setItem('ferni:expression-arbiter', 'true');
    vi.advanceTimersByTime(6_000); // past the arbiter's own 5 s safety hold
    await send('laughter_detected', { laughType: 'hearty', confidence: 0.9 });
    await send('reply_tone', { emotion: 'content', speed: 1 });
    await send('emotion', { emotion: 'happy', confidence: 0.9, intensity: 0.9, timestamp: 2 });
    expectOnlyCalmFaces();
  });

  it('still shows the calm faces during the hold', async () => {
    await sendCrisis();
    for (const name of ['empathetic', 'attentive', 'holdingSpace'] as const) {
      ferniExpressions.setExpression(name);
      expect(ferniExpressions.getExpression()).toBe(name);
    }
    for (const id of ['attentive', 'listening', 'empathetic'] as const) {
      luxoExpressions.setExpression(id);
      expect(byId('coachAvatar').getAttribute('data-expression')).toBe(id);
    }
  });

  it('fails closed: no message ends the hold, whatever it says', async () => {
    const endLike: Array<[string, Record<string, unknown>]> = [
      ['crisis_resolved', { resolved: true }],
      ['crisis_ended', {}],
      ['crisis_over', { reason: 'unknown' }],
      ['humanization_signal', { signalType: 'concern_detected', concernLevel: 'none' }],
      ['humanization_signal', { signalType: 'concern_detected', concernLevel: 'mild' }],
      ['emotional_trajectory', { trajectory: 'de_escalating', confidence: 0.9 }],
      ['status', { status: 'connected' }], // what a reconnect looks like mid-call
    ];
    await sendCrisis();
    for (const [type, payload] of endLike) {
      await send(type, payload);
      ferniExpressions.setExpression('delighted');
      luxoExpressions.setExpression('winking');
      presenceUI.setVoiceEmotion('happy');
      expectOnlyCalmFaces();
    }
    handleDataMessage({ type: 42 } as unknown as DataMessage); // malformed: no usable type
    vi.advanceTimersByTime(10 * 60_000);
    ferniExpressions.setExpression('happy');
    expectOnlyCalmFaces();
  });

  it('a malformed crisis message still starts the hold', async () => {
    handleDataMessage({ type: 'crisis_detected', severity: 'not-a-number' } as unknown as DataMessage);
    ferniExpressions.setExpression('delighted');
    luxoExpressions.setExpression('winking');
    expect(isCalm(ferniExpressions.getExpression())).toBe(true);
    expect(isCalm(byId('coachAvatar').getAttribute('data-expression'))).toBe(true);
  });

  it('a humanization crisis concern starts the hold too', async () => {
    await send('humanization_signal', {
      signalType: 'concern_detected',
      concernLevel: 'crisis',
      concernType: 'crisis',
      intensity: 1,
    });
    ferniExpressions.setExpression('delighted');
    luxoExpressions.setExpression('winking');
    presenceUI.setVoiceEmotion('happy');
    expectOnlyCalmFaces();
  });

  it('an emotional intervention starts the hold too', async () => {
    await send('emotional_intervention', { trajectory: 'spiral_down', shouldIntervene: true });
    ferniExpressions.setExpression('delighted');
    luxoExpressions.setExpression('winking');
    presenceUI.setVoiceEmotion('happy');
    expectOnlyCalmFaces();
  });

  it('the call ending frees every face for the next call', async () => {
    await sendCrisis();
    onCallEnded();

    ferniExpressions.setExpression('delighted');
    expect(ferniExpressions.getExpression()).toBe('delighted');
    luxoExpressions.setExpression('winking');
    expect(byId('coachAvatar').getAttribute('data-expression')).toBe('winking');
    presenceUI.setVoiceEmotion('happy');
    expect(presenceUI.getVoiceEmotion()).toBe('happy');
    await send('emotion', { emotion: 'excited', confidence: 0.9, intensity: 0.9, timestamp: 3 });
    expect(coachEmotionClasses()).toContain('emotion-excited');
  });
});

describe('crisis face hold (face engine on)', () => {
  const calmFaces = CALM.map((name) => resolveFace(name));
  const expectCalmEngineFace = (): void => {
    expect(calmFaces).toContain(currentFace());
  };

  beforeEach(() => {
    localStorage.setItem('ferni:face-engine', 'true');
  });

  it('a crisis replaces a held choreography face with the safety face', async () => {
    expect(setFace('joyful', { source: 'choreography', hold: 60_000 })).toBe(true);
    await sendCrisis();
    expectCalmEngineFace();
  });

  it('the engine renderer refuses every token face outside the allow-list', async () => {
    await sendCrisis();
    const shown = Object.keys(EXPRESSIONS)
      .filter((name) => !CALM.includes(name))
      .filter((name) => setFace(name, { source: 'choreography' }));
    expect(shown).toEqual([]);
    expectCalmEngineFace();
  });

  it('both expression APIs and the legacy eyes stay calm under the engine', async () => {
    await sendCrisis();
    ferniExpressions.setExpression('delighted');
    luxoExpressions.setExpression('winking');
    await send('expression_update', { expression: 'crying' });
    expectCalmEngineFace();
    presenceUI.setVoiceEmotion('happy');
    expect(isCalm(presenceUI.getVoiceEmotion())).toBe(true);
  });

  it('a calm face still shows, and the call ending frees the engine', async () => {
    await sendCrisis();
    expect(setFace('attentive', { source: 'reaction' })).toBe(true);
    expect(currentFace()).toBe('attentive');

    onCallEnded();
    vi.advanceTimersByTime(10_000);
    expect(setFace('happy', { source: 'choreography' })).toBe(true);
    expect(currentFace()).toBe('happy');
  });
});
