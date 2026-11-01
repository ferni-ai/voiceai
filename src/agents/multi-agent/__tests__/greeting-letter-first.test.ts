/**
 * A letter to future them, on the day the tool promised it (future-letters.ts), is the opening's
 * one thread: a win or a check-in waits for a later call, never the letter. Main's one-thread
 * rule held it back behind any of them, so a frequent caller's letter could keep slipping.
 */
import { describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
const win = {
  id: 'c1',
  commitmentId: 'c1',
  text: "I'll call my sister Sunday",
  doneAt: '2026-10-28',
};
const markWinSurfaced = vi.fn(async () => undefined);
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => win),
  markWinSurfaced,
}));
const letter = { writtenOn: 'October 18, 2026', mark: vi.fn() };
const due = vi.hoisted(() => ({ letter: true }));
vi.mock('../../../tools/domains/engagement/future-letters.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  letterToOffer: vi.fn(async () => (due.letter ? letter : undefined)),
}));

const { directedGreeting, WIN_DIRECTION } = await import('../greeting-direction.js');
const { rememberCallLaunch, PEP_TALK_DIRECTION } = await import('../../shared/call-launch-hint.js');
const { rememberCallerRecognition } = await import('../../voice-agent-entry/caller-recognition.js');
const { letterOfferDirection } =
  await import('../../../tools/domains/engagement/future-letters.js');
const lastDirection = (): string =>
  (directedText.mock.calls.at(-1)![1] as unknown as { direction: string }).direction;

describe('a due letter opens the call ahead of a win', () => {
  it('offers the letter; the win waits, unnamed and unmarked', async () => {
    markWinSurfaced.mockClear();
    await directedGreeting('gl-1', 'jordan-taylor', { userId: 'voice-eval-u1', userName: 'Sam' });
    expect(lastDirection()).toContain(letterOfferDirection(letter));
    expect(lastDirection()).not.toContain(WIN_DIRECTION);
    expect(markWinSurfaced).not.toHaveBeenCalled();
  });

  it('with no letter due, the win opens the call as before', async () => {
    due.letter = false;
    try {
      await directedGreeting('gl-2', 'jordan-taylor', { userId: 'voice-eval-u2', userName: 'Sam' });
      expect(lastDirection()).toContain(WIN_DIRECTION);
      expect(markWinSurfaced).toHaveBeenCalled();
    } finally {
      due.letter = true;
    }
  });
});

describe('the letter still yields, and is marked only when offered', () => {
  it("yields to the caller's own reason for calling", async () => {
    rememberCallLaunch(
      'gl-3',
      { kind: 'bookend', ref: 'a'.repeat(24) },
      { CALL_LAUNCH_CONTEXT: 'on' }
    );
    await directedGreeting('gl-3', 'jordan-taylor', { userId: 'voice-eval-u3', userName: 'Sam' });
    expect(lastDirection()).toContain(PEP_TALK_DIRECTION);
    expect(lastDirection()).not.toContain(letterOfferDirection(letter));
  });

  it('is never read to a caller the line does not recognise', async () => {
    rememberCallerRecognition('gl-4', { status: 'maybe', attestation: 'B' });
    await directedGreeting('gl-4', 'jordan-taylor', { userId: 'voice-eval-u4', userName: 'Sam' });
    expect(lastDirection()).not.toContain(letterOfferDirection(letter));
  });

  it('is marked offered only when the spoken line offers it', async () => {
    letter.mark.mockClear();
    directedText.mockResolvedValueOnce({
      text: 'Hey Sam, good to hear you!',
      source: 'actor',
    } as never);
    await directedGreeting('gl-5', 'jordan-taylor', { userId: 'voice-eval-u5', userName: 'Sam' });
    expect(letter.mark).not.toHaveBeenCalled();
    directedText.mockResolvedValueOnce({
      text: 'Hey Sam, the letter you wrote yourself is ready. Want to hear it?',
      source: 'actor',
    } as never);
    await directedGreeting('gl-6', 'jordan-taylor', { userId: 'voice-eval-u6', userName: 'Sam' });
    expect(letter.mark).toHaveBeenCalledTimes(1);
  });
});
