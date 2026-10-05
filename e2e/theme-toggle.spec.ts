/**
 * Theme toggle, from the sign-in screen through the settings picker.
 *
 * The dev server accepts ?e2e=1 so these tests can open Settings without a
 * Google or Apple session. Production builds do not.
 */

import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';

interface SurfaceReading {
  bodyBg: string;
  theme: string | null;
  chrome: string | null;
  stored: string | null;
  panelBg: string | null;
  titleColor: string | null;
  titleContrast: number;
}

function contrastRatio(foreground: string, background: string): number {
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = (color: string): number => {
    const parts = color.match(/[\d.]+/g);
    if (!parts || parts.length < 3) return 0;
    const [r, g, b] = parts.slice(0, 3).map(Number);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const hi = Math.max(lum(foreground), lum(background));
  const lo = Math.min(lum(foreground), lum(background));
  return (hi + 0.05) / (lo + 0.05);
}

async function openThemePicker(page: Page, theme: 'midnight' | 'zen'): Promise<void> {
  await page.addInitScript((stored) => {
    localStorage.setItem('voiceai-theme', stored);
  }, theme);
  await page.goto(`${BASE_URL}/?e2e=1`);
  const trigger = page.locator('.settings-trigger');
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  await expect(page.locator('.settings-menu--visible')).toBeVisible();
  const themeItem = page.locator('[data-action="theme"]');
  await themeItem.scrollIntoViewIfNeeded();
  await themeItem.click();
  await expect(page.locator('.theme-language-settings--visible')).toBeVisible();
  await expect(page.getByText('Night Ink')).toBeVisible();
  await expect(page.getByText('Zen Garden')).toBeVisible();
}

async function readSurface(page: Page): Promise<SurfaceReading> {
  return page.evaluate(() => {
    const panel = document.querySelector('.theme-language-settings__panel');
    const title = document.querySelector('.theme-language-settings__title');
    const panelBg = panel ? getComputedStyle(panel).backgroundColor : null;
    const titleColor = title ? getComputedStyle(title).color : null;
    const channel = (value: number): number => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (color: string): number => {
      const parts = color.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return 0;
      const [r, g, b] = parts.slice(0, 3).map(Number);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const titleContrast =
      panelBg && titleColor
        ? (Math.max(lum(titleColor), lum(panelBg)) + 0.05) /
          (Math.min(lum(titleColor), lum(panelBg)) + 0.05)
        : 0;
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      theme: document.documentElement.getAttribute('data-theme'),
      chrome: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
      stored: localStorage.getItem('voiceai-theme'),
      panelBg,
      titleColor,
      titleContrast,
    };
  });
}

test.describe('Theme Toggle UI', () => {
  test.describe.configure({ timeout: 60_000 });
  test('dark theme applies Night Ink on the sign-in screen', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('voiceai-theme', 'midnight');
    });
    await page.goto(BASE_URL);
    await page.waitForSelector('.sign-in-gate-btn--apple', { timeout: 10000 });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(20, 17, 14)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#14110e');

    const apple = page.locator('.sign-in-gate-btn--apple');
    const appleBg = await apple.evaluate((el) => getComputedStyle(el).backgroundColor);
    const appleText = await apple.evaluate((el) => getComputedStyle(el).color);
    expect(appleBg).toBe('rgb(244, 239, 230)');
    expect(appleText).toBe('rgb(20, 17, 14)');
    expect(contrastRatio(appleText, appleBg)).toBeGreaterThan(7);
  });

  test('light theme applies zen chrome on the sign-in screen', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('voiceai-theme', 'zen');
    });
    await page.goto(BASE_URL);
    await page.waitForSelector('.sign-in-gate-btn--apple', { timeout: 10000 });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'zen');
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(250, 250, 249)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#fafaf9');
  });

  test('follows the system dark theme on a first visit', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.removeItem('voiceai-theme');
    });
    await page.goto(BASE_URL);
    await page.waitForSelector('.sign-in-gate-btn--apple', { timeout: 10000 });

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    const persisted = await page.evaluate(() => localStorage.getItem('voiceai-theme'));
    expect(persisted).toBeNull();
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(20, 17, 14)');
  });

  test('settings picker switches Night Ink and Zen and keeps the choice', async ({ page }) => {
    await openThemePicker(page, 'zen');

    const night = page.locator('[data-action="set-theme"][data-theme="midnight"]');
    const zen = page.locator('[data-action="set-theme"][data-theme="zen"]');
    await night.click();

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(20, 17, 14)');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.getElementById('app')!).backgroundColor))
      .toBe('rgb(20, 17, 14)');
    const dark = await readSurface(page);
    expect(dark.theme).toBe('midnight');
    expect(dark.bodyBg).toBe('rgb(20, 17, 14)');
    expect(dark.chrome).toBe('#14110e');
    expect(dark.stored).toBe('midnight');
    expect(dark.panelBg).toBe('rgb(53, 46, 40)');
    expect(dark.titleColor).toBe('rgb(244, 239, 230)');
    expect(dark.titleContrast).toBeGreaterThan(7);

    const preview = page.locator('.theme-language-settings__theme-preview--midnight');
    const previewBg = await preview.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(previewBg).toBe('rgb(20, 17, 14)');

    await zen.click();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(250, 250, 249)');
    const light = await readSurface(page);
    expect(light.theme).toBe('zen');
    expect(light.bodyBg).toBe('rgb(250, 250, 249)');
    expect(light.chrome).toBe('#fafaf9');
    expect(light.stored).toBe('zen');
    expect(light.titleContrast).toBeGreaterThan(7);

    await page.reload();
    await expect(page.locator('.settings-trigger')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'zen');
    const afterReload = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(afterReload).toBe('rgb(250, 250, 249)');
    expect(await page.evaluate(() => localStorage.getItem('voiceai-theme'))).toBe('zen');
  });

  test('theme choice is keyboard accessible', async ({ page }) => {
    await openThemePicker(page, 'zen');
    const night = page.locator('[data-action="set-theme"][data-theme="midnight"]');
    await night.focus();
    await expect(night).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(20, 17, 14)');
    expect(await page.evaluate(() => localStorage.getItem('voiceai-theme'))).toBe('midnight');
  });
});
