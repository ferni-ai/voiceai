/**
 * The hello for a phone caller who might be someone Ferni knows
 * (caller-recognition.ts): warm, no name assumed, asks whether it's them.
 */
import { describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));

const { directedGreeting } = await import('../greeting-direction.js');
const { rememberCallerRecognition } = await import('../../voice-agent-entry/caller-recognition.js');

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

describe('greeting a maybe caller', () => {
  it('asks whether it is them instead of greeting them by name', async () => {
    rememberCallerRecognition('g-maybe', { status: 'maybe', attestation: 'B', name: 'Seth' });
    await directedGreeting('g-maybe', 'ferni', {});
    expect(lastRequest().direction).toMatch(/ask lightly whether it's Seth/);
    expect(lastRequest().facts['who it might be']).toBe('Seth');
    expect(lastRequest().facts['their name']).toBeUndefined();
  });

  it('greets a stranger the usual way', async () => {
    rememberCallerRecognition('g-stranger', { status: 'stranger', attestation: 'A' });
    await directedGreeting('g-stranger', 'ferni', {});
    expect(lastRequest().direction).not.toMatch(/whether it's/);
    expect(lastRequest().facts['who it might be']).toBeUndefined();
  });
});
