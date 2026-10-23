/**
 * PRIVACY: the semantic-router domain bridge hands each routed tool the
 * session's caller the way LiveKit does (`opts.ctx.userData.userId`).
 *
 * It called `execute(args, {})`, so tools that read the caller there (tasks,
 * shopping list, bills, routines, trips, habits) fell back to 'default': every
 * routed caller shared one bucket. A caller with no id gets a per-call anon:
 * id instead, so two of them never share one either.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A stateful tool shaped like the real ones: keyed by opts.ctx.userData.userId, else 'default'. */
const notes = vi.hoisted(() => new Map<string, string[]>());
const seen = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../registry/index.js', () => ({
  getTool: () => ({
    create: () => ({
      execute: async (args: { note?: string }, opts: unknown) => {
        seen.push(opts);
        const id =
          (opts as { ctx?: { userData?: { userId?: string } } } | undefined)?.ctx?.userData
            ?.userId || 'default';
        if (args.note) notes.set(id, [...(notes.get(id) ?? []), args.note]);
        return (notes.get(id) ?? []).join(', ') || 'nothing yet';
      },
    }),
  }),
}));

import { executeDomainTool } from '../executor.js';

const MAPPINGS = { note_add: { domainToolId: 'addNote' }, note_list: { domainToolId: 'getNotes' } };

function run(
  tool: keyof typeof MAPPINGS,
  userId: string | undefined,
  note?: string,
  sessionId = 's1'
) {
  const context = {
    userId: userId as string,
    sessionId,
    personaId: 'ferni',
    conversationHistory: [],
    services: null,
  };
  return executeDomainTool(tool, note ? { note } : {}, context, MAPPINGS);
}

beforeEach(() => {
  notes.clear();
  seen.length = 0;
});

describe('domain bridge passes the caller to routed tools', () => {
  it("runs the tool as the session's member", async () => {
    await run('note_add', 'uid-member', 'call the dentist');

    expect(seen[0]).toMatchObject({ ctx: { userData: { userId: 'uid-member' } } });
    expect((await run('note_list', 'uid-member')).naturalResponse).toBe('call the dentist');
    expect([...notes.keys()]).toEqual(['uid-member']);
  });

  it('two callers without an id, in two sessions, never see each other', async () => {
    await run('note_add', undefined, 'my diagnosis', 'sess-a');
    const other = await run('note_list', 'unknown', undefined, 'sess-b');

    expect(other.naturalResponse).toBe('nothing yet');
    expect(notes.has('default')).toBe(false);
    const ids = seen.map(
      (o) => (o as { ctx: { userData: { userId: string } } }).ctx.userData.userId
    );
    expect(ids.every((id) => id.startsWith('anon:'))).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('an id-less caller hears their own note back later in the same session', async () => {
    await run('note_add', undefined, 'buy milk', 'sess-c');
    expect((await run('note_list', 'anon', undefined, 'sess-c')).naturalResponse).toBe('buy milk');
  });

  it("keeps a per-call anon: caller's own id", async () => {
    await run('note_add', 'anon:abc', 'this call only');
    expect((await run('note_list', 'anon:abc')).naturalResponse).toBe('this call only');
  });
});
