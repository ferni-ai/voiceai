/**
 * POST /api/journal/transcribe: the Voice Journal panel's speech-to-text.
 *
 * Transcription costs money per call (Deepgram, Whisper or Gemini on Vertex),
 * and this route had no auth at all: with a working transcriber behind it,
 * anyone could use it as a free transcription proxy. So it now needs a signed
 * in person, is rate limited per person on the expensive tier, and refuses
 * audio over the transcriber's cap before reading or decoding it.
 *
 * @module api/journal-transcribe-route
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { transcribeAudioBuffer } from '../services/custom-agent/memory-capture-service.js';
import { MAX_TRANSCRIBE_BYTES } from '../services/custom-agent/vertex-transcribe.js';
import { createLogger } from '../utils/safe-logger.js';
import { RATE_LIMIT_TIERS, rateLimit, requireAuth } from './auth-middleware.js';
import { parseBody, sendJSON } from './helpers.js';

const log = createLogger({ module: 'journal-transcribe-route' });

/** Base64 length of the largest clip the transcriber accepts. */
export const MAX_AUDIO_BASE64_CHARS = Math.ceil(MAX_TRANSCRIBE_BYTES / 3) * 4;
/** Room for the JSON around the audio (mimeType, quotes, braces). */
const MAX_BODY_BYTES = MAX_AUDIO_BASE64_CHARS + 64 * 1024;

const PLACEHOLDER = '[Transcription unavailable]';

function tooLarge(res: ServerResponse): true {
  sendJSON(res, { error: 'Audio too large', maxBytes: MAX_TRANSCRIBE_BYTES, transcript: '' }, 413);
  return true;
}

/** Handles the route; always returns true (a response has been sent). */
export async function handleJournalTranscribe(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent

  // The expensive tier (10 a minute), keyed by the verified uid, never an IP or a body field.
  const limited = rateLimit(req, res, {
    tier: RATE_LIMIT_TIERS.expensive,
    keyPrefix: 'expensive:journal-transcribe',
    keyGenerator: () => `user:${auth.userId}`,
  });
  if (limited) return true; // 429 already sent

  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    log.warn(
      { userId: auth.userId, bytes: declared },
      'Journal transcribe refused: body too large'
    );
    return tooLarge(res);
  }

  const body = await parseBody<{ audioBase64?: string; mimeType?: string }>(req);
  if (!body.audioBase64) {
    sendJSON(res, { error: 'Missing audioBase64 data' }, 400);
    return true;
  }
  if (body.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    log.warn(
      { userId: auth.userId, chars: body.audioBase64.length },
      'Journal transcribe refused: audio too large'
    );
    return tooLarge(res);
  }

  try {
    const nodeBuffer = Buffer.from(body.audioBase64, 'base64');
    const audioBuffer = nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength
    ) as ArrayBuffer;
    const mimeType = body.mimeType || 'audio/webm';

    log.debug({ bufferSize: audioBuffer.byteLength, mimeType }, 'Transcribing journal audio');
    const transcript = await transcribeAudioBuffer(audioBuffer, mimeType);

    sendJSON(res, { transcript, success: transcript !== PLACEHOLDER }, 200);
    return true;
  } catch (error) {
    log.error({ error: String(error), userId: auth.userId }, 'Transcription failed');
    sendJSON(res, { error: 'Transcription failed', transcript: '' }, 500);
    return true;
  }
}
