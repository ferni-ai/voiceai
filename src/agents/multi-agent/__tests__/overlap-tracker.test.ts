import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { wireOverlapTracker } from '../overlap-tracker.js';

function session() {
  const emitter = new EventEmitter();
  return {
    on: (e: string, h: (ev: unknown) => void) => emitter.on(e, h),
    off: (e: string, h: (ev: unknown) => void) => emitter.off(e, h),
    emit: (e: string, ev: unknown) => emitter.emit(e, ev),
  };
}

describe('wireOverlapTracker', () => {
  it('marks a reply the caller spoke over, until Ferni starts the next one', () => {
    const s = session();
    const userData: { spokeOverReply?: boolean } = {};
    wireOverlapTracker(s, userData);
    s.emit('agent_state_changed', { newState: 'speaking' });
    s.emit('user_state_changed', { newState: 'speaking' });
    s.emit('agent_state_changed', { newState: 'listening' });
    expect(userData.spokeOverReply).toBe(true);
    // the cut-off reply lands late; still spoken over
    s.emit('conversation_item_added', { item: { role: 'assistant', interrupted: true } });
    expect(userData.spokeOverReply).toBe(true);
    s.emit('agent_state_changed', { newState: 'speaking' });
    expect(userData.spokeOverReply).toBe(false);
  });

  it('clears it when the reply still played to the end (a resumed "mm-hm")', () => {
    const s = session();
    const userData: { spokeOverReply?: boolean } = {};
    wireOverlapTracker(s, userData);
    s.emit('agent_state_changed', { newState: 'speaking' });
    s.emit('user_state_changed', { newState: 'speaking' });
    s.emit('agent_state_changed', { newState: 'listening' });
    s.emit('conversation_item_added', { item: { role: 'assistant', interrupted: false } });
    expect(userData.spokeOverReply).toBe(false);
  });

  it('does not count the caller speaking while Ferni is quiet', () => {
    const s = session();
    const userData: { spokeOverReply?: boolean } = {};
    const off = wireOverlapTracker(s, userData);
    s.emit('user_state_changed', { newState: 'speaking' });
    expect(userData.spokeOverReply).toBeUndefined();
    off();
  });
});
