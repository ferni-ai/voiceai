/**
 * Why is the reply model's first request of a call slow? Separates a cold
 * client (first request on a new google.LLM: auth token + connection) from a
 * cold prompt cache (a system prompt + tools Gemini has not seen yet).
 *
 * Per trial, with a fresh prompt prefix P and P' (a nonce defeats caching
 * across trials):
 *   cold        new client A, P   (both cold: a call's first turn)
 *   warm        client A, P again (both warm: a later turn)
 *   newClient   new client B, P   (cold client, cached prompt)
 *   newPrompt   client A, P'      (warm client, uncached prompt)
 *
 * Usage: GOOGLE_CLOUD_PROJECT=... npx tsx scripts/llm-cold-probe.ts [trials] [model...]
 * Prints one JSON line per request, then medians.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { initializeLogger, llm } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import {
  buildCascadeLLMOptions,
  cascadeThinking,
} from '../src/agents/model-provider/cartesia-cascade.js';

const trials = Number(process.argv[2] ?? 6);
const models = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

const dir = 'src/personas/bundles/ferni/identity';
const persona = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n\n')
  .slice(0, 24_000); // with the tools, ~10k prompt tokens like a dev turn 1 (9.8k)

/** ~150 tools with Ferni-sized descriptions; names and text vary so they are not trivially cacheable. */
function tools(): llm.ToolContext {
  const ctx: llm.ToolContext = {};
  for (let i = 0; i < 150; i++) {
    ctx[`tool_${i}`] = llm.tool({
      description: `Helper ${i}: ${persona.slice(i * 100, i * 100 + 90).replace(/\s+/g, ' ')}`,
      parameters: z.object({
        query: z.string().describe('What the caller asked for'),
        when: z.string().optional().describe('When, in the caller words'),
        count: z.number().optional(),
      }),
      execute: async () => 'ok',
    });
  }
  return ctx;
}

function client(model: string): llm.LLM {
  const main = buildCascadeLLMOptions(process.env, 0.8);
  return new google.LLM({ ...main, model, thinkingConfig: cascadeThinking(model) });
}

async function ask(
  model: llm.LLM,
  prefix: string,
  toolCtx: llm.ToolContext
): Promise<{ firstTextMs: number | null; cached: number; prompt: number }> {
  const chatCtx = llm.ChatContext.empty();
  chatCtx.addMessage({ role: 'system', content: `${prefix}\n\n${persona}` });
  chatCtx.addMessage({ role: 'assistant', content: 'hey.' });
  chatCtx.addMessage({ role: 'user', content: "Hey Ferni, it's been kind of a long day." });
  const started = performance.now();
  let firstTextMs: number | null = null;
  let cached = 0;
  let prompt = 0;
  const stream = model.chat({
    chatCtx,
    toolCtx,
    connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 15_000 },
  });
  for await (const chunk of stream) {
    if (firstTextMs === null && (chunk.delta?.content?.trim() || chunk.delta?.toolCalls?.length)) {
      firstTextMs = Math.round(performance.now() - started);
    }
    if (chunk.usage) {
      cached = chunk.usage.promptCachedTokens;
      prompt = chunk.usage.promptTokens;
    }
  }
  return { firstTextMs, cached, prompt };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};

async function main(): Promise<void> {
  initializeLogger({ pretty: false, level: 'warn' });
  const toolCtx = tools();
  const results: Record<string, number[]> = {};
  for (let t = 0; t < trials; t++) {
    for (const name of models) {
      const nonce = `[session ${Date.now()}-${t}-${Math.random()}]`;
      const a = client(name);
      const runs: Array<[string, llm.LLM, string]> = [
        ['cold', a, nonce],
        ['warm', a, nonce],
        ['newClient', client(name), nonce],
        ['newPrompt', a, `${nonce}*`],
      ];
      for (const [cond, model, prefix] of runs) {
        const r = await ask(model, prefix, toolCtx);
        console.log(JSON.stringify({ trial: t, model: name, cond, ...r }));
        if (r.firstTextMs !== null) (results[`${name} ${cond}`] ??= []).push(r.firstTextMs);
      }
    }
  }
  for (const [k, v] of Object.entries(results))
    console.log(`${k}: median ${median(v)} ms (n=${v.length})`);
}

void main();
