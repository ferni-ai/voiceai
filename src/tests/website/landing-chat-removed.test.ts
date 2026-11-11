/**
 * ferni.ai's AI landing script (apps/website/ferni-website/src/js/ai-powered-landing.js)
 * used to build a text chat widget (#ferni-live-chat) when the landing-ai-live-chat
 * flag came back on, and post visitors' messages to /api/landing/ai/chat. Ferni is a
 * voice companion and that chat had none of the crisis handling real conversations
 * get, so it was removed (#3683). Here the script runs in a small fake browser with
 * every flag on: no chat flag is asked for, no widget is built, nothing posts to
 * /chat, and the features that stay still start.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const SCRIPT = readFileSync(
  join(process.cwd(), 'apps/website/ferni-website/src/js/ai-powered-landing.js'),
  'utf8'
);

interface FakeElement {
  id: string;
  className: string;
  innerHTML: string;
  textContent: string;
  [key: string]: unknown;
}

function element(tag: string): FakeElement {
  const attrs = new Map<string, string>();
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    addEventListener: () => {},
    appendChild: (child: unknown) => child,
    insertBefore: (child: unknown) => child,
    querySelector: () => element('div'),
    querySelectorAll: () => [],
    remove: () => {},
    focus: () => {},
  };
  return el;
}

async function runWithEveryFlagOn() {
  const bodyChildren: FakeElement[] = [];
  const headChildren: FakeElement[] = [];
  const askedFlags: string[] = [];
  const fetched: string[] = [];
  const ready: Array<() => unknown> = [];
  const window: Record<string, unknown> = {
    innerWidth: 1280,
    scrollY: 0,
    addEventListener: () => {},
    FerniExperiments: {
      getVariant: async (id: string) => {
        askedFlags.push(id);
        return 'enabled';
      },
      trackConversionForAll: () => {},
    },
  };
  const document = {
    readyState: 'loading',
    referrer: '',
    addEventListener: (type: string, fn: () => unknown) => {
      if (type === 'DOMContentLoaded') ready.push(fn);
    },
    createElement: element,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { appendChild: (c: FakeElement) => (bodyChildren.push(c), c) },
    head: { appendChild: (c: FakeElement) => (headChildren.push(c), c) },
  };
  const context = vm.createContext({
    window,
    document,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, status: 200, json: async () => ({}) };
    }),
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
  });
  vm.runInContext(SCRIPT, context);
  await Promise.all(ready.map((fn) => fn()));
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  return { window, bodyChildren, headChildren, askedFlags, fetched };
}

describe('ai-powered-landing.js has no text chat', () => {
  it('builds no chat widget and posts nothing to /chat, with every flag on', async () => {
    const { window, bodyChildren, askedFlags, fetched } = await runWithEveryFlagOn();

    expect(askedFlags).not.toContain('landing-ai-live-chat');
    expect(bodyChildren.map((c) => c.id)).not.toContain('ferni-live-chat');
    expect(bodyChildren.some((c) => c.innerHTML.includes('ferni-chat-'))).toBe(false);
    expect(fetched.filter((url) => url.endsWith('/chat'))).toEqual([]);
    const api = window.FerniAI as Record<string, unknown>;
    expect(api).not.toHaveProperty('chat');
  });

  it('still starts the features that stay', async () => {
    const { window, askedFlags, bodyChildren } = await runWithEveryFlagOn();

    expect(askedFlags).toEqual(
      expect.arrayContaining(['landing-ai-smart-faq', 'landing-ai-hover-previews'])
    );
    const { config } = window.FerniAI as { config: Record<string, boolean> };
    expect(config.enableSmartFAQ).toBe(true);
    expect(config.enableHoverPreviews).toBe(true);
    // Hover previews add their tooltip to the page.
    expect(bodyChildren.map((c) => c.className)).toContain('ferni-hover-preview');
  });
});
