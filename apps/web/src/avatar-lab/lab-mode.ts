/**
 * The admin avatar lab: the real webapp avatar alone at /avatar-lab, which the
 * admin Avatar Soul page frames. Only that exact path (with or without a
 * trailing slash) is the lab; /avatar-lab-x or /a/avatar-lab stay the app.
 */
const AVATAR_LAB_PATH = '/avatar-lab';

export function isAvatarLab(loc: Pick<Location, 'pathname'> = window.location): boolean {
  return loc.pathname === AVATAR_LAB_PATH || loc.pathname === `${AVATAR_LAB_PATH}/`;
}
