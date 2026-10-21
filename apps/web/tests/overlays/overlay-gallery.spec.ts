/**
 * Overlay gallery checks (playwright.overlays.config.ts).
 *
 * Every gallery scene, light and dark, on a phone and a desktop viewport:
 * 1. Contrast: axe color-contrast plus the gallery probe (which sees text on
 *    gradients) may not exceed contrast-baseline.json (a ratchet: today's
 *    failures are recorded, new ones fail).
 * 2. A visual snapshot per scene and theme.
 * With the overlay-host flag on, the toast region must also stay inside the
 * viewport with even gutters, clear of Connect and the menu trigger, and in
 * the top layer.
 *
 * Refresh the contrast baseline after fixing violations (one worker, so the
 * file is written once per test in order):
 *   UPDATE_CONTRAST_BASELINE=1 pnpm exec playwright test -c playwright.overlays.config.ts --workers=1 -g contrast
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENES = [
  'toast-pair',
  'toast-error',
  'toast-long',
  'toast-warning',
  'notice-action',
  'achievement',
  'celebration',
  'milestone',
  'first-milestone',
  'notification-card',
  'outreach',
  'offline-banner',
  'reconnecting',
  'weak-connection',
  'collision',
  'modal',
  'sheet',
  'toast-over-sheet',
  'permission',
  'action-confirmation',
  'call-notice',
  'command-palette',
  'coach-mark',
  'captions',
  'caption-moments',
  'caption-breath',
  'caption-heard',
  'caption-heard-reply',
] as const;

const BASELINE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'contrast-baseline.json');
const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
const updating = process.env.UPDATE_CONTRAST_BASELINE === '1';

/** Wait until no finite animation or transition is still running (5 s cap). */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
      null,
      { timeout: 5_000 }
    )
    .catch(() => undefined);
}

async function openScene(page: Page, scene: string, flagOn = false): Promise<void> {
  await page.addInitScript(
    ([withAchievement, overlayHost, withCaptions, withBreath, withHeard]) => {
      try {
        // The first chat of the day unlocks Early Bird; keep it to the scenes that show it.
        if (!withAchievement)
          localStorage.setItem('ferni-last-interaction-date', new Date().toDateString());
        if (overlayHost) localStorage.setItem('ferni:flag:overlay-host', 'true');
        // Live captions need their flag and the transcription setting, or the scene shows none.
        if (withCaptions) {
          localStorage.setItem('ferni:flag:captions-v2', 'true');
          localStorage.setItem('ferni_show_transcription', 'true');
        }
        if (withBreath) localStorage.setItem('ferni:flag:captions-breath', 'true');
        if (withHeard) localStorage.setItem('ferni:flag:captions-heard', 'true');
        // The welcome tour is not a gallery scene; on a slow runner it opened mid-test.
        localStorage.setItem('ferni:onboarding:complete', 'true');
      } catch {
        // Storage unavailable: the scene still renders.
      }
    },
    [
      scene === 'achievement' || scene === 'collision',
      flagOn,
      scene === 'captions' ||
        scene === 'caption-moments' ||
        scene === 'caption-breath' ||
        scene.startsWith('caption-heard'),
      scene === 'caption-breath',
      scene.startsWith('caption-heard'),
    ] as const
  );
  // Pin the wall clock: greetings, countdowns and time-of-day features must not
  // depend on when CI runs (a run between 00:00 and 05:00 showed Night Owl).
  await page.clock.setFixedTime(new Date('2026-10-12T14:00:00'));
  await page.goto(`/?e2e=1&gallery=overlays&scene=${scene}`);
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready,
    null,
    {
      timeout: 45_000,
    }
  );
  await page.waitForTimeout(600); // entrance transitions
  // Wait for the app shell to stop moving (late chips and badges shift it by a few px).
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => {
      const r = document.getElementById('connectBtn')?.getBoundingClientRect();
      return r ? `${r.x},${r.y},${r.width},${r.height}` : '';
    });
    if (now && now === last) break;
    last = now;
    await page.waitForTimeout(250);
  }
  // Let finite entrance animations and transitions finish (the busier the machine, the longer).
  await settleAnimations(page);
  // Freeze transitions from here on, so a theme switch can't be measured mid-fade.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
}

