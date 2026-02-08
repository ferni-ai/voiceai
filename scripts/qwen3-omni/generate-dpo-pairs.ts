#!/usr/bin/env npx tsx
/**
 * Generate DPO (Direct Preference Optimization) pairs from SFT JSONL.
 *
 * Reads ferni-coaching-sft.jsonl, and for each (user, assistant) pair,
 * uses an LLM to generate a "rejected" (flat, corporate) version of the
 * assistant response. Outputs MS-Swift DPO JSONL.
 *
 * Usage:
 *   npx tsx scripts/qwen3-omni/generate-dpo-pairs.ts [--input path] [--out path] [--max N]
 *
 * Environment:
 *   OPENAI_API_KEY or Vertex AI (GOOGLE_CLOUD_PROJECT) for LLM calls.
 */

import { createReadStream, createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createInterface } from 'readline';
import { callLLM } from '../../src/services/llm-utils.js';
import { createLogger } from '../../src/utils/safe-logger.js';

const log = createLogger({ module: 'qwen3-omni-generate-dpo-pairs' });

const FLAT_REWRITE_PROMPT = `Rewrite this AI life coach response to sound flat, corporate, and generic. Keep the same factual content but remove warmth, personality, and emotional connection. Use neutral, formal language. Output only the rewritten response, no preamble.

Response to rewrite:
`;

const DEFAULT_INPUT = 'scripts/qwen3-omni/data/ferni-coaching-sft.jsonl';
const DEFAULT_OUTPUT = 'scripts/qwen3-omni/data/ferni-coaching-dpo.jsonl';
const DEFAULT_MAX = 1000;
const BATCH_DELAY_MS = 200;

interface SFTExample {
  messages: Array<{ role: string; content: string }>;
}

/**
 * MS-Swift DPO format:
 *   messages: [{role:'system', content:...}, {role:'user', content:...}, {role:'assistant', content:CHOSEN}]
 *   rejected_response: string  (the dispreferred response)
 * See: https://swift.readthedocs.io/en/latest/Customization/Custom-dataset.html
 */
interface DPOExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  rejected_response: string;
}

function parseArgs(): { input: string; output: string; max: number } {
  const args = process.argv.slice(2);
  let input = DEFAULT_INPUT;
  let output = DEFAULT_OUTPUT;
  let max = DEFAULT_MAX;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--input' || args[i] === '-i') && args[i + 1]) {
      input = args[i + 1]!;
      i++;
    } else if ((args[i] === '--out' || args[i] === '-o') && args[i + 1]) {
      output = args[i + 1]!;
      i++;
    } else if ((args[i] === '--max' || args[i] === '-n') && args[i + 1]) {
      max = parseInt(args[i + 1]!, 10) || DEFAULT_MAX;
      i++;
    }
  }

  return { input, output, max };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateRejected(chosen: string): Promise<string> {
  const prompt = FLAT_REWRITE_PROMPT + chosen;
  const result = await callLLM(prompt, {
    maxTokens: 1024,
    temperature: 0.5,
    timeout: 15000,
  });
  const trimmed = (result ?? '').trim();
  if (!trimmed || trimmed === chosen) {
    throw new Error('LLM failed to generate distinct rejected response');
  }
  return trimmed;
}

async function main(): Promise<void> {
  const { input, output, max } = parseArgs();

  await mkdir(dirname(output), { recursive: true });
  const rl = createInterface({
    input: createReadStream(input, { encoding: 'utf-8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  const stream = createWriteStream(output, { flags: 'w' });

  let count = 0;
  let skipped = 0;
  let errors = 0;

  for await (const line of rl) {
    if (count >= max) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let example: SFTExample;
    try {
      example = JSON.parse(trimmed) as SFTExample;
    } catch {
      skipped++;
      continue;
    }

    const userMsg = example.messages?.find((m) => m.role === 'user');
    const assistantMsg = example.messages?.find((m) => m.role === 'assistant');
    if (!userMsg?.content || !assistantMsg?.content) {
      skipped++;
      continue;
    }

    const chosen = assistantMsg.content;
    let rejected: string;
    try {
      rejected = await generateRejected(chosen);
      await sleep(BATCH_DELAY_MS);
    } catch (err) {
      log.warn({ error: String(err) }, 'LLM call failed, using chosen as rejected');
      rejected = chosen;
      errors++;
    }

    const dpo: DPOExample = {
      messages: [
        { role: 'user', content: userMsg.content },
        { role: 'assistant', content: chosen },
      ],
      rejected_response: rejected,
    };
    stream.write(JSON.stringify(dpo) + '\n');
    count++;
  }

  stream.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  log.info({ count, skipped, errors, input, output }, 'DPO pair generation complete');
}

main().catch((err) => {
  log.error({ error: String(err) }, 'Fatal');
  process.exit(1);
});
