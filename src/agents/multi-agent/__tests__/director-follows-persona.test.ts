/**
 * The director as the call wires it (installDirectorNotes), through a Ferni to
 * Jordan swap inside one session. Prod 2026-10-13: it labelled Jordan's lines
 * "Ferni" and told Jordan to say "I'm actually still Ferni."
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';

const calls: Array<{ system: string; prompt: string }> = [];
vi.mock('../../../config/generative-model.js', () => ({
  getGenerativeModel: async (opts: { systemInstruction: string }) => ({
    generateContent: async (prompt: string) => {
      calls.push({ system: opts.systemInstruction, prompt });
      return { response: { text: () => 'NONE' } };
    },
  }),
}));

const { installDirectorNotes } = await import('../turn-observers.js');

afterEach(() => {
  vi.unstubAllEnvs();
  calls.length = 0;
});

async function callThroughSwap(): Promise<{ system: string; prompt: string }> {
  vi.stubEnv('DIRECTOR_NOTES', 'on');
  const handlers = new Map<string, Array<(ev: unknown) => void>>();
  const emit = (event: string, ev: unknown): void => handlers.get(event)?.forEach((h) => h(ev));
  const userData = { personaId: 'ferni' };
  const session = {
    userData,
    on: (e: string, h: (ev: unknown) => void) => handlers.set(e, [...(handlers.get(e) ?? []), h]),
    off: () => {},
  };
  const items: Array<{ id: string; type: string; role: string; textContent: string }> = [];
  const add = (id: string, role: string, textContent: string): void => {
    const item = { id, type: 'message', role, textContent };
    items.push(item);
    emit(voice.AgentSessionEventTypes.ConversationItemAdded, { item });
  };
  await installDirectorNotes({
    session: session as never,
    sessionId: 's',
    userName: 'Seth',
    agent: () => ({ chatCtx: { items } }),
    cleanupFunctions: [],
  });

  add('u1', 'user', 'Hey, can I talk to Jordan?');
  add('a1', 'assistant', 'Sure, handing you over.');
  userData.personaId = 'jordan-taylor'; // persona-swap.ts sets it as it swaps
  add('a2', 'assistant', "Hey, it's Jordan.");
  add('u2', 'user', 'Hey Jordan, who is this?');
  emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'speaking' });
  emit(voice.AgentSessionEventTypes.AgentStateChanged, { newState: 'listening' });
  await vi.waitFor(() => expect(calls.length).toBe(1));
  return calls[0];
}

describe('the director on the call, after Ferni hands over to Jordan', () => {
  it('with DIRECTOR_PERSONA_AWARE on, knows Jordan is speaking and labels lines by who said them', async () => {
    vi.stubEnv('DIRECTOR_PERSONA_AWARE', 'on');
    const { system, prompt } = await callThroughSwap();
    expect(system).toContain('teammate Jordan, who is on the call now');
    expect(prompt).toContain('Ferni: Sure, handing you over.');
    expect(prompt).toContain("Jordan: Hey, it's Jordan.");
    expect(prompt).toContain("Your notes for Jordan's next reply:");
  });

  it('with the flag off, behaves as before: every assistant line is Ferni', async () => {
    const { system, prompt } = await callThroughSwap();
    expect(system).not.toContain('on the call now');
    expect(prompt).toContain("Ferni: Hey, it's Jordan.");
    expect(prompt).not.toContain('Jordan:');
    expect(prompt).toContain("Your notes for Ferni's next reply:");
  });
});
