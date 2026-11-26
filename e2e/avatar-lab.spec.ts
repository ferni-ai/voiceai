/**
 * The avatar lab (/avatar-lab), driven over its postMessage bridge in a real
 * browser (#4069: every admin control is real). No sign-in: the lab needs none.
 *
 * The bridge answers only its parent window on its own origin, so the lab is
 * framed by a stand-in parent page served on the app's origin (page.route), and
 * the requests are posted from that parent. The cross-origin case frames it from
 * a page on another origin: a second server on a loopback port (the `outsider`
 * fixture; a page.route page counts as public, and Chrome's local network access
 * checks would block it from framing a localhost lab at all).
 *
 * Runs in the menu merge gate (playwright.menu-e2e.config.ts, project
 * "avatar-lab"), against the Vite app at E2E_BASE_URL.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test as base, type Page } from '@playwright/test';

const LAB_TYPE = 'ferni:avatar-lab';
const HARNESS_PATH = '/__avatar-lab-parent';
const BOOT_MS = 45_000;
/** How long the lids may take to come to rest before the test says so. */
const LID_SETTLE_MS = 4_000;
/**
 * The longest a turn waits before the avatar shows it: TURN_SETTLE_REDUCED_MS
 * (400 ms, ui/avatar-motion/turn-driver.ts) plus a margin. A first turn shows at once.
 */
const TURN_SHOWN_MS = 600;

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
  window.postOnly = (type, command) => {
    const frame = document.getElementById('lab');
    const id = 'e2e-' + Math.random().toString(36).slice(2);
    frame.contentWindow.postMessage({ type, id, command }, new URL(frame.src).origin);
    return id;
  };
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

/**
 * Fixtures, so their teardown runs even when a test fails or times out:
 * - outsider: the origin of a server on another loopback port that serves only the parent page;
 * - reducedMotionPage: a page in its own context that prefers reduced motion.
 */
const test = base.extend<{ outsider: string; reducedMotionPage: Page }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright needs the destructuring form
  outsider: async ({}, use) => {
    const body = parentPage(labUrl());
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await use(`http://127.0.0.1:${port}`);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  },
  reducedMotionPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await use(page);
    } finally {
      await context.close();
    }
  },
});

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

/**
 * Where the lids come to rest: the same outline over four samples 100 ms apart.
 * Fails within LID_SETTLE_MS, naming `what` and the last two samples, if they keep moving.
 */
async function restingLid(page: Page, what: string): Promise<string | null> {
  let previous = await lidShape(page);
  let last = previous;
  const deadline = Date.now() + LID_SETTLE_MS;
  for (let stable = 0; stable < 4;) {
    if (Date.now() > deadline) {
      throw new Error(
        `${what}: the lids did not settle within ${LID_SETTLE_MS} ms; last two samples: ${previous} | ${last}`
      );
    }
    await page.waitForTimeout(100);
    previous = last;
    last = await lidShape(page);
    stable = last === previous ? stable + 1 : 0;
  }
  return last;
}

/**
 * The outline "excited" draws, learned without the hold. Ambient life can redraw the lids
 * as `warm` at any moment (ambient-life.ui.ts performWarmthPulse), so one capture might
 * catch that instead: two rounds in a row (neutral, then excited) must agree.
 */
