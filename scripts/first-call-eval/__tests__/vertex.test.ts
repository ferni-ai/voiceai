/**
 * generate(): callers that pass no `location` send exactly the request they sent
 * before the option existed (global endpoint, same body and headers); a
 * location only changes the host and path, and token counting never changes
 * what generate() returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({ execFileSync: () => Buffer.from('tok-123\n') }));

const { generate, tokensByModel } = await import('../vertex.js');
const { withBillingLabels } = await import('../../lib/gemini-billing-labels.mjs');

const opts = {
  model: 'gemini-test',
  system: 'Be brief.',
  contents: [{ role: 'user' as const, parts: [{ text: 'hi' }] }],
  thinkingLevel: 'MINIMAL' as const,
  json: true,
};

let calls: Array<{ url: string; init: RequestInit }>;
function answer(body: unknown) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

beforeEach(() => vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'proj-x'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('generate() request', () => {
  it('without a location: the pre-option global request, byte for byte', async () => {
    answer({ candidates: [{ content: { parts: [{ text: ' hello ' }] } }] });
    expect(await generate(opts)).toBe('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/proj-x/locations/global/publishers/google/models/gemini-test:generateContent'
    );
    const before = JSON.stringify(
      withBillingLabels({
        systemInstruction: { parts: [{ text: 'Be brief.' }] },
        contents: opts.contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          responseMimeType: 'application/json',
        },
      })
    );
    expect(calls[0]!.init.body).toBe(before);
    expect(calls[0]!.init.headers).toEqual({
      Authorization: 'Bearer tok-123',
      'Content-Type': 'application/json',
    });
  });

  it('with a location: the regional host and path, the same body', async () => {
    answer({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await generate(opts);
    const globalBody = calls[0]!.init.body;
    answer({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await generate({ ...opts, location: 'us-central1' });
    expect(calls[0]!.url).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/proj-x/locations/us-central1/publishers/google/models/gemini-test:generateContent'
    );
    expect(calls[0]!.init.body).toBe(globalBody);
  });

  it('counts tokens from usageMetadata (thinking as output) without changing the reply', async () => {
    delete tokensByModel['gemini-count'];
    const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 2 };
    answer({ candidates: [{ content: { parts: [{ text: 'yes' }] } }], usageMetadata });
    expect(await generate({ ...opts, model: 'gemini-count' })).toBe('yes');
    answer({ candidates: [{ content: { parts: [{ text: 'no usage' }] } }] });
    expect(await generate({ ...opts, model: 'gemini-count' })).toBe('no usage');
    expect(tokensByModel['gemini-count']).toEqual({ in: 10, out: 5 });
  });
});
