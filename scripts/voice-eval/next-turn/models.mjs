// Gemini on Vertex and qwen3 on the local Ollama, with retries; and a small worker pool.
import { execFileSync } from 'node:child_process';

import { parseJudgeJson } from '../judge.mjs';
import { judgeModel } from '../../lib/judge-model.mjs';

const gcloud = (args) => execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = { value: '', at: 0 };
let project;

/** One generateContent call: the reply text, thoughts dropped. Retries 429s, 5xx and network errors. */
export async function gemini(model, body, tries = 5) {
  project ??= process.env.GOOGLE_CLOUD_PROJECT ?? gcloud(['config', 'get-value', 'project']);
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  for (let i = 1; ; i++) {
    // Tokens last an hour and a run outlives one.
    if (Date.now() - token.at > 30 * 60_000)
      token = { value: gcloud(['auth', 'print-access-token']), at: Date.now() };
    const headers = { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }).catch(
      () => ({ ok: false, status: 0, json: async () => ({}) })
    );
    const json = await res.json().catch(() => ({}));
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    if (res.ok)
      return parts
        .map((p) => (p.thought ? '' : (p.text ?? '')))
        .join('')
        .trim();
    if (i >= tries || ![0, 429, 500, 502, 503, 504].includes(res.status))
      throw new Error(
        `${model} ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 300)}`
      );
    await sleep(2000 * 2 ** i);
  }
}

/** Gemini as a judge: temperature 0.2, JSON out. */
export async function geminiJson(prompt, model = judgeModel()) {
  const generationConfig = { temperature: 0.2, responseMimeType: 'application/json' };
  return parseJudgeJson(
    await gemini(model, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    })
  );
}

/**
 * qwen3 on Ollama with thinking on (never qwen2.5: it judged invalidly, 2026-10-11). Streamed,
 * since fetch gives up after 300 s without headers. num_ctx 8192 as the other local judges use:
 * a different one makes Ollama reload the model between their calls and ours.
 */
export async function qwenJson(prompt, model = process.env.QWEN_MODEL ?? 'qwen3:30b-a3b') {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const messages = [{ role: 'user', content: prompt }];
  const options = { temperature: 0.2, num_ctx: 8192 };
  for (let i = 1; ; i++) {
    try {
      const body = JSON.stringify({ model, think: true, format: 'json', options, messages });
      const res = await fetch(`${host}/api/chat`, { method: 'POST', body });
      const lines = (await res.text()).split('\n').filter(Boolean);
      if (!res.ok) throw new Error(`ollama ${res.status}: ${lines.join(' ').slice(0, 200)}`);
      return parseJudgeJson(lines.map((l) => JSON.parse(l).message?.content ?? '').join(''));
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(5000);
    }
  }
}

/** `fn` over `items`, at most `n` at once; a failed item is logged and skipped. */
export async function pool(items, n, fn) {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift())
      await fn(item).catch((e) => console.error(`skip: ${e.message}`));
  };
  await Promise.all(Array.from({ length: n }, worker));
}
