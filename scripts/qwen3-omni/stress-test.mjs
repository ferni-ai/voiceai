#!/usr/bin/env node
/**
 * Qwen3-Omni Thinker stress test (text modality)
 *
 * Sends text chat completion requests to the Qwen Thinker in a loop (optionally
 * concurrent) and reports latency percentiles and throughput. Use this to
 * load-test the platform without audio (no STT/TTS).
 *
 * Usage:
 *   node scripts/qwen3-omni/stress-test.mjs [options]
 *
 * Options:
 *   --url <url>     Thinker base URL (default: QWEN3_OMNI_URL or http://localhost:8000)
 *   --model <name>  Model name (default: Qwen3-Omni; must match Thinker)
 *   --requests <n>  Total requests (default: 20)
 *   --concurrency   Concurrent requests (default: 1)
 *   --max-tokens    Max tokens per response (default: 128)
 *
 * Requires: Qwen Thinker with OpenAI-compatible /v1/chat/completions
 *   - vLLM: vllm serve Qwen/Qwen3-Omni-... --port 8000
 *   - Or set QWEN3_OMNI_URL to your Thinker endpoint
 */

const DEFAULT_URL = process.env.QWEN3_OMNI_URL || 'http://localhost:8000';
const DEFAULT_MODEL = 'Qwen3-Omni';
const DEFAULT_REQUESTS = 20;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_MAX_TOKENS = 128;

function parseArgs() {
  const args = process.argv.slice(2);
  let url = DEFAULT_URL;
  let model = process.env.QWEN3_OMNI_MODEL || DEFAULT_MODEL;
  let requests = DEFAULT_REQUESTS;
  let concurrency = DEFAULT_CONCURRENCY;
  let maxTokens = DEFAULT_MAX_TOKENS;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === '--requests' && args[i + 1]) {
      requests = parseInt(args[++i], 10) || DEFAULT_REQUESTS;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[++i], 10) || 1;
    } else if (args[i] === '--max-tokens' && args[i + 1]) {
      maxTokens = parseInt(args[++i], 10) || DEFAULT_MAX_TOKENS;
    }
  }
  return { url, model, requests, concurrency, maxTokens };
}

async function oneRequest(baseUrl, model, requestId, maxTokens) {
  const start = performance.now();
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: `Stress test request #${requestId}. Reply in one short sentence.`,
        },
      ],
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const latencyMs = performance.now() - start;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  return { latencyMs, contentLength: content.length };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

async function run() {
  const { url, model, requests, concurrency, maxTokens } = parseArgs();
  console.log('Qwen3-Omni stress test (text modality)');
  console.log('  URL:', url);
  console.log('  Model:', model);
  console.log('  Requests:', requests);
  console.log('  Concurrency:', concurrency);
  console.log('  Max tokens:', maxTokens);
  console.log('');

  const latencies = [];
  const errors = [];
  let nextId = 0;

  async function worker() {
    while (true) {
      const id = ++nextId;
      if (id > requests) break;
      try {
        const result = await oneRequest(url, model, id, maxTokens);
        latencies.push(result.latencyMs);
      } catch (err) {
        errors.push({ id, error: String(err.message || err) });
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  const startWall = performance.now();
  await Promise.all(workers);
  const wallMs = performance.now() - startWall;

  const ok = latencies.length;
  const failed = errors.length;
  latencies.sort((a, b) => a - b);

  console.log('Results');
  console.log('  Completed:', ok);
  console.log('  Failed:', failed);
  if (failed > 0) {
    errors.slice(0, 5).forEach((e) => console.log('    ', e.id, e.error));
    if (errors.length > 5) console.log('    ... and', errors.length - 5, 'more');
  }
  console.log('  Wall time (s):', (wallMs / 1000).toFixed(2));
  if (ok > 0) {
    console.log('  Throughput (req/s):', (ok / (wallMs / 1000)).toFixed(2));
    console.log(
      '  Latency (ms): p50',
      percentile(latencies, 50).toFixed(0),
      'p95',
      percentile(latencies, 95).toFixed(0),
      'p99',
      percentile(latencies, 99).toFixed(0)
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
