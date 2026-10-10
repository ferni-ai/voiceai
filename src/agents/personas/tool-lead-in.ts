/**
 * Say a few words before a look-up, the way a person checking their phone does.
 *
 * Live calls went silent for 2-4 s on every look-up turn: Gemini calls the tool
 * first and speaks only after the result, and a prompt asking it to talk first
 * did not change that (0 lead-ins on 2026-10-07 calls). Silence that long reads
 * as a dropped call. When a reply's first move is a look-up tool and the model
 * said nothing, this puts a short line ("Let me look.") into the stream just
 * ahead of the call. It is spoken while the tool runs, and it lands in the chat
 * history as Ferni's words, so the answer after the result follows on from it.
 *
 * Only the first reply of a turn gets one: the answer after a tool result never
 * does. TOOL_LEAD_IN=off turns it off.
 *
 * Actions the caller asked for (a timer, a reminder, music) get a short "Sure."
 * instead: they were left silent on the idea that the action is the reply, but
 * the reply only comes after the model is called again, and live they took
 * 3.2-6.1 s of silence (dev, 2026-10-09) where a person says "Sure" at once.
 * Only when the caller's words ask for something (mayNeedTool), so a tool the
 * model calls on its own mid-chat never gets one. TOOL_ACK=off turns it off.
 *
 * @module agents/personas/tool-lead-in
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

/** No "Oh"/"Ooh": the opener gate trims those, and "Oh… Oh, it's sunny" doubles. */
export const LEAD_INS = [
  'Let me look.',
  'One sec, let me check.',
  'Let me pull that up.',
  'Hang on, checking.',
] as const;

/** Tools that fetch something the caller waits on. */
const LOOKUP_TOOLS = new Set([
  'getWeather',
  'getWeatherForecast',
  'quickWeather',
  'getNews',
  'getPositiveNewsOnly',
  'getSports',
  'getCommuteTime',
  'getDirections',
  'searchWeb',
  'searchWikipedia',
  'findRestaurants',
  'searchLocalBusinesses',
  'getCalendarToday',
  'getCalendarWeek',
  'quickCalendar',
  'searchFlights',
  'searchHotels',
  'getFlightPrice',
  'searchRecipes',
  'searchBooks',
  'searchPodcasts',
]);

/** Short acks before an action the caller asked for. */
export const ACKS = ['Sure.', 'Okay.', 'Yep.', 'On it.'] as const;

/** Actions a caller asks for out loud and waits on: a timer, a reminder, music. */
const ACTION_TOOLS = new Set([
  'quickTimer',
  'setTimer',
  'cancelTimer',
  'quickAlarm',
  'setAlarm',
  'snoozeAlarm',
  'deleteAlarm',
  'setReminder',
  'cancelReminder',
  'recurringReminder',
  'locationReminder',
  'playMusic',
  'quickMusic',
  'musicControl',
  'playMusicInRoom',
  'playSonosMusic',
  'pauseSonos',
  'resumeSonos',
  'setSonosVolume',
  'setRoomVolume',
  'rememberAboutUser',
  'rememberImportantFact',
  'quickNote',
  'saveNote',
  'createCalendarEvent',
  'scheduleEventNatural',
  'scheduleCall',
]);

type Chunk = llm.ChatChunk | string | object;

interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** True when the request answers the caller's words, not a tool result. */
function isFirstReplyOfTurn(chatCtx: llm.ChatContext): boolean {
  const items = (chatCtx as unknown as { items?: ItemView[] }).items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.type === 'function_call_output') return false;
    if (item?.type === 'message' && item.role === 'user') return true;
  }
  return false;
}

/** The caller's last words, without a reminder appended after a blank line or a note. */
function callerWords(chatCtx: llm.ChatContext): string {
  const items = (chatCtx as unknown as { items?: ItemView[] }).items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.type !== 'message' || item.role !== 'user') continue;
    const text = (item.textContent ?? '').split('\n')[0];
    if (!text.startsWith(TURN_CONTEXT_HEADER)) return text;
  }
  return '';
}

/** Which line each call says next, so one call does not repeat itself. */
const nextLine = new WeakMap<object, number>();
const nextAck = new WeakMap<object, number>();

function pickLine(
  session: object,
  lines: readonly string[],
  seen: WeakMap<object, number>
): string {
  const n = seen.get(session) ?? 0;
  seen.set(session, n + 1);
  return lines[n % lines.length] ?? lines[0];
}

type LeadIn = 'lookup' | 'action' | 'none';

/**
 * What one chunk decides: undefined while nothing has been said or called yet,
 * otherwise which line, if any, goes ahead of it.
 */
function leadInBefore(chunk: Chunk, asked: boolean): LeadIn | undefined {
  if (typeof chunk === 'string') return chunk.trim() ? 'none' : undefined;
  const delta = (chunk as llm.ChatChunk | undefined)?.delta;
  if (delta?.content?.trim()) return 'none';
  const first = delta?.toolCalls?.[0];
  if (!first) return undefined;
  if (LOOKUP_TOOLS.has(first.name)) return 'lookup';
  return asked && ACTION_TOOLS.has(first.name) ? 'action' : 'none';
}

/** Wrap one reply's LLM stream; `session` keys the line rotation. */
export function withToolLeadIn(
  input: ReadableStream<Chunk>,
  request: llm.ChatContext,
  session: object,
  env: Record<string, string | undefined> = process.env
): ReadableStream<Chunk> {
  if (env.TOOL_LEAD_IN === 'off' || !isFirstReplyOfTurn(request)) return input;
  const asked = env.TOOL_ACK !== 'off' && mayNeedTool(callerWords(request));
  let decided = false;
  return new ReadableStream<Chunk>({
    async start(controller) {
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const leadIn = decided ? undefined : leadInBefore(chunk, asked);
          if (leadIn !== undefined) decided = true;
          if (leadIn === 'lookup' || leadIn === 'action') {
            const { id } = chunk as llm.ChatChunk;
            const line =
              leadIn === 'lookup'
                ? pickLine(session, LEAD_INS, nextLine)
                : pickLine(session, ACKS, nextAck);
            controller.enqueue({ id, delta: { role: 'assistant', content: `${line} ` } });
          }
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
