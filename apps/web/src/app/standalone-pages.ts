/**
 * Pages opened from a text link that take the place of the app. app.ts asks
 * here first, before the main app's sign-in gate and UI start.
 *
 * @module app/standalone-pages
 */

/** /connect, with or without trailing slashes; not /connections. */
const CONNECT_PATHS = /^\/connect\/*$/;

/** Open the page for this location if it is one; true when it took over. */
export async function openStandalonePage(
  pathname: string,
  hash = window.location.hash
): Promise<boolean> {
  if (pathname.startsWith('/a/')) {
    const page = await import('../ui/answer-card-page.ui.js');
    const id = page.answerCardIdFromPath(pathname);
    if (!id) return false;
    await page.initAnswerCardPage(id);
    return true;
  }
  if (CONNECT_PATHS.test(pathname)) {
    // Before anything awaits, and even when the page won't open: keep the
    // single-use invite out of the address bar, history, screenshots and
    // anything that reads the URL, such as a crash report.
    if (window.location.hash) {
      window.history.replaceState(null, '', pathname + window.location.search);
    }
    const page = await import('../ui/connect-invite-page.ui.js');
    const invite = page.connectInviteFromLocation(pathname, hash);
    if (!invite) return false;
    await page.initConnectInvitePage(invite);
    return true;
  }
  return false;
}
