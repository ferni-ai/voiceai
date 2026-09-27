/**
 * Gemini native-audio provider: Gemini Live hears, thinks and SPEAKS, with an
 * optional replicated (custom) voice from a 10-20s sample.
 *
 * The last describe block runs the real, patched plugin code
 * (patches/@livekit__agents-plugin-google@1.5.1.patch). It fails on an
 * unpatched install, which is the point: an SDK upgrade that drops the patch
 * must break this test, not silently fall back to a prebuilt voice.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GeminiNativeAudioProvider,
  buildNativeAudioModelOptions,
  buildNativeAudioVoiceConfig,
} from '../gemini-native-audio.js';

const SAMPLE_RATE = 24000;
function pcmFile(seconds: number, ext = '.pcm'): string {
  const dir = mkdtempSync(join(tmpdir(), 'voice-sample-'));
  const path = join(dir, `ferni${ext}`);
  writeFileSync(path, Buffer.alloc(Math.round(seconds * SAMPLE_RATE * 2), 1));
  return path;
}

afterEach(() => {
  for (const k of [
    'NATIVE_AUDIO_VOICE_SAMPLE',
    'NATIVE_AUDIO_MODEL',
    'NATIVE_AUDIO_LOCATION',
    'NATIVE_AUDIO_VOICE',
  ])
    delete process.env[k];
});

describe('buildNativeAudioVoiceConfig', () => {
  it('returns undefined (prebuilt voice) when no sample is configured', () => {
    expect(buildNativeAudioVoiceConfig({})).toBeUndefined();
  });

  it('builds a replicatedVoiceConfig from a 15s 24kHz PCM sample', () => {
    const cfg = buildNativeAudioVoiceConfig({ NATIVE_AUDIO_VOICE_SAMPLE: pcmFile(15) });
    expect(cfg?.replicatedVoiceConfig?.mimeType).toBe('audio/pcm;rate=24000');
    const bytes = Buffer.from(cfg?.replicatedVoiceConfig?.voiceSampleAudio ?? '', 'base64').length;
    expect(bytes).toBe(15 * SAMPLE_RATE * 2);
  });

  it('rejects samples outside the documented 10-20s window', () => {
    expect(() => buildNativeAudioVoiceConfig({ NATIVE_AUDIO_VOICE_SAMPLE: pcmFile(5) })).toThrow(
      /10-20s/
    );
    expect(() => buildNativeAudioVoiceConfig({ NATIVE_AUDIO_VOICE_SAMPLE: pcmFile(25) })).toThrow(
      /10-20s/
    );
  });

  it('rejects non-PCM files instead of sending a container header as audio', () => {
    expect(() =>
      buildNativeAudioVoiceConfig({ NATIVE_AUDIO_VOICE_SAMPLE: pcmFile(15, '.wav') })
    ).toThrow(/raw PCM/);
  });
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
    const opts = buildNativeAudioModelOptions({ NATIVE_AUDIO_VOICE_SAMPLE: pcmFile(12) }, 'x');
    expect(opts.voiceConfig?.replicatedVoiceConfig?.mimeType).toBe('audio/pcm;rate=24000');
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
