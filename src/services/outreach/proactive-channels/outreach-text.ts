/**
 * The words of a proactive check-in: written by Gemini (Vertex, with the
 * server's own credentials, no API key) from the reason Ferni is reaching
 * out, and nothing else. When that fails, or the result doesn't pass the
 * checks below, a prepared line is used, never the same line twice in a row.
 *
 * text_source in the outreach log says which: 'llm', 'template' (the
 * trigger's own line, e.g. "I said I'd check in about the move"), or
 * 'fallback' (a general check-in line).
 *
 * @module services/outreach/proactive-channels/outreach-text
 */

import { callLLM } from '../../llm-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

const log = createLogger({ module: 'ProactiveText' });

export type TextSource = 'llm' | 'template' | 'fallback';

const MAX_CHARS = 240;

/** General check-in lines, used in turn when nothing better can be written. */
export const FALLBACK_LINES = [
  "Hey, it's Ferni. Been thinking about you. How's your day going?",
  "Hey, it's Ferni. Just checking in. What's on your mind today?",
  "Hey, it's Ferni. How are things with you this week?",
  "Hey, it's Ferni. Anything good happen today?",
];

/** Words Ferni doesn't use about herself, and markup that means the model misfired. */
const REJECT = /\bassistant\b|\bAI\b|language model|as an a\.?i\b|[{}<>]|\bhttps?:/i;

export interface TextInput {
  trigger: Pick<ProactiveTrigger, 'kind' | 'reason' | 'text'>;
  channel: ProactiveChannel;
  /** The last check-in text they got; never sent again back to back. */
  lastText?: string;
  /** Turns the fallback lines (e.g. how many check-ins are in the log). */
  rotation: number;
}

export function promptFor(input: TextInput): string {
  const { trigger, channel } = input;
  const general = trigger.kind === 'planned_checkin';
  const why = general
    ? "a regular check-in. There's no specific news, so don't pretend there is."
    : `${trigger.reason}.`;
  return [
    `You are Ferni, writing a short ${channel === 'sms' ? 'text message' : 'note in their app'} to a friend you check in on.`,
    `Why you're reaching out: ${why}`,
    'Write one or two short sentences, under 160 characters, warm and casual.',
    "Mention only what's in the reason. Don't invent details, plans, or feelings they haven't shared.",
    channel === 'sms' ? 'Start with "Hey, it\'s Ferni."' : '',
    'End with an easy question they can answer in a few words.',
    'No emoji, hashtags, or quotation marks. Never call yourself an assistant or an AI.',
    'Reply with the message only.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** The model's reply cleaned up, or null when it can't be sent as-is. */
export function acceptable(raw: string | null, lastText?: string): string | null {
  const text = (raw ?? '')
    .trim()
    .replace(/^["'“]+|["'”]+$/g, '')
    .replace(/\s+/g, ' ');
  if (!text || text.length > MAX_CHARS || REJECT.test(text)) return null;
  return text === lastText ? null : text;
}

function fallback(input: TextInput): { text: string; source: TextSource } {
  if (input.trigger.kind !== 'planned_checkin' && input.trigger.text !== input.lastText) {
    return { text: input.trigger.text, source: 'template' };
  }
  const n = FALLBACK_LINES.length;
  for (let i = 0; i < n; i++) {
    const line = FALLBACK_LINES[(input.rotation + i) % n];
    if (line !== input.lastText) return { text: line, source: 'fallback' };
  }
  return { text: FALLBACK_LINES[0], source: 'fallback' };
}

export async function writeOutreachText(
  input: TextInput
): Promise<{ text: string; source: TextSource }> {
  try {
    const raw = await callLLM(promptFor(input), {
      maxTokens: 120,
      temperature: 0.8,
      timeout: 8000,
    });
    const text = acceptable(raw, input.lastText);
    if (text) return { text, source: 'llm' };
    log.info(
      { kind: input.trigger.kind },
      'Generated check-in text not usable; using a prepared line'
    );
  } catch (error) {
    log.warn({ error: String(error) }, 'Check-in text generation failed');
  }
  return fallback(input);
}
