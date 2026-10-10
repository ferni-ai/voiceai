/**
 * Custom agents: one is created and kept, and what opens from its card is on top and
 * usable. Roleplay and the character sheet opened UNDER the marketplace before, so the
 * click did nothing visible and their controls couldn't be reached.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh). Desktop only:
 * phones have no marketplace button before the whole team is unlocked.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, shownDialogs, signIn, watchProblems } from './support';

const NAME = 'Captain Nova';

async function opens(page: Page, control: Locator, what: string) {
  const before = await shownDialogs(page);
  await control.click();
  return newPanel(page, before, what);
}

async function openCreations(page: Page) {
  const market = await opens(page, page.locator('#marketplaceBtn'), 'marketplace');
  await market.locator('[data-tab="creations"]').click();
  return market;
}

/** Walk the wizard: a fictional agent, named, voice left for later */
async function createAgent(page: Page) {
  const market = await openCreations(page);
  const wizard = await opens(page, market.locator('[data-action="create-agent"]').first(), 'wizard');
  const next = wizard.locator('[data-action="next"]');
  await wizard.locator('[data-type="fictional"]').click();
  await next.click();
  await wizard.locator('#agent-name').fill(NAME);
  await wizard.locator('#agent-description').fill('A cheerful starship captain who loves puns');
  await next.click();
  await wizard.locator('[data-voice-option="later"]').click();
  await next.click(); // personality, as it comes
  await next.click(); // memories, none yet
  const created = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/custom-agents$/.test(r.url()));
  await next.click(); // Create Agent
  expect((await created).status()).toBe(201);
}

/** Whether the element at the middle of `target` is inside it: on top, and clickable */
const onTop = (target: Locator) =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no marketplace button on phones');
  await signIn(page, await createUser());
  await expectHome(page);
});

test('a custom agent is created and kept', async ({ page }) => {
  const problems = watchProblems(page);
  await createAgent(page);
  await page.reload();
  await expectHome(page);
  const market = await openCreations(page);
  await expect(market.locator('.custom-agent-card', { hasText: NAME })).toBeVisible();
  expect(problems.take()).toEqual([]);
});

test('Roleplay and Character open on top of the marketplace, and work', async ({ page }) => {
  await createAgent(page);
  await page.keyboard.press('Escape');
  const market = await openCreations(page);
  const card = market.locator('.custom-agent-card', { hasText: NAME });

  const roleplay = await opens(page, card.locator('[data-action="start-roleplay"]'), 'roleplay');
  const tavern = roleplay.locator('[data-scenario="tavern"]');
  expect(await onTop(tavern), 'the scenario is on top, not under the marketplace').toBe(true);
  await tavern.click();
  await expect(roleplay.locator('.roleplay-btn[data-action="start-roleplay"]')).toBeEnabled();
  await page.keyboard.press('Escape');

  const sheet = await opens(page, card.locator('[data-action="open-character"]'), 'character sheet');
  expect(await onTop(sheet.locator('button').first()), 'the character sheet is on top').toBe(true);
});

test('the selected marketplace tab can be read', async ({ page }) => {
  // The persona's colours are set a moment after the home screen; read the tab after that
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--persona-text').trim()))
    .not.toBe('');
  const market = await openCreations(page);
  const tab = market.locator('[data-tab="creations"].active');
  // Read the colours once the tab's transition has settled
  await tab.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const { color, background } = await tab.evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor };
  });
  expect(color, 'label and background differ').not.toBe(background);
});
