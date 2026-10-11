/**
 * The hello for a phone caller Ferni hasn't recognised (caller-recognition.ts):
 * a neutral "who's this?", the same whether or not the number belongs to an
 * account, so the greeting can't tell a stranger whose number it is.
 */
import { describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const { directedGreeting, GREETING_DIRECTION } = await import('../greeting-direction.js');
const { rememberCallerRecognition, UNRECOGNISED_CALLER_DIRECTION } =
  await import('../../voice-agent-entry/caller-recognition.js');

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

describe('greeting an unrecognised phone caller', () => {
  it("asks who's calling, names nobody, and greets a maybe like a stranger", async () => {
    const asked: Request[] = [];
    for (const status of ['maybe', 'stranger'] as const) {
      rememberCallerRecognition(`g-${status}`, { status, attestation: 'none' });
      await directedGreeting(`g-${status}`, 'ferni', {});
      asked.push(lastRequest());
    }
    expect(asked[0].direction).toBe(`${GREETING_DIRECTION} ${UNRECOGNISED_CALLER_DIRECTION}`);
    expect(asked[0].direction).toMatch(/who's this/);
    expect(asked[1].direction).toBe(asked[0].direction);
    expect(asked[1].facts).toEqual(asked[0].facts);
    expect(asked[0].facts['their name']).toBeUndefined();
  });

  it('greets a recognised caller the usual way', async () => {
    rememberCallerRecognition('g-known', { status: 'known', attestation: 'A', userId: 'u1' });
    await directedGreeting('g-known', 'ferni', { userName: 'Seth' });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(lastRequest().facts['their name']).toBe('Seth');
  });
});
