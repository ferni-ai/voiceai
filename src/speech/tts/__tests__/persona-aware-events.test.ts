import type { EventEmitter } from 'node:events';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const METRICS = { type: 'tts_metrics', ttfbMs: 412, label: 'cartesia.TTS' };
const ERROR = {
  type: 'tts_error',
  timestamp: 1,
  label: 'cartesia.TTS',
  error: new Error('socket closed'),
  recoverable: false,
};

function make() {
  const outer = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
  const inner = () => (outer as unknown as { personaTTS: EventEmitter }).personaTTS;
  const metrics = vi.fn();
  const errors = vi.fn();
  outer.on('metrics_collected', metrics);
  outer.on('error', errors);
  return { outer, inner, metrics, errors };
}

describe('PersonaAwareTTS passes its inner TTS events to the session', () => {
  it('re-emits the inner TTS metrics on the outer TTS', () => {
    const { inner, metrics } = make();
    inner().emit('metrics_collected', METRICS);
    expect(metrics).toHaveBeenCalledWith(METRICS);
  });

  it('keeps inner errors off the session', () => {
    const { inner, errors } = make();
    // Before the fix an 'error' emit on the inner TTS had no listener and threw.
    expect(() => inner().emit('error', ERROR)).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not throw when nobody listens on the outer TTS', () => {
    const outer = new PersonaAwareTTS('Ferni', { voiceId: 'voice-a' } as never);
    const inner = (outer as unknown as { personaTTS: EventEmitter }).personaTTS;
    expect(() => inner.emit('error', ERROR)).not.toThrow();
  });

  it('after a voice switch forwards the new inner TTS and drops the old one', () => {
    const { outer, inner, metrics, errors } = make();
    const old = inner();
    outer.switchVoice('Peter', 'voice-b');
    const next = inner();
    expect(next).not.toBe(old);

    old.emit('metrics_collected', METRICS);
    expect(metrics).not.toHaveBeenCalled();
    expect(old.listenerCount('metrics_collected')).toBe(0);
    // No listener left on the old one (an 'error' emit there would now throw, as before).
    expect(old.listenerCount('error')).toBe(0);

    next.emit('metrics_collected', METRICS);
    next.emit('error', ERROR);
    expect(metrics).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
  });

  it('cleanup() stops forwarding', () => {
    const { outer, inner, metrics } = make();
    outer.cleanup();
    inner().emit('metrics_collected', METRICS);
    expect(metrics).not.toHaveBeenCalled();
    expect(inner().listenerCount('metrics_collected')).toBe(0);
  });
});