async function learnExcitedLids(page: Page): Promise<string | null> {
  let earlier: string | null | undefined;
  for (let round = 1; round <= 4; round++) {
    expect(await send(page, { name: 'face', expression: 'neutral' })).toMatchObject({ ok: true });
    const neutral = await restingLid(page, `round ${round}, neutral`);
    expect(await send(page, { name: 'face', expression: 'excited' })).toMatchObject({
      ok: true,
      ran: 'setExpression',
    });
    const excited = await restingLid(page, `round ${round}, excited`);
    if (excited !== neutral && excited === earlier) return excited;
    earlier = excited;
  }
  throw new Error(
    `"excited" never drew the same outline twice in a row, unlike neutral; last: ${earlier}`
  );
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

    // Without the hold, "excited" redraws the lids: learn the outline it draws
    const excited = await learnExcitedLids(page);
    expect(await send(page, { name: 'face', expression: 'neutral' })).toMatchObject({ ok: true });
    expect(await restingLid(page, 'neutral before the hold')).not.toBe(excited);

    expect(await send(page, { name: 'crisisHold', on: true })).toMatchObject({
      ok: true,
      ran: 'holdCrisisFace',
    });
    expect((await send(page, { name: 'status' }))?.status?.crisisHeld).toBe(true);
    const held = await restingLid(page, 'held, before the refused face');

    const refused = await send(page, { name: 'face', expression: 'excited' });
    // The reply proves the lab's own gate (lab-commands.ts face case). The lids below prove
    // the inner gate (handOffToFaceEngine): with only the lab gate removed they still stay.
    expect(refused).toMatchObject({ ok: false });
    expect(refused?.ran).toBeUndefined();
    expect(refused?.why ?? '').toMatch(/crisis hold/i);
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(200);
      const now = await lidShape(page);
      expect(now, 'the lids after a refused face').toBe(held);
      expect(now, 'the lids drew "excited" during the hold').not.toBe(excited);
    }
  });

  test('reduced motion: status says so and protective mode is refused', async ({
    page,
    reducedMotionPage,
  }) => {
    await openLab(page);
    expect((await send(page, { name: 'status' }))?.status?.reducedMotion).toBe(false);
    expect(await send(page, { name: 'moment', moment: 'protectiveOn' })).toMatchObject({
      ok: true,
      ran: 'enterProtectiveMode',
    });

    await openLab(reducedMotionPage);
    expect((await send(reducedMotionPage, { name: 'status' }))?.status?.reducedMotion).toBe(true);
    const refused = await send(reducedMotionPage, { name: 'moment', moment: 'protectiveOn' });
    expect(refused).toMatchObject({ ok: false });
    expect(refused?.ran).toBeUndefined();
    expect(refused?.why ?? '').toMatch(/reduced motion/i);
  });

  test('a page on another origin cannot run a command', async ({ page, outsider }) => {
    await page.goto(`${outsider}${HARNESS_PATH}`);
    expect(new URL(page.url()).origin).not.toBe(appOrigin());
    // The class is added just after the bridge starts listening (avatar-lab/index.ts)
    await expect(lab(page).locator('.avatar-container.entrance-complete')).toBeAttached({
      timeout: BOOT_MS,
    });
    const coach = lab(page).locator('#coach');
    await expect(coach).toBeVisible();
    await expect(coach).not.toHaveClass(/\bis-speaking\b/);

    // In the lab, a listener added after the bridge's: listeners run in the order they were
    // added, so once it has seen the message the bridge has already handled it. It also counts
    // every turn the avatar shows (turn-driver.ts AVATAR_TURN_EVENT).
    const labFrame = page.frame({ url: /\/avatar-lab\/?$/ });
    if (!labFrame) throw new Error('no avatar lab frame in the outside page');
    await labFrame.evaluate((type) => {
      const seen = { ids: [] as string[], turns: 0 };
      (window as unknown as { __outside: typeof seen }).__outside = seen;
      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: unknown; id?: unknown } | null;
        if (data?.type === type && typeof data.id === 'string') seen.ids.push(data.id);
      });
      window.addEventListener('ferni:avatar-turn', () => (seen.turns += 1));
    }, LAB_TYPE);

    const id = await page.evaluate(
      ([type, command]) =>
        (window as unknown as { postOnly: (t: string, c: unknown) => string }).postOnly(
          type,
          command
        ),
      [LAB_TYPE, { name: 'turn', speaker: 'ferni' }] as const
    );
    await labFrame.waitForFunction(
      (want) =>
        (window as unknown as { __outside: { ids: string[] } }).__outside.ids.includes(want),
      id
    );
    await page.waitForTimeout(TURN_SHOWN_MS);
    const turns = await labFrame.evaluate(
      () => (window as unknown as { __outside: { turns: number } }).__outside.turns
    );
    expect(turns, 'turns the avatar showed after the outside request').toBe(0);
    expect(await coach.getAttribute('class'), 'the outside turn ran').not.toMatch(
      /\bis-speaking\b/
    );
  });
});
