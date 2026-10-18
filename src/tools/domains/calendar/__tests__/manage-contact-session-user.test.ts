/**
 * manageContact routes to the legacy contact tools. It used to route them with an
 * empty context, so every caller's contacts were read and written under one
 * 'default' user, and its "call" action said "Calling… Ready to dial!" while
 * nothing dialed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const contacts = vi.hoisted(() => ({
  findContact: vi.fn(async (_userId: string, _who: string) => ({
    id: 'c1',
    displayName: 'Mom',
    phones: [{ number: '+18015550111', primary: true }],
  })),
  getUserContacts: vi.fn(async (_userId: string) => []),
  searchContacts: vi.fn(async (_userId: string, _q: string) => []),
  markContacted: vi.fn(),
}));

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ description: config.description, execute: config.execute })) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../services/contacts.js', async (orig) => ({
  ...(await orig<object>()),
  findContact: contacts.findContact,
  getUserContacts: contacts.getUserContacts,
  searchContacts: contacts.searchContacts,
  markContacted: contacts.markContacted,
  formatContactForSpeech: (c: { displayName: string }) => c.displayName,
}));

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { createContactsTools, NO_SESSION_USER } from '../../../scheduling/contacts-tools.js';
import { getToolDefinitions } from '../index.js';

type Exec = { execute: (args: object, opts: unknown) => Promise<unknown> };

async function manageContact(userId: string, args: object): Promise<string> {
  const def = (await getToolDefinitions()).find((d: ToolDefinition) => d.id === 'manageContact')!;
  const tool = def.create({ userId, agentId: 'ferni' } as ToolContext) as Exec;
  return String(await tool.execute(args, { toolCallId: 't', ctx: {} }));
}

afterEach(() => vi.clearAllMocks());

describe('manageContact', () => {
  it("reads the caller's own contacts, not a shared 'default' user", async () => {
    await manageContact('caller-a', { action: 'list' });
    await manageContact('caller-b', { action: 'find', query: 'mom' });
    expect(contacts.getUserContacts.mock.calls.map((c) => c[0])).toEqual(['caller-a']);
    expect(contacts.searchContacts.mock.calls.map((c) => c[0])).toEqual(['caller-b']);
  });

  it('"call" says it has not called, and marks nobody contacted', async () => {
    const reply = await manageContact('caller-a', { action: 'call', name: 'mom' });
    expect(reply).toContain("I haven't called Mom");
    expect(reply).not.toMatch(/Calling|Ready to dial/);
    expect(contacts.markContacted).not.toHaveBeenCalled();
  });

  it('with no session user the contact tools refuse rather than read a shared book', async () => {
    const tool = createContactsTools().callMyContact as unknown as Exec;
    expect(await tool.execute({ who: 'mom' }, { toolCallId: 't', ctx: {} })).toBe(NO_SESSION_USER);
    expect(contacts.findContact).not.toHaveBeenCalled();
  });
});
