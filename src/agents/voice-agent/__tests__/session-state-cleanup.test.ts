/**
 * Every call's session-state handlers (session-state-handler.ts) left state
 * behind: setupSessionStateHandlers returns clearTimers, and neither caller ran
 * it. The feedback engine kept an entry per call (with its last messages), and
 * the process-wide prosody stream kept the call's callback, which holds the
 * handler scope and so the whole call's session until the next call started.
 * These tests open and close calls against the real module.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { voice } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { feedbackTriggerEngine } from '../../feedback/index.js';
import { getContinuousProsodyStream } from '../../../intelligence/context-builders/continuous-prosody.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

let n = 0;

/** One call: its handlers, wired to a fake session, after Ferni has spoken once. */
function openCall() {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session = {
    agentState: 'listening',
    userState: 'listening',
    on: (evt: string, h: (e: unknown) => void) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt: string, h: (e: unknown) => void) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: {
      isAgentSpeaking: () => false,
      handleAgentStartedSpeaking: () => undefined,
      handleUserFinishedSpeaking: () => undefined,
    },
    userData: {},
    sessionId: `state-cleanup-${process.pid}-${n++}`,
  } as unknown as SessionStateContext);
  for (const h of [...(handlers.get(voice.AgentSessionEventTypes.AgentStateChanged) ?? [])]) {
    try {
      h({ newState: 'speaking', oldState: 'thinking' });
    } catch {
      // Work further down the handler may need a live session; not under test.
    }
  }
  return result;
}

describe('session-state handlers: a call leaves nothing behind', () => {
  it('clearTimers empties the per-call feedback state after N calls', () => {
    const start = feedbackTriggerEngine.sessionCount();
    const calls = Array.from({ length: 25 }, openCall);
    expect(feedbackTriggerEngine.sessionCount()).toBe(start + 25); // what leaked per call
    for (const call of calls) call.clearTimers();
    expect(feedbackTriggerEngine.sessionCount()).toBe(start);
  });

  it('drops the prosody callback at call end, but not a later call’s', () => {
    const stream = getContinuousProsodyStream();
    const first = openCall();
    const second = openCall(); // the next call took the stream over
    first.clearTimers();
    expect(stream.isActive()).toBe(true); // the first call's end doesn't stop the second's
    second.clearTimers();
    expect(stream.isActive()).toBe(false);
  });

  it('both callers run clearTimers when the call (or its persona) ends', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
    expect(src('multi-agent/agent-setup.ts')).toMatch(
      /cleanupFunctions\.push\(stateResult\.clearTimers\)/
    );
    const legacy = src('voice-agent-entry/handler-setup.ts');
    expect(legacy).toMatch(/const \{ silenceContext, clearTimers \} = setupSessionStateHandlers/);
    expect(legacy).toMatch(
      /cleanupTracker\.register\('timer', 'session-state timers', clearTimers\)/
    );
  });
});
