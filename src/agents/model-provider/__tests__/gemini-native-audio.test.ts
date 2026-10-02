/**
 * Gemini native-audio provider: Gemini Live hears, thinks and SPEAKS, with an
 * optional replicated (custom) voice from a 10-20s sample.
 *
 * The last describe block runs the real, patched plugin code
 * (patches/@livekit__agents-plugin-google@1.5.1.patch). It fails on an
 * unpatched install, which is the point: an SDK upgrade that drops the patch
 * must break this test, not silently fall back to a prebuilt voice.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replicated = vi.hoisted(() => ({
  getPersonaVoiceSample: vi.fn(),
  isReplicatedVoiceAllowed: vi.fn(),
}));
vi.mock('../replicated-voice.js', () => ({
  REPLICATED_VOICE_MIME: 'audio/pcm;rate=24000',
  getPersonaVoiceSample: replicated.getPersonaVoiceSample,
  isReplicatedVoiceAllowed: replicated.isReplicatedVoiceAllowed,
}));

import {
  GeminiNativeAudioProvider,
  buildNativeAudioModelOptions,
  toReplicatedVoiceConfig,
} from '../gemini-native-audio.js';

const SAMPLE = Buffer.alloc(15 * 24000 * 2, 1);

const ENV_KEYS = [
  'NATIVE_AUDIO_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'NATIVE_AUDIO_MODEL',
  'NATIVE_AUDIO_LOCATION',
  'NATIVE_AUDIO_VOICE',
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

// Restore rather than delete: a worker may reuse this process for other files.
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe('buildNativeAudioModelOptions', () => {
  it('asks Vertex for audio output from gemini-3.8-live with transcription on', () => {
    const opts = buildNativeAudioModelOptions({ GOOGLE_CLOUD_PROJECT: 'proj' }, 'be kind');
    expect(opts).toMatchObject({
      model: 'gemini-3.8-live',
      vertexai: true,
      project: 'proj',
      location: 'us-central1',
      modalities: ['AUDIO'],
      instructions: 'be kind',
      voice: 'Puck',
    });
    expect(opts.inputAudioTranscription).toEqual({});
    expect(opts.outputAudioTranscription).toEqual({});
    expect(opts.voiceConfig).toBeUndefined();
  });

  it('carries the replicated voice config through', () => {
    const opts = buildNativeAudioModelOptions({}, 'x', undefined, toReplicatedVoiceConfig(SAMPLE));
    expect(opts.voiceConfig?.replicatedVoiceConfig).toEqual({
      voiceSampleAudio: SAMPLE.toString('base64'),
      mimeType: 'audio/pcm;rate=24000',
    });
  });

  it('uses the allowlisted project when NATIVE_AUDIO_PROJECT is set', () => {
    const opts = buildNativeAudioModelOptions(
      { GOOGLE_CLOUD_PROJECT: 'main', NATIVE_AUDIO_PROJECT: 'fern-prod-2' },
      'x'
    );
    expect(opts.project).toBe('fern-prod-2');
  });
});

describe('GeminiNativeAudioProvider', () => {
  const provider = new GeminiNativeAudioProvider();

  it('lets the realtime model own turn-taking and speech', () => {
    expect(provider.id).toBe('gemini-native-audio');
    expect(provider.getSessionTurnDetection()).toBe('realtime_llm');
    expect(provider.hasBuiltInTurnDetection()).toBe(true);
    expect(provider.hasNativeFunctionCalling()).toBe(true);
    expect(provider.needsJsonWorkaround()).toBe(false);
  });

  it('declares that it speaks for itself, so scripted lines route through it', () => {
    expect(provider.speaksNatively()).toBe(true);
  });
});

describe('GeminiNativeAudioProvider.createLLMModel voice selection', () => {
  const provider = new GeminiNativeAudioProvider();
  type Model = { _options: { voiceConfig?: unknown; voice?: string } };

  beforeEach(() => {
    replicated.getPersonaVoiceSample.mockReset();
    replicated.isReplicatedVoiceAllowed.mockReset();
    process.env.NATIVE_AUDIO_PROJECT = 'fern-prod-2';
  });

  it("speaks with the persona's replicated voice when the project is allowlisted", async () => {
    replicated.getPersonaVoiceSample.mockResolvedValue(SAMPLE);
    replicated.isReplicatedVoiceAllowed.mockResolvedValue(true);
    const model = (await provider.createLLMModel({ instructions: 'x', personaId: 'maya-santos' })) as Model;
    expect(replicated.getPersonaVoiceSample).toHaveBeenCalledWith('maya-santos');
    expect(replicated.isReplicatedVoiceAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'fern-prod-2', location: 'us-central1', model: 'gemini-3.8-live' })
    );
    expect(model._options.voiceConfig).toEqual(toReplicatedVoiceConfig(SAMPLE));
    expect((model._options as { project?: string }).project).toBe('fern-prod-2');
  });

  it('falls back to the prebuilt voice in the main project when not allowlisted', async () => {
    // The allowlisted project may not grant this agent Vertex at all; running the
    // whole session there would fail the call, not just the cloned voice.
    process.env.GOOGLE_CLOUD_PROJECT = 'main-project';
    replicated.getPersonaVoiceSample.mockResolvedValue(SAMPLE);
    replicated.isReplicatedVoiceAllowed.mockResolvedValue(false);
    const model = (await provider.createLLMModel({ instructions: 'x', personaId: 'ferni' })) as Model & {
      _options: { project?: string };
    };
    expect(model._options.voiceConfig).toBeUndefined();
    expect(model._options.voice).toBe('Puck');
    expect(model._options.project).toBe('main-project');
  });

  it('skips the allowlist check when no sample could be made', async () => {
    replicated.getPersonaVoiceSample.mockResolvedValue(null);
    const model = (await provider.createLLMModel({ instructions: 'x', personaId: 'ferni' })) as Model;
    expect(replicated.isReplicatedVoiceAllowed).not.toHaveBeenCalled();
    expect(model._options.voiceConfig).toBeUndefined();
  });
});

describe('patched @livekit/agents-plugin-google', () => {
  async function loadRealtimeApi() {
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@livekit/agents-plugin-google');
    const file = join(dirname(entry), 'realtime', 'realtime_api.js');
    return (await import(pathToFileURL(file).href)) as {
      RealtimeModel: new (o: Record<string, unknown>) => { _options: Record<string, unknown> };
      RealtimeSession: {
        prototype: {
          buildConnectConfig: (this: unknown) => { speechConfig: { voiceConfig: unknown } };
        };
      };
    };
  }

  it('keeps voiceConfig on the model options', async () => {
    const { RealtimeModel } = await loadRealtimeApi();
    const voiceConfig = {
      replicatedVoiceConfig: { voiceSampleAudio: 'AAAA', mimeType: 'audio/pcm;rate=24000' },
    };
    const model = new RealtimeModel({ apiKey: 'test', voiceConfig });
    expect(model._options.voiceConfig).toEqual(voiceConfig);
  });

  it('sends voiceConfig in the Live connect config instead of the prebuilt voice', async () => {
    const { RealtimeModel, RealtimeSession } = await loadRealtimeApi();
    const voiceConfig = {
      replicatedVoiceConfig: { voiceSampleAudio: 'AAAA', mimeType: 'audio/pcm;rate=24000' },
    };
    const model = new RealtimeModel({ apiKey: 'test', voiceConfig });
    const config = RealtimeSession.prototype.buildConnectConfig.call({
      options: model._options,
      _tools: undefined,
    });
    expect(config.speechConfig.voiceConfig).toEqual(voiceConfig);
  });

  it('still falls back to the prebuilt voice when no voiceConfig is given', async () => {
    const { RealtimeModel, RealtimeSession } = await loadRealtimeApi();
    const model = new RealtimeModel({ apiKey: 'test', voice: 'Kore' });
    const config = RealtimeSession.prototype.buildConnectConfig.call({
      options: model._options,
      _tools: undefined,
    });
    expect(config.speechConfig.voiceConfig).toEqual({ prebuiltVoiceConfig: { voiceName: 'Kore' } });
  });
});
