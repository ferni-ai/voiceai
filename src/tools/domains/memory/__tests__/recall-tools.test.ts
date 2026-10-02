/**
 * recallFromMemory and recallPreviousConversation search the caller's own
 * memory (facts/people and past conversations), not persona content.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown; description: string }) => ({
      description: config.description,
      execute: config.execute,
    })),
  },
}));

const { search, recordFeedback, ragLookup, searchUserFacts, searchUserConversations } = vi.hoisted(
  () => ({
    search: vi.fn(async () => null),
    recordFeedback: vi.fn(),
    ragLookup: vi.fn(async () => 'PERSONA STORY ABOUT GRIEF'),
    searchUserFacts: vi.fn(),
    searchUserConversations: vi.fn(),
  })
);
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ search, recordFeedback }),
}));

vi.mock('../../../../memory/retrieval/semantic-rag.js', () => ({
  ragLookup,
  semanticSearch: vi.fn(async () => []),
}));

vi.mock('../../../../memory/recall/user-memory-search.js', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../../../memory/recall/user-memory-search.js')>();
  return { ...real, searchUserFacts, searchUserConversations };
});

import type { ToolContext } from '../../../registry/types.js';
import {
  recallFromMemoryUnifiedDef,
  recallPreviousConversationUnifiedDef,
  resolveUserId,
} from '../tools-unified.js';
import { recallFromMemoryDef, recallPreviousConversationDef } from '../tools.js';

type Exec = (
  args: Record<string, string>,
  opts: { ctx: { userData: Record<string, unknown> } }
) => Promise<string>;

const ctx = {
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  userId: 'default',
} as unknown as ToolContext;
const run = (
  def: { create: (c: ToolContext) => unknown },
  args: Record<string, string>,
  userData: Record<string, unknown>
) => (def.create(ctx) as { execute: Exec }).execute(args, { ctx: { userData } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ['unified (domain registry)', recallFromMemoryUnifiedDef, recallPreviousConversationUnifiedDef],
  ['legacy (persona agents)', recallFromMemoryDef, recallPreviousConversationDef],
])('%s recall tools', (_name, recallFromMemory, recallPreviousConversation) => {
  it("recallFromMemory returns the caller's facts", async () => {
    searchUserFacts.mockResolvedValue([
      { id: 'f1', kind: 'fact', text: 'Emma: lives in = Denver', score: 3 },
      { id: 'p1', kind: 'person', text: 'Emma (sister)', score: 2 },
    ]);
    const out = await run(recallFromMemory, { topic: 'my sister' }, { userId: 'u1' });
    expect(searchUserFacts).toHaveBeenCalledWith('u1', 'my sister', expect.any(Object));
    expect(out).toContain('- Emma: lives in = Denver');
    expect(out).toContain('- Emma (sister)');
    expect(ragLookup).not.toHaveBeenCalled();
  });

  it("recallPreviousConversation searches the caller's conversations, not persona content", async () => {
    searchUserConversations.mockResolvedValue([
      {
        conversationId: 'conv_1',
        date: new Date('2026-09-25T10:00:00Z'),
        snippet: 'They said: "The move to Denver was exhausting"',
        source: 'turns',
        score: 2,
      },
    ]);
    const out = await run(recallPreviousConversation, { query: 'the move' }, { userId: 'u1' });
    expect(searchUserConversations).toHaveBeenCalledWith('u1', 'the move', expect.any(Object));
    expect(out).toContain(
      '[2026-09-25 · conversation conv_1] They said: "The move to Denver was exhausting"'
    );
    expect(out).not.toContain('PERSONA');
    expect(ragLookup).not.toHaveBeenCalled();
  });

  it("never searches the placeholder 'default' user", async () => {
    searchUserConversations.mockResolvedValue([]);
    searchUserFacts.mockResolvedValue([]);
    const out = await run(recallPreviousConversation, { query: 'the move' }, {});
    expect(searchUserConversations).not.toHaveBeenCalled();
    expect(out).toContain("don't have specific memories");
    await run(recallFromMemory, { topic: 'x' }, {});
    expect(searchUserFacts).not.toHaveBeenCalled();
  });
});

describe('resolveUserId', () => {
  it('skips empty and placeholder ids', () => {
    expect(resolveUserId(undefined, 'default')).toBeUndefined();
    expect(resolveUserId('', 'u2')).toBe('u2');
    expect(resolveUserId('u1', 'u2')).toBe('u1');
  });
});
