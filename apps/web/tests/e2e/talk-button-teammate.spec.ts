/**
 * E2E: the talk button names the teammate picked in the team bar, keeps naming
 * them after a reload, and a tap asks the server for a call with that teammate
 * (the token request's persona_id). App audit 2026-11-16 item 8: with Alex
 * picked the button still read "Talk to Ferni".
 *
 * APIs are mocked, so this needs only the Vite dev server (?e2e=1).
 */

import { expect, test } from '@playwright/test';

const TEAM = [
  { id: 'ferni', name: 'Ferni', isCoordinator: true },
  { id: 'alex-chen', name: 'Alex Chen' },
];

test.use({ permissions: ['microphone'] });

test('the talk button follows the picked teammate, across a reload, to the call', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'microphone permission grant is Chromium-only');

  await page.route('**/api/agents**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        agents: TEAM.map((a) => ({ isCoordinator: false, colors: null, ...a })),
      }),
    })
  );
  await page.route('**/api/relationship/team-unlocks**', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ teamByNeed: true, tier: 'friend' }), // the whole team is open
    })
  );
  await page.addInitScript(() => {
    if (sessionStorage.getItem('talk-seeded')) return;
    sessionStorage.setItem('talk-seeded', '1');
    localStorage.setItem('ferni_user_id', 'e2e-talk-button');
    localStorage.setItem(
      'ferni_roster_prefs',
      JSON.stringify({ addedMembers: ['alex-chen'], isFirstVisit: false })
    );
  });

  const talk = page.locator('#connectBtn .btn-content');
  await page.goto('/?e2e=1');
  await expect(talk).toHaveText('Talk to Ferni');

  await page.locator('#teamRoster [data-persona-id="alex-chen"]').click();
  await expect(page.locator('#personaName')).toHaveText('Alex');
  await expect(talk).toHaveText('Talk to Alex');

  await page.reload();
  await expect(talk).toHaveText('Talk to Alex');

  // The tap asks for a room with Alex; answering with an error keeps the test offline.
  const tokenRequest = page.waitForRequest((req) => /\/token\?/.test(req.url()));
  await page.route(/\/token\?/, (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.locator('#connectBtn').click();
  const personaId = new URL((await tokenRequest).url()).searchParams.get('persona_id');
  expect(personaId).toBe('alex-chen');
});
