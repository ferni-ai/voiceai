/**
 * POST /api/journal/twin-response: the Digital Twin's reply to the person's own words, from
 * their twin profile and journal (twin-reply.ts). Signed in only: it is not an open LLM endpoint.
 *
 * @module api/journal-twin-route
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { readTypedMessageForCrisis } from '../agents/personas/crisis-gate-text.js';
import { generateTwinResponse, hasTwinProfile } from '../services/custom-agent/twin-reply.js';
import { withOwnTwin, type TwinRequestBody } from '../services/custom-agent/twin-request.js';
import { getLogger } from '../utils/safe-logger.js';
import { parseBody, sendJSON } from './helpers.js';
import { requireAuth } from './auth-middleware.js';

const log = getLogger();

/** The status-first form journal-routes.ts uses. */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

/** POST /api/journal/twin-response - Generate response from Digital Twin */
export async function handleJournalTwinResponse(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const auth = await requireAuth(req, res); // SECURITY: not an open LLM endpoint
  if (!auth) return true;
  const sent = await parseBody<TwinRequestBody>(req);
  // The voice turn's crisis gate, before the twin or the journal is read or the model asked.
  // The twin keeps no conversation, so the message is read on its own.
  const crisis =
    typeof sent?.userMessage === 'string'
      ? await readTypedMessageForCrisis(sent.userMessage)
      : null;
  if (crisis?.action === 'replace') {
    sendJson(res, 200, { response: crisis.reply, crisis: true });
    return true;
  }
  // The Chronicle sends no profile: it is built from the caller's own twin
  const body = await withOwnTwin(auth.userId, sent);

  if (!body.userMessage || !hasTwinProfile(body.profile)) {
    sendJson(res, 400, { error: body.userMessage ? 'Missing profile' : 'Missing userMessage' });
    return true;
  }
  try {
    const response = await generateTwinResponse({
      userMessage: crisis?.message ?? body.userMessage,
      profile: body.profile,
      relevantJournals: body.relevantJournals ?? [],
      keyThemes: body.keyThemes ?? [],
    });
    if (!response) {
      sendJson(res, 503, { error: 'Twin response unavailable' });
      return true;
    }
    sendJson(res, 200, { response });
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'Twin response generation failed');
    sendJson(res, 500, { error: 'Failed to generate response' });
    return true;
  }
}
