/**
 * The admin portal (/admin), walked against the real API server as the menu gate
 * runs it (#4069). Desktop only: the portal is not a phone UI, so the mobile
 * projects leave this file out by name (playwright.*.config.ts), never by skip.
 *
 * As an admin (an emulator account with the `admin: true` claim), for every section
 * the rendered nav lists, so a new section is walked without editing this file:
 * - every /api/ answer of 400 or more is paired with the section saying why,
 *   "unavailable (HTTP n)" (the portal's unavailable state), on screen or in a toast;
 * - no uncaught exception, and no console.error outside CONSOLE_ALLOWED;
 * - no placeholder or fake text (PLACEHOLDERS) in what the section shows or links to;
 * - every visible, enabled button, tab and [data-navigate] control does something
 *   you could see: a request, a change to the page, a dialog, a download, a
 *   navigation or a new tab. A confirm is cancelled, and nothing may be written then;
 * - every link answers: an internal one below 400 and not the app's 404 fallback,
 *   an external one a well-formed https: URL (never fetched).
 *
 * KNOWN_DEAD holds what still fails on main, each with its #4069 work-list row. A new
 * failure fails the walk, and so does an entry that no longer fails: delete it then.
 */
import { expect, test, type Page } from '@playwright/test';
import { createAdminUser, createUser, signIn } from './support';

/** Findings on main today, by the walk's own wording, each with the #4069 row that fixes it. */
const KNOWN_DEAD: Record<string, string> = {
  // Save cash and Update LTV:CAC do nothing with empty inputs, and keep nothing (FO12, FO13)
  'dead control: finops > Save (2)': 'W7',
  'dead control: finops > Update LTV:CAC': 'W7',
  // the tester's Send is cancelled by the delegated click trap (AD7); catalogue links to authed routes (AD9, AD10)
  'dead control: api-docs > Send': 'W15',
  'link leads nowhere (401): api-docs > Feature Flags API -> /api/v1/admin/flags': 'W15',
  'link leads nowhere (401): api-docs > Trust API -> /api/trust-journey/summary': 'W15',
  // no soul stats route (HL4, HL5)
  'http 404 with no reason shown: human-listening: GET /api/v1/admin/soul/stats': 'W12b',
};

/** console.error lines that are not a portal fault, each with why. */
const CONSOLE_ALLOWED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /^Failed to load resource: the server responded with a status of \d+/,
    why: "the browser's own line for an HTTP error; the walk pairs each one with its visible reason",
  },
];

/** Reads a signed-in account may get without the admin claim, each with why. */
const PUBLIC_READS: { path: RegExp; why: string }[] = [
  { path: /^\/api\/agents$/, why: 'the public team list the app shows everyone' },
  {
    path: /^\/api\/observability\/semantic-routing$/,
    why: 'observability reads are open to any signed-in account on purpose (routing-dashboard-admin.test.ts)',
  },
];

