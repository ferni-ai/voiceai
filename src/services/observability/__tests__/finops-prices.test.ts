/**
 * Every model the default voice cascade uses has its own price row, so a call's
 * recorded cost never falls through to the `default` guess. The model names come
 * from the cascade's own builders (called with an empty env) and the pinned Sonic
 * snapshot, so changing a default without pricing it fails here.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCascadeHedge,
  buildCascadeLLMOptions,
  buildCascadeSTTOptions,
  buildFastLane,
} from '../../../agents/model-provider/cartesia-cascade.js';
import { CARTESIA_SNAPSHOT } from '../../../config/voice-ids.js';
import { PRICING, endSession, recordSTTCost, startSession } from '../finops.js';

/** A speech row's `models` lists the exact model ids it prices. */
function pricesModel(row: { models?: readonly string[] }, model: string): boolean {
  return (row.models ?? []).includes(model);
}

describe('finops prices the default cascade', () => {
  const main = buildCascadeLLMOptions({});
  const llmModels = [
    main.model,
    buildCascadeHedge({})?.backup.model,
    buildFastLane({ CASCADE_FAST_LANE: 'on' }, main)?.options.model,
  ];

  it.each(llmModels)('has an LLM price row for %s', (model) => {
    expect(model).toBeTypeOf('string');
    expect(Object.keys(PRICING.llm)).toContain(model);
  });

  it('prices the cascade STT model under the cartesia row', () => {
    const { model } = buildCascadeSTTOptions({});
    expect(pricesModel(PRICING.stt.cartesia, model)).toBe(true);
  });

  it('prices the pinned Sonic snapshot under the cartesia TTS row', () => {
    expect(pricesModel(PRICING.tts.cartesia, CARTESIA_SNAPSHOT)).toBe(true);
  });

  it('charges STT at the cartesia rate when no provider is named', () => {
    const sessionId = 'finops-prices-stt-default';
    startSession({ sessionId });
    recordSTTCost({ durationSeconds: 60, sessionId });
    const session = endSession(sessionId);
    expect(session?.costs.stt).toBeCloseTo(PRICING.stt.cartesia.perMinute, 10);
  });
});
