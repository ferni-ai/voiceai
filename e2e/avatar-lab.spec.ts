/**
 * The avatar lab (/avatar-lab), driven over its postMessage bridge in a real
 * browser (#4069: every admin control is real). No sign-in: the lab needs none.
 *
 * The bridge answers only its parent window on its own origin, so the lab is
 * framed by a stand-in parent page served on the app's origin (page.route), and
 * the requests are posted from that parent. The "no reply" case frames it from
 * a page on another origin: a second server on a loopback port this spec starts
 * (a page.route page counts as public, and Chrome's local network access checks
 * would block it from framing a localhost lab at all).
 *
 * Runs in the menu merge gate (playwright.menu-e2e.config.ts, project
 * "avatar-lab"), against the Vite app at E2E_BASE_URL.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

const LAB_TYPE = 'ferni:avatar-lab';
const HARNESS_PATH = '/__avatar-lab-parent';
/** A same-origin reply takes milliseconds; three seconds of silence is a fair "no answer". */
const NO_REPLY_MS = 3_000;
const BOOT_MS = 45_000;

type Command = Record<string, unknown> & { name: string };
interface Reply {
  id: string;
  ok: boolean;
  ran?: string;
  why?: string;
  status?: { ready: boolean; crisisHeld: boolean; reducedMotion: boolean; turn: string };
}

