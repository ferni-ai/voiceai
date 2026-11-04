/**
 * axe over every menu panel (playwright.overlays.config.ts).
 *
 * 2026-10-18 UI audit: the menu panels had serious axe findings (aria-label on a
 * plain div, an unnamed nested dialog, scroll areas a keyboard can't reach). This
 * opens each menu row, light and dark, and asserts no serious or critical axe
 * violations inside the panel that opened.
 *
 * There is no API server here, so panels open in their empty or error states.
 *
 * A row whose panel never appears is a failure, not a pass: a panel that mounts
 * late or not at all would otherwise go unscanned while the run stayed green.
 *
 * Each panel is scanned top to bottom: every scroll area in it is stepped through
 * its full height with a scan at each step. axe reports contrast reliably only for
 * what is inside the viewport. On a phone, rows below the fold of a scrolling
 * modal were reported on some runs and silently left out on others, never marked
 * incomplete (the quiet-hours time labels in contact settings, #3335). A panel
 * that runs past the fold but can't be scrolled there fails instead of passing on
 * the part that was visible.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['zen', 'midnight'] as const;
/** Rows that leave the page or start something rather than opening a panel */
const NOT_PANELS = new Set(['sign-out', 'support-ferni']);
/**
 * Rows that open no panel here, so there is nothing to scan. With no API,
 * share-ferni can't load a link and openReferral shows a toast instead
 * (referral.ui.ts); menu-dialogs.spec.ts allows the same row to close without a
 * panel. Any other row that opens no panel fails this test.
 */
const NO_PANEL = new Set(['share-ferni']);
/** How long a row's panel may take to appear before the row counts as skipped */
const PANEL_TIMEOUT_MS = 15_000;
/** Scans one panel may take; a taller panel fails rather than going partly unscanned */
const MAX_SCANS_PER_PANEL = 12;
/** Each scroll step moves this share of the visible height, so steps overlap */
const SCROLL_STRIDE = 0.8;
const BLOCKING = new Set(['serious', 'critical']);

async function openApp(page: Page, theme: string): Promise<void> {
  await page.addInitScript((th) => {
    try {
      localStorage.setItem('ferni_user_id', 'e2e-user');
      localStorage.setItem('ferni_theme', th);
      localStorage.setItem('voiceai-theme', th);
    } catch {
      /* private mode */
    }
  }, theme);
  await page.goto('/?e2e=1');
  await page.locator('.settings-trigger').waitFor({ state: 'attached' });
}

async function openRow(page: Page, action: string): Promise<void> {
  await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
  await page.evaluate((a) => {
    (document.querySelector(`.settings-menu [data-action="${a}"]`) as HTMLElement).click();
  }, action);
}

/** The topmost visible dialog, marked so axe can be scoped to it */
async function markOpenPanel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (
        !r.width ||
        !r.height ||
        r.right <= 0 ||
        r.left >= innerWidth ||
        r.bottom <= 0 ||
        r.top >= innerHeight
      )
        return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05)
          return false;
        if (n.getAttribute('aria-hidden') === 'true') return false;
      }
      return true;
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(
      shown
    );
    const top = dialogs.pop();
    if (!top || top.closest('.mobile-bottom-sheet, .panel-loading-shell')) return false;
    top.setAttribute('data-axe-panel', '');
    return true;
  });
}

/**
 * Wait until the marked panel has loaded and nothing in it is mid-fade. With no API
 * here a panel's fetch fails, then it renders its fallback rows and staggers them in
 * (history: ~1.5 s to the demo rows, then 200 ms + 50 ms per row, then 300 ms). The
 * old fixed sleep let a slow runner scan those rows at ~70% opacity and report
 * contrast failures on colours nobody sees once the panel settles (#2391).
 * Looping animations (spinners) don't count. A panel that never finishes loading is
 * scanned as it is after the timeout, and the test records that it was.
 *
 * @returns false if the panel was still loading or moving at the timeout
 */
