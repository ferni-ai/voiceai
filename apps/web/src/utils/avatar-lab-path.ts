/**
 * The admin avatar lab is the page at /avatar-lab (with or without a trailing
 * slash) and nothing else: /avatar-lab-x or /a/avatar-lab stay the app.
 * Pure and low in the layers so services can ask it too; avatar-lab/lab-mode.ts
 * re-exports it for the app shell.
 */
const AVATAR_LAB_PATH = '/avatar-lab';

export function isAvatarLab(loc: Pick<Location, 'pathname'> = window.location): boolean {
  return loc.pathname === AVATAR_LAB_PATH || loc.pathname === `${AVATAR_LAB_PATH}/`;
}
