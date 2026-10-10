/**
 * In a multi-agent call (the production path) the app's in-call controls reach the agent
 * that's speaking now. Before, only single-agent calls registered the data handler, so
 * music play/pause, starting a game or practice, and approving an action reached nothing.
 */
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { resolvePendingAction, getSessionAdapter } = vi.hoisted(() => ({
  resolvePendingAction: vi.fn(async () => null),
  getSessionAdapter: vi.fn(() => null),
}));
vi.mock('../../../services/automation/trust-level-system.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolvePendingAction,
}));
vi.mock('../../shared/handoff/coordinator-adapter.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSessionAdapter,
}));

const { liveDataChannelContext, startInCallChannels } = await import('../live-data-context.js');

/** A room the agent is in: messages arrive from the person's participant */
function room() {
  const r = new EventEmitter() as EventEmitter & {
    localParticipant: { identity: string; publishData: () => Promise<void> };
    send: (message: object) => void;
  };
  r.localParticipant = { identity: 'agent', publishData: vi.fn(async () => undefined) };
  r.send = (message) =>
    r.emit('dataReceived', new TextEncoder().encode(JSON.stringify(message)), {
      identity: 'person',
    });
  return r;
}

function agents(personaId = 'ferni') {
  const state = { personaId, session: { name: `${personaId}-session` } };
  return {
    state,
    getActiveAgent: () => state,
    getCurrentPersonaId: () => state.personaId,
  };
}

const parts = (r: ReturnType<typeof room>) => ({
  room: r as never,
  ctx: undefined,
  services: {} as never,
  userId: 'u1',
  sessionId: 'call-1',
  sessionPersona: { id: 'ferni', name: 'Ferni' },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  resolvePendingAction.mockClear();
  getSessionAdapter.mockClear();
});

describe('in-call controls in a multi-agent call', () => {
  it('approving an action reaches the approval handler', async () => {
    const r = room();
    const stop = startInCallChannels(parts(r), agents());
    r.send({ type: 'action_response', actionId: 'a-1', approved: true });
    await settle();
    expect(resolvePendingAction).toHaveBeenCalledWith('u1', 'a-1', true);
    stop();
  });

  it('handoffs are left to the multi-agent call, not handled twice', async () => {
    const r = room();
    const stop = startInCallChannels(parts(r), agents());
    r.send({ type: 'handoff_request', target: 'maya-santos' });
    r.send({ type: 'handoff_cancel' });
    await settle();
    expect(getSessionAdapter).not.toHaveBeenCalled();
    stop();
  });

  it('nothing is handled once the call has stopped them', async () => {
    const r = room();
    startInCallChannels(parts(r), agents())();
    r.send({ type: 'action_response', actionId: 'a-2', approved: false });
    await settle();
    expect(resolvePendingAction).not.toHaveBeenCalled();
  });

  it('the handlers see the agent speaking now, after a handoff', () => {
    const live = agents('ferni');
    const context = liveDataChannelContext(parts(room()) as never, live);
    expect(context.sessionPersona.id).toBe('ferni');
    live.state.personaId = 'maya-santos';
    live.state.session = { name: 'maya-santos-session' };
    expect(context.sessionPersona.id).toBe('maya-santos');
    expect(context.session).toEqual({ name: 'maya-santos-session' });
  });
});
