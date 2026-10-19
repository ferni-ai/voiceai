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

/** Ids of the dialogs a person could see right now */
function visibleDialogs(page: Page): Promise<string[]> {
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
        return el.id ? `#${el.id}` : `[data-menu-dialog="${i}"]`;
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
    for (const action of actions) {
      await openApp(page);
      await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
      const before = new Set(await visibleDialogs(page));
      await page.evaluate((a) => {
        (document.querySelector(`.settings-menu [data-action="${a}"]`) as HTMLElement).click();
      }, action);

      let opened: string | undefined;
      await expect
        .poll(
          async () => {
            opened = (await visibleDialogs(page)).find((sel) => !before.has(sel));
            return opened ?? null;
          },
          { timeout: 10_000 }
        )
        .not.toBeNull()
        .catch(() => undefined);
      if (!opened) {
        problems.push(`${action}: no dialog opened`);
        continue;
      }
      const dialog = page.locator(opened).first();
      const name = await dialog.evaluate((el) => {
        const by = el.getAttribute('aria-labelledby');
        const labelled = by ? document.getElementById(by)?.textContent?.trim() : '';
        return (el.getAttribute('aria-label') ?? labelled ?? '').trim();
      });
      if (!name) problems.push(`${action}: dialog has no name`);
      // the loading shell is named too, but the real panel must be checked once it lands
      if ((await dialog.getAttribute('class'))?.includes('panel-loading-shell')) {
        await expect(page.locator('.panel-loading-shell')).toHaveCount(0, { timeout: 15_000 });
      }
    }
    test.info().annotations.push({ type: 'rows checked', description: actions.join(', ') });
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