/** Switch theme in place (the gallery keeps its overlays open). */
async function useTheme(page: Page, theme: 'zen' | 'midnight'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme === 'midnight' ? 'dark' : 'light' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  // A late entrance (a coach mark fading in) can still be running; measure it settled.
  await settleAnimations(page);
}

/**
 * Scenes whose overlays keep animating (sparkles, the avatar's stretch, several
 * arrivals at once) are contrast-checked but not pixel-compared: their frames
 * differ run to run on a busy runner. Captions too: on a phone the in-call
 * layout is still settling, so they show three lines, one or none depending on
 * when the frame is taken (tests/e2e/captions-layout.spec.ts checks their box).
 * Caption moments add a chip that springs in and leaves after 9 s.
 */
const NO_SNAPSHOT = new Set([
  'achievement',
  'celebration',
  'first-milestone',
  'collision',
  'captions',
  'caption-moments',
  'caption-breath',
  'caption-heard',
  'caption-heard-reply',
]);

/** Text that changes with the clock or animates, kept out of the pixel diff. */
const MASKS = ['.avatar-container', '.settings-menu__header-eyebrow', '.countdown-text'];

test('the spec covers every gallery scene', async ({ page }) => {
  await openScene(page, 'toast-pair');
  const scenes = await page.evaluate(
    () => (window as unknown as { __overlayGallery: { scenes: string[] } }).__overlayGallery.scenes
  );
  expect([...scenes].sort()).toEqual([...SCENES].sort());
});

for (const scene of SCENES) {
  test(`${scene}: contrast and snapshot`, async ({ page }, testInfo) => {
    await openScene(page, scene);
    for (const theme of ['zen', 'midnight'] as const) {
      await useTheme(page, theme);

      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      const failing = results.violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
      );
      // axe skips text on gradients (Early Bird); the gallery probe resolves the first stop.
      const probe = await page.evaluate(() =>
        (
          window as unknown as {
            __overlayGallery: {
              probe(): { overlays: { selector: string; lowContrast: string[] }[] };
            };
          }
        ).__overlayGallery
          .probe()
          .overlays.flatMap((o) => o.lowContrast.map((c) => `${o.selector}: ${c}`))
      );
      failing.push(...probe.filter((p) => !failing.some((f) => f.includes(p))));
      const key = `${testInfo.project.name}/${scene}/${theme}`;
      if (updating) {
        const current: Record<string, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
        current[key] = failing.length;
        writeFileSync(
          BASELINE_FILE,
          `${JSON.stringify(current, Object.keys(current).sort(), 2)}\n`
        );
      } else {
        expect(
          failing.length,
          `new contrast failures in ${key}:\n${failing.join('\n')}`
        ).toBeLessThanOrEqual(baseline[key] ?? 0);
      }

      if (NO_SNAPSHOT.has(scene)) continue;
      await expect(page).toHaveScreenshot(`${scene}-${theme}.png`, {
        mask: MASKS.map((s) => page.locator(s)),
      });
    }
  });
}

for (const scene of ['toast-pair', 'notice-action', 'toast-over-sheet'] as const) {
  test(`${scene}: toast region geometry with the overlay host on`, async ({ page }, testInfo) => {
    await openScene(page, scene, true);
    const g = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el || el.getClientRects().length === 0) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      };
      const region = document.querySelector('.ferni-toast-region');
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        open: region?.matches(':popover-open') ?? false,
        region: box(region),
        toasts: document.querySelectorAll('.ferni-toast').length,
        avoid: ['#connectBtn', '.mobile-menu-trigger']
          .map((s) => box(document.querySelector(s)))
          .filter(Boolean),
      };
    });
    const region = g.region;
    expect(g.open).toBe(true);
    expect(region).not.toBeNull();
    if (!region) return;

    const left = region.x;
    const right = g.vw - (region.x + region.w);
    expect(left).toBeGreaterThanOrEqual(15);
    expect(right).toBeGreaterThanOrEqual(15);
    expect(region.y + region.h).toBeLessThanOrEqual(g.vh / 2);
    if (testInfo.project.name === 'phone') {
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      expect(g.toasts).toBe(1);
    } else {
      expect(Math.round(right)).toBe(24);
      expect(g.toasts).toBeLessThanOrEqual(2);
    }
    for (const a of g.avoid) {
      if (!a) continue;
      const overlaps =
        region.x < a.x + a.w &&
        a.x < region.x + region.w &&
        region.y < a.y + a.h &&
        a.y < region.y + region.h;
      expect(overlaps).toBe(false);
    }
  });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Boxes of the first visible match of each selector, plus the viewport. */
