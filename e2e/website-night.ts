/**
 * The ferni.ai home page at night, for the website specs.
 *
 * js/landing-intelligence.js asks the landing API for time-aware content and,
 * when it says visualMode: 'dark' on a dark system, adds `.theme--dark` and
 * `.time-mode--night` to body; before 05:00 on a dark system it also adds
 * `.time-mode--late-night` from the clock. On a light system it must leave
 * the page on paper. The built site has no API, so the specs answer it here
 * and pin the clock to NIGHT (they run in UTC).
 *
 * The script reads the content from POST /api/landing/optimize (its
 * timeContent field) and also defines a GET of /api/landing/time-content, so
 * both are answered. Only visualMode is sent: the copy stays as built.
 */

import type { BrowserContext, Page } from '@playwright/test';

/** 02:00 in the specs' UTC time zone. */
export const NIGHT = new Date('2026-06-15T02:00:00Z');

/** The classes the script adds on a dark system at NIGHT. */
export const NIGHT_CLASSES = ['theme--dark', 'time-mode--night', 'time-mode--late-night'];

const TIME_CONTENT = { visualMode: 'dark' } as const;

declare global {
  interface Window {
    ferniNightAnswered?: boolean;
  }
}

/**
 * Runs in the page. Once the optimize answer has been parsed, one task later
 * (after every promise callback, the script's included) it sets
 * window.ferniNightAnswered. A message channel task, because the specs'
 * paused clock holds back setTimeout.
 */
function flagAnswer(): void {
  const json = Response.prototype.json;
  Response.prototype.json = async function (this: Response) {
    const body: unknown = await json.call(this);
    if (this.url.endsWith('/api/landing/optimize')) {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        window.ferniNightAnswered = true;
      };
      channel.port2.postMessage(null);
    }
    return body;
  };
}

/** Answers the landing API with night content for every page of the context. */
export async function serveNightContent(context: BrowserContext): Promise<void> {
  await context.addInitScript(flagAnswer);
  await context.route('**/api/landing/time-content', (route) =>
    route.fulfill({ json: TIME_CONTENT })
  );
  await context.route('**/api/landing/optimize', (route) =>
    route.fulfill({ json: { timeContent: TIME_CONTENT } })
  );
}

/** Waits until the script has read the night answer and acted on it. */
export async function waitForNight(page: Page): Promise<void> {
  await page.waitForFunction(() => window.ferniNightAnswered === true, null, { polling: 50 });
}

/** Which of NIGHT_CLASSES body has. */
export async function nightClasses(page: Page): Promise<string[]> {
  return page.evaluate(
    (names) => names.filter((name) => document.body.classList.contains(name)),
    NIGHT_CLASSES
  );
}
