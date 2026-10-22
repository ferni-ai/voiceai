/**
 * Computed-style diff of the built ferni.ai site against origin/main, and the
 * dark-mode override audit (theme plan T1).
 *
 * For every page built into _site, in light, dark (prefers-color-scheme) and
 * night (dark plus the `.theme--dark` class that js/landing-intelligence.js
 * adds when /api/landing/time-content says visualMode: 'dark'), it walks the
 * whole DOM of both builds and compares the colour properties in PROPS for
 * every element and its ::before and ::after. Computed values are exact, so
 * this sees the small shifts and the below-the-fold changes the screenshot
 * gate can't. Elements are matched by their tag path (`body:1>main:1>div:3`),
 * not by class or id, so a renamed class still compares the same element.
 *
 * Override audit: on the PR build in dark mode, each stylesheet whose name
 * says dark or night is disabled in turn (document.styleSheets[i].disabled)
 * and the elements whose colours change are counted. A sheet can be deleted
 * when its count is 0.
 *
 * Each test writes a fragment; website-style-diff-report.ts merges them into
 * style-diff-report/report.json and report.md. The spec itself only fails
 * when a page can't be read; the workflow decides what fails the job.
 *
 * Run from the repo root with the PR built into _site and the base into
 * _site-base (cd apps/website/ferni-website && npm run build:prod, then the
 * same in a worktree of origin/main, moving its _site to _site-base):
 *
 *   npx playwright test -c apps/website/ferni-website/playwright.style-diff.config.ts
 */

import { expect, test, type Browser, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { keepOffProdApi } from './built-site-server';
import { builtPages, FRAGMENTS, WEBSITE } from './website-style-diff-report';

/** Served by the config's webServer. */
const BASE = 'http://127.0.0.1:8771';
const PR = 'http://127.0.0.1:8772';

const PROPS = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color',
  '-webkit-text-fill-color',
  'filter',
  'opacity',
];

/** Stylesheets the override audit disables one at a time, by file name. */
const AUDITED = /(dark|night)[^/]*\.css$/;

/** Differences kept per page and mode as examples; the counts cover all. */
const SAMPLES = 25;

const MODES = ['light', 'dark', 'night'] as const;
type Mode = (typeof MODES)[number];

/** Animations and transitions off, so every value read is the final one. */
const STILL_CSS =
  '*,*::before,*::after{animation:none!important;transition:none!important}' +
  '.reveal,[data-animate],[class*="fade"]{opacity:1!important;transform:none!important}';

/** key -> [label, ...one value per PROPS entry] */
type Snapshot = Record<string, string[]>;

/**
 * Runs in the page. Returns the snapshot of every element, and with `audit`
 * also how many elements change when each audited sheet is disabled.
 */
function readStyles([props, auditPattern]: [string[], string | null]): {
  snapshot: Snapshot;
  audit: Record<string, number>;
} {
  const SKIP = new Set(['head', 'script', 'style', 'noscript', 'template', 'link', 'meta']);
  const origin = location.origin;
  const take = (): Snapshot => {
    const out: Snapshot = {};
    const record = (el: Element, key: string, label: string, pseudo?: string): void => {
      const style = getComputedStyle(el, pseudo);
      if (pseudo && (style.content === 'none' || style.content === 'normal')) return;
      out[key + (pseudo ?? '')] = [
        label,
        ...props.map((prop) => style.getPropertyValue(prop).replaceAll(origin, '')),
      ];
    };
    const visit = (el: Element, key: string): void => {
      const classes = [...el.classList].slice(0, 3).map((name) => `.${name}`);
      const label = el.localName + (el.id ? `#${el.id}` : '') + classes.join('');
      record(el, key, label);
      record(el, key, label, '::before');
      record(el, key, label, '::after');
      const seen = new Map<string, number>();
      for (const child of el.children) {
        if (SKIP.has(child.localName)) continue;
        const n = (seen.get(child.localName) ?? 0) + 1;
        seen.set(child.localName, n);
        visit(child, `${key}>${child.localName}:${n}`);
      }
    };
    visit(document.documentElement, 'html');
    return out;
  };

  const snapshot = take();
  const audit: Record<string, number> = {};
  if (auditPattern) {
    const pattern = new RegExp(auditPattern);
    const byName = new Map<string, CSSStyleSheet[]>();
    for (const sheet of document.styleSheets) {
      const name = sheet.href ? new URL(sheet.href).pathname.split('/').pop() : undefined;
      if (name && pattern.test(name)) byName.set(name, [...(byName.get(name) ?? []), sheet]);
    }
    for (const [name, sheets] of byName) {
      for (const sheet of sheets) sheet.disabled = true;
      const without = take();
      audit[name] = Object.keys(snapshot).filter(
        (key) => without[key]?.slice(1).join('\n') !== snapshot[key].slice(1).join('\n')
      ).length;
      for (const sheet of sheets) sheet.disabled = false;
    }
  }
  return { snapshot, audit };
}