async function boxes(
  page: Page,
  selectors: string[]
): Promise<{ vw: number; vh: number; found: (Box | null)[] }> {
  return page.evaluate((sels) => {
    const box = (el: Element | null) => {
      if (!el || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      found: sels.map((s) => box(document.querySelector(s))),
    };
  }, selectors);
}

/** What a celebration card may never cover: Connect, the call controls and the menu trigger. */
const CONTROLS = ['#connectBtn', '.controls-row', '#waveformContainer', '.mobile-menu-trigger'];

// With the toast kill switch set (VITE_TOAST_REGION=off, src/ui/overlay/toast-flag.ts),
// the old cards come back (#1065 moved the easter-egg card off the controls, #846
// the milestone card): keep them there.
for (const [scene, card] of [
  ['achievement', '.achievement-notification'],
  ['first-milestone', '.ferni-milestone'],
] as const) {
  test(`${scene}: card stays on screen and clear of the controls with the toast kill switch set`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('ferni:flag:toast-region', 'off'));
    await openScene(page, scene);
    const { vw, vh, found } = await boxes(page, [card, ...CONTROLS]);
    const [box, ...controls] = found;
    expect(box, `${card} is not on screen`).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.x + box.w).toBeLessThanOrEqual(vw - 8);
    expect(box.y + box.h).toBeLessThanOrEqual(vh - 8);
    for (const [i, c] of controls.entries()) {
      if (c) expect(overlaps(box, c), `${card} covers ${CONTROLS[i]}`).toBe(false);
    }
  });
}

// With the flag on, every celebration is an achievement toast in the region,
// and the old card does not appear as well.
for (const [scene, legacy] of [
  ['achievement', '.achievement-notification'],
  ['celebration', '.moment-celebration'],
  ['first-milestone', '.ferni-milestone'],
] as const) {
  test(`${scene}: an achievement toast instead of the card with the overlay host on`, async ({
    page,
  }) => {
    await openScene(page, scene, true);
    await expect(
      page.locator('.ferni-toast-region .ferni-toast--achievement').first()
    ).toBeVisible();
    await expect(page.locator(legacy)).toHaveCount(0);
    const { vw, vh, found } = await boxes(page, ['.ferni-toast-region', ...CONTROLS]);
    const [region, ...controls] = found;
    expect(region).not.toBeNull();
    if (!region) return;
    expect(region.x).toBeGreaterThanOrEqual(15);
    expect(vw - (region.x + region.w)).toBeGreaterThanOrEqual(15);
    expect(region.y + region.h).toBeLessThanOrEqual(vh / 2);
    for (const [i, c] of controls.entries()) {
      if (c) expect(overlaps(region, c), `toast region covers ${CONTROLS[i]}`).toBe(false);
    }
  });
}

test.describe('breath motion, in the browser', () => {
  test('reduced motion shows every word at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScene(page, 'caption-breath');
    const names = await page.$$eval('.ferni-caption-word', (els) =>
      els.map((el) => getComputedStyle(el).animationName)
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name === 'none')).toBe(true);
  });

  test('a settled line does not replay its rise when the region redraws', async ({ page }) => {
    await openScene(page, 'caption-breath');
    await page.evaluate(() => {
      const say = (text: string, isFinal: boolean): void => {
        window.dispatchEvent(
          new CustomEvent('ferni:transcript', { detail: { type: 'agent', text, isFinal } })
        );
      };
      say('That makes a lot of sense.', true);
      say('When you said it went sideways', false);
    });
    await page.waitForTimeout(150);
    const settled = await page.$$eval(
      '.ferni-captions__viewport > .ferni-caption-line:first-child .ferni-caption-word',
      (els) => els.map((el) => getComputedStyle(el).animationName)
    );
    const live = await page.$$eval(
      '.ferni-captions__viewport > .ferni-caption-line:last-child .ferni-caption-word',
      (els) => els.map((el) => getComputedStyle(el).animationName)
    );
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((name) => name === 'none')).toBe(true);
    expect(live.every((name) => name === 'ferni-breath-word')).toBe(true);
  });
});

