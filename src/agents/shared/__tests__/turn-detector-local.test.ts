import { InferenceRunner, inference } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import {
  endpointingDelays,
  registerLocalEotRunner,
  sessionTurnDetection,
  turnDetectorMode,
} from '../turn-patience.js';

const METHOD = 'lk_eot_audio';

describe('TURN_DETECTOR=local', () => {
  afterEach(() => {
    delete (InferenceRunner.registeredRunners as Record<string, string>)[METHOD];
  });

  it('is off unless asked for', () => {
    expect(turnDetectorMode({})).toBe('off');
    expect(turnDetectorMode({ TURN_DETECTOR: 'local' })).toBe('local');
    expect(turnDetectorMode({ TURN_DETECTOR: 'cloud' })).toBe('cloud');
    expect(sessionTurnDetection('stt', {})).toBe('stt');
  });

  it('registers the SDK runner next to the package entry, once', () => {
    const resolve = () => 'file:///x/node_modules/@livekit/agents/dist/index.js';
    expect(registerLocalEotRunner(resolve)).toBe(true);
    expect(InferenceRunner.registeredRunners[METHOD]).toBe(
      'file:///x/node_modules/@livekit/agents/dist/inference/eot/runner.js'
    );
    expect(registerLocalEotRunner(resolve)).toBe(true); // no "already registered" throw
  });

  it('finds the real runner file in the installed SDK', async () => {
    expect(registerLocalEotRunner()).toBe(true);
    const mod = await import(InferenceRunner.registeredRunners[METHOD]);
    expect(typeof mod.default).toBe('function');
  });

  it('falls back when the package cannot be resolved', () => {
    expect(registerLocalEotRunner(() => { throw new Error('nope'); })).toBe(false);
  });

  it('caps the endpointing wait so the model, not a long timer, decides', () => {
    expect(endpointingDelays({}).maxEndpointingDelay).toBe(2500);
    expect(endpointingDelays({ TURN_DETECTOR: 'local' }).maxEndpointingDelay).toBe(2000);
    expect(endpointingDelays({ TURN_DETECTOR: 'cloud' }).maxEndpointingDelay).toBe(2000);
  });

  it('builds the local audio detector type the session accepts', () => {
    expect(typeof inference.TurnDetector).toBe('function');
  });

  it('cloud uses the full v1 model when LiveKit credentials are set, and local without them', () => {
    const saved = { k: process.env.LIVEKIT_API_KEY, s: process.env.LIVEKIT_API_SECRET };
    try {
      process.env.LIVEKIT_API_KEY = 'key';
      process.env.LIVEKIT_API_SECRET = 'secret';
      const cloud = sessionTurnDetection('stt', { TURN_DETECTOR: 'cloud' }) as inference.TurnDetector;
      expect(cloud.model).toBe('turn-detector-v1');
      delete process.env.LIVEKIT_API_KEY;
      delete process.env.LIVEKIT_API_SECRET;
      const fallback = sessionTurnDetection('stt', { TURN_DETECTOR: 'cloud' }) as inference.TurnDetector;
      expect(fallback.model).toBe('turn-detector-v1-mini');
      const local = sessionTurnDetection('stt', { TURN_DETECTOR: 'local' }) as inference.TurnDetector;
      expect(local.model).toBe('turn-detector-v1-mini');
    } finally {
      if (saved.k === undefined) delete process.env.LIVEKIT_API_KEY;
      else process.env.LIVEKIT_API_KEY = saved.k;
      if (saved.s === undefined) delete process.env.LIVEKIT_API_SECRET;
      else process.env.LIVEKIT_API_SECRET = saved.s;
    }
  });
});
