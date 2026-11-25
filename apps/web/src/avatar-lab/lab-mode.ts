/**
 * The admin avatar lab: the real webapp avatar alone at /avatar-lab, which the
 * admin Avatar Soul page frames. Only that exact path (with or without a
 * trailing slash) is the lab; /avatar-lab-x or /a/avatar-lab stay the app.
 */
import { createLogger } from '../utils/logger.js';

const log = createLogger('AvatarLab');

const AVATAR_LAB_PATH = '/avatar-lab';

export function isAvatarLab(loc: Pick<Location, 'pathname'> = window.location): boolean {
  return loc.pathname === AVATAR_LAB_PATH || loc.pathname === `${AVATAR_LAB_PATH}/`;
}

type LoadLab = () => Promise<{ startAvatarLab: () => Promise<void> }>;

/**
 * Loads the lab page (its own chunk) and starts it. A failure to load or boot
 * is logged, never thrown, so it cannot reject app.ts initialize().
 */
export async function openAvatarLab(load: LoadLab = () => import('./index.js')): Promise<void> {
  try {
    await (await load()).startAvatarLab();
  } catch (error) {
    log.error('Failed to initialize the avatar lab:', error);
  }
}
