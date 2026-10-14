/**
 * Voice journal transcription with Gemini on Vertex.
 *
 * The UI server (Cloud Run john-bogle-ui) has neither DEEPGRAM_API_KEY nor
 * OPENAI_API_KEY, so transcribeAudioBuffer had no provider on prod and every
 * voice journal came back as '[Transcription unavailable]'. Gemini accepts
 * audio inline and the UI server already reaches Vertex through its service
 * account (ADC), so this needs no new key. It runs only with
 * JOURNAL_TRANSCRIBE_VERTEX on, after Deepgram and Whisper.
 *
 * The transcript is the person's private journal: it is never logged, only
 * its length.
 *
 * @module services/custom-agent/vertex-transcribe
 */

import { getExtractionModel, vertexOptions } from '../../config/gemini-config.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { minimalThinkingFor } from '../../config/thinking-defaults.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'vertex-transcribe' });

/** About 10 minutes of opus; journal clips are far shorter. Inline Vertex requests cap near 20 MB. */
export const MAX_TRANSCRIBE_BYTES = 10 * 1024 * 1024;
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

/** What browsers record (Chrome webm/opus, Firefox ogg/opus, Safari mp4/aac) plus wav, as Vertex names them. */
const VERTEX_MIME: Readonly<Record<string, string>> = {
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/opus',
  'audio/mp4': 'audio/mp4',
  'audio/aac': 'audio/aac',
  'audio/m4a': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
};

const INSTRUCTION =
  'Transcribe the speech in this audio verbatim, in the language spoken. ' +
  'Reply with only the words spoken: no commentary, labels, timestamps, speaker names ' +
  'or descriptions of sounds. If there is no speech, reply with nothing at all.';

/** A lone bracketed note such as "[silence]" is the model describing the audio, not words. */
const BRACKETED_NOTE = /^\[[^\]]*\]$/;

interface Part {
  text?: string;
  thought?: boolean;
}

interface AudioModel {
  generateContent: (params: {
    contents: Array<{
      role: string;
      parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    }>;
    generationConfig?: Record<string, unknown>;
  }) => Promise<{ response: { candidates?: Array<{ content?: { parts?: Part[] } }> } }>;
}

interface AudioClient {
  getGenerativeModel: (params: { model: string }, options?: { timeout?: number }) => AudioModel;
}

let client: Promise<AudioClient> | null = null;

async function getClient(): Promise<AudioClient> {
  client ??= import('@google-cloud/vertexai')
    .then(({ VertexAI }) => {
      const project =
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT_ID ||
        'johnb-2025';
      const options = vertexOptions(project, process.env.VERTEX_AI_LOCATION || undefined);
      return new VertexAI(options) as unknown as AudioClient;
    })
    .catch((error: unknown) => {
      // Not cached, so the next journal can try again; the caller logs it.
      client = null;
      throw error;
    });
  return client;
}

/** The base type Vertex accepts for `mimeType` ("audio/webm;codecs=opus" -> "audio/webm"), or null. */
export function vertexAudioMime(mimeType: string): string | null {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return VERTEX_MIME[base] ?? null;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Vertex transcription timed out after ${ms} ms`)),
      ms
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The words spoken in `audio`: '' when there is no speech, null when it could
 * not be transcribed (too big, unsupported type, timeout or a Vertex error).
 */
export async function transcribeWithVertex(
  audio: Buffer,
  mimeType: string
): Promise<string | null> {
  const mime = vertexAudioMime(mimeType);
  if (!mime) {
    log.warn({ mimeType }, 'Vertex transcription skipped: unsupported audio type');
    return null;
  }
  if (audio.byteLength === 0 || audio.byteLength > MAX_TRANSCRIBE_BYTES) {
    log.warn(
      { bytes: audio.byteLength, maxBytes: MAX_TRANSCRIBE_BYTES },
      'Vertex transcription skipped: audio empty or too large'
    );
    return null;
  }

  const model = getExtractionModel();
  const started = Date.now();
  try {
    const vertex = await getClient();
    const thinking = minimalThinkingFor(model);
    const result = await withTimeout(
      vertex.getGenerativeModel({ model }, { timeout: TRANSCRIBE_TIMEOUT_MS }).generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mime, data: audio.toString('base64') } },
              { text: INSTRUCTION },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      }),
      TRANSCRIBE_TIMEOUT_MS
    );
    const text = (result.response?.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const transcript = BRACKETED_NOTE.test(text) ? '' : text;
    log.info(
      {
        model,
        mimeType: mime,
        bytes: audio.byteLength,
        chars: transcript.length,
        ms: Date.now() - started,
      },
      'Vertex transcription complete'
    );
    return transcript;
  } catch (error) {
    log.error(
      {
        error: String(error),
        model,
        mimeType: mime,
        bytes: audio.byteLength,
        ms: Date.now() - started,
      },
      'Vertex transcription failed'
    );
    return null;
  }
}

/** transcribeWithVertex when JOURNAL_TRANSCRIBE_VERTEX is on; null, with no call, when it is off. */
export async function vertexJournalFallback(
  audio: ArrayBuffer,
  mimeType: string,
  env: Env = process.env
): Promise<string | null> {
  if (!flagOn('JOURNAL_TRANSCRIBE_VERTEX', env)) return null;
  return transcribeWithVertex(Buffer.from(audio), mimeType);
}
