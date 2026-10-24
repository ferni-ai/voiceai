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
  'spotify', // starts OAuth
  'support-ferni', // opens the payment provider when the flag is on
]);

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
      await page.evaluate((a) => {
        (document.querySelector(`.settings-menu [data-action="${a}"]`) as HTMLElement).click();
      }, action);

      // The loading shell must be named too, but the real panel is checked once it lands.
      // A lazy panel may also close its shell and open nothing (referral without a link
      // shows a toast instead); that is noted, not failed.
      let opened: SeenDialog | undefined;
      let shellSeen = false;
      let unnamedShell = false;
      let outcome: 'opened' | 'closed' | null = null;
      // the shell can go a beat before the real panel fades in, so "closed" needs a quiet spell
      let shellGoneAt: number | null = null;
      await expect
        .poll(
          async () => {
            const fresh = (await visibleDialogs(page)).filter((d) => !before.has(d.sel));
            const shells = fresh.filter((d) => d.shell);
            if (shells.length) shellSeen = true;
            if (shells.some((d) => !d.name)) unnamedShell = true;
            opened = fresh.find((d) => !d.shell);
            shellGoneAt = shellSeen && !shells.length ? (shellGoneAt ?? Date.now()) : null;
            const closed = shellGoneAt !== null && Date.now() - shellGoneAt >= 1_500;
            outcome = opened ? 'opened' : closed ? 'closed' : null;
            return outcome;
          },
          { timeout: 25_000 }
        )
        .not.toBeNull()
        .catch(() => undefined);
      if (unnamedShell) problems.push(`${action}: loading shell has no name`);
      if (outcome === 'closed') {
        closedWithoutPanel.push(action);
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
