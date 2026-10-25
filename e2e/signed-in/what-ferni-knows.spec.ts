/**
 * What Ferni Knows (VITE_MEMORY_VIEW, on in prod): the menu row opens it, a new
 * caller sees the empty state, a fact Ferni learned shows, and Forget in the panel
 * sticks after a reload. The walk is built with prod's flags (scripts/ci/prod-web-flags.mjs).
 * The fact is written straight into the Firestore emulator, in the shape a call's
 * extraction writes it; menu-known.emulator.test.ts runs the agent's own writer and recall.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  openSettingsMenu,
  rawKeysOnScreen,
  shownDialogs,
  signIn,
  watchProblems,
  type TestUser,
} from './support';

const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}`;
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? 'demo-ferni';

/** A call's fact for `user`, as deep extraction stores it (bogle_users/{uid}/dynamic_facts). */
async function seedFact(user: TestUser, entityName: string, key: string, value: string) {
  const fields = Object.fromEntries(
    Object.entries({
      entityName,
      key,
      value,
      factType: 'attribute',
      source: 'deep_extraction',
    }).map(([k, v]) => [k, { stringValue: v }])
  );
  const url = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/bogle_users/${user.uid}/dynamic_facts`;
  const res = await fetch(`${url}?documentId=f_e2e${Math.random().toString(36).slice(2, 10)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: {
        ...fields,
        confidence: { doubleValue: 0.9 },
        extractedAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  expect(res.ok, `seeding a fact failed: ${res.status}`).toBe(true);
}

async function openKnown(page: Page) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="cognitive"]').click();
  const panel = await newPanel(page, before, 'cognitive');
  await expect(panel.locator('.ferni-known__title')).toHaveText('What Ferni Knows');
  await expect(panel.locator('.ferni-known__body')).toHaveAttribute('aria-busy', 'false');
  return panel;
}

let user: TestUser;
test.beforeEach(async ({ page }) => {
  user = await createUser();
  await signIn(page, user);
  await expectHome(page);
});

test('what ferni knows: a new caller sees the empty state, not the old panel', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openKnown(page);
  await expect(panel.locator('.ferni-known__state')).toHaveText(/^Nothing yet\./);
  await expect(page.locator('.cognitive-insights-panel:visible')).toHaveCount(0);
  expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

  const id = (await panel.getAttribute('data-e2e-dialog')) as string;
  await page.keyboard.press('Escape');
  await expect
    .poll(() => isGone(page, id), { message: 'did not close on Escape', timeout: 5_000 })
    .toBe(true);
  expect(problems.take()).toEqual([]);
});

test('what ferni knows: a learned fact shows, and Forget sticks after a reload', async ({
  page,
}) => {
  await seedFact(user, 'Biscuit', 'breed', 'golden retriever');
  await seedFact(user, 'user', 'hometown', 'Asheville');
  const problems = watchProblems(page);
  let panel = await openKnown(page);
  const row = panel.locator('.ferni-known__row', { hasText: 'breed: golden retriever' });
  await expect(row).toBeVisible();
  await expect(
    panel.locator('.ferni-known__row', { hasText: 'hometown: Asheville' })
  ).toBeVisible();

  await row.locator('.ferni-known__more').click();
  await row.getByRole('button', { name: 'Forget', exact: true }).click();
  await expect(
    panel.locator('.ferni-known__row', { hasText: 'breed: golden retriever' })
  ).toHaveCount(0);

  await page.reload();
  await expectHome(page);
  panel = await openKnown(page);
  await expect(
    panel.locator('.ferni-known__row', { hasText: 'hometown: Asheville' })
  ).toBeVisible();
  await expect(panel.locator('.ferni-known__row', { hasText: 'golden retriever' })).toHaveCount(0);
  expect(problems.take()).toEqual([]);
});
