import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { attachSessionEventLog, userStateLine } from '../session-event-log.js';

/** One caller turn's state events, shaped like the SDK's (speech_created carries the handle). */
function simulateTurn(session: EventEmitter): void {
  const t = 1791804747158;
  session.emit('user_state_changed', {
    type: 'user_state_changed',
    oldState: 'listening',
    newState: 'speaking',
    createdAt: t,
  });
  session.emit('user_state_changed', {
    type: 'user_state_changed',
    oldState: 'speaking',
    newState: 'listening',
    createdAt: t + 900,
  });
  for (const [oldState, newState] of [
    ['listening', 'thinking'],
    ['thinking', 'speaking'],
    ['speaking', 'listening'],
  ]) {
    session.emit('agent_state_changed', {
      type: 'agent_state_changed',
      oldState,
      newState,
      createdAt: t + 1000,
    });
  }
  for (const id of ['speech_cbb5df1b-eee', 'speech_5ae066a0-6ef']) {
    session.emit('speech_created', {
      type: 'speech_created',
      userInitiated: true,
      source: 'generate_reply',
      speechHandle: {
        interruptFut: {},
        authorizedEvent: {},
        scheduledFut: {},
        doneFut: {},
        generations: [],
        _chatItems: [],
        _tasks: [],
        _numSteps: 1,
        itemAddedCallbacks: {},
        doneCallbacks: {},
        _id: id,
        _allowInterruptions: true,
        _stepIndex: 0,
        _inputDetails: { modality: 'audio' },
      },
      createdAt: t + 1100,
    });
  }
}

/** What the old handlers wrote for the same events. */
function oldBytes(): number {
  const session = new EventEmitter();
  let bytes = 0;
  const dump = (tag: string) => (e: unknown) => {
    bytes += Buffer.byteLength(`\n${tag} ${JSON.stringify(e, null, 2)}\n`);
  };
  session.on('user_state_changed', dump('👤 [USER STATE]'));
  session.on('agent_state_changed', dump('🤖 [AGENT STATE]'));
  session.on('speech_created', dump('🎙️ [SPEECH CREATED]'));
  simulateTurn(session);
  return bytes;
}

describe('attachSessionEventLog', () => {
  it('writes far fewer bytes per turn than the pretty dumps did', () => {
    const session = new EventEmitter();
    const lines: string[] = [];
    const handlers: Array<{ event: string; handler: (...a: unknown[]) => void }> = [];
    attachSessionEventLog(session, handlers, (l) => lines.push(l));
    simulateTurn(session);
    const after = lines.reduce((n, l) => n + Buffer.byteLength(l), 0);
    const before = oldBytes();
    // Measured: 1,774 -> 80 bytes per turn, 7 stderr writes -> 2.
    expect(before).toBeGreaterThan(1700);
    expect(after).toBeLessThan(before * 0.05);
    expect(lines).toHaveLength(2);
    expect(handlers.map((h) => h.event).sort()).toEqual([
      'agent_state_changed',
      'speech_created',
      'user_state_changed',
    ]);
  });

  it('keeps the caller going away visible to the call reviewer', () => {
    expect(userStateLine({ oldState: 'listening', newState: 'away' })).toBe(
      '👤 [USER STATE] listening -> away\n'
    );
  });
});
