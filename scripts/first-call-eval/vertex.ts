/**
 * One Gemini call on Vertex (global endpoint), with the gcloud ADC token, for
 * the first-call eval scripts. Retries 429s and network errors; returns '' when
 * every attempt fails so one bad call can't sink a batch.
 */
import { execFileSync } from 'node:child_process';

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

export async function generate(opts: GenerateOptions): Promise<string> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${opts.model}:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.maxOutputTokens ?? 400,
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
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