const PLACEHOLDERS: [RegExp, string][] = [
  [/\bundefined\b/, 'undefined'],
  [/\bNaN\b/, 'NaN'],
  [/\[object Object\]/, '[object Object]'],
  [/\$\{/, '${'],
  [/coming soon/i, 'coming soon'],
  [/YOUR_DOC_ID/, 'YOUR_DOC_ID'],
  [/\bLorem\b/, 'Lorem'],
  [/\bTODO\b/, 'TODO'],
];

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CONTROLS = 'button, [role="tab"], a[href], [data-navigate]';
/** How long a click may take to show its effect before the walk calls the control dead. */
const EFFECT_MS = 1_500;
const REOPEN_GOTO_MS = 15_000;

type Seen =
  | { kind: 'request'; method: string; path: string; sameOrigin: boolean; bearer: boolean }
  | { kind: 'response'; status: number; method: string; path: string }
  | { kind: 'failed'; method: string; path: string }
  | { kind: 'console' | 'exception' | 'dialog'; text: string }
  | { kind: 'download' | 'load' | 'popup' };

/** A message as a stable finding: its first line, without URLs (their ports differ between runs). */
const oneLine = (text: string) =>
  text
    .split('\n')[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .slice(0, 160);

/** Everything the page does, in order; a step reads what came after its mark. */
function record(page: Page): { log: Seen[]; inFlight: Map<unknown, number> } {
  const log: Seen[] = [];
  const inFlight = new Map<unknown, number>(); // request -> when it started
  const origin = () => new URL(page.url()).origin;
  page.on('request', (r) => {
    const url = new URL(r.url());
    const sameOrigin = url.origin === origin();
    if (sameOrigin && r.resourceType() !== 'eventsource') inFlight.set(r, Date.now());
    log.push({
      kind: 'request',
      method: r.method(),
      path: url.pathname,
      sameOrigin,
      bearer: 'authorization' in r.headers(),
    });
  });
  page.on('requestfinished', (r) => inFlight.delete(r));
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/') && url.origin === origin()) {
      log.push({
        kind: 'response',
        status: r.status(),
        method: r.request().method(),
        path: url.pathname,
      });
    }
  });
  page.on('requestfailed', (r) => {
    inFlight.delete(r);
    const url = new URL(r.url());
    // A section that is left cancels its pollers' requests: that is cleanup, not a failure
    if (url.pathname.startsWith('/api/') && !r.failure()?.errorText.includes('ERR_ABORTED')) {
      log.push({ kind: 'failed', method: r.method(), path: url.pathname });
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error') log.push({ kind: 'console', text: oneLine(m.text()) });
  });
  page.on('pageerror', (e) => log.push({ kind: 'exception', text: oneLine(e.message) }));
  page.on('dialog', (d) => {
    log.push({ kind: 'dialog', text: d.type() });
    // A confirm is cancelled (nothing destructive runs); an alert is only read
    void (d.type() === 'alert' ? d.accept() : d.dismiss());
  });
  page.on('download', (d) => {
    log.push({ kind: 'download' });
    void d.cancel();
  });
  page.on('load', () => {
    inFlight.clear(); // the old document's requests end with it
    log.push({ kind: 'load' });
  });
  page.on('popup', (p) => {
    log.push({ kind: 'popup' });
    void p.close();
  });
  return { log, inFlight };
}

/**
 * In the page, before any of its scripts: every DOM change, and every "unavailable (...)"
 * text that appears where it can be seen (a toast is gone by the time the walk would read it).
 */
