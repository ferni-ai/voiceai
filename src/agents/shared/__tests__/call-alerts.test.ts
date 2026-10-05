import { describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import { alertInstructions, createCallAlertSpeaker } from '../call-alerts.js';

function fakeSession() {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  const s = {
    agentState: 'speaking',
    userState: 'listening',
    generateReply: vi.fn(),
    on: (e: string, fn: (ev: unknown) => void) => listeners.set(e, (listeners.get(e) ?? new Set()).add(fn)),
    off: (e: string, fn: (ev: unknown) => void) => listeners.get(e)?.delete(fn),
    emit: (e: string) => [...(listeners.get(e) ?? [])].forEach((fn) => fn({})),
  };
  return s;
}

const timer = {
  type: 'timer_complete' as const,
  userId: 'u',
  message: "Timer's up for pasta!",
  priority: 'high' as const,
  context: { label: 'pasta' },
};

describe('call alerts', () => {
  it('waits for a pause, then has Ferni say it', async () => {
    const s = fakeSession();
    const done = createCallAlertSpeaker(s)(timer);
    await Promise.resolve();
    expect(s.generateReply).not.toHaveBeenCalled(); // Ferni is mid-sentence
    s.agentState = 'listening';
    s.emit(voice.AgentSessionEventTypes.AgentStateChanged);
    await done;
    expect(s.generateReply).toHaveBeenCalledWith({
      instructions: expect.stringContaining('(pasta) just went off'),
    });
  });

  it('gives Ferni the facts, not canned words', () => {
    const text = alertInstructions(timer);
    expect(text).toContain('in your own words');
    expect(text).not.toContain("Timer's up");
  });
});
