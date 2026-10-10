/**
 * A custom agent's text chat: it is framed as the agent (only a twin is "your past
 * self"), and it sends the conversation so far and the scene to the agent's own chat.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiPost } = vi.hoisted(() => ({
  apiPost: vi.fn(async (_path: string, _body?: unknown) => ({ ok: true, status: 200, data: { reply: 'Ahoy!' } as unknown })),
}));
vi.mock('../../src/utils/api.js', () => ({ apiPost }));

const { chatFraming, replyFromAgent, talksAsPastSelf } = await import('../../src/services/custom-agent-chat.js');
type Agent = Parameters<typeof chatFraming>[0];

const captain = { id: 'a1', type: 'fictional', name: 'nova', displayName: 'Captain Nova', description: 'A cheerful starship captain' } as unknown as Agent;
const twin = { id: 'a2', type: 'twin', name: 'me', displayName: 'Me' } as unknown as Agent;

beforeEach(() => apiPost.mockClear());

describe('framing', () => {
  it('only a twin is your past self', () => {
    expect(talksAsPastSelf(twin)).toBe(true);
    expect(talksAsPastSelf(captain)).toBe(false);
  });

  it('any other agent is shown as itself', () => {
    const framing = chatFraming(captain);
    expect(framing.title).toBe('Captain Nova');
    expect(framing.subtitle).toBe('A cheerful starship captain');
    expect(`${framing.title} ${framing.subtitle} ${framing.placeholder} ${framing.hint}`).not.toMatch(/past self|journal/i);
  });
});

describe('replies', () => {
  it("sends the talk so far and the scene to the agent's own chat", async () => {
    const reply = await replyFromAgent(
      'a1',
      [
        { role: 'twin', content: 'Welcome aboard!' },
        { role: 'user', content: 'Where to?' },
      ],
      'Which star?',
      'A cozy tavern'
    );
    expect(reply).toBe('Ahoy!');
    expect(apiPost).toHaveBeenCalledWith('/api/custom-agents/a1/chat', {
      message: 'Which star?',
      history: [
        { from: 'agent', text: 'Welcome aboard!' },
        { from: 'person', text: 'Where to?' },
      ],
      scene: 'A cozy tavern',
    });
  });

  it("throws when the agent doesn't answer, so the chat shows its error", async () => {
    apiPost.mockResolvedValueOnce({ ok: false, status: 502, data: undefined });
    await expect(replyFromAgent('a1', [], 'hi', '')).rejects.toThrow();
  });
});