async function open(browser: Browser, site: string, path: string, mode: Mode): Promise<Page> {
  const context = await browser.newContext({
    colorScheme: mode === 'light' ? 'light' : 'dark',
  });
  await keepOffProdApi(context);
  await context.route('**/api/landing/time-content', (route) =>
    route.fulfill({ json: mode === 'night' ? { visualMode: 'dark' } : {} })
  );
  // Third-party scripts can add elements, and a web font arriving moves
  // layout that some scripts measure; only third-party stylesheets load.
  await context.route(
    (url) => !url.href.startsWith(site),
    (route) => (route.request().resourceType() === 'stylesheet' ? route.continue() : route.abort())
  );
  const page = await context.newPage();
  const time = new Date('2026-06-15T10:00:00Z');
  // Installed a minute early: pausing at the install time itself fails when
  // the clock has already moved past it.
  await page.clock.install({ time: new Date(time.getTime() - 60_000) });
  await page.clock.pauseAt(time);
  await page.addInitScript(() => {
    // Every observed element is reported in view at once, as if the page had
    // been scrolled through, so scroll reveals don't depend on timing.
    window.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0];
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element): void {
        queueMicrotask(() => {
          const box = target.getBoundingClientRect();
          const entry = {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: box,
            intersectionRect: box,
            rootBounds: null,
            time: 0,
          };
          this.callback([entry], this);
        });
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    };
    localStorage.clear();
    sessionStorage.clear();
    let seed = 0x2f6b3a1d;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  const response = await page.goto(`${site}${path}`, { waitUntil: 'load' });
  expect(response?.ok(), `${site}${path}`).toBe(true);
  await page.addStyleTag({ content: STILL_CSS });
  if (mode === 'night') {
    await page.evaluate(() => document.body.classList.add('theme--dark', 'time-mode--night'));
  }
  return page;
}

async function read(
  browser: Browser,
  site: string,
  path: string,
  mode: Mode,
  audit = false
): Promise<{ snapshot: Snapshot; audit: Record<string, number> }> {
  const page = await open(browser, site, path, mode);
  try {
    return await page.evaluate(readStyles, [PROPS, audit ? AUDITED.source : null] as [
      string[],
      string | null,
    ]);
  } finally {
    await page.context().close();
  }
}

interface Difference {
  element: string;
  label: string;
  property: string;
  base: string;
  pr: string;
}

function compare(base: Snapshot, pr: Snapshot) {
  let changed = 0;
  const added = Object.keys(pr).filter((key) => !(key in base));
  const removed = Object.keys(base).filter((key) => !(key in pr));
  const byProperty: Record<string, number> = {};
  const samples: Difference[] = [];
  for (const [key, values] of Object.entries(pr)) {
    const old = base[key];
    // values[0] is the label, which changes with the classes.
    if (!old || old.slice(1).join('\n') === values.slice(1).join('\n')) continue;
    changed++;
    PROPS.forEach((property, i) => {
      if (old[i + 1] === values[i + 1]) return;
      byProperty[property] = (byProperty[property] ?? 0) + 1;
      if (samples.length < SAMPLES) {
        samples.push({
          element: key,
          label: values[0],
          property,
          base: old[i + 1],
          pr: values[i + 1],
        });
      }
    });
  }
  return {
    elements: Object.keys(pr).length,
    changed,
    added: added.length,
    removed: removed.length,
    differences: changed + added.length + removed.length,
    byProperty,
    samples,
    addedSamples: added.slice(0, 5),
    removedSamples: removed.slice(0, 5),
  };
}

const PAGES = builtPages(`${WEBSITE}/_site`);

test.describe.configure({ mode: 'parallel' });

for (const path of PAGES) {
  test(`${path} computed styles`, async ({ browser }) => {
    const inBase = existsSync(
      join(`${WEBSITE}/_site-base`, path.endsWith('/') ? `${path}index.html` : path)
    );
    const fragment: Record<string, unknown> = { page: path, inBase };
    const modes: Record<string, unknown> = {};
    for (const mode of MODES) {
      const pr = await read(browser, PR, path, mode, mode === 'dark');
      if (mode === 'dark') fragment.audit = pr.audit;
      if (!inBase) continue;
      const base = await read(browser, BASE, path, mode);
      modes[mode] = compare(base.snapshot, pr.snapshot);
    }
    fragment.modes = modes;
    mkdirSync(FRAGMENTS, { recursive: true });
    const name = path.replaceAll('/', '_').replace(/^_|_$/g, '') || 'home';
    writeFileSync(join(FRAGMENTS, `${name}.json`), JSON.stringify(fragment));
  });
}
