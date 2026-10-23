import { EventEmitter } from 'node:events';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AgentDirectory } from '../../../personas/agent-directory.js';
import {
  installPersonaSpeakingAttribute,
  PERSONA_ATTRIBUTE,
  PERSONA_NAME_ATTRIBUTE,
} from '../persona-speaking-attribute.js';

const ON = { PERSONA_SPEAKING_ATTRIBUTE: 'on' };
const flush = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

function call(setAttributes = vi.fn(async (_: Record<string, string>) => undefined)) {
  return { room: { localParticipant: { setAttributes } }, setAttributes };
}
function session() {
  const s = new EventEmitter();
  return Object.assign(s, {
    speak: () => s.emit('agent_state_changed', { oldState: 'listening', newState: 'speaking' }),
    state: (newState: string) => s.emit('agent_state_changed', { newState }),
  });
}
const personas = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.map(([a]) => (a as Record<string, string>)[PERSONA_ATTRIBUTE]);

describe('installPersonaSpeakingAttribute', () => {
  beforeAll(async () => {
    await AgentDirectory.getEntry('ferni'); // the alias table, for canonical ids
  });

  it('flag off (the default): never writes, at start or on speech', () => {
    const { room, setAttributes } = call();
    const s = session();
    const userData = { personaId: 'ferni' };
    installPersonaSpeakingAttribute(s, room, userData, {});
    s.speak();
    userData.personaId = 'maya-santos';
    s.state('listening');
    s.speak();
    expect(setAttributes).not.toHaveBeenCalled();
    expect(s.listenerCount('agent_state_changed')).toBe(0);
  });

  it('shows the first persona at call start, with its display name', () => {
    const { room, setAttributes } = call();
    installPersonaSpeakingAttribute(session(), room, { personaId: 'ferni' }, ON);
    expect(setAttributes).toHaveBeenCalledExactlyOnceWith({
      [PERSONA_ATTRIBUTE]: 'ferni',
      [PERSONA_NAME_ATTRIBUTE]: 'Ferni',
    });
  });

  it('flips only when a different persona starts speaking, once per change', () => {
    const { room, setAttributes } = call();
    const s = session();
    const userData = { personaId: 'ferni' };
    installPersonaSpeakingAttribute(s, room, userData, ON);
    s.speak(); // Ferni again: no write
    s.state('thinking');
    userData.personaId = 'maya-santos'; // the swap: nothing written until she speaks
    expect(personas(setAttributes)).toEqual(['ferni']);
    s.state('listening');
    s.speak();
    s.state('listening');
    s.speak();
    expect(personas(setAttributes)).toEqual(['ferni', 'maya-santos']);
    expect(setAttributes.mock.calls[1][0]).toEqual({
      [PERSONA_ATTRIBUTE]: 'maya-santos',
      [PERSONA_NAME_ATTRIBUTE]: 'Maya',
    });
  });

  it('writes the canonical id for an alias', () => {
    const { room, setAttributes } = call();
    installPersonaSpeakingAttribute(session(), room, { personaId: 'maya' }, ON);
    expect(personas(setAttributes)).toEqual(['maya-santos']);
  });

  it("a later persona's own session (one session per persona) waits for its first audio", () => {
    const { room, setAttributes } = call();
    installPersonaSpeakingAttribute(session(), room, { personaId: 'ferni' }, ON);
    const peter = session();
    installPersonaSpeakingAttribute(peter, room, { personaId: 'peter-john' }, ON);
    expect(personas(setAttributes)).toEqual(['ferni']);
    peter.speak();
    expect(personas(setAttributes)).toEqual(['ferni', 'peter-john']);
  });

  it('a failed write is tried again on the next speech', async () => {
    const setAttributes = vi
      .fn(async (_: Record<string, string>) => undefined)
      .mockRejectedValueOnce(new Error('not connected'));
    const { room } = call(setAttributes);
    const s = session();
    installPersonaSpeakingAttribute(s, room, { personaId: 'ferni' }, ON);
    await flush();
    s.speak();
    expect(personas(setAttributes)).toEqual(['ferni', 'ferni']);
  });

  it('no room or no local participant: nothing to write, nothing thrown', () => {
    const s = session();
    expect(() =>
      installPersonaSpeakingAttribute(s, undefined, { personaId: 'ferni' }, ON)
    ).not.toThrow();
    installPersonaSpeakingAttribute(s, {}, { personaId: 'ferni' }, ON);
    expect(() => s.speak()).not.toThrow();
  });
});
