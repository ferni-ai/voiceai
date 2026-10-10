/**
 * Helpers for e2e runs against the signed-in local stack
 * (scripts/e2e/start-signed-in-stack.sh: Firebase emulators + API + Vite dev server).
 */
import { expect, type Page } from '@playwright/test';

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099';
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-ferni';

export interface TestUser {
  email: string;
  password: string;
  uid: string;
}

/** A brand-new account in the Auth emulator; `verified` mirrors Google/Apple sign-ins. */
export async function createUser({ verified = true } = {}): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@ferni.local`;
  const password = `pw-${Math.random().toString(36).slice(2)}-A1!`;
  const signUp = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  expect(signUp.ok, `emulator sign-up failed: ${signUp.status}`).toBe(true);
  const { localId } = (await signUp.json()) as { localId: string };
  if (verified) {
    const update = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ localId, emailVerified: true, displayName: 'E2E Tester' }),
    });
    expect(update.ok, `emulator verify failed: ${update.status}`).toBe(true);
  }
  return { email, password, uid: localId };
}

/** Sign in through the app's own Firebase Auth instance (dev server only). */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('ferni:use-demo-data', 'false'));
  await expect(page.locator('[data-provider="google"], [data-provider="emulator"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(async ({ email, password }) => {
    const firebase = await import(/* @vite-ignore */ '/src/config/firebase.ts');
    const auth = await import(/* @vite-ignore */ '/node_modules/.vite/deps/firebase_auth.js');
    await auth.signInWithEmailAndPassword(firebase.getFirebaseAuth(), email, password);
  }, user);
}

/** The settings button on wide screens; on phones, the quick-actions sheet button. */
export function menuTrigger(page: Page) {
  // By class, not label: the labels are translated
  return page.locator('.settings-trigger:visible, .mobile-menu-trigger:visible').first();
}

/** Open the settings menu the way this screen size does. */
export async function openSettingsMenu(page: Page): Promise<void> {
  const trigger = menuTrigger(page);
  const viaSheet = await trigger.evaluate((el) => el.classList.contains('mobile-menu-trigger'));
  await trigger.click();
  if (viaSheet) await page.locator('.mobile-bottom-sheet [data-action="settings"]').click();
  await expect(page.locator('.settings-menu--visible')).toBeVisible();
}

/** Wait until the signed-in home screen is usable. */
export async function expectHome(page: Page): Promise<void> {
  await expect(menuTrigger(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#connectBtn')).toBeVisible({ timeout: 30_000 });
}

/**
 * Everything that went wrong while a feature was in use: console errors,
 * uncaught exceptions, and API calls answered with 4xx/5xx.
 */
export function watchProblems(page: Page): { take: () => string[] } {
  let problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) => problems.push(`exception: ${error.message.slice(0, 300)}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) {
      problems.push(`api ${response.status()}: ${response.request().method()} ${url.pathname}`);
    }
  });
  return {
    take: () => {
      const taken = problems;
      problems = [];
      return taken;
    },
  };
}

/** Visible text that is a raw i18n key such as "menu.items.garden". */
export async function rawKeysOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const keyLike = /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
    const found = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim() ?? '')
        .join(' ')
        .trim();
      for (const text of [own, el.getAttribute('aria-label') ?? '', el.getAttribute('placeholder') ?? '']) {
        if (keyLike.test(text)) found.add(text);
      }
    }
    return [...found];
  });
}

const DIALOGS = '[role="dialog"], [role="alertdialog"]';

/** Dialogs on screen right now (visible, opaque enough to read, usable). */
export async function shownDialogs(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        let opacity = 1;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity || 1);
        return (
          rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none' &&
          opacity > 0.05 && rect.right > 0 && rect.left < innerWidth && !el.closest('.settings-menu')
        );
      })
      .map((el) => {
        el.dataset.e2eDialog ||= Math.random().toString(36).slice(2);
        return el.dataset.e2eDialog as string;
      });
  }, DIALOGS);
}

/** Wait for a dialog that wasn't on screen before the click; return its locator. */
export async function newPanel(page: Page, before: string[], action: string) {
  let opened: string | undefined;
  await expect
    .poll(async () => (opened = (await shownDialogs(page)).find((id) => !before.includes(id))), {
      message: `${action} did not open a panel`,
      timeout: 8_000,
    })
    .toBeTruthy();
  return page.locator(`[data-e2e-dialog="${opened}"]`);
}

export async function isGone(page: Page, id: string): Promise<boolean> {
  return !(await shownDialogs(page)).includes(id);
}
