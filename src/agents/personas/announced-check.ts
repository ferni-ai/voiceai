/**
 * Measures replies that announce a look-up and then make no tool call.
 *
 * Prod call 2026-10-17: asked for the weather, a teammate said "I'll check the
 * current weather for <city> right now." and called no tool. Ten seconds later
 * it said "about seventy-four degrees and clear", still with no tool call (the
 * reading cached at call start was 81.7°F). Saying it would check, then
 * answering from nothing, is how made-up live data sounds true.
 *
 * Every reply the model writes passes through here untouched (ferni-agent.ts
 * llmNode, by way of action-claim-guard.ts). When the reply's words announce a
 * check ("I'll check", "let me look that up") and the same reply calls no
 * tool, one ANNOUNCED_CHECK_NO_TOOL line is logged: how many tools were open
 * and whether a live-data tool was among them, never the words.
 * ANNOUNCED_CHECK_LOG=off turns the log off.
 *
 * @module agents/personas/announced-check
 */
import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'AnnouncedCheck' });

type Chunk = llm.ChatChunk | string | object;

export function announcedCheckLogEnabled(env: Env = process.env): boolean {
  return flagOn('ANNOUNCED_CHECK_LOG', env);
}

/** "I'll check", "let me look that up", "checking now", "give me a sec to pull it up". */
const ANNOUNCES =
  /\b(?:i'll|i will|let me|lemme|i'm going to|i'm gonna|i am going to|gonna)\s+(?:just\s+|quickly\s+|go\s+|quick\s+)?(?:check(?!\s+(?:in|back|on you)\b)|look(?:\s+(?:that|it|this|those))?\s+up|look into|pull(?:\s+(?:that|it|this|up))|find out|search|grab (?:the|that|it)|see what)\b|\bchecking (?:on |that |it |the |now|right now)|\bone (?:sec|second|moment),? (?:let me|i'll)\b/i;

/** Curly apostrophes from the model read as straight ones. */
export function announcesCheck(text: string): boolean {
  return ANNOUNCES.test(text.replace(/[‘’]/g, "'"));
}

function textOf(chunk: Chunk): string {
  if (typeof chunk === 'string') return chunk;
  const delta = (chunk as Partial<llm.ChatChunk> | null)?.delta;
  return delta?.content ?? '';
}

function callsTool(chunk: Chunk): boolean {
  if (typeof chunk !== 'object' || chunk === null) return false;
  const calls = (chunk as { delta?: { toolCalls?: unknown[] } }).delta?.toolCalls;
  return (calls?.length ?? 0) > 0;
}

/** Tools that fetch live data, to tell "had no tool for it" from "had one and didn't call it". */
const LIVE_DATA_TOOLS = new Set([
  'getWeather',
  'getWeatherForecast',
  'getNews',
  'getSports',
  'searchWeb',
  'getCurrentContext',
  'findTools',
]);

/** Enough of a reply to find an announcement; replies are a few sentences. */
const MAX_CHARS = 2000;

/**
 * The model's reply, passed through unchanged. At its end, one log line when
 * it announced a check and called no tool.
 */
export async function withAnnouncedCheckLog<T>(
  reply: Promise<T> | T,
  tools: { functionTools?: Record<string, unknown> },
  env: Env = process.env
): Promise<T> {
  const stream = await reply;
  if (stream === null || stream === undefined || !announcedCheckLogEnabled(env)) return stream;
  const names = Object.keys(tools.functionTools ?? {});
  const context = {
    toolsOpen: names.length,
    liveDataToolOpen: names.some((name) => LIVE_DATA_TOOLS.has(name)),
  };
  const reader = (stream as unknown as ReadableStream<Chunk>).getReader();
  const tapped = new ReadableStream<Chunk>({
    async start(controller) {
      let text = '';
      let toolCalled = false;
      try {
        for (let next = await reader.read(); !next.done; next = await reader.read()) {
          const chunk = next.value;
          if (callsTool(chunk)) toolCalled = true;
          else if (text.length < MAX_CHARS) text += textOf(chunk);
          controller.enqueue(chunk);
        }
        if (!toolCalled && announcesCheck(text)) {
          log.warn(context, 'ANNOUNCED_CHECK_NO_TOOL');
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch((error: unknown) => {
        log.debug({ error: String(error) }, 'reply cancel after the announced-check tap failed');
      });
    },
  });
  return tapped as unknown as T;
}
