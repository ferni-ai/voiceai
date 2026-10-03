/**
 * Replicated voices for the Gemini native-audio pipeline.
 *
 * Each persona speaks with a voice replicated from a 10-20s sample
 * (speech_config.voice_config.replicated_voice_config). The sample is rendered
 * once from the persona's own Cartesia voice, so a changed FERNI_VOICE_ID (etc.)
 * changes the replicated voice too, and cached on disk and in memory. A
 * hand-recorded sample can override it per persona.
 *
 * Google rejects a project that is not allowlisted at session setup (close
 * 1007, no setupComplete), which would end every call. isReplicatedVoiceAllowed
 * checks that with a setup-only handshake (no generation) and caches the answer,
 * so the provider can fall back to a prebuilt voice instead.
 *
 * @module agents/model-provider/replicated-voice
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { CARTESIA_MODEL, getVoiceIdForPersona } from '../../config/voice-ids.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ReplicatedVoice' });

const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2; // 16-bit mono
const MIN_SECONDS = 10;
const MAX_SECONDS = 20;
const TRIM_TO_SECONDS = 18;
const ALLOWLIST_TTL_MS = 10 * 60 * 1000;

/** Warm, varied, conversational: what the replicated voice should sound like. */
const SAMPLE_TRANSCRIPT =
  "Hey, it's good to hear from you. I was just thinking about what you said last week, " +
  'about wanting a little more room to breathe in your mornings. How has that been going? ' +
  "No pressure at all, I'm just curious. Some weeks are like that, you know? " +
  "You plan for calm, and life has other ideas. Honestly, I'm just glad you're here, " +
  'and we can take it one step at a time.';

export const REPLICATED_VOICE_MIME = `audio/pcm;rate=${SAMPLE_RATE}`;

export interface VoiceSampleDeps {
  env: Record<string, string | undefined>;
  cacheDir: string;
  voiceIdFor: (personaId: string) => string;
  /** Render SAMPLE_TRANSCRIPT in a Cartesia voice as 24kHz s16le PCM. */
  render: (voiceId: string, apiKey: string) => Promise<Buffer>;
  readFile: (path: string) => Promise<Buffer>;
  writeFile: (path: string, data: Buffer) => Promise<void>;
}

export type HandshakeResult = 'setupComplete' | 'rejected';
export type Handshake = (opts: AllowlistOptions) => Promise<HandshakeResult>;

export interface AllowlistOptions {
  project: string;
  location: string;
  model: string;
  sample: Buffer;
}

const samples = new Map<string, Buffer>();
const allowlist = new Map<string, { allowed: boolean; at: number }>();

export function resetReplicatedVoiceCaches(): void {
  samples.clear();
  allowlist.clear();
}

const seconds = (b: Buffer): number => b.length / BYTES_PER_SECOND;

function usable(b: Buffer): Buffer | null {
  if (seconds(b) < MIN_SECONDS) return null;
  if (seconds(b) <= MAX_SECONDS) return b;
  return b.subarray(0, TRIM_TO_SECONDS * BYTES_PER_SECOND);
}

