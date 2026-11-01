/**
 * `ferni email unread` / `ferni email summary`: a Gmail read that can't run answers
 * {unavailable, say} (services/gmail/gmail-honesty.ts). The CLI prints the `say`,
 * never "No unread emails!" or a summary of zeros. A real empty list still says so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/cli-auth.service.js', () => ({
  isAuthenticated: () => true,
  getCurrentUser: () => ({ userId: 'u1' }),
  getAuthHeaders: async () => ({ Authorization: 'Bearer t' }),
}));

const SAY = "I can't read your inbox; that isn't connected.";

/** Runs the email command with `argv` against a /api/chat/tool that returns `result`. */
async function runCli(argv: string[], result: unknown): Promise<string> {
  vi.resetModules();
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify({ success: true, result }), { status: 200 })
  );
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  const saved = process.argv;
  process.argv = ['node', 'email', ...argv];
  try {
    await import('../email.js');
    await vi.waitFor(() => expect(lines.length).toBeGreaterThan(1));
  } finally {
    process.argv = saved;
  }
  return lines.join('\n');
}

describe('ferni email with an unavailable Gmail read', () => {
  afterEach(() => vi.restoreAllMocks());

  it('unread prints the say, not "No unread emails!"', async () => {
    const out = await runCli(['unread'], { unavailable: 'gmail_not_permitted', say: SAY });
    expect(out).toContain(SAY);
    expect(out).not.toMatch(/no unread emails/i);
  });

  it('summary prints the say, not a summary of zeros', async () => {
    const out = await runCli(['summary'], { unavailable: 'gmail_not_permitted', say: SAY });
    expect(out).toContain(SAY);
    expect(out).not.toMatch(/Unread:|Total:/);
  });

  it('a real empty list still says no unread emails', async () => {
    const out = await runCli(['unread'], []);
    expect(out).toMatch(/No unread emails!/);
  });
});
