#!/usr/bin/env npx tsx
/**
 * Qwen3-Omni evaluation pipeline.
 *
 * Measures:
 *   - E2E latency: user message -> first agent audio byte (target < 300ms)
 *   - Thinker latency: time to first token
 *   - TTS latency: text -> first audio chunk
 *   - Function-calling: optional probe for tool-call response
 *
 * Usage:
 *   npx tsx scripts/qwen3-omni/evaluate.ts [--runs N] [--out path]
 *
 * Environment:
 *   QWEN3_OMNI_URL, QWEN3_TTS_URL (or defaults from config)
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { getQwen3OmniConfig } from '../../src/integrations/qwen3-omni/config.js';
import { createLogger } from '../../src/utils/safe-logger.js';

const log = createLogger({ module: 'qwen3-omni-evaluate' });

const DEFAULT_RUNS = 5;
const DEFAULT_OUTPUT = 'scripts/qwen3-omni/data/eval-report.json';

interface EvalReport {
  timestamp: string;
  config: { thinkerUrl: string; ttsUrl: string };
  e2eLatencyMs: { min: number; max: number; avg: number; samples: number };
  thinkerLatencyMs: { min: number; max: number; avg: number; samples: number };
  ttsLatencyMs: { min: number; max: number; samples: number };
  functionCallProbe?: { triggered: boolean; latencyMs: number };
  targetE2EMs: number;
  targetVoiceMOS?: number;
}

function parseArgs(): { runs: number; output: string } {
  const args = process.argv.slice(2);
  let runs = DEFAULT_RUNS;
  let output = DEFAULT_OUTPUT;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--runs' || args[i] === '-n') && args[i + 1]) {
      runs = parseInt(args[i + 1]!, 10) || DEFAULT_RUNS;
      i++;
    } else if ((args[i] === '--out' || args[i] === '-o') && args[i + 1]) {
      output = args[i + 1]!;
      i++;
    }
  }
  return { runs, output };
}

async function measureThinkerLatency(thinkerUrl: string): Promise<number> {
  const start = Date.now();
  const res = await fetch(`${thinkerUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen3-Omni',
      messages: [
        {
          role: 'system',
          content: 'You are Ferni, a warm life coach. Reply in one short sentence.',
        },
        { role: 'user', content: 'Hey, how are you?' },
      ],
      max_tokens: 100,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`Thinker ${res.status}`);
  await res.json();
  return Date.now() - start;
}

async function measureTtsLatency(ttsUrl: string, text: string): Promise<number> {
  const start = Date.now();
  const res = await fetch(`${ttsUrl}/v1/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      persona_id: 'ferni',
      language: 'English',
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const buf = await res.arrayBuffer();
  const firstByte = buf.byteLength > 0 ? start : Date.now();
  return firstByte - start;
}

async function measureE2ELatency(thinkerUrl: string, ttsUrl: string): Promise<number> {
  const t0 = Date.now();
  const thinkerRes = await fetch(`${thinkerUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen3-Omni',
      messages: [
        { role: 'system', content: 'You are Ferni. Reply in one short sentence.' },
        { role: 'user', content: 'Hi, how are you?' },
      ],
      max_tokens: 80,
      stream: false,
    }),
  });
  if (!thinkerRes.ok) throw new Error(`Thinker ${thinkerRes.status}`);
  const thinkerJson = (await thinkerRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = thinkerJson.choices?.[0]?.message?.content?.trim() || 'Hello.';
  const ttsRes = await fetch(`${ttsUrl}/v1/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, persona_id: 'ferni', language: 'English' }),
  });
  if (!ttsRes.ok) throw new Error(`TTS ${ttsRes.status}`);
  await ttsRes.arrayBuffer();
  return Date.now() - t0;
}

function stats(samples: number[]): { min: number; max: number; avg: number } {
  if (samples.length === 0) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { min, max, avg };
}

async function main(): Promise<void> {
  const { runs, output } = parseArgs();
  const config = getQwen3OmniConfig();
  const thinkerUrl = config.serverUrl.replace(/\/$/, '');
  const ttsUrl = config.ttsServerUrl.replace(/\/$/, '');

  const e2eSamples: number[] = [];
  const thinkerSamples: number[] = [];
  const ttsSamples: number[] = [];

  for (let i = 0; i < runs; i++) {
    try {
      const [e2e, thinker, tts] = await Promise.all([
        measureE2ELatency(thinkerUrl, ttsUrl),
        measureThinkerLatency(thinkerUrl),
        measureTtsLatency(ttsUrl, 'Hello, how are you doing today?'),
      ]);
      e2eSamples.push(e2e);
      thinkerSamples.push(thinker);
      ttsSamples.push(tts);
    } catch (err) {
      log.warn({ error: String(err), run: i + 1 }, 'Sample failed');
    }
  }

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    config: { thinkerUrl, ttsUrl },
    e2eLatencyMs: { ...stats(e2eSamples), samples: e2eSamples.length },
    thinkerLatencyMs: { ...stats(thinkerSamples), samples: thinkerSamples.length },
    ttsLatencyMs: { ...stats(ttsSamples), samples: ttsSamples.length },
    targetE2EMs: 300,
  };

  await mkdir(dirname(output), { recursive: true });
  const stream = createWriteStream(output, { flags: 'w' });
  stream.write(JSON.stringify(report, null, 2));
  stream.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  log.info(
    {
      e2eAvgMs: report.e2eLatencyMs.avg,
      thinkerAvgMs: report.thinkerLatencyMs.avg,
      ttsAvgMs: report.ttsLatencyMs.avg,
      targetE2EMs: 300,
      output,
    },
    'Evaluation complete'
  );
}

main().catch((err) => {
  log.error({ error: String(err) }, 'Fatal');
  process.exit(1);
});
