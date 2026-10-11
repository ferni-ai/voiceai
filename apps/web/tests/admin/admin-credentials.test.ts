/**
 * Admin sections send the admin's credentials.
 *
 * Experiments, Speech Metrics, Semantic Routing and FinOps used to call the
 * API with a bare fetch, so production (no dev-mode key) got 401s and blank
 * dashboards. "Preview voice" called admin routes that do not exist.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/admin/admin-api.js', () => ({
  getAdminHeadersAsync: vi.fn(async () => ({ Authorization: 'Bearer admin-token' })),
}));

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ data: {} }), { status: 200 })
);

function callsTo(prefix: string): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix)) as Array<
    [string, RequestInit | undefined]
  >;
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('admin sections send the signed-in admin token', () => {
  it('Experiments loads with the admin token', async () => {
    const { render } = await import('../../src/admin/sections/ExperimentsSection.js');
    // Only the request matters here; the stub payload is not a full dashboard
    await Promise.allSettled([render()]);
    const calls = callsTo('/api/v1/admin/experiments');
    expect(calls.length).toBeGreaterThan(0);
    expect(header(calls[0]?.[1], 'Authorization')).toBe('Bearer admin-token');
  });

  it('Speech Metrics loads with the admin token', async () => {
    const { render } = await import('../../src/admin/sections/SpeechMetricsSection.js');
    await Promise.allSettled([render()]);
    const calls = callsTo('/api/speech-metrics/dashboard');
    expect(calls.length).toBeGreaterThan(0);
    expect(header(calls[0]?.[1], 'Authorization')).toBe('Bearer admin-token');
  });

  it('Semantic Routing loads with the admin token', async () => {
    document.body.innerHTML = '<div id="semantic-routing-content"></div>';
    const mod = await import('../../src/admin/sections/SemanticRoutingSection.js');
    await mod.init();
    mod.cleanup();
    const calls = callsTo('/api/observability/');
    expect(calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        '/api/observability/semantic-routing',
        '/api/observability/routing-dashboard',
      ])
    );
    for (const [, init] of calls) {
      expect(header(init, 'Authorization')).toBe('Bearer admin-token');
    }
  });

  it('FinOps sends the token and keeps a stored admin key out of the URL', async () => {
    localStorage.setItem('admin_key', 'stored-key');
    const finops = await import('../../src/admin/sections/FinOpsSection.js');
    document.body.innerHTML = await finops.render();
    await Promise.allSettled([finops.setupEvents()]);
    finops.cleanup();
    const calls = callsTo('/api/finops/');
    expect(calls.length).toBeGreaterThan(0);
    for (const [url, init] of calls) {
      expect(url).not.toContain('admin_key');
      expect(header(init, 'Authorization')).toBe('Bearer admin-token');
      expect(header(init, 'X-Admin-Key')).toBe('stored-key');
    }
  });

  it('no named section calls fetch without credentials', () => {
    for (const name of ['Experiments', 'SpeechMetrics', 'SemanticRouting', 'FinOps']) {
      const src = readFileSync(
        resolve(__dirname, `../../src/admin/sections/${name}Section.ts`),
        'utf8'
      );
      expect(src, name).not.toMatch(/(?<![A-Za-z])fetch\(/);
    }
  });
});

describe('Preview voice', () => {
  it('calls the persona TTS route that exists on the server', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Blob(['mp3']), { status: 200 }));
    const play = vi.fn(async () => undefined);
    vi.stubGlobal(
      'Audio',
      class {
        play = play;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
      }
    );
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    const { previewAgentVoice, VOICE_PREVIEW_ROUTE } =
      await import('../../src/admin/admin-voice-preview.js');

    await previewAgentVoice('peter-john');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(VOICE_PREVIEW_ROUTE);
    expect(JSON.parse(String(init.body))).toMatchObject({ personaId: 'peter-john' });
    expect(play).toHaveBeenCalled();

    const server = readFileSync(
      resolve(__dirname, '../../../../src/api/landing-intelligence.routes.ts'),
      'utf8'
    );
    expect(server).toContain(`pathname === '${VOICE_PREVIEW_ROUTE}'`);
  });

  it('releases the audio when the browser blocks playback', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Blob(['mp3']), { status: 200 }));
    vi.stubGlobal(
      'Audio',
      class {
        play = vi.fn(async () => {
          throw new DOMException('blocked', 'NotAllowedError');
        });
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
      }
    );
    URL.createObjectURL = vi.fn(() => 'blob:blocked');
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const { previewAgentVoice } = await import('../../src/admin/admin-voice-preview.js');

    await previewAgentVoice('peter-john');

    expect(revoke).toHaveBeenCalledWith('blob:blocked');
  });

  it('admin-events no longer calls the missing voice-sample or tts-preview routes', () => {
    const src = readFileSync(resolve(__dirname, '../../src/admin/admin-events.ts'), 'utf8');
    expect(src).not.toContain('/voice-sample');
    expect(src).not.toContain('/tts-preview');
  });
});
