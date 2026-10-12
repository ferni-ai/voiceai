/**
 * Moments the voice agent sends as `ferni_moment` data messages.
 *
 * `kind: 'remembered'`: Ferni just stored something the caller told him
 * (rememberAboutUser, sent by src/tools/domains/memory/remember-moment.ts
 * only after the store succeeded and only with REMEMBER_MOMENT=on on the
 * agent). The Moments pill shows "I'll remember: <summary>". The agent
 * already keeps the summary short and leaves out forgotten topics, emails,
 * links and long numbers; this side only refuses anything that isn't a short
 * plain string.
 *
 * @module app/moment-messages
 */

import { t } from '../i18n/index.js';
import type { DataMessage } from '../types/events.js';
import { moments } from '../ui/moments/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MomentMessages');

export const MOMENT_MESSAGE_TYPE = 'ferni_moment';
/** The agent sends at most 60 characters; anything much longer is not from it. */
const MAX_SUMMARY_CHARS = 80;

/** The pill's text for a moment message, or null when there's nothing to show. */
export function momentText(message: DataMessage): string | null {
  if (message['kind'] !== 'remembered') return null;
  const raw = message['summary'];
  if (typeof raw !== 'string') return null;
  const summary = raw.replace(/\s+/g, ' ').trim();
  if (!summary || summary.length > MAX_SUMMARY_CHARS) return null;
  return t('moments.remembered', { summary });
}

/**
 * Show a moment from the agent.
 * @returns true when the message was a moment (and is consumed)
 */
export function handleMomentMessage(message: DataMessage): boolean {
  if (message.type !== MOMENT_MESSAGE_TYPE) return false;
  const text = momentText(message);
  if (text) moments.whisper(text, { type: 'info' });
  else log.debug({ kind: message['kind'] }, 'Moment not shown');
  return true;
}
