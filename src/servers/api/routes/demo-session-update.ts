/**
 * POST /demo-session-update: write the conversation into a landing-page demo.
 *
 * It used to take only a `room_name`, so anyone who knew or guessed one could
 * overwrite that demo's conversation, and the overwrite then followed the demo
 * into the account that claimed it. A write now has to carry the demo's
 * `claim_token`: the random secret /demo-token hands only to whoever started
 * that demo, and the same proof /demo-claim takes. It's compared in constant
 * time, an unknown room answers like a wrong token (403, so rooms can't be
 * probed), and a demo that has been claimed is closed to writes (409).
 *
 * @module servers/api/routes/demo-session-update
 */

import { timingSafeEqual } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { onBodyEnd } from '../request-failure.js';
import * as demoSessions from '../services/demo-sessions.js';

const log = createLogger({ module: 'DemoSessionUpdateRoute' });

type Conversation = Parameters<typeof demoSessions.updateDemoSessionConversation>[1];

/** Largest body read; a demo is at most a few minutes of conversation. */
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

interface UpdateBody {
  roomName?: string;
  claimToken?: string;
  conversation?: Conversation;
}

function parseBody(body: string): UpdateBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not JSON: treated like an empty body, so the caller gets a 400
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const record = parsed as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v : undefined;
  const { conversation } = record;
  return {
    roomName: str(record['room_name']),
    claimToken: str(record['claim_token']),
    conversation:
      typeof conversation === 'object' && conversation !== null && !Array.isArray(conversation)
        ? (conversation as Conversation)
        : undefined,
  };
}

/** True when `given` is the demo's claim token (constant-time). */
export function claimTokenMatches(given: string, expected: unknown): boolean {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function update(body: string, res: ServerResponse): Promise<void> {
  const { roomName, claimToken, conversation } = parseBody(body);
  if (!roomName || !conversation) {
    sendJson(res, 400, { error: 'Missing room_name or conversation data' });
    return;
  }
  if (!claimToken) {
    log.warn({ roomName }, 'SECURITY: /demo-session-update rejected, no claim_token');
    sendJson(res, 401, { error: 'claim_token required' });
    return;
  }

  const session = await demoSessions.getDemoSession(roomName);
  if (!session || !claimTokenMatches(claimToken, session.claimToken)) {
    log.warn({ roomName }, 'SECURITY: /demo-session-update rejected, claim_token does not match');
    sendJson(res, 403, { error: 'Not allowed to update this demo session' });
    return;
  }
  if (session.claimed) {
    sendJson(res, 409, { error: 'Demo session already claimed' });
    return;
  }

  const success = await demoSessions.updateDemoSessionConversation(roomName, conversation);
  if (!success) {
    sendJson(res, 404, { error: 'Demo session not found' });
    return;
  }
  sendJson(res, 200, { success: true });
}

/** Handle POST /demo-session-update. Always answers the request. Rate limit: 30/min. */
export async function handleDemoSessionUpdate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) {
    return true;
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // Answer once and stop reading; 'end' never comes after destroy()
        tooLarge = true;
        chunks.length = 0;
        sendJson(res, 413, { error: 'Request body too large' });
        req.destroy();
        resolve(true);
        return;
      }
      chunks.push(chunk);
    });

    req.on('error', (err) => {
      if (tooLarge) return; // already answered 413
      log.error({ error: err.message }, 'Request error in demo session update');
      if (!res.headersSent) sendJson(res, 500, { error: 'Request error' });
      resolve(true);
    });

    onBodyEnd(req, res, resolve, async () => {
      if (tooLarge) return;
      try {
        await update(Buffer.concat(chunks).toString('utf8'), res);
      } catch (err) {
        log.error({ error: String(err) }, 'Demo session update error');
        if (!res.headersSent) sendJson(res, 500, { error: 'Failed to update demo session' });
      }
      resolve(true);
    });
  });
}