function overridePath(personaId: string, env: VoiceSampleDeps['env']): string | undefined {
  const key = `NATIVE_AUDIO_VOICE_SAMPLE_${personaId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return env[key] || env.NATIVE_AUDIO_VOICE_SAMPLE;
}

/**
 * The persona's replicated-voice sample, or null to use a prebuilt voice.
 * Never throws: a missing or bad sample must not end a call.
 */
export async function getPersonaVoiceSample(
  personaId: string,
  deps: VoiceSampleDeps = defaultDeps()
): Promise<Buffer | null> {
  try {
    const override = overridePath(personaId, deps.env);
    if (override) {
      if (!override.toLowerCase().endsWith('.pcm')) {
        // A WAV/MP3 container header would be sent to Google as audio.
        log.error({ personaId, path: override }, 'Voice sample must be raw PCM (.pcm)');
        return null;
      }
      const recorded = usable(await deps.readFile(override));
      if (!recorded) {
        log.error({ personaId, path: override }, 'Voice sample must be 10-20s of 24kHz 16-bit mono PCM');
      }
      return recorded;
    }

    const voiceId = deps.voiceIdFor(personaId);
    const cached = samples.get(voiceId);
    if (cached) return cached;

    const diskPath = join(deps.cacheDir, `${voiceId}.pcm`);
    const fromDisk = await deps.readFile(diskPath).then(usable, () => null);
    if (fromDisk) {
      samples.set(voiceId, fromDisk);
      return fromDisk;
    }

    const apiKey = deps.env.CARTESIA_API_KEY;
    if (!apiKey) {
      log.warn({ personaId }, 'No CARTESIA_API_KEY to render a voice sample; using a prebuilt voice');
      return null;
    }
    const rendered = usable(await deps.render(voiceId, apiKey));
    if (!rendered) {
      log.warn({ personaId, voiceId }, 'Rendered voice sample is under 10s; using a prebuilt voice');
      return null;
    }
    await deps.writeFile(diskPath, rendered).catch((e) =>
      log.warn({ error: String(e) }, 'Could not cache voice sample on disk')
    );
    samples.set(voiceId, rendered);
    log.info({ personaId, voiceId, seconds: seconds(rendered).toFixed(1) }, 'Voice sample ready');
    return rendered;
  } catch (error) {
    log.warn({ personaId, error: String(error) }, 'Voice sample unavailable; using a prebuilt voice');
    return null;
  }
}

/**
 * Whether this project may use replicated voices. A setup-only handshake: an
 * allowlisted project gets setupComplete, others are closed with 1007. Cached
 * per project/location/model for 10 minutes so a newly granted allowlist is
 * picked up without a restart. Never throws.
 */
export async function isReplicatedVoiceAllowed(
  opts: AllowlistOptions,
  handshake: Handshake = liveHandshake
): Promise<boolean> {
  const key = `${opts.project}/${opts.location}/${opts.model}`;
  const hit = allowlist.get(key);
  if (hit && Date.now() - hit.at < ALLOWLIST_TTL_MS) return hit.allowed;

  let allowed = false;
  try {
    allowed = (await handshake(opts)) === 'setupComplete';
  } catch (error) {
    log.warn({ key, error: String(error) }, 'Replicated-voice handshake failed');
  }
  allowlist.set(key, { allowed, at: Date.now() });
  log.info({ key, allowed }, 'Replicated-voice allowlist check');
  return allowed;
}

async function liveHandshake(opts: AllowlistOptions): Promise<HandshakeResult> {
  const { GoogleGenAI, Modality } = await import('@google/genai');
  const ai = new GoogleGenAI({ vertexai: true, project: opts.project, location: opts.location });
  return new Promise<HandshakeResult>((resolve, reject) => {
    let settled = false;
    const finish = (r: HandshakeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => finish('rejected'), 8000);
    ai.live
      .connect({
        model: opts.model,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              replicatedVoiceConfig: {
                voiceSampleAudio: opts.sample.toString('base64'),
                mimeType: REPLICATED_VOICE_MIME,
              },
            },
          } as never,
        },
        callbacks: {
          onmessage: (m) => {
            if (m.setupComplete) finish('setupComplete');
          },
          onclose: () => finish('rejected'),
          onerror: () => finish('rejected'),
        },
      })
      .then((session) => {
        // Close once we have the answer; the handshake never generates audio.
        const close = (): void => {
          try {
            session.close();
          } catch {
            // already closed
          }
        };
        if (settled) close();
        else setTimeout(close, 8500);
      })
      .catch(reject);
  });
}

async function renderWithCartesia(voiceId: string, apiKey: string): Promise<Buffer> {
  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Cartesia-Version': '2025-04-16', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: SAMPLE_TRANSCRIPT,
      voice: { mode: 'id', id: voiceId },
      output_format: { container: 'raw', encoding: 'pcm_s16le', sample_rate: SAMPLE_RATE },
      language: 'en',
    }),
  });
  if (!res.ok) throw new Error(`Cartesia render failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function defaultDeps(): VoiceSampleDeps {
  return {
    env: process.env,
    cacheDir: join(tmpdir(), 'ferni-voice-samples'),
    voiceIdFor: getVoiceIdForPersona,
    render: renderWithCartesia,
    readFile: (p) => readFile(p),
    writeFile: async (p, b) => {
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, b);
    },
  };
}