function watchDom(): void {
  const w = {
    changed: [] as Node[],
    noisy: new WeakSet<Node>(),
    reasons: new Set<string>(),
    anims: new WeakSet<Animation>(),
    values: new Map<Element, string>(),
    unread: new Set<Node>(),
    /** A reason counts once it can be seen (a toast lands in its region before the region opens). */
    read: () => {
      for (const node of w.unread) {
        const el = node instanceof Element ? node : node.parentElement;
        if (!el?.isConnected) w.unread.delete(node);
        else if (el.checkVisibility()) {
          for (const m of (node.textContent ?? '').matchAll(
            /unavailable \((?:HTTP \d+|network error)\)/g
          ))
            w.reasons.add(m[0]);
          w.unread.delete(node);
        }
      }
    },
  };
  (window as unknown as { __walk: typeof w }).__walk = w;
  const reason = /unavailable \((?:HTTP \d+|network error)\)/;
  const TOASTS = '.ferni-toast-region, .ferni-toast-live, .moments-container';
  const observe = () =>
    new MutationObserver((records) => {
      for (const r of records) {
        // A toast that times out is not a click's effect; a new one is
        const host = (r.target instanceof Element ? r.target : r.target.parentElement)?.closest(
          TOASTS
        );
        const newToast =
          r.type === 'childList' && [...r.addedNodes].some((n) => n instanceof Element);
        if (!host || newToast) w.changed.push(r.target);
        const nodes = r.type === 'characterData' ? [r.target] : [...r.addedNodes];
        for (const node of nodes) if (reason.test(node.textContent ?? '')) w.unread.add(node);
      }
      w.read();
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  observe();
}

interface Walk {
  page: Page;
  log: Seen[];
  inFlight: Map<unknown, number>;
  findings: Set<string>;
}

type WalkWindow = Window & {
  __walk: {
    changed: Node[];
    noisy: WeakSet<Node>;
    reasons: Set<string>;
    anims: WeakSet<Animation>;
    values: Map<Element, string>;
    read: () => void;
  };
};

/** Start a step: forget earlier DOM changes and reasons. */
async function mark(walk: Walk): Promise<number> {
  await walk.page.evaluate(() => {
    const w = (window as unknown as WalkWindow).__walk;
    w.changed = [];
    w.reasons.clear();
    for (const a of document.getAnimations()) w.anims.add(a);
    // A field's value is a property, not an attribute: no MutationObserver sees it change
    w.values = new Map(
      [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')].map((el) => [
        el,
        el.value,
      ])
    );
  });
  return walk.log.length;
}

/** Nodes that change with nobody touching them (pollers, clocks) don't count as a click's effect. */
async function learnNoise(walk: Walk): Promise<void> {
  await mark(walk);
  await walk.page.waitForTimeout(800);
  await walk.page.evaluate(() => {
    const w = (window as unknown as WalkWindow).__walk;
    for (const n of w.changed) w.noisy.add(n);
  });
}

/** Changes since the mark that someone could see: on a shown node, and not one that changes by itself. */
async function domEffects(
  walk: Walk
): Promise<{ changes: number; reasons: string[]; sample: string }> {
  return walk.page.evaluate(() => {
    const w = (window as unknown as WalkWindow).__walk;
    w.read();
    const shown = (n: Node | null | undefined) => {
      const el = n instanceof Element ? n : n?.parentElement;
      return !!el?.isConnected && el.checkVisibility();
    };
    const changed = w.changed.filter((n) => !w.noisy.has(n) && shown(n));
    // element.animate() only: CSS transitions and animations also run on hover and press
    const anims = document
      .getAnimations()
      .filter(
        (a) =>
          a.constructor === Animation &&
          !w.anims.has(a) &&
          shown((a.effect as KeyframeEffect | null)?.target)
      ).length;
    const fields = [...w.values].filter(
      ([el, value]) => shown(el) && (el as HTMLInputElement).value !== value
    ).length;
    const sample = changed
      .slice(0, 3)
      .map((n) =>
        n instanceof Element
          ? `${n.tagName.toLowerCase()}.${n.classList[0] ?? ''}#${n.id}`
          : '#text'
      )
      .join(' ');
    return { changes: changed.length + anims + fields, reasons: [...w.reasons], sample };
  });
}

/**
 * domEffects, or null when a navigation the click started tore the page down mid-read
 * (seen in CI: the URL check ran just before the navigation began). A reload is an effect.
 */
async function domEffectsUnlessGone(
  walk: Walk
): Promise<Awaited<ReturnType<typeof domEffects>> | null> {
  try {
    return await domEffects(walk);
  } catch (e) {
    if (!(e instanceof Error) || !/Execution context was destroyed/.test(e.message)) throw e;
    await walk.page.waitForLoadState();
    return null;
  }
}

/** Wait (up to 3s) for the screen to stop changing, so what an earlier click set off isn't credited to the next. */
async function quiet(walk: Walk): Promise<void> {
  for (const until = Date.now() + 3_000; Date.now() < until;) {
    await mark(walk);
    await walk.page.waitForTimeout(250);
    if ((await domEffects(walk)).changes === 0) return;
  }
}

/** Wait until no same-origin request has been in flight for 300ms (at most `maxMs`; a long poll is not waited for). */
async function settle(walk: Walk, maxMs = 5_000): Promise<void> {
  let quietSince = Date.now();
  for (const deadline = Date.now() + maxMs; Date.now() < deadline;) {
    await walk.page.waitForTimeout(50);
    const busy = [...walk.inFlight.values()].some((started) => Date.now() - started < maxMs);
    if (busy) quietSince = Date.now();
    else if (Date.now() - quietSince >= 300) return;
  }
}

/** Each /api/ answer of 400+ (or failed request) after `from` needs its reason on screen. */
function checkFailures(walk: Walk, from: number, reasons: string[], where: string): void {
  for (const e of walk.log.slice(from)) {
    if (
      e.kind === 'response' &&
      e.status >= 400 &&
      !reasons.includes(`unavailable (HTTP ${e.status})`)
    ) {
      walk.findings.add(`http ${e.status} with no reason shown: ${where}: ${e.method} ${e.path}`);
    }
    if (e.kind === 'failed' && !reasons.includes('unavailable (network error)')) {
      walk.findings.add(`network error with no reason shown: ${where}: ${e.method} ${e.path}`);
    }
    if (e.kind === 'exception') walk.findings.add(`exception: ${where}: ${e.text}`);
    if (e.kind === 'console' && !CONSOLE_ALLOWED.some((a) => a.pattern.test(e.text))) {
      walk.findings.add(`console.error: ${where}: ${e.text}`);
    }
  }
}

interface Control {
  index: number;
  name: string;
  /** Row controls (data-*-id) share one handler per kind: the walk clicks the first of each. */
  kind: string;
  href: string | null;
}

/** The visible, enabled controls inside `root`, tagged data-walk=<index>, named as a reader hears them. */
async function controls(walk: Walk, root: string): Promise<Control[]> {
  return walk.page.evaluate(
    ([rootSel, selector]) => {
      const found: { index: number; name: string; kind: string; href: string | null }[] = [];
      const counts = new Map<string, number>();
      document.querySelectorAll('[data-walk]').forEach((el) => el.removeAttribute('data-walk'));
      const scope = document.querySelector(rootSel);
      for (const el of scope?.querySelectorAll<HTMLElement>(selector) ?? []) {
        // The tab already shown has nothing to do: it is walked once another tab is chosen
        const current =
          el.getAttribute('role') === 'tab' && el.getAttribute('aria-selected') === 'true';
        const disabled =
          current ||
          (el as HTMLButtonElement).disabled ||
          el.getAttribute('aria-disabled') === 'true';
        if (disabled || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          continue;
        const base = (el.getAttribute('aria-label') || el.innerText || el.title || el.tagName)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60);
        const n = (counts.get(base) ?? 0) + 1;
        counts.set(base, n);
        const href =
          el.tagName === 'A' && !el.hasAttribute('data-navigate') ? el.getAttribute('href') : null;
        const name = n > 1 ? `${base} (${n})` : base;
        const data = [...el.attributes].filter(
          (a) => a.name.startsWith('data-') && a.name !== 'data-walk'
        );
        const kind = data.some((a) => a.name.endsWith('-id'))
          ? `${el.tagName}.${el.className}[${data.map((a) => (a.name.endsWith('-id') ? a.name : `${a.name}=${a.value}`)).join(',')}]`
          : name;
        el.setAttribute('data-walk', String(found.length));
        found.push({ index: found.length, name, kind, href });
      }
      return found;
    },
    [root, CONTROLS] as const
  );
}

/** A link must lead somewhere real; it is checked, not clicked, so the walk stays on the portal. */
async function checkLink(walk: Walk, where: string, c: Control, fallback: string): Promise<void> {
  const href = c.href ?? '';
  for (const [pattern, marker] of PLACEHOLDERS) {
    if (pattern.test(href))
      walk.findings.add(`placeholder "${marker}" in a link: ${where} > ${c.name}`);
  }
  const url = new URL(href, walk.page.url());
  if (url.origin !== new URL(walk.page.url()).origin) {
    if (url.protocol !== 'https:')
      walk.findings.add(`link is not https: ${where} > ${c.name} -> ${href}`);
    return;
  }
  const res = await walk.page.request.get(url.href);
  const body = await res.text();
  if (res.status() >= 400 || (/\.[a-z]+$/.test(url.pathname) && body === fallback)) {
    walk.findings.add(
      `link leads nowhere (${res.status()}): ${where} > ${c.name} -> ${url.pathname}`
    );
  }
}

/**
 * Open a section from the nav and wait for it to finish loading. It gets a second click, after
 * closing anything the last section left open: in CI one open failed once and the retry took 4s.
 * Each failed try logs its step, since CI keeps no trace.
 */
async function openSection(walk: Walk, id: string, name: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt > 1) await closeModals(walk);
      await walk.page.locator(`.admin-nav-btn[data-section="${id}"]`).click({ timeout: 10_000 });
      await expect(walk.page.locator('#adminSectionTitle')).toHaveText(name);
      await expect(walk.page).toHaveURL(new RegExp(`[?&]section=${id}\\b`));
      await expect(walk.page.locator('#adminContent .admin-loading')).toHaveCount(0, {
        timeout: 10_000,
      });
      await settle(walk);
      return true;
    } catch (e) {
      console.log(`open ${id}, try ${attempt}: ${String(e).split('\n')[0]}`);
    }
  }
  walk.findings.add(`section did not open: ${id}`);
  return false;
}

