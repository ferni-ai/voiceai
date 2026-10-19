/**
 * Nothing animates on the main thread while the app sits idle.
 *
 * Measured in the dev app (phone profile, 4x CPU, idle): 12 infinite CSS
 * loops ran inside closed panels, the grain overlay moved its
 * background-position, the connect button breathed with box-shadow, the
 * avatar's glow pulse animated `filter`, and the active team member ran a
 * transform loop that an `!important` rule made invisible. All of those run
 * per frame on the main thread. These tests pin the fixed shape: closed panels
 * pause their loops (and resume when open), and the idle loops left animate
 * only opacity or transform.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB = resolve(__dirname, '../..');
/** File text, or '' when it does not exist (so each test fails on its own). */
function read(path: string): string {
  try {
    return readFileSync(resolve(WEB, path), 'utf8');
  } catch {
    return '';
  }
}
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level rules of a flat stylesheet. */
function rules(css: string): Array<{ selectors: string[]; body: string }> {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
    body: m[2],
  }));
}

/** The body of `@keyframes name` in a stylesheet. */
function keyframes(css: string, name: string): string {
  const start = css.indexOf(`@keyframes ${name}`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  return '';
}

describe('closed panels pause their loops', () => {
  const pauseSelectors = rules(read('src/styles/paused-when-hidden.css'))
    .filter((r) => /animation-play-state:\s*paused/.test(r.body))
    .flatMap((r) => r.selectors);

  /** Does a pause rule match `el` (or its ::after, for `pseudo`)? */
  function paused(el: Element, pseudo = ''): boolean {
    return pauseSelectors.some((sel) => {
      if (pseudo ? !sel.endsWith(pseudo) : /::/.test(sel)) return false;
      return el.matches(pseudo ? sel.slice(0, -pseudo.length) : sel);
    });
  }

  const cases: Array<{ name: string; html: string; target: string; open: string; openClass: string; pseudo?: string }> = [
    { name: 'thinking dots', html: '<div id="coach"><div class="thinking-float"><span class="thinking-dot"></span></div></div>', target: '.thinking-dot', open: '#coach', openClass: 'is-thinking' },
    { name: 'stage celebration icon', html: '<div class="relationship-celebration"><div class="celebration-card"><div class="celebration-icon"></div></div></div>', target: '.celebration-icon', open: '.relationship-celebration', openClass: 'visible' },
    { name: 'settings badge', html: '<aside class="settings-menu"><span class="settings-menu__badge"></span></aside>', target: '.settings-menu__badge', open: '.settings-menu', openClass: 'settings-menu--visible' },
    { name: 'insights glow', html: '<div class="insights-view"><div class="insights-empty__glow"></div></div>', target: '.insights-empty__glow', open: '.insights-view', openClass: 'insights-view--visible' },
    { name: 'insights icon ring', html: '<div class="insights-view"><div class="insights-empty__icon-ring"></div></div>', target: '.insights-empty__icon-ring', open: '.insights-view', openClass: 'insights-view--visible' },
    { name: 'insights sample dot', html: '<div class="insights-view"><span class="insights-empty__sample-dot"></span></div>', target: '.insights-empty__sample-dot', open: '.insights-view', openClass: 'insights-view--visible' },
    { name: 'predictions icon', html: '<div class="predictions-panel"><div class="predictions-empty__icon"></div></div>', target: '.predictions-empty__icon', open: '.predictions-panel', openClass: 'predictions-panel--visible' },
    { name: 'proactive indicator dot', html: '<div class="proactive-indicator"><span class="indicator-dot"></span></div>', target: '.indicator-dot', open: '.proactive-indicator', openClass: 'is-visible' },
    { name: 'team insights spinner', html: '<div class="team-insights-panel"><div class="team-insights-spinner"></div></div>', target: '.team-insights-spinner', open: '.team-insights-panel', openClass: 'is-open' },
  ];

  it.each(cases)('$name: paused while closed, running once open', ({ html, target, open, openClass, pseudo }) => {
    document.body.innerHTML = html;
    const el = document.querySelector(target) as Element;
    expect(paused(el, pseudo)).toBe(true);
    document.querySelector(open)?.classList.add(openClass);
    expect(paused(el, pseudo)).toBe(false);
  });

  it('the stylesheet is loaded by the page', () => {
    expect(read('index.html')).toContain('href="/src/styles/paused-when-hidden.css"');
  });
});

describe('proactive indicator', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.setItem('ferniUserId', 'u1');
  });
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.doUnmock('../../src/utils/api.js');
    vi.doUnmock('../../src/services/attention-queue.js');
  });

  it.each([
    [0, false],
    [2, true],
  ])('with %i unread messages, is-visible is %s', async (count, visible) => {
    vi.doMock('../../src/utils/api.js', () => ({
      apiGet: vi.fn(async () => ({ ok: true, status: 200, data: { messages: Array.from({ length: count }, (_, i) => ({ id: String(i) })) } })),
      apiPost: vi.fn(),
    }));
    vi.doMock('../../src/services/attention-queue.js', () => ({
      requestAttention: (_id: string, show: () => void) => show(),
    }));
    const { initProactiveMessages } = await import('../../src/ui/proactive-messages.ui.js');
    initProactiveMessages();
    await vi.waitFor(() => expect(document.querySelector('.proactive-indicator')).not.toBeNull());
    const indicator = document.querySelector('.proactive-indicator') as HTMLElement;
    await vi.waitFor(() => expect(indicator.classList.contains('is-visible')).toBe(visible));
    expect(indicator.style.visibility).toBe(visible ? 'visible' : 'hidden');
  });
});

