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
 * Later turns' requests leave it out (withoutPastLeadIns): there it taught the
 * model to announce actions instead of calling tools.
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
 * TOOL_ACK_WIDE=on covers the tools the dead-air audit found uncovered (real
 * prod, 2026-10-15 to 10-22: covered tool turns had a 1.5 s median gap,
 * uncovered ones ~3.1 s; callOnBehalf alone was 16 of 110 gaps over 2.5 s).
 * marketData and the contact look-ups get a lead-in, only when the caller asked
 * and never on a grave call ("Let me pull that up." after "my brother passed
 * away" is the worst sound Ferni can make). Calls and contact changes
 * get "On it." only, when the caller asked: callOnBehalf first reads the number back
 * for a yes, so no word that sounds done ("Okay." / "Yep.") goes ahead of it.
 *
 * @module agents/personas/tool-lead-in
 */

import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { flagOn } from '../../config/env-flag.js';
import { callIsGrave, sessionIsGrave } from '../integrations/presence-heavy.js';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { afterBridge, EXTRA_LOOKUP_TOOLS, lookupBridgeOn } from './lookup-bridge.js';

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

/** TOOL_ACK_WIDE: look-ups the audit found silent. */
const WIDE_LOOKUP_TOOLS = new Set([
  'marketData',
  'getContactInfo',
  'searchContacts',
  'getContactInsights',
  'getContactsNeedingAttention',
  'getContactInteractionHistory',
  'getContactStats',
]);

/** TOOL_ACK_WIDE: actions with side effects; "On it." only, never a word that sounds done. */
const WIDE_ACTION_TOOLS = new Set([
  'callOnBehalf',
  'callAndConverse',
  'callUser',
  'manageContact',
  'saveContact',
  'saveContactInfo',
  'recordContactInteraction',
  'setContactFollowUp',
  'completeContactFollowUp',
]);

export const ON_IT = 'On it.';

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

type LeadIn = 'lookup' | 'action' | 'underway' | 'none';

/**
 * What one chunk decides: undefined while nothing has been said or called yet,
 * otherwise which line, if any, goes ahead of it.
 */
function leadInBefore(
  chunk: Chunk,
  asked: boolean,
  extra: boolean,
  wider: { lookups: boolean; actions: boolean }
): LeadIn | undefined {
  if (typeof chunk === 'string') return chunk.trim() ? 'none' : undefined;
  const delta = (chunk as llm.ChatChunk | undefined)?.delta;
  if (delta?.content?.trim()) return 'none';
  const first = delta?.toolCalls?.[0];
  if (!first) return undefined;
  if (
    LOOKUP_TOOLS.has(first.name) ||
    (extra && EXTRA_LOOKUP_TOOLS.has(first.name)) ||
    (wider.lookups && WIDE_LOOKUP_TOOLS.has(first.name))
  ) {
    return 'lookup';
  }
  if (asked && ACTION_TOOLS.has(first.name)) return 'action';
  return asked && wider.actions && WIDE_ACTION_TOOLS.has(first.name) ? 'underway' : 'none';
}

/** The words left once one of `lines` opening `text` is cut, or undefined if none opens it. */
function afterLine(text: string, lines: readonly string[]): string | undefined {
  const t = text.trim();
  const line = lines.find((l) => t === l || t.startsWith(`${l} `));
  return line === undefined ? undefined : t.slice(line.length).trim();
}

/**
 * The words left once a lead-in (or an ack right ahead of a tool call) is cut.
 * An ack is cut only before a call: "Sure." is also a word the model says.
 */
function afterLeadIn(text: string, beforeCall: boolean): string | undefined {
  return afterLine(text, LEAD_INS) ?? (beforeCall ? afterLine(text, ACKS) : undefined);
}

/**
 * The request without the lead-ins of earlier turns: a lead-in line in an
 * assistant message before the caller's latest message is cut.
 *
 * In history, "Hang on, checking." reads as Ferni announcing an action in
 * words, and the model copied that on the next action: asked for a timer after
 * a weather look-up, it said "I've got that timer set" without calling the tool.
 * Replaying the same captured requests (2026-10-09), the timer tool was called
 * on 87 of 130 replies with the earlier lead-in and 130 of 130 without it.
 * This turn's own lead-in comes after the caller's words, so the answer after
 * the tool result still sees it and follows on from it. The session's history
 * is untouched; only the request changes. The action acks ("Sure.") land in
 * history the same way, just ahead of the timer call, so they are cut too.
 */
export function withoutPastLeadIns(
  chatCtx: llm.ChatContext,
  env: Record<string, string | undefined> = process.env
): llm.ChatContext {
  const bridges = lookupBridgeOn(env);
  const items = chatCtx.items;
  let lastUser = -1;
  for (let i = items.length - 1; i >= 0 && lastUser < 0; i--) {
    const item = items[i];
    if (item?.type === 'message' && item.role === 'user') lastUser = i;
  }
  let changed = false;
  const kept = items.flatMap((item, i) => {
    if (i > lastUser || item.type !== 'message' || item.role !== 'assistant') return [item];
    const text = item.textContent ?? '';
    // LOOKUP_BRIDGE: "Okay, got it." opening an answer after a tool result (lookup-bridge.ts).
    const rest =
      afterLeadIn(text, items[i + 1]?.type === 'function_call') ??
      (bridges ? afterBridge(text, items[i - 1]?.type === 'function_call_output') : undefined);
    if (rest === undefined) return [item];
    changed = true;
    if (!rest) return [];
    return [
      llm.ChatMessage.create({
        id: item.id,
        role: item.role,
        content: rest,
        interrupted: item.interrupted,
        createdAt: item.createdAt,
        extra: item.extra,
      }),
    ];
  });
  if (!changed) return chatCtx;
  const ctx = chatCtx.copy();
  ctx.items = kept;
  return ctx;
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
  const extra = lookupBridgeOn(env);
  const wide = flagOn('TOOL_ACK_WIDE', env);
  // The caller's words now and the call's last few turns (this turn may not be in history yet).
  const grave = (): boolean =>
    sessionIsGrave(session) || callIsGrave(undefined, [callerWords(request)]);
  const wider = { lookups: wide && asked && !grave(), actions: wide };
  let decided = false;
  return new ReadableStream<Chunk>({
    async start(controller) {
      try {
        for await (const chunk of input as unknown as AsyncIterable<Chunk>) {
          const leadIn = decided ? undefined : leadInBefore(chunk, asked, extra, wider);
          if (leadIn !== undefined) decided = true;
          if (leadIn !== undefined && leadIn !== 'none') {
            const { id } = chunk as llm.ChatChunk;
            const line =
              leadIn === 'lookup'
                ? pickLine(session, LEAD_INS, nextLine)
                : leadIn === 'action'
                  ? pickLine(session, ACKS, nextAck)
                  : ON_IT;
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