const MODAL = '.admin-modal-overlay:visible';

/** Close whatever a click left open: a confirm is cancelled, any other modal escaped. */
async function closeModals(walk: Walk): Promise<'confirm' | null> {
  const cancel = walk.page.locator(`${MODAL} [data-action="cancel"]:visible`);
  const confirmed = (await cancel.count()) > 0;
  if (confirmed) await cancel.last().click({ timeout: 3_000 });
  for (let i = 0; i < 3 && (await walk.page.locator(MODAL).count()); i++)
    await walk.page.keyboard.press('Escape');
  // One nobody can see can't be closed by hand either; clear it so the next click is judged alone
  await walk.page.evaluate(() =>
    document.querySelectorAll('.admin-modal-overlay').forEach((m) => m.remove())
  );
  return confirmed ? 'confirm' : null;
}

/**
 * Back on the section, freshly loaded, after a click navigated or reloaded the page.
 * The click's own navigation may still be landing: it can interrupt this goto, or (a reload
 * of the same URL) leave it waiting with no end. So each goto is bounded and retried, and
 * what counts is the section loading below, not the goto's own answer.
 */
async function reopen(walk: Walk, id: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await walk.page.goto(`/admin?section=${id}`, { timeout: REOPEN_GOTO_MS });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      await walk.page.waitForTimeout(500);
    }
  }
  await expect(walk.page.locator('#adminContent .admin-loading')).toHaveCount(0, {
    timeout: 15_000,
  });
  await settle(walk);
  await learnNoise(walk);
}

