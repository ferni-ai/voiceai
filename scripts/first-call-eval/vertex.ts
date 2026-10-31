/**
 * One Gemini call on Vertex (global endpoint), with the gcloud ADC token, for
 * the first-call eval scripts. Retries 429s and network errors; returns '' when
 * every attempt fails so one bad call can't sink a batch.
 */
import { execFileSync } from 'node:child_process';
import { withBillingLabels } from '../lib/gemini-billing-labels.mjs';

export interface Content {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface GenerateOptions {
  model: string;
  system: string;
  contents: Content[];
  temperature?: number;
  maxOutputTokens?: number;
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  json?: boolean;
  /** Extra request fields for Gemini (tools, toolConfig), e.g. scripts/persona-eval/internals-probe.ts. */
  extra?: Record<string, unknown>;
}

let token = '';
let tokenAt = 0;
function accessToken(): string {
  if (!token || Date.now() - tokenAt > 30 * 60_000) {
    token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
      .toString()
      .trim();
    tokenAt = Date.now();
  }
  return token;
}

/** Calls per model through generate(), for a script's cost line. */
export const callsByModel: Record<string, number> = {};

export async function generate(opts: GenerateOptions): Promise<string> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
  callsByModel[opts.model] = (callsByModel[opts.model] ?? 0) + 1;
  if (!opts.model.startsWith('gemini')) return generateMaas(project, opts);
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${opts.model}:generateContent`;
  const body = JSON.stringify(withBillingLabels({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxOutputTokens ?? 400,
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
    ...opts.extra,
  }));
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      error?: { message?: string };
    };
    if (json.error) throw new Error(`${opts.model}: ${json.error.message}`);
    return (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }
  return '';
}

/**
 * A partner model on Vertex Model-as-a-Service (the OpenAI-compatible
 * endpoint, e.g. openai/gpt-oss-120b-maas), same credential and retries.
 * `json` and `thinkingLevel` are ignored: JSON mode garbled 87 of 144 gpt-oss
 * answers on 2026-10-18, so callers parse the JSON out of the text.
 */
async function generateMaas(project: string, opts: GenerateOptions): Promise<string> {
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/endpoints/openapi/chat/completions`;
  const body = JSON.stringify({
    model: opts.model,
    temperature: opts.temperature ?? 0.8,
    max_tokens: opts.maxOutputTokens ?? 400,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.contents.map((c) => ({
        role: c.role === 'model' ? 'assistant' : 'user',
        content: c.parts.map((p) => p.text).join(''),
      })),
    ],
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    type Body = {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    const json = (await res.json()) as Body | Body[];
    const error = Array.isArray(json) ? json[0]?.error : json.error;
    if (error) throw new Error(`${opts.model}: ${error.message}`);
    return Array.isArray(json) ? '' : String(json.choices?.[0]?.message?.content ?? '').trim();
  }
  return '';
}
