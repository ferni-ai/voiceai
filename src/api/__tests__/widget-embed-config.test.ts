/**
 * Widget embed.js config resolution.
 *
 * embed.js must accept window.FerniWidget, window.FERNI_CONFIG (CLI-generated
 * pages) and data-* attributes on its own <script> tag, and default apiBase to
 * the script's own origin so third-party sites call Ferni, not themselves.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

vi.mock('../../utils/interval-manager.js', () => ({ registerInterval: vi.fn() }));

import { WIDGET_CONFIG_RESOLVER_JS } from '../widget-embed-config.js';
import { handleWidgetRoutes } from '../widget-routes.js';

type Resolver = (
  win: Record<string, unknown>,
  script: { src?: string; getAttribute(name: string): string | null } | null
) => { widgetId?: string; apiBase: string };

const resolve = new Function(
  `${WIDGET_CONFIG_RESOLVER_JS}; return resolveFerniWidgetConfig;`
)() as Resolver;

function scriptTag(src: string, attrs: Record<string, string> = {}) {
  return { src, getAttribute: (name: string) => attrs[name] ?? null };
}

const HOST = { location: { href: 'https://customer-site.example/page' } };
const EMBED_SRC = 'https://app.ferni.ai/api/widget/embed.js';

describe('resolveFerniWidgetConfig', () => {
  it('reads window.FerniWidget', () => {
    const cfg = resolve(
      { ...HOST, FerniWidget: { widgetId: 'w1', apiBase: 'https://api.ferni.ai/' } },
      scriptTag(EMBED_SRC)
    );
    expect(cfg).toEqual({ widgetId: 'w1', apiBase: 'https://api.ferni.ai' });
  });

  it('reads window.FERNI_CONFIG from CLI-generated pages', () => {
    const cfg = resolve(
      { ...HOST, FERNI_CONFIG: { agentId: 'agent-7', apiUrl: 'https://agents.ferni.ai' } },
      scriptTag(EMBED_SRC)
    );
    expect(cfg).toEqual({ widgetId: 'agent-7', apiBase: 'https://agents.ferni.ai' });
  });

  it('treats FERNI_CONFIG.apiUrl "" as unset and falls back to the script origin', () => {
    const cfg = resolve(
      { ...HOST, FERNI_CONFIG: { agentId: 'agent-7', apiUrl: '' } },
      scriptTag(EMBED_SRC)
    );
    expect(cfg).toEqual({ widgetId: 'agent-7', apiBase: 'https://app.ferni.ai' });
  });

  it('reads data-widget-id / data-api-base from the script tag', () => {
    const cfg = resolve(
      { ...HOST },
      scriptTag(EMBED_SRC, { 'data-widget-id': 'widget_abc123', 'data-api-base': 'https://x.ferni.ai' })
    );
    expect(cfg).toEqual({ widgetId: 'widget_abc123', apiBase: 'https://x.ferni.ai' });
  });

  it('defaults apiBase to the embed script origin, not the host page', () => {
    const cfg = resolve({ ...HOST }, scriptTag(EMBED_SRC, { 'data-widget-id': 'w' }));
    expect(cfg.apiBase).toBe('https://app.ferni.ai');
  });

  it('resolves a relative script src against the page', () => {
    const cfg = resolve({ ...HOST, FerniWidget: { widgetId: 'w' } }, scriptTag('/api/widget/embed.js'));
    expect(cfg.apiBase).toBe('https://customer-site.example');
  });

  it('prefers FerniWidget over FERNI_CONFIG over data attributes', () => {
    const cfg = resolve(
      { ...HOST, FerniWidget: { widgetId: 'a' }, FERNI_CONFIG: { agentId: 'b' } },
      scriptTag(EMBED_SRC, { 'data-widget-id': 'c' })
    );
    expect(cfg.widgetId).toBe('a');
  });

  it('returns no widgetId when nothing is configured', () => {
    expect(resolve({ ...HOST }, null)).toEqual({ widgetId: undefined, apiBase: '' });
  });
});

describe('GET /api/widget/embed.js', () => {
  async function serveEmbedScript(): Promise<string> {
    let body = '';
    const res = {
      writeHead: vi.fn(),
      end: (chunk: string) => {
        body = chunk;
      },
    } as unknown as ServerResponse;
    const req = { method: 'GET' } as IncomingMessage;
    await handleWidgetRoutes(req, res, '/api/widget/embed.js');
    return body;
  }

  it('fetches widget config from the script origin using FERNI_CONFIG', async () => {
    const script = await serveEmbedScript();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    const win: Record<string, unknown> = {
      location: { href: 'https://customer-site.example/' },
      FERNI_CONFIG: { agentId: 'agent-7', apiUrl: '' },
    };
    const doc = {
      readyState: 'complete',
      currentScript: scriptTag(EMBED_SRC),
      querySelector: () => null,
    };

    new Function('window', 'document', 'fetch', script)(win, doc, fetchMock);
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('https://app.ferni.ai/api/widget/config/agent-7');
    expect(typeof (win.FerniWidget as { open?: unknown }).open).toBe('function');
  });
});