/** Click one control and judge it: something visible must happen. */
async function clickControl(walk: Walk, id: string, root: string, c: Control): Promise<void> {
  const where = `${id} > ${c.name}`;
  const urlBefore = walk.page.url().split('#')[0];
  await closeModals(walk);
  await quiet(walk);
  const from = await mark(walk);
  try {
    await walk.page.locator(`${root} [data-walk="${c.index}"]`).click({ timeout: 3_000 });
    // A pointer resting on a toast pauses it, and the toasts after it wait behind it
    await walk.page.mouse.move(1, 1);
  } catch {
    walk.findings.add(`could not be clicked: ${where}`);
    return;
  }
  let effect: string | undefined;
  let reasons: string[] = [];
  for (const until = Date.now() + EFFECT_MS; Date.now() < until && !effect;) {
    await walk.page.waitForTimeout(50);
    const after = walk.log.slice(from);
    const reloaded =
      after.some((e) => e.kind === 'load') || walk.page.url().split('#')[0] !== urlBefore;
    if (reloaded) return void (await reopen(walk, id));
    const dom = await domEffectsUnlessGone(walk);
    if (!dom) return void (await reopen(walk, id));
    reasons = dom.reasons;
    const other = after.find((e) => ['request', 'dialog', 'download', 'popup'].includes(e.kind));
    effect =
      dom.changes > 0
        ? `${dom.changes} changes on screen (${dom.sample})`
        : other
          ? other.kind === 'request'
            ? `${other.method} ${other.path}`
            : other.kind
          : (await walk.page.locator(MODAL).count()) > 0
            ? 'a modal'
            : undefined;
  }
  if (!effect) walk.findings.add(`dead control: ${where}`);
  await settle(walk); // what the click started may still open a modal when it answers
  const confirmed =
    (await closeModals(walk)) ??
    (walk.log.slice(from).some((e) => e.kind === 'dialog' && e.text === 'confirm')
      ? 'confirm'
      : null);
  await settle(walk);
  if (confirmed) {
    const wrote = walk.log
      .slice(from)
      .filter((e) => e.kind === 'request' && WRITES.has(e.method) && e.path.startsWith('/api/'));
    for (const e of wrote)
      if (e.kind === 'request')
        walk.findings.add(`wrote after its confirm was cancelled: ${where}: ${e.method} ${e.path}`);
  }
  // A navigation here still has the click's failures judged, on the reasons seen before it
  const last = await domEffectsUnlessGone(walk);
  reasons = [...new Set([...reasons, ...(last?.reasons ?? [])])];
  checkFailures(walk, from, reasons, where);
  if (!last) await reopen(walk, id);
}

