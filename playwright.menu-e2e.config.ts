import { defineConfig } from '@playwright/test';
import base from './playwright.signed-in.config';

/**
 * The signed-in walk as the menu merge gate (.github/workflows/menu-e2e.yml).
 *
 * Same specs, stack and viewports as playwright.signed-in.config.ts, with one
 * difference: a skipped test fails the gate (scripts/ci/menu-e2e-no-skips.mjs).
 * A skip there is how a panel that stopped rendering passes silently. So tests
 * that skip on purpose are left out here, by name, and each entry says why.
 * If one of them should run again, delete its entry; if a new test has to skip,
 * add it here with its reason instead of letting the gate tolerate skips.
 */

/** Panels hidden from the menu (apps/web/src/config/menu-visibility.ts, #1683, #1695). */
const HIDDEN_PANEL_SPECS = [
  '**/agent-chat.spec.ts', // Meet More Friends (the marketplace)
  '**/custom-agents.spec.ts', // Meet More Friends (the marketplace)
  '**/connect-panels.spec.ts', // Apple Health, Oura, Wearables tiles
];
const HIDDEN_PANELS = [
  /quiz: answering a question shows how you did/, // Knowledge Quiz
  /gift: the seed amounts are announced as amounts/, // seeds cut from the menu
  /what's coming: planting seeds spends them/, // What's Coming
  /Set the Mood with nothing connected/, // Set the Mood
  /Connect for Spotify asks to connect Spotify/, // Music Together
  /the marketplace shows no progress toward Maya/, // Meet More Friends
];

/** Controls that exist on one screen size only. */
const NOT_ON_DESKTOP = ['**/mobile-sheet.spec.ts']; // the phone's pull-down sheet
const NOT_ON_DESKTOP_TESTS = [/home: "journey" opens and closes cleanly/]; // phone indicator

const projects = base.projects ?? [];
const project = (name: string) => {
  const p = projects.find((x) => x.name === name);
  if (!p) throw new Error(`playwright.signed-in.config.ts has no "${name}" project`);
  return p;
};

export default defineConfig({
  ...base,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.MENU_E2E_JSON ?? 'test-results/menu-e2e-results.json' }],
    ['html', { outputFolder: 'playwright-report-menu-e2e', open: 'never' }],
  ],
  projects: [
    {
      ...project('desktop'),
      testIgnore: [...HIDDEN_PANEL_SPECS, ...NOT_ON_DESKTOP],
      grepInvert: [...HIDDEN_PANELS, ...NOT_ON_DESKTOP_TESTS],
    },
    {
      ...project('mobile'),
      testIgnore: HIDDEN_PANEL_SPECS,
      grepInvert: HIDDEN_PANELS,
    },
  ],
});