async function waitForPanelToSettle(page: Page): Promise<boolean> {
  return expect
    .poll(
      () =>
        page.evaluate(() => {
          const panel = document.querySelector('[data-axe-panel]');
          if (!panel) return true;
          const visible = (el: Element): boolean => el.getClientRects().length > 0;
          const loading = [
            ...panel.querySelectorAll('[aria-busy="true"], [class*="__loading"]'),
          ].some(visible);
          const moving = panel
            .getAnimations({ subtree: true })
            .some(
              (a) =>
                a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity
            );
          // a staggered row parked at opacity 0 whose fade hasn't started yet
          const waiting = [...panel.querySelectorAll<HTMLElement>('[style*="opacity"]')].some(
            (el) => el.style.opacity === '0'
          );
          return !loading && !moving && !waiting;
        }),
      { timeout: 6_000, intervals: [100, 150, 250] }
    )
    .toBe(true)
    .then(
      () => true,
      () => false
    );
}

interface Sweep {
  /** Scans run, the first at the panel's opening scroll position */
  scans: number;
  /** Set when part of the panel could not be brought into view and scanned */
  problem?: string;
  /** A scroll step was scanned before its content stopped moving */
  unsettled: boolean;
}

/**
 * Run `scan` with the marked panel at its opening position, then step each of its
 * scroll areas from top to bottom and run `scan` at every step. Text below the
 * fold that no scroll area can bring up, a scroll area that stops short, a sweep
 * that ends before the bottom, or a panel taller than MAX_SCANS_PER_PANEL steps
 * comes back with a `problem`.
 */
async function sweepPanel(page: Page, scan: () => Promise<void>): Promise<Sweep> {
  const sweep: Sweep = { scans: 0, unsettled: false };
  const scanHere = async (): Promise<void> => {
    await scan();
    sweep.scans += 1;
  };
  await scanHere();

  const { areas, unreachable } = await page.evaluate(() => {
    const panel = document.querySelector('[data-axe-panel]');
    if (!panel) return { areas: 0, unreachable: '' };
    const inside = [...panel.querySelectorAll('*')];
    const scrolls = (el: Element): boolean =>
      ['auto', 'scroll', 'overlay'].includes(getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight + 1;
    const found = [panel, ...inside].filter(scrolls);
    // text that sits past the fold with no scroll area around it to bring it up
    const strandedText = (): Element | undefined =>
      inside.find((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.bottom > innerHeight + 1 &&
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) &&
          !found.some((area) => area !== el && area.contains(el))
        );
      });
    let stranded = strandedText();
    // a panel laid out in the page itself scrolls with the document
    const doc = document.scrollingElement;
    if (stranded && doc && doc.scrollHeight > doc.clientHeight + 1) {
      found.push(doc);
      stranded = strandedText();
    }
    found.forEach((el, i) => el.setAttribute('data-axe-scroll-area', String(i)));
    const name = stranded ? `${stranded.tagName.toLowerCase()}.${stranded.classList[0] ?? ''}` : '';
    return { areas: found.length, unreachable: name };
  });
  if (unreachable) sweep.problem = `${unreachable} is below the fold and nothing scrolls to it`;

  for (let i = 0; i < areas && !sweep.problem; i++) {
    const area = page.locator(`[data-axe-scroll-area="${i}"]`);
    const { height, end } = await area.evaluate((el) => ({
      height: el.clientHeight,
      end: el.scrollHeight - el.clientHeight,
    }));
    const stride = Math.max(1, Math.floor(height * SCROLL_STRIDE));
    let scannedAt = 0;
    for (let top = 0; top < end;) {
      if (sweep.scans >= MAX_SCANS_PER_PANEL) {
        sweep.problem = `taller than ${MAX_SCANS_PER_PANEL} scroll steps`;
        break;
      }
      top = Math.min(top + stride, end);
      const reached = await area.evaluate((el, to) => {
        (el as HTMLElement).style.scrollBehavior = 'auto';
        el.scrollTop = to;
        return el.scrollTop;
      }, top);
      if (Math.abs(reached - top) > 2) {
        sweep.problem = `scroll area ${i} stops at ${Math.round(reached)} of ${end} px`;
        break;
      }
      // let scroll-triggered reveals start before checking that nothing moves
      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      );
      if (!(await waitForPanelToSettle(page))) sweep.unsettled = true;
      await scanHere();
      scannedAt = reached;
    }
    // The last scan must be at the bottom. A loop bound that stops one step early
    // leaves the last stretch unscanned and nothing else notices.
    if (!sweep.problem && end - scannedAt > 1) {
      sweep.problem = `scroll area ${i}: last scan at ${Math.round(scannedAt)} of ${end} px`;
    }
    await area.evaluate((el) => {
      el.scrollTop = 0;
    });
  }
  return sweep;
}

