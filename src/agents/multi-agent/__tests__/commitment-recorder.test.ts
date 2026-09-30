import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FollowUp } from '../../../memory/recall/follow-ups.js';
import { wireCommitmentRecorder } from '../commitment-recorder.js';

describe('wireCommitmentRecorder', () => {
  it('saves a plan with a when from committed user turns, once', () => {
    const emitter = new EventEmitter();
    const saved: FollowUp[] = [];
    const off = wireCommitmentRecorder(
      { on: (e, h) => emitter.on(e, h), off: (e, h) => emitter.off(e, h) },
      (f) => saved.push(f),
      () => 42
    );
    const user = (text: string) =>
      emitter.emit('conversation_item_added', { item: { role: 'user', textContent: text } });
    user("I'm going to call my mom this weekend.");
    user("I'm going to call my mom this weekend.");
    user('It was a long day');
    emitter.emit('conversation_item_added', {
      item: { role: 'assistant', textContent: "I'll check in on you tomorrow" },
    });
    expect(saved).toEqual([
      { id: 'call-mom', text: 'They said: "I\'m going to call my mom this weekend."', at: 42 },
    ]);
    off();
  });
});