test.describe('heard, in the browser', () => {
  test('the caller line is faint until its transcript is final', async ({ page }) => {
    await openScene(page, 'caption-heard');
    expect(await page.$$eval('.ferni-caption-line--interim', (els) => els.length)).toBe(1);
    await page.evaluate(() =>
      window.dispatchEvent(
        new CustomEvent('ferni:transcript', {
          detail: {
            type: 'user',
            text: "My sister Ana starts her new job Monday and I'm weirdly nervous for her.",
            isFinal: true,
          },
        })
      )
    );
    await page.waitForTimeout(150);
    expect(await page.$$eval('.ferni-caption-line--interim', (els) => els.length)).toBe(0);
  });

  test('the check pops once Ferni takes the settled caller line', async ({ page }) => {
    await openScene(page, 'caption-heard-reply');
    expect(
      await page.$$eval('.ferni-caption-line--ticked .ferni-caption-check', (els) => els.length)
    ).toBe(1);
    expect(await page.$$eval('.ferni-caption-line--interim', (els) => els.length)).toBe(0);
  });

  test('the check sits inside the caption area in the reply scene', async ({ page }) => {
    await openScene(page, 'caption-heard-reply');
    const inside = await page.evaluate(() => {
      const check = document.querySelector('.ferni-caption-check');
      const view = document.querySelector('.ferni-captions__viewport');
      if (!check || !view) return false;
      const c = check.getBoundingClientRect();
      const v = view.getBoundingClientRect();
      return c.top >= v.top - 1 && c.bottom <= v.bottom + 1;
    });
    expect(inside).toBe(true);
  });

  test('at every size, the caller line shows whole with the reply, or is set aside: no line is cut', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openScene(page, 'caption-heard-reply');
    // openScene freezes transitions for its own theme switch. This check needs the real
    // reduced-motion path, so take that override out.
    await page.evaluate(() => {
      for (const style of Array.from(document.querySelectorAll('style'))) {
        if (style.textContent?.trim() === '*, *::before, *::after { transition: none !important; }')
          style.remove();
      }
    });
    const SIZES = [
      [1280, 800],
      [1440, 900],
      [1366, 768],
      [390, 844],
      [360, 640],
    ] as const;
    // Alternate the reply's text: an unchanged transcript does not restart the idle timer,
    // and the region hides after six seconds without speech.
    const REPLIES = [
      "Nervous-for-someone is love in disguise. What's she walking into?",
      'Nervous-for-someone is love in disguise. What is she walking into?',
    ] as const;
    const failures: string[] = [];
    let turn = 0;
    for (const reduced of [false, true]) {
      for (const dark of [false, true]) {
        for (const large of [false, true]) {
          for (const [width, height] of SIZES) {
            await page.setViewportSize({ width, height });
            await page.emulateMedia({
              colorScheme: dark ? 'dark' : 'light',
              reducedMotion: reduced ? 'reduce' : 'no-preference',
            });
            await page.evaluate(
              ([d, l]) => {
                document.documentElement.setAttribute('data-theme', d ? 'midnight' : 'zen');
                document.documentElement.style.fontSize = l ? '24px' : '';
                window.dispatchEvent(new Event('resize'));
              },
              [dark, large] as const
            );
            await page.evaluate(
              (text) =>
                window.dispatchEvent(
                  new CustomEvent('ferni:transcript', {
                    detail: { type: 'agent', text, isFinal: false },
                  })
                ),
              REPLIES[turn++ % REPLIES.length]
            );
            await page.waitForTimeout(900); // let the resize settle before measuring
            const result = await page.evaluate(() => {
              const viewEl = document.querySelector<HTMLElement>('.ferni-captions__viewport');
              const view = viewEl?.getBoundingClientRect();
              const visible = !!viewEl && getComputedStyle(viewEl).display !== 'none';
              const lines = [
                ...document.querySelectorAll('.ferni-captions__viewport > .ferni-caption-line'),
              ] as HTMLElement[];
              const shown = lines.filter((l) => getComputedStyle(l).display !== 'none');
              // Each visual line of each shown line: one straddling the viewport edge is cut.
              const cut: string[] = [];
              for (const l of shown) {
                const range = document.createRange();
                range.selectNodeContents(l);
                for (const b of Array.from(range.getClientRects())) {
                  if (
                    view &&
                    b.bottom > view.top &&
                    b.top < view.bottom &&
                    (b.top < view.top - 1 || b.bottom > view.bottom + 1)
                  ) {
                    cut.push(l.textContent?.slice(0, 24) ?? '');
                    break;
                  }
                }
              }
              const caller = lines.find((l) => l.dataset.speaker === 'user');
              const callerSet = !caller || getComputedStyle(caller).display === 'none';
              // A shown caller line must be whole in the viewport: not cut, and not scrolled out.
              let callerRows = 'n/a';
              if (caller && !callerSet && view) {
                const range = document.createRange();
                range.selectNodeContents(caller);
                const rows = Array.from(range.getClientRects());
                const inside = rows.every(
                  (b) => b.top >= view.top - 1 && b.bottom <= view.bottom + 1
                );
                const touches = rows.some((b) => b.bottom > view.top && b.top < view.bottom);
                callerRows = inside ? 'whole' : touches ? 'cut' : 'out';
              }
              const root = document.querySelector('.ferni-captions');
              const padding = root ? getComputedStyle(root).paddingTop : null;
              const reply = lines.find((l) => l.dataset.speaker === 'agent');
              const fontOf = (el: HTMLElement | undefined) =>
                el ? parseFloat(getComputedStyle(el).fontSize) : null;
              const callerFont = callerSet ? null : fontOf(caller);
              // The step-down size, read from the token in the page.
              const probe = document.createElement('span');
              probe.style.fontSize = 'var(--text-base)';
              document.body.append(probe);
              const textBase = parseFloat(getComputedStyle(probe).fontSize);
              probe.remove();
              return {
                visible,
                shown: shown.length,
                cut,
                callerSet,
                callerRows,
                padding,
                callerFont,
                textBase,
              };
            });
            const label = `${width}x${height} dark=${dark} large=${large} reduced=${reduced}`;
            if (!result.visible || result.shown === 0)
              failures.push(`${label}: caption area hidden, nothing measured`);
            if (result.cut.length) failures.push(`${label}: cut ${result.cut.join(' | ')}`);
            if (result.callerRows === 'cut' || result.callerRows === 'out')
              failures.push(`${label}: caller line ${result.callerRows}`);
            // A roomy size shows the caller's line whole, with the region padding dropped.
            if (width === 1440 && !dark && !large && result.callerSet)
              failures.push(`${label}: caller set aside at a roomy size`);
            // The caller's line steps down to the --text-base size when it is shown.
            if (result.callerFont !== null && Math.abs(result.callerFont - result.textBase) > 0.5)
              failures.push(
                `${label}: caller font ${result.callerFont}px, expected --text-base ${result.textBase}px`
              );
            if (width === 1440 && !dark && !large && result.padding !== '0px')
              failures.push(`${label}: caller-mode padding not dropped (${result.padding})`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test('reduced motion settles the caller line with no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScene(page, 'caption-heard');
    // openScene freezes transitions. Take that override out, so only the app's own
    // reduced-motion rule decides the transition here.
    await page.evaluate(() => {
      for (const style of Array.from(document.querySelectorAll('style'))) {
        if (style.textContent?.trim() === '*, *::before, *::after { transition: none !important; }')
          style.remove();
      }
    });
    const durations = await page.$$eval(".ferni-caption-line[data-speaker='user']", (els) =>
      els.map((el) => getComputedStyle(el).transitionDuration)
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((d) => parseFloat(d) < 0.001)).toBe(true);
  });
});

test('reduced motion turns off the plain captions fade (flags off)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScene(page, 'captions');
  const names = await page.$$eval(
    '.ferni-caption-line:not(.ferni-caption-line--settled) .ferni-caption-words',
    (els) => els.map((el) => getComputedStyle(el).animationName)
  );
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name === 'none')).toBe(true);
});
