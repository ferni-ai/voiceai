/**
 * What /admin opens. Every /admin URL opens the Admin Portal, whatever its
 * query string says: the old `?legacy` dashboard and its hand-drawn "Avatar
 * Soul Lab" preview were removed (#4069), so an old bookmark lands on the
 * real portal.
 *
 * @module app/admin-route
 */

/** Open the Admin Portal; app.ts calls this for /admin. */
export async function openAdminRoute(): Promise<void> {
  const { openAdminPortal } = await import('../admin/index.js');
  await openAdminPortal();
}
