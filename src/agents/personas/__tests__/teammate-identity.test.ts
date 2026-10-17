/**
 * Prod call 2026-10-17: talking to Alex, the caller asked for "Fern" and Alex
 * answered "I'll pass you back to Ferni. Ferni here." without the handoff.
 * A teammate's turn says who is speaking and that a request for Ferni is the
 * handoff tool; the tool itself stays open to every teammate.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { UserProfile } from '../../../types/user-profile.js';
import { teammateIdentityNote } from '../teammate-identity.js';
import { toolsForTurn, withTurnReminder } from '../turn-request.js';

const profile = { id: 'u', totalConversations: 400 } as unknown as UserProfile;

function sessionAs(personaId: string) {
  return {
    userData: {
      personaId,
      services: { userProfile: profile, devMode: { enabled: true, bypassUnlocks: true } },
    },
  };
}

/** What the model is sent after the caller's words. */
function reminderFor(personaId: string, words: string): string {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: words });
  const out = withTurnReminder(chat, sessionAs(personaId));
  return (out.items.at(-1) as llm.ChatMessage).textContent ?? '';
}

describe('teammateIdentityNote', () => {
  it('tells a teammate who they are and that a request for Ferni is a handoff call', () => {
    const note = teammateIdentityNote('alex-chen', {});
    expect(note).toContain('You are Alex.');
    expect(note).toContain('never say you are Ferni or speak as him');
    expect(note).toContain("call that teammate's handoff tool in this reply");
  });

  it('says nothing to Ferni, or with TEAMMATE_IDENTITY_NOTE=off', () => {
    expect(teammateIdentityNote('ferni', {})).toBe('');
    expect(teammateIdentityNote(undefined, {})).toBe('');
    expect(teammateIdentityNote('alex-chen', { TEAMMATE_IDENTITY_NOTE: 'off' })).toBe('');
  });
});

describe("a teammate's turn", () => {
  it('carries the identity line when Alex is on the call', () => {
    const reminder = reminderFor('alex-chen', 'transfer me to Ferni.');
    expect(reminder).toContain('You are Alex.');
    expect(reminder).toContain('never say you are Ferni');
  });

  it("doesn't when Ferni is", () => {
    expect(reminderFor('ferni', 'transfer me to Maya.')).not.toContain('never say you are Ferni');
  });

  it('keeps the handoff back to Ferni open to Alex, and drops only his own', async () => {
    const fn = (name: string) =>
      llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });
    const tools = new llm.ToolContext(['handoffToAlex', 'handoffToFerni', 'handoffToMaya'].map(fn));
    const sent = await toolsForTurn(sessionAs('alex-chen'), llm.ChatContext.empty(), tools, {
      loggedLockedHandoffs: true,
    });
    expect(Object.keys(sent.functionTools)).toContain('handoffToFerni');
    expect(Object.keys(sent.functionTools)).not.toContain('handoffToAlex');
  });
});