/** Click every control in `root` (twice over, so a tab's panel is walked once it shows). */
async function walkControls(
  walk: Walk,
  id: string,
  root: string,
  fallback: string
): Promise<number> {
  const done = new Set<string>();
  await learnNoise(walk);
  for (let round = 0; round < 2; round++) {
    let list = await controls(walk, root);
    for (const first of list) {
      if (done.has(first.kind)) continue;
      done.add(first.kind);
      // Find it again if an earlier click redrew the section
      const tagged = walk.page.locator(`${root} [data-walk="${first.index}"]`);
      const same = (await tagged.count()) === 1 && (await tagged.isVisible());
      if (!same) {
        list = await controls(walk, root);
        if (!list.some((x) => x.kind === first.kind)) await reopen(walk, id);
        list = await controls(walk, root);
      }
      const c = same ? first : list.find((x) => x.kind === first.kind);
      if (!c) continue; // drawn only after another control's click: round 2 picks it up
      if (c.href !== null && !c.href.startsWith('#')) await checkLink(walk, id, c, fallback);
      else await clickControl(walk, id, root, c);
    }
  }
  return done.size;
}

function placeholdersIn(text: string): string[] {
  return PLACEHOLDERS.filter(([pattern]) => pattern.test(text)).map(([, marker]) => marker);
}

test.describe('admin portal', () => {
  test('an account without the admin claim gets no admin data', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, await createUser());
    const answered: string[] = [];
    page.on('response', (r) => {
      const url = new URL(r.url());
      const isPublic = PUBLIC_READS.some((p) => p.path.test(url.pathname));
      if (url.pathname.startsWith('/api/') && r.status() < 400 && !isPublic) {
        answered.push(`${r.status()} ${r.request().method()} ${url.pathname}`);
      }
    });
    await page.goto('/admin');
    const nav = page.locator('.admin-nav-btn[data-section]');
    await expect(nav.first()).toBeVisible({ timeout: 30_000 });
    const ids = await nav.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-section') ?? '')
    );
    expect(ids.length, 'the nav lists the sections').toBeGreaterThan(5);
    for (const id of ids) {
      await page.locator(`.admin-nav-btn[data-section="${id}"]`).click();
      await expect(page.locator('#adminContent .admin-loading')).toHaveCount(0, {
        timeout: 10_000,
      });
      await page.waitForTimeout(500);
    }
    expect(answered, 'admin reads that answered a non-admin').toEqual([]);
  });

  test('every section and every control works as an admin', async ({ page }) => {
    test.setTimeout(900_000);
    await page.addInitScript(watchDom);
    await signIn(page, await createAdminUser());
    const walk: Walk = { page, ...record(page), findings: new Set() };
    const fallback = await (await page.request.get('/admin-walk-missing.html')).text();

    await page.goto('/admin');
    const nav = page.locator('.admin-nav-btn[data-section]');
    await expect(nav.first()).toBeVisible({ timeout: 30_000 });
    const sections = await nav.evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-section') ?? '',
        name: el.querySelector('.admin-nav-text')?.textContent?.trim() ?? '',
      }))
    );
    expect(sections.length, 'the nav lists the sections').toBeGreaterThan(5);

    for (const { id, name } of sections) {
      const started = Date.now();
      const from = await mark(walk);
      if (!(await openSection(walk, id, name))) continue;
      const shown = await page.locator('#adminContent').innerText();
      for (const marker of placeholdersIn(shown))
        walk.findings.add(`placeholder "${marker}": ${id}`);
      checkFailures(walk, from, (await domEffects(walk)).reasons, id);
      const walked = await walkControls(walk, id, '#adminContent', fallback);
      console.log(`${id}: ${walked} controls, ${Date.now() - started}ms`);
    }
    // The portal's own header (Refresh, Back to App) and sidebar toggle
    await walkControls(walk, sections[0].id, '.admin-header', fallback);

    const found = [...walk.findings].sort();
    console.log(found.join('\n'));
    // The walk proves the admin claim (prod's path), not the dev-mode key a `vite dev` page also sends
    const adminRoutes = walk.log.flatMap((e) =>
      e.kind === 'request' && e.path.startsWith('/api/v1/admin/') ? [e] : []
    );
    expect(adminRoutes.length, 'admin routes the walk called').toBeGreaterThan(10);
    expect(
      adminRoutes.filter((e) => !e.bearer).map((e) => `${e.method} ${e.path}`),
      "admin requests without the admin's token"
    ).toEqual([]);
    expect(
      found.filter((f) => !(f in KNOWN_DEAD)),
      'new failures (fix them, or list them in KNOWN_DEAD with their #4069 row)'
    ).toEqual([]);
    expect(
      Object.keys(KNOWN_DEAD).filter((k) => !walk.findings.has(k)),
      'KNOWN_DEAD entries that now work: delete them'
    ).toEqual([]);
  });
});
