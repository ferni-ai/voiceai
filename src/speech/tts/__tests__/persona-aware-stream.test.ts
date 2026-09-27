import { beforeAll, describe, expect, it, vi } from 'vitest';

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

function fakeStream() {
  const sent: string[] = [];
  // Keep the spies: stream() replaces flush/endInput on this same object.
  const flush = vi.fn();
  const endInput = vi.fn();
  return {
    sent,
    flush,
    endInput,
    stream: { pushText: (t: string) => void sent.push(t), flush, endInput },
  };
}

describe('PersonaAwareTTS.stream() markup handling', () => {
  it('forwards a tag split across pushText calls to Cartesia whole', () => {
    const tts = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    const { sent, stream, flush, endInput } = fakeStream();
    (tts as unknown as { personaTTS: { stream: () => unknown } }).personaTTS.stream = () => stream;
    const s = tts.stream() as unknown as { pushText: (t: string) => void; endInput: () => void };
    s.pushText('Hey.<break ti');
    s.pushText('me="80ms"/> What');
    s.pushText("'s up? [laughter] [soft breath] Nice.");
    s.endInput();
    // Each piece handed to Cartesia holds only whole tags.
    for (const piece of sent) {
      expect((piece.match(/</g) ?? []).length).toBe((piece.match(/>/g) ?? []).length);
    }
    expect(sent.join('')).toBe('Hey.<break time="80ms"/> What\'s up? [laughter] Nice.');
    expect(endInput).toHaveBeenCalledOnce();
    void flush;
  });

  it('releases held-back text on flush before the segment boundary', () => {
    const tts = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    const { sent, stream, flush, endInput } = fakeStream();
    (tts as unknown as { personaTTS: { stream: () => unknown } }).personaTTS.stream = () => stream;
    const s = tts.stream() as unknown as { pushText: (t: string) => void; flush: () => void };
    s.pushText('Rate it [1-10] please');
    s.flush();
    expect(sent.join('')).toBe('Rate it [1-10] please');
    expect(flush).toHaveBeenCalledOnce();
    void endInput;
  });

  it('synthesize() keeps supported markup and drops the rest', () => {
    const tts = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    const seen: string[] = [];
    (tts as unknown as { personaTTS: { synthesize: (t: string) => unknown } }).personaTTS.synthesize = (
      t: string
    ) => {
      seen.push(t);
      return {};
    };
    tts.synthesize('<speak>[soft breath]<emotion value="calm"/>Hi.</speak>');
    expect(seen).toEqual(['<emotion value="calm"/>Hi.']);
  });
});
