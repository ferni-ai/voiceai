/**
 * A line queued for one call is never spoken on another. The speech coordinator is one per
 * process, and a new session can attach while lines are still queued. A line queued for another
 * session id is dropped when a session attaches; a line queued for the same id (a hand-off keeps
 * its call) is kept and spoken on the new session.
 *
 * Real coordinator and real routing (session-integration.ts); only the LiveKit session is a stub.
 * All lines fictional.
 */
import type { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupSpeechCoordination,
  initializeSpeechCoordination,
  routeSpeech,
} from '../session-integration.js';
import {
  SpeechCoordinator,
  SpeechPriority,
  resetSpeechCoordinator,
} from '../speech-coordinator.js';

let n = 0;

const stubSession = () => {
  const say = vi.fn();
  return { say, session: { say } as unknown as voice.AgentSession };
};
const said = (say: ReturnType<typeof vi.fn>) => say.mock.calls.map((c) => c[0] as string);

/** A call (`callId`) whose coordinator is busy with Line A and has one crisis line queued. */
async function callWithALineQueued() {
  const callId = `call-${++n}`;
  const first = stubSession();
  initializeSpeechCoordination({ session: first.session, sessionId: callId, personaId: 'p-1' });
  await routeSpeech(callId, 'Line A');
  await routeSpeech(callId, 'Crisis line', { priority: SpeechPriority.CRISIS });
  return { callId, first };
}

/** Attach a new session, then let the coordinator's start-up delay and cooldown pass. */
async function attach(sessionId: string, personaId: string) {
  vi.useFakeTimers();
  const next = stubSession();
  initializeSpeechCoordination({ session: next.session, sessionId, personaId });
  await vi.advanceTimersByTimeAsync(5_000);
  vi.useRealTimers();
  return next;
}

beforeEach(() => {
  resetSpeechCoordinator();
});

afterEach(() => {
  vi.useRealTimers();
  resetSpeechCoordinator();
});

describe('attaching a session while lines are queued', () => {
  it('a line queued for another session id is dropped; nothing is said', async () => {
    const { callId, first } = await callWithALineQueued();
    expect(said(first.say)).toEqual(['Line A']);

    const next = await attach(`${callId}-other`, 'p-2');

    expect(said(next.say)).toEqual([]);
    expect(said(first.say)).toEqual(['Line A']);
    cleanupSpeechCoordination(callId);
    cleanupSpeechCoordination(`${callId}-other`);
  });

  it("the new session's own lines are still spoken after a foreign line was dropped", async () => {
    const { callId } = await callWithALineQueued();
    const otherId = `${callId}-other`;

    const next = await attach(otherId, 'p-2');
    await routeSpeech(otherId, 'Hello from the other call');

    expect(said(next.say)).toEqual(['Hello from the other call']);
    cleanupSpeechCoordination(callId);
    cleanupSpeechCoordination(otherId);
  });

  it('a line queued for the same session id is kept across a hand-off and spoken on the new session', async () => {
    const { callId, first } = await callWithALineQueued();

    const next = await attach(callId, 'p-2');

    expect(said(next.say)).toEqual(['Crisis line']);
    expect(said(first.say)).toEqual(['Line A']);
    cleanupSpeechCoordination(callId);
  });

  it('a line queued before the coordinator knew a session id is kept, as before', async () => {
    const coordinator = new SpeechCoordinator();
    const first = stubSession();
    coordinator.attachSession(first.session); // no context: no id
    await coordinator.requestSpeak({
      text: 'Line A',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });
    await coordinator.requestSpeak({
      text: 'Unowned line',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });

    vi.useFakeTimers();
    const next = stubSession();
    coordinator.attachSession(next.session, { sessionId: 'a-call', personaId: 'p-1' });
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    expect(said(next.say)).toEqual(['Unowned line']);
  });

  it('attaching with no context keeps the lines of the call the coordinator is already serving', async () => {
    const coordinator = new SpeechCoordinator();
    const first = stubSession();
    coordinator.attachSession(first.session, { sessionId: 'a-call', personaId: 'p-1' });
    await coordinator.requestSpeak({
      text: 'Line A',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });
    await coordinator.requestSpeak({
      text: 'Line B',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });

    vi.useFakeTimers();
    const next = stubSession();
    coordinator.attachSession(next.session);
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    expect(said(next.say)).toEqual(['Line B']);
  });
});

describe('a line is checked against the call that asked for it, not the one attached now', () => {
  it('a line requested by call A while call B is attached is never spoken on B', async () => {
    const callA = `call-${++n}`;
    const callB = `call-${++n}`;
    const a = stubSession();
    const b = stubSession();
    initializeSpeechCoordination({ session: a.session, sessionId: callA, personaId: 'p-1' });
    initializeSpeechCoordination({ session: b.session, sessionId: callB, personaId: 'p-2' });

    await routeSpeech(callA, 'A line that arrives late');
    await routeSpeech(callB, 'B line');

    expect(said(b.say)).toEqual(['B line']);
    expect(said(a.say)).toEqual([]);
    cleanupSpeechCoordination(callA);
    cleanupSpeechCoordination(callB);
  });

  it('a line queued for A is dropped when its turn comes if the id changed without an attach', async () => {
    const coordinator = new SpeechCoordinator();
    const session = stubSession();
    coordinator.attachSession(session.session, { sessionId: 'call-a', personaId: 'p-1' });
    await coordinator.requestSpeak({
      text: 'Line A1',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });
    await coordinator.requestSpeak({
      text: 'Line A2',
      priority: SpeechPriority.RESPONSE,
      source: 'direct',
    });

    coordinator.setContext({ sessionId: 'call-b' }); // no attachSession: only the id moves
    vi.useFakeTimers();
    coordinator.onSpeechEnded(false, 1000);
    await vi.advanceTimersByTimeAsync(5_000);
    vi.useRealTimers();

    expect(said(session.say)).toEqual(['Line A1']);
  });
});
