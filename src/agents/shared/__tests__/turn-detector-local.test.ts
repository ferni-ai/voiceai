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
  });

  it('builds the local audio detector type the session accepts', () => {
    expect(typeof inference.TurnDetector).toBe('function');
  });
});
