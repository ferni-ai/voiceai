/**
 * Pages opened from a text link that take the place of the app. app.ts asks
 * here first, before the main app's sign-in gate and UI start.
 *
 * @module app/standalone-pages
 */

/** Open the page for pathname if it is one; true when it took over. */
export async function openStandalonePage(pathname: string): Promise<boolean> {
  if (!pathname.startsWith('/a/')) return false;
  const page = await import('../ui/answer-card-page.ui.js');
  const id = page.answerCardIdFromPath(pathname);
  if (!id) return false;
  await page.initAnswerCardPage(id);
  return true;
}
