import { beforeAll, describe, expect, it, vi } from 'vitest';

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

type WithInner = { personaTTS: { updateOptions: (o: unknown) => void } };

describe('PersonaAwareTTS.setDeliveryStyle', () => {
  it('passes emotion and speed to the Cartesia voice', () => {
    const tts = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    const spy = vi.spyOn((tts as unknown as WithInner).personaTTS, 'updateOptions');
    tts.setDeliveryStyle({ emotion: 'sympathetic', speed: 0.92 });
    expect(spy).toHaveBeenCalledWith({ emotion: ['sympathetic'], speed: 0.92 });
    expect(tts.getDeliveryStyle()).toEqual({ emotion: 'sympathetic', speed: 0.92 });
  });

  it('clears emotion and speed when reset to default delivery', () => {
    const tts = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    tts.setDeliveryStyle({ emotion: 'calm', speed: 0.9 });
    const spy = vi.spyOn((tts as unknown as WithInner).personaTTS, 'updateOptions');
    tts.setDeliveryStyle(null);
    expect(spy).toHaveBeenCalledWith({ emotion: undefined, speed: undefined });
  });
});