for (const theme of THEMES) {
  test(`menu panels have no serious or critical axe violations (${theme})`, async ({ page }) => {
    test.setTimeout(300_000);
    await openApp(page, theme);
    await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
    const actions = (
      await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.settings-menu .settings-menu__item[data-action]'
          ),
        ]
          .filter((el) => el.dataset.toggle !== 'true' && el.style.display !== 'none')
          .map((el) => el.dataset.action as string)
      )
    ).filter((a) => !NOT_PANELS.has(a));
    expect(actions.length).toBeGreaterThan(20);

    const findings = new Set<string>();
    const scanned: string[] = [];
    const steps: string[] = [];
    const unswept: string[] = [];
    const unsettled: string[] = [];
    const skipped: { action: string; reason: string }[] = [];
    for (const action of actions) {
      await openApp(page, theme);
      await openRow(page, action);
      // let the panel load (or fail to) and finish animating in
      const marked = await expect
        .poll(() => markOpenPanel(page), { timeout: PANEL_TIMEOUT_MS })
        .toBe(true)
        .then(
          () => true,
          () => false
        );
      if (!marked) {
        skipped.push({ action, reason: `no panel after ${PANEL_TIMEOUT_MS / 1000} s` });
        continue;
      }
      await page.waitForTimeout(800);
      if (!(await page.locator('[data-axe-panel]').count())) {
        skipped.push({ action, reason: 'panel closed before the scan' });
        continue;
      }
      const settled = await waitForPanelToSettle(page);
      const sweep = await sweepPanel(page, async () => {
        const { violations } = await new AxeBuilder({ page }).include('[data-axe-panel]').analyze();
        for (const v of violations.filter((x) => BLOCKING.has(x.impact ?? ''))) {
          for (const node of v.nodes) {
            // the same node seen from two scroll steps is one finding
            findings.add(
              `${action}: ${v.id} (${v.impact}) at ${node.target.join(' ')}: ${(node.any[0]?.message ?? '').slice(0, 140)}`
            );
          }
        }
      });
      if (!settled || sweep.unsettled) unsettled.push(action);
      if (sweep.scans > 1) steps.push(`${action} ×${sweep.scans}`);
      if (sweep.problem) unswept.push(`${action} (${sweep.problem})`);
      scanned.push(action);
    }

    const { annotations } = test.info();
    annotations.push({ type: 'panels scanned', description: scanned.join(', ') || 'none' });
    const describe = ({ action, reason }: { action: string; reason: string }) =>
      `${action} (${reason})`;
    if (skipped.length)
      annotations.push({ type: 'panels skipped', description: skipped.map(describe).join(', ') });
    if (unsettled.length)
      annotations.push({ type: 'scanned before settling', description: unsettled.join(', ') });
    if (steps.length) annotations.push({ type: 'scroll steps', description: steps.join(', ') });
    if (unswept.length)
      annotations.push({ type: 'not scanned top to bottom', description: unswept.join(', ') });

    const unexpectedSkips = skipped.filter((s) => !NO_PANEL.has(s.action)).map(describe);
    expect.soft(unexpectedSkips, `rows never scanned:\n${unexpectedSkips.join('\n')}`).toEqual([]);
    expect.soft(unswept, `rows not scanned top to bottom:\n${unswept.join('\n')}`).toEqual([]);
    // The report must match what ran: every row is listed once, as scanned or skipped.
    const listed = annotations.find((a) => a.type === 'panels scanned')?.description ?? '';
    const listedRows = listed === 'none' ? [] : listed.split(', ');
    const skippedRows = skipped.map((s) => s.action);
    expect
      .soft([...listedRows, ...skippedRows].sort(), 'rows listed as scanned plus rows skipped')
      .toEqual([...actions].sort());
    // An exemption whose row now opens a panel (or is gone) is stale.
    const staleExemptions = [...NO_PANEL].filter((a) => !skippedRows.includes(a));
    expect
      .soft(staleExemptions, 'NO_PANEL rows that now open a panel or left the menu; remove them')
      .toEqual([]);
    expect([...findings], [...findings].join('\n')).toEqual([]);
  });
}