describe('idle loops animate only opacity or transform', () => {
  const inline = read('src/styles/inline-styles.css');

  it('the grain overlay breathes with opacity, not background-position', () => {
    const grain = keyframes(read('src/ui/avatar-soul.ui.ts'), 'grainBreath');
    expect(grain).toContain('opacity');
    expect(grain).not.toMatch(/background-position/);
  });

  it('nothing animates an anchor-positioned element (it re-lays out every frame)', () => {
    // #1248 anchored a glow layer to the connect button and faded it in and
    // out: Chrome re-ran anchor layout for it 60 times a second, idle and in
    // calls. The button's own box-shadow breath (below) costs less.
    const anchored = rules(inline).filter((r) => /position-anchor\s*:/.test(r.body));
    const animatedSelectors = rules(inline)
      .filter((r) => /animation(-name)?\s*:\s*(?!none)/.test(r.body))
      .flatMap((r) => r.selectors);
    for (const rule of anchored) {
      for (const selector of rule.selectors) expect(animatedSelectors).not.toContain(selector);
    }
    expect(inline).not.toMatch(/\.controls-row(:has\([^)]*\))?::before\s*\{[^}]*position-anchor/);
  });

  it('the connect button keeps its own breath', () => {
    const zen = rules(inline).find((r) => r.selectors.includes("[data-theme='zen'] .btn-primary:not(:disabled)"));
    expect(zen?.body).toMatch(/animation:\s*zenBtnBreath/);
    expect(keyframes(inline, 'connectGlowBreath')).toBe('');
  });

  it('the active team member runs no invisible transform loop', () => {
    const active = rules(inline).filter((r) =>
      r.selectors.includes('.team-member.active:not(.switching-to):not(.switching-from)')
    );
    expect(active.some((r) => /transform:\s*none\s*!important/.test(r.body))).toBe(true);
    expect(active.some((r) => /animation:/.test(r.body))).toBe(false);
  });
});

describe('avatar glow pulse', () => {
  interface Call {
    target: Element;
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
  }
  let calls: Call[] = [];

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value(this: Element, keyframes: Keyframe[], options?: number | KeyframeAnimationOptions) {
        calls.push({ target: this, keyframes, options: typeof options === 'object' ? options : {} });
        return { cancel: vi.fn(), pause: vi.fn(), play: vi.fn(), finished: Promise.resolve(), onfinish: null };
      },
    });
    document.body.innerHTML = '<div id="coach"><div class="avatar-container"><div id="coachAvatar"></div></div></div>';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is an opacity loop on a layer, never a filter loop on the avatar', async () => {
    const presence = await import('../../src/ui/presence.ui.js');
    presence.initPresenceUI();
    const endless = calls.filter((c) => c.options.iterations === Infinity);
    const props = (c: Call) => new Set(c.keyframes.flatMap((k) => Object.keys(k)));
    expect(endless.filter((c) => props(c).has('filter'))).toHaveLength(0);
    const glow = endless.find((c) => (c.target as HTMLElement).classList.contains('avatar-glow-layer'));
    expect(glow).toBeDefined();
    expect([...props(glow as Call)].filter((p) => p !== 'offset')).toEqual(['opacity']);
    expect(glow?.target.parentElement?.id).toBe('coachAvatar');
    presence.dispose();
  });
});
