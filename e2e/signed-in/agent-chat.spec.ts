/**
 * Roleplay with a custom agent: the chat is the agent's own, not "Your Past Self"; the
 * scene goes to the agent as context and is never shown as the person's message.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh). The local
 * stack has no model key, so the agent's chat answers 502 here and the chat shows its
 * error line; with a key it shows the reply. Desktop only: phones have no marketplace
 * button before the whole team is unlocked.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, shownDialogs, signIn } from './support';

const NAME = 'Captain Nova';

async function opens(page: Page, control: Locator, what: string) {
  const before = await shownDialogs(page);
  await control.click();
  return newPanel(page, before, what);
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no marketplace button on phones');
  await signIn(page, await createUser());
  await expectHome(page);
});

test("roleplay talks with the agent itself, and the scene isn't the person's message", async ({ page }) => {
  // Create the agent through the API the wizard uses
  const created = await page.evaluate(async (name) => {
    const { createCustomAgent } = await import(/* @vite-ignore */ '/src/services/custom-agent.service.ts');
    return createCustomAgent({ name, displayName: name, description: 'A cheerful starship captain', type: 'fictional' });
  }, NAME);
  expect(created, 'agent created').toBeTruthy();

  const market = await opens(page, page.locator('#marketplaceBtn'), 'marketplace');
  await market.locator('[data-tab="creations"]').click();
  const card = market.locator('.custom-agent-card', { hasText: NAME });
  const roleplay = await opens(page, card.locator('[data-action="start-roleplay"]'), 'roleplay');
  await roleplay.locator('[data-scenario="tavern"]').click();

  const chatRequest = page.waitForRequest((r) => /\/api\/custom-agents\/[^/]+\/chat$/.test(r.url()));
  await roleplay.locator('.roleplay-btn[data-action="start-roleplay"]').click();
  const sent = (await chatRequest).postDataJSON() as { message: string; history: unknown[]; scene: string };

  // The scene is context for the agent, with the scenario's real (translated) name
  expect(sent.message).toBe('');
  expect(sent.scene).toContain('Chance Meeting');
  expect(sent.scene).not.toContain('scenarios.');

  const chat = page.locator('.talk-twin-overlay.open');
  await expect(chat.locator('#twin-title')).toHaveText(NAME);
  await expect(chat).not.toContainText(/past self/i);
  await expect(chat).not.toContainText('[ROLEPLAY MODE]');
  // Either the agent's reply or the chat's own error line: never silence, never the raw scene
  const answer = chat.locator('.twin-message--twin:not(.twin-message--thinking)');
  await expect(answer.first()).toBeVisible({ timeout: 15_000 });
  await expect(answer.first()).not.toHaveText('');
});
