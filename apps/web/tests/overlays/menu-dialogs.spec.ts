/**
 * Every menu row opens a named modal dialog (playwright.overlays.config.ts).
 *
 * 2026-10-18 UI audit: Your Day (Hub), Trust & Growth and Make It Yours opened
 * as plain divs, so screen readers never heard a dialog open and Tab walked out
 * into the page behind. This opens each row of the menu and asserts a visible
 * role="dialog" with an accessible name appears.
 *
 * There is no API server here, so panels open in their empty or error states;
 * the dialog semantics must hold in those states too.
 */
import { expect, test, type Page } from '@playwright/test';

/** Rows that leave the page or start something rather than opening a panel */
const NOT_PANELS = new Set([
  'sign-out', // signs out
  'support-ferni', // opens the payment provider when the flag is on
]);

/**
 * Rows whose lazy panel may close its loading shell and open nothing here. With no
 * API, share-ferni can't load a link, so openReferral shows a toast instead
 * (referral.ui.ts). Any other row doing this fails.
 */
const CLOSES_WITHOUT_PANEL = new Set(['share-ferni']);

async function openApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ferni_user_id', 'e2e-user');
    } catch {
      /* private mode */
    }
  });
  await page.goto('/?e2e=1');
  await page.locator('.settings-trigger').waitFor({ state: 'attached' });
}

/** Menu rows, read from the rendered menu (toggles switch in place) */
async function menuActions(page: Page): Promise<string[]> {
  await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.settings-menu .settings-menu__item[data-action]')]
      .filter((el) => el.dataset.toggle !== 'true' && el.style.display !== 'none')
      .map((el) => el.dataset.action as string)
  );
}

/**
 * Record the name of every loading shell the next click puts up, however briefly.
 * On a fast runner a shell can open and close between two polls, so polling alone
 * saw no dialog at all (#2711 round 2). The shell is built and named before it is
 * appended to <body> (panel-loading-shell.ts), so its name is readable on insertion.
 */
async function watchShells(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __shells: string[]; __shellObserver?: MutationObserver };
    w.__shellObserver?.disconnect();
    w.__shells = [];
    w.__shellObserver = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (!(n instanceof Element) || !n.classList.contains('panel-loading-shell')) continue;
          const by = n.getAttribute('aria-labelledby');
          const labelled = by ? document.getElementById(by)?.textContent?.trim() : '';
          w.__shells.push((n.getAttribute('aria-label') ?? labelled ?? '').trim());
        }
      }
    });
    w.__shellObserver.observe(document.body, { childList: true });
  });
}

function shellsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __shells?: string[] }).__shells ?? []);
}

interface SeenDialog {
  sel: string;
  name: string;
  /** panel-loading-shell: a lazy panel's placeholder, replaced once the panel loads */
  shell: boolean;
}

/**
 * The dialogs a person could see right now, each read in this one pass. Reading a
 * dialog again later by selector raced the loading shell being swapped for the real
 * panel: the selector then matched nothing and the read waited out the whole test.
 */
function visibleDialogs(page: Page): Promise<SeenDialog[]> {
  return page.evaluate(() => {
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
        if (n.getAttribute('aria-hidden') === 'true') return false;
      }
      return true;
    };
    return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
      .filter(shown)
      .map((el, i) => {
        if (!el.id) el.setAttribute('data-menu-dialog', String(i));
        const by = el.getAttribute('aria-labelledby');
        const labelled = by ? document.getElementById(by)?.textContent?.trim() : '';
        return {
          sel: el.id ? `#${el.id}` : `[data-menu-dialog="${i}"]`,
          name: (el.getAttribute('aria-label') ?? labelled ?? '').trim(),
          shell: el.classList.contains('panel-loading-shell'),
        };
      });
  });
}

test.describe('menu panels are named modal dialogs', () => {
  test('every row opens one', async ({ page }) => {
    test.setTimeout(240_000);
    await openApp(page);
    const actions = (await menuActions(page)).filter((a) => !NOT_PANELS.has(a));
    expect(actions.length).toBeGreaterThan(20);

    const problems: string[] = [];
    const closedWithoutPanel: string[] = [];
    for (const action of actions) {
      await openApp(page);
      await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
      const before = new Set((await visibleDialogs(page)).map((d) => d.sel));
      await watchShells(page);
      await page.evaluate((a) => {
        (document.querySelector(`.settings-menu [data-action="${a}"]`) as HTMLElement).click();
      }, action);

      // The loading shell must be named too, but the real panel is checked once it lands.
      // A lazy panel may also close its shell and open nothing: allowed only for the
      // rows in CLOSES_WITHOUT_PANEL.
      let opened: SeenDialog | undefined;
      let shellSeen = false;
      let outcome: 'opened' | 'closed' | null = null;
      // the shell can go a beat before the real panel fades in, so "closed" needs a 3 s quiet spell
      let shellGoneAt: number | null = null;
      await expect
        .poll(
          async () => {
            const fresh = (await visibleDialogs(page)).filter((d) => !before.has(d.sel));
            const shells = fresh.filter((d) => d.shell);
            shellSeen = (await shellsSeen(page)).length > 0;
            opened = fresh.find((d) => !d.shell);
            shellGoneAt = shellSeen && !shells.length ? (shellGoneAt ?? Date.now()) : null;
            const closed = shellGoneAt !== null && Date.now() - shellGoneAt >= 3_000;
            outcome = opened ? 'opened' : closed ? 'closed' : null;
            return outcome;
          },
          { timeout: 25_000 }
        )
        .not.toBeNull()
        .catch(() => undefined);
      if ((await shellsSeen(page)).some((name) => !name)) problems.push(`${action}: loading shell has no name`);
      if (outcome === 'closed') {
        closedWithoutPanel.push(action);
        if (!CLOSES_WITHOUT_PANEL.has(action)) problems.push(`${action}: loading shell closed and no panel opened`);
        continue;
      }
      if (!opened) {
        problems.push(shellSeen ? `${action}: still loading after 25 s` : `${action}: no dialog opened`);
        continue;
      }
      if (!opened.name) problems.push(`${action}: dialog has no name`);
    }
    test.info().annotations.push({ type: 'rows checked', description: actions.join(', ') });
    if (closedWithoutPanel.length) {
      test.info().annotations.push({ type: 'closed without a panel', description: closedWithoutPanel.join(', ') });
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
