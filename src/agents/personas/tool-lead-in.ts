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
 * does. Instant tools (music, handoffs, memory, timers) get none, because the
 * action itself is the reply. TOOL_LEAD_IN=off turns it off.
 *
 * @module agents/personas/tool-lead-in
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

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

type Chunk = llm.ChatChunk | string | object;

interface ItemView {
  type?: string;
  role?: string;
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

/** Which line each call says next, so one call does not repeat itself. */
const nextLine = new WeakMap<object, number>();

function pickLine(session: object): string {
  const n = nextLine.get(session) ?? 0;
  nextLine.set(session, n + 1);
  return LEAD_INS[n % LEAD_INS.length] ?? LEAD_INS[0];
}

/**
 * What one chunk decides: undefined while nothing has been said or called yet,
 * otherwise whether a lead-in goes ahead of it.
 */
function leadInBefore(chunk: Chunk): boolean | undefined {
  if (typeof chunk === 'string') return chunk.trim() ? false : undefined;
  const delta = (chunk as llm.ChatChunk | undefined)?.delta;
  if (delta?.content?.trim()) return false;
  const first = delta?.toolCalls?.[0];
  return first ? LOOKUP_TOOLS.has(first.name) : undefined;
}

/** Wrap one reply's LLM stream; `session` keys the line rotation. */
export function withToolLeadIn(
  input: ReadableStream<Chunk>,
  request: llm.ChatContext,
  session: object,
  env: Record<string, string | undefined> = process.env
): ReadableStream<Chunk> {
  if (env.TOOL_LEAD_IN === 'off' || !isFirstReplyOfTurn(request)) return input;
  let decided = false;
  return new ReadableStream<Chunk>({
    async start(controller) {
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const leadIn = decided ? undefined : leadInBefore(chunk);
          if (leadIn !== undefined) decided = true;
          if (leadIn === true) {
            const { id } = chunk as llm.ChatChunk;
            controller.enqueue({
              id,
              delta: { role: 'assistant', content: `${pickLine(session)} ` },
            });
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
