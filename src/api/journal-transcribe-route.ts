/**
 * POST /api/journal/transcribe: the Voice Journal panel's speech-to-text.
 *
 * Transcription costs money per call (Deepgram, Whisper or Gemini on Vertex),
 * and this route had no auth at all: with a working transcriber behind it,
 * anyone could use it as a free transcription proxy. So it now needs a signed
 * in person, is rate limited, and refuses audio over the transcriber's cap
 * while the body streams in (bounded-body.ts), before decoding it.
 *
 * Firebase anonymous sign-in is on (no-sign-up onboarding), so anyone can mint
 * a fresh uid per request. Anonymous callers are therefore limited by client
 * IP, not uid, and every caller also shares a per-IP limit, so one address
 * can't fan out across many accounts. Anonymous people can still journal.
 * IPv6 is keyed by its /64 (rate-limit-ip-key.ts), and the limits count across
 * instances, with an hourly spend ceiling (journal-transcribe-limits.ts).
 *
 * @module api/journal-transcribe-route
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { transcribeAudioBuffer } from '../services/custom-agent/memory-capture-service.js';
import { MAX_TRANSCRIBE_BYTES } from '../services/custom-agent/vertex-transcribe.js';
import { getClientIp } from '../utils/client-ip.js';
import { rateLimitIpKey } from '../utils/rate-limit-ip-key.js';
import { createLogger } from '../utils/safe-logger.js';
import { requireAuth } from './auth-middleware.js';
import { BodyTooLargeError, readJsonBodyLimited } from './bounded-body.js';
import {
  overHourlyCeiling,
  overLimit,
  PER_IP_PER_MINUTE,
  PER_PERSON_PER_MINUTE,
} from './journal-transcribe-limits.js';
import { sendJSON } from './helpers.js';

const log = createLogger({ module: 'journal-transcribe-route' });

/** Base64 length of the largest clip the transcriber accepts. */
export const MAX_AUDIO_BASE64_CHARS = Math.ceil(MAX_TRANSCRIBE_BYTES / 3) * 4;
/** Room for the JSON around the audio (mimeType, quotes, braces). */
export const MAX_BODY_BYTES = MAX_AUDIO_BASE64_CHARS + 64 * 1024;

const PLACEHOLDER = '[Transcription unavailable]';

function tooLarge(req: IncomingMessage, res: ServerResponse): true {
  // The rest of the body is never read, so close the connection once the 413 is out.
  res.setHeader('Connection', 'close');
  res.once('finish', () => req.destroy());
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

  // getClientIp trusts only the proxy hops Cloud Run adds; IPv6 is keyed by its /64.
  const ip = rateLimitIpKey(getClientIp(req));
  if (await overLimit(res, `expensive:journal-transcribe-ip:ip:${ip}`, PER_IP_PER_MINUTE)) {
    return true; // 429 already sent
  }
  // Per person: the verified uid, or the IP for an anonymous uid (minted on demand).
  const person = auth.isAnonymous ? `anon-ip:${ip}` : `user:${auth.userId}`;
  if (await overLimit(res, `expensive:journal-transcribe:${person}`, PER_PERSON_PER_MINUTE)) {
    return true; // 429 already sent
  }

  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    log.warn(
      { userId: auth.userId, bytes: declared },
      'Journal transcribe refused: body too large'
    );
    return tooLarge(req, res);
  }

  let body: { audioBase64?: string; mimeType?: string };
  try {
    body = await readJsonBodyLimited(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      log.warn(
        { userId: auth.userId, maxBytes: MAX_BODY_BYTES },
        'Journal transcribe refused: body too large'
      );
      return tooLarge(req, res);
    }
    log.warn({ error: String(error), userId: auth.userId }, 'Journal transcribe: unreadable body');
    sendJSON(res, { error: 'Invalid request body' }, 400);
    return true;
  }
  if (!body.audioBase64) {
    sendJSON(res, { error: 'Missing audioBase64 data' }, 400);
    return true;
  }
  if (body.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    log.warn(
      { userId: auth.userId, chars: body.audioBase64.length },
      'Journal transcribe refused: audio too large'
    );
    return tooLarge(req, res);
  }
  if (await overHourlyCeiling(res)) return true; // 503 already sent

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
