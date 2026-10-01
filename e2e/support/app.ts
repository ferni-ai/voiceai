/**
 * Navigation helpers for the web app (apps/web), shared by the root E2E specs.
 *
 * Selectors here follow the real DOM in apps/web/src; keep them in sync with
 * the components they name.
 */

import type { Page, Route } from '@playwright/test';

/** Set on <body> once the main app has booted (apps/web/src/app.ts). */
export const APP_LOADED = 'body.app-loaded';

/** Open the settings menu from the floating trigger (ui/settings-menu.ui.ts). */
export async function openSettingsMenu(page: Page): Promise<void> {
  await page.waitForSelector('.settings-trigger', { timeout: 10000 });
  await page.click('.settings-trigger');
  await page.waitForSelector('.settings-menu--visible');
}

/**
 * Click a settings menu item by its data-action, expanding the collapsible
 * section that holds it if needed (sections such as "Settings" start
 * collapsed; see renderContent in ui/settings-menu.ui.ts).
 */
export async function clickMenuItem(page: Page, action: string): Promise<void> {
  await openSettingsMenu(page);
  const item = page.locator(`.settings-menu [data-action="${action}"]`).first();
  if (!(await item.isVisible())) {
    const header = page.locator('.settings-menu__section', { has: item }).locator('.settings-menu__section-header');
    if ((await header.count()) > 0 && (await header.getAttribute('aria-expanded')) !== 'true') {
      await header.click();
    }
  }
  await item.click();
}

/**
 * Seed the relationship progress the app keeps in localStorage
 * (services/relationship-stage.service.ts), unless a test already set it.
 *
 * `?dev` auto-unlocks the team by simulating up to 50 conversations, which
 * moves a brand-new user to "Getting Started" and opens the stage celebration
 * dialog over the page. Seeding a user who already has those conversations
 * gives the dev tools an unobstructed page, like a returning developer's.
 *
 * Other stages unlock the menu's progressively disclosed sections and items.
 * Days and streaks are set to the stage's thresholds (STAGE_THRESHOLDS in the
 * service) so the next recorded conversation doesn't move the stage.
 */
export async function seedRelationship(
  page: Page,
  { stage = 'getting-started', totalConversations = 50 }: { stage?: RelationshipStage; totalConversations?: number } = {}
): Promise<void> {
  const { days, streak } = STAGE_MINIMUMS[stage];
  await page.addInitScript(
    ({ stage: s, totalConversations: n, days: d, streak: k }) => {
      try {
        if (localStorage.getItem('ferni_relationship')) return;
        const now = new Date().toISOString();
        localStorage.setItem(
          'ferni_relationship',
          JSON.stringify({
            stage: s,
            firstMeetingDate: new Date(Date.now() - d * 86400000).toISOString(),
            metrics: {
              totalConversations: n,
              daysSinceFirstMeeting: d,
              currentStreak: k,
              longestStreak: k,
              milestonesReached: 0,
              insightsShared: 0,
              lastConversation: Date.now(),
            },
            memories: [],
            lastUpdated: now,
          })
        );
      } catch {
        // Storage unavailable: the app starts as a new user.
      }
    },
    { stage, totalConversations, days, streak }
  );
}

export type RelationshipStage =
  | 'first-meeting'
  | 'getting-started'
  | 'building-trust'
  | 'established'
  | 'deep-partnership';

/** Minimum days together and streak per stage (services/relationship-stage.service.ts). */
const STAGE_MINIMUMS: Record<RelationshipStage, { days: number; streak: number }> = {
  'first-meeting': { days: 0, streak: 0 },
  'getting-started': { days: 0, streak: 1 },
  'building-trust': { days: 5, streak: 3 },
  established: { days: 21, streak: 7 },
  'deep-partnership': { days: 45, streak: 14 },
};

/**
 * Pin settings menu items ("Your Favorites", stored in ferni_menu_pinned).
 * Some panels are only listed in the menu once pinned, e.g. accent-settings.
 */
export async function pinMenuItems(page: Page, actions: readonly string[]): Promise<void> {
  await page.addInitScript((items) => {
    try {
      localStorage.setItem('ferni_menu_pinned', JSON.stringify(items));
    } catch {
      // Storage unavailable: nothing pinned.
    }
  }, [...actions]);
}

/** A Digital Twin custom agent as the UI server's /api/custom-agents returns it. */
export const TWIN_AGENT = {
  id: 'twin-e2e',
  userId: 'e2e-user',
  name: 'Sam Twin',
  displayName: 'Sam Twin',
  description: 'A digital twin for end-to-end tests',
  type: 'twin',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  voice: {},
  personality: {},
  memories: { stories: [], wisdom: [], sharedMoments: [], journalEntries: [] },
  behaviors: { greetings: [], farewells: [], catchphrases: [], responsePatterns: {} },
  privacy: 'private',
} as const;

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Answer the custom-agents API with a single Digital Twin (TWIN_AGENT). */
export async function mockTwinAgent(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/custom-agents'),
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const base = `/api/custom-agents/${TWIN_AGENT.id}`;
      if (path === '/api/custom-agents') return json(route, [TWIN_AGENT]);
      if (path === base) return json(route, TWIN_AGENT);
      if (path.startsWith(`${base}/memories`)) return json(route, []);
      return json(route, { error: 'Not found' }, 404);
    }
  );

  // Twin profile store (services/twin-profile.service.ts): starts empty, and a
  // save echoes the profile back like the UI server does.
  await page.route(
    (url) => url.pathname === '/api/twin/profile',
    (route) => {
      if (route.request().method() === 'POST') {
        const body = (route.request().postDataJSON() ?? {}) as { profile?: Record<string, unknown> };
        return json(route, { success: true, profile: { ...body.profile, completionPercentage: 50 } });
      }
      return json(route, { exists: false });
    }
  );
}

/**
 * Open the marketplace's "My Creations" tab from the roster's "Add more
 * agents" button (ui/team.ui.ts → ui/marketplace.ui.ts).
 */
export async function openMyCreations(page: Page): Promise<void> {
  await page.click('#marketplaceBtn');
  await page.click('.marketplace-tab[data-tab="creations"]');
  await page.waitForSelector(`.custom-agent-card[data-agent-id="${TWIN_AGENT.id}"]`);
}

/** Open the Digital Twin's voice journal (needs mockTwinAgent). */
export async function openTwinJournal(page: Page): Promise<void> {
  await openMyCreations(page);
  await page.click(`[data-action="open-journal"][data-agent-id="${TWIN_AGENT.id}"]`);
  await page.waitForSelector('.voice-journal-overlay.open');
}

/** Open the Digital Twin's profile wizard (needs mockTwinAgent). */
export async function openTwinProfile(page: Page): Promise<void> {
  await openMyCreations(page);
  await page.click(`[data-action="open-profile"][data-agent-id="${TWIN_AGENT.id}"]`);
}
