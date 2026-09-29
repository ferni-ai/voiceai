/**
 * Group call Twilio webhooks (no user auth; Twilio signature required).
 *
 * Mounted before the engagement routes, which own the `/api/group` prefix and
 * answered Twilio's unauthenticated callbacks with 401.
 *
 * - GET|POST /api/group/call/answer  → TwiML bridging the callee into the LiveKit room
 * - POST     /api/group/call/status  → call status callback (acknowledged + logged)
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { generateAnswerTwiml } from '../agents/group-conversation/conference-call-manager.js';
import { createLogger } from '../utils/safe-logger.js';
import { readSignedTwilioParams } from './webhook-signatures.js';

const log = createLogger({ module: 'group-call-webhooks' });

const ANSWER_PATH = '/api/group/call/answer';
const STATUS_PATH = '/api/group/call/status';

function forbidden(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('Forbidden');
}

/**
 * @returns true when the request was a group-call webhook and has been answered
 */
export async function handleGroupCallWebhooks(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const isAnswer = pathname === ANSWER_PATH && (req.method === 'GET' || req.method === 'POST');
  const isStatus = pathname === STATUS_PATH && req.method === 'POST';
  if (!isAnswer && !isStatus) return false;

  const params = await readSignedTwilioParams(req);
  if (!params) {
    forbidden(res);
    return true;
  }

  if (isStatus) {
    log.info({ callSid: params.CallSid, status: params.CallStatus }, 'Group call status update');
    res.writeHead(204);
    res.end();
    return true;
  }

  const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const twiml = generateAnswerTwiml({
    roomName: query.get('roomName') || 'default',
    sipDomain: process.env.SIP_DOMAIN ?? 'sip.livekit.cloud',
    name: query.get('name') || 'Guest',
    introduction: query.get('intro') || undefined,
  });
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml);
  return true;
}