/** A parent page holding only the lab frame, with `postToLab` to send a request and await its reply. */
function parentPage(labUrl: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Lab parent</title>
<iframe id="lab" src="${labUrl}" style="width:360px;height:480px;border:0"></iframe>
<script>
  window.postToLab = (type, command, waitMs) => new Promise((resolve) => {
    const frame = document.getElementById('lab');
    const id = 'e2e-' + Math.random().toString(36).slice(2);
    const done = (value) => { clearTimeout(timer); removeEventListener('message', onMessage); resolve(value); };
    const onMessage = (event) => {
      if (event.source === frame.contentWindow && event.data && event.data.id === id) done(event.data);
    };
    const timer = setTimeout(() => done(null), waitMs);
    addEventListener('message', onMessage);
    frame.contentWindow.postMessage({ type, id, command }, new URL(frame.src).origin);
  });
</script>`;
}

const appOrigin = (): string => new URL(test.info().project.use.baseURL ?? '').origin;
const labUrl = (): string => new URL('/avatar-lab', appOrigin()).href;

/** The parent page on the app's own origin, the one the bridge answers. */
async function openParent(page: Page): Promise<void> {
  const url = `${appOrigin()}${HARNESS_PATH}`;
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html', body: parentPage(labUrl()) })
  );
  await page.goto(url);
}

/** A server on another loopback port that serves only the parent page: another origin. */
async function startOutsider(): Promise<{ server: Server; origin: string }> {
  const body = parentPage(labUrl());
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

function send(page: Page, command: Command, waitMs = 5_000): Promise<Reply | null> {
  return page.evaluate(
    ([type, cmd, ms]) =>
      (
        window as unknown as {
          postToLab: (t: string, c: unknown, m: number) => Promise<Reply | null>;
        }
      ).postToLab(type, cmd, ms),
    [LAB_TYPE, command, waitMs] as const
  );
}

/** Opens the lab in a same-origin parent and waits until the lab says its avatar is ready. */
async function openLab(page: Page): Promise<void> {
  await openParent(page);
  await expect
    .poll(async () => (await send(page, { name: 'status' }, 1_000))?.status?.ready ?? false, {
      timeout: BOOT_MS,
      message: 'the lab answers status with ready: true',
    })
    .toBe(true);
}

const lab = (page: Page) => page.frameLocator('#lab');

/** The top lid's outline: what a face change redraws on the eyes. */
const lidShape = (page: Page) => lab(page).locator('.lid-top').getAttribute('d');

/** Waits until the lid has stopped moving and returns where it came to rest. */
async function restingLid(page: Page): Promise<string | null> {
  let last = await lidShape(page);
  for (let stable = 0; stable < 4;) {
    await page.waitForTimeout(250);
    const now = await lidShape(page);
    stable = now === last ? stable + 1 : 0;
    last = now;
  }
  return last;
}

test.describe('avatar lab', () => {
  test('shows only the avatar', async ({ page }) => {
    await openLab(page);
    await expect(lab(page).locator('#coach')).toBeVisible();
    // The avatar, its name, and the waveform under it (the lab keeps both: avatar-lab/index.ts
    // LAB_STYLE), and the boxes that hold them; anything else shown is the app leaking through
    const others = await lab(page)
      .locator('body')
      .evaluate((body) =>
        [...body.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0 || !el.checkVisibility()) return false;
            const kept = '#coach, #personaName, #waveformContainer';
            return !el.closest(kept) && !el.querySelector(kept);
          })
          .map((el) => `${el.tagName.toLowerCase()}#${el.id}.${el.classList[0] ?? ''}`)
      );
    expect(others, 'visible elements besides the avatar').toEqual([]);
  });

  test('a turn sets and clears the speaking state', async ({ page }) => {
    await openLab(page);
    const coach = lab(page).locator('#coach');
    await expect(coach).not.toHaveClass(/\bis-speaking\b/);
    expect(await send(page, { name: 'turn', speaker: 'ferni' })).toMatchObject({
      ok: true,
      ran: 'update',
    });
    await expect(coach).toHaveClass(/\bis-speaking\b/);
    expect(await send(page, { name: 'turn', speaker: 'none' })).toMatchObject({ ok: true });
    await expect(coach).not.toHaveClass(/\bis-speaking\b/);
  });

  test('a moment runs its real export', async ({ page }) => {
    await openLab(page);
    expect(await send(page, { name: 'moment', moment: 'memorySpark' })).toMatchObject({
      ok: true,
      ran: 'triggerMemorySpark',
    });
  });

  test('the crisis hold refuses a playful face and the eyes stay as they were', async ({
    page,
  }) => {
    // The lids draw the face only with the face engine, lid blend and blinks off; pin them,
    // whatever the build's switches say (config/motion-flags.ts override keys)
    await page.addInitScript(() => {
      for (const key of ['ferni:face-engine', 'ferni:lid-blend', 'ferni:natural-blink'])
        localStorage.setItem(key, 'off');
    });
    await openLab(page);

    // Without the hold, "excited" redraws the lids: learn the shape it draws
    const before = await restingLid(page);
    expect(await send(page, { name: 'face', expression: 'excited' })).toMatchObject({
      ok: true,
      ran: 'setExpression',
    });
    const excited = await restingLid(page);
    expect(excited, 'an allowed face changes the lids').not.toBe(before);
    expect(await send(page, { name: 'face', expression: 'neutral' })).toMatchObject({ ok: true });
    expect(await restingLid(page)).not.toBe(excited);

    expect(await send(page, { name: 'crisisHold', on: true })).toMatchObject({
      ok: true,
      ran: 'holdCrisisFace',
    });
    expect((await send(page, { name: 'status' }))?.status?.crisisHeld).toBe(true);
    const held = await restingLid(page);

    const refused = await send(page, { name: 'face', expression: 'excited' });
    expect(refused).toMatchObject({ ok: false });
    expect(refused?.ran).toBeUndefined();
    expect(refused?.why ?? '').toMatch(/crisis hold/i);
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(200);
      expect(await lidShape(page), 'the lids after a refused face').toBe(held);
    }
  });

  test('reduced motion: status says so and protective mode is refused', async ({ browser }) => {
    const plain = await browser.newPage();
    await openLab(plain);
    expect((await send(plain, { name: 'status' }))?.status?.reducedMotion).toBe(false);
    expect(await send(plain, { name: 'moment', moment: 'protectiveOn' })).toMatchObject({
      ok: true,
      ran: 'enterProtectiveMode',
    });
    await plain.context().close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page);
    expect((await send(page, { name: 'status' }))?.status?.reducedMotion).toBe(true);
    const refused = await send(page, { name: 'moment', moment: 'protectiveOn' });
    expect(refused).toMatchObject({ ok: false });
    expect(refused?.ran).toBeUndefined();
    expect(refused?.why ?? '').toMatch(/reduced motion/i);
    await context.close();
  });

  test('a page on another origin gets no reply and runs nothing', async ({ page }) => {
    const outsider = await startOutsider();
    try {
      await page.goto(`${outsider.origin}${HARNESS_PATH}`);
      expect(new URL(page.url()).origin).not.toBe(appOrigin());
      await outsideCannotDrive(page);
    } finally {
      await new Promise((resolve) => outsider.server.close(resolve));
    }
  });
});

/** The outside page posts a turn and a status to the booted lab: no reply, and the turn never shows. */
async function outsideCannotDrive(page: Page): Promise<void> {
  // The class is added just after the bridge starts listening (avatar-lab/index.ts)
  await expect(lab(page).locator('.avatar-container.entrance-complete')).toBeAttached({
    timeout: BOOT_MS,
  });
  const coach = lab(page).locator('#coach');
  await expect(coach).toBeVisible();

  const [turn, status] = await Promise.all([
    send(page, { name: 'turn', speaker: 'ferni' }, NO_REPLY_MS),
    send(page, { name: 'status' }, NO_REPLY_MS),
  ]);
  expect(turn, 'a reply to the outside page').toBeNull();
  expect(status, 'a reply to the outside page').toBeNull();
  await expect(coach, 'the outside turn ran').not.toHaveClass(/\bis-speaking\b/);
}
