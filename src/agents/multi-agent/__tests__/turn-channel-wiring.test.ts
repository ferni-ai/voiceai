/**
 * The call channel reaches the director through the call's own wiring (#2710): the turn
 * listeners record it for the session (rememberCallChannel), and the director reads it
 * (channel: callChannelOf). Each piece has its own test; this one runs both on one session
 * object, so removing either link fails here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import { APP_CHANNEL_NOTE } from '../../personas/director-channel.js';

const calls: Array<{ system: string; prompt: string }> = [];
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async (opts: { systemInstruction: string }) => ({
    generateContent: async (prompt: string) => {
      calls.push({ system: opts.systemInstruction, prompt });
      return { response: { text: () => 'NONE' } };
    },
  }),
}));

const { installDirectorNotes, installTurnListeners } = await import('../turn-observers.js');

afterEach(() => {
  vi.unstubAllEnvs();
  calls.length = 0;
});

/** One session object for both installs, with the events the director listens to */
async function callOn(phone: boolean): Promise<string> {
  vi.stubEnv('DIRECTOR_NOTES', 'on');
  vi.stubEnv('DIRECTOR_KNOWS_CHANNEL', 'on');
  const handlers = new Map<string, Array<(ev: unknown) => void>>();
  const emit = (event: string, ev: unknown): void => handlers.get(event)?.forEach((h) => h(ev));
  const session = {
    userData: { personaId: 'ferni' },
    on: (e: string, h: (ev: unknown) => void) => handlers.set(e, [...(handlers.get(e) ?? []), h]),
    off: () => {},
  };
  const items: Array<{ id: string; type: string; role: string; textContent: string }> = [];
  const agent = () => ({ chatCtx: { items } });
  const cleanupFunctions: Array<() => void> = [];
  await installTurnListeners({
    session: session as never,
    sessionId: 's',
    agent,
    dynamicToolLoader: { loadAllDomains: async () => 0, getCurrentTools: () => ({}) },
    cleanupFunctions,
    phone,
  });
  await installDirectorNotes({
    session: session as never,
    sessionId: 's',
    userName: 'Seth',
    agent,
    cleanupFunctions,
  });
  const add = (id: string, role: string, textContent: string): void => {
    const item = { id, type: 'message', role, textContent };
    items.push(item);
    emit(voice.AgentSessionEventTypes.ConversationItemAdded, { item });
  };
  add('u1', 'user', 'Could you ring me on my phone?');
  add('a1', 'assistant', 'Sure, calling you now.');
  emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'speaking' });
  emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'listening' });
  await vi.waitFor(() => expect(calls.length).toBe(1));
  cleanupFunctions.forEach((fn) => fn());
  return calls[0].system;
}

describe('the call channel, wired through the turn listeners and the director', () => {
  it('an app call (phone: false) reaches the director prompt', async () => {
    expect(await callOn(false)).toContain(APP_CHANNEL_NOTE);
  });

  it('a phone call (phone: true) does not add the app note', async () => {
    const system = await callOn(true);
    expect(system).not.toContain(APP_CHANNEL_NOTE);
    expect(system).toContain('a live, unscripted phone call');
  });
});
