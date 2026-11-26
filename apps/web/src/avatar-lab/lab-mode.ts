/**
 * The admin avatar lab: the real webapp avatar alone at /avatar-lab, which the
 * admin Avatar Soul page frames. Which paths are the lab is decided once, in
 * utils/avatar-lab-path.ts, so services can check it as well.
 */
import { createLogger } from '../utils/logger.js';

export { isAvatarLab } from '../utils/avatar-lab-path.js';

const log = createLogger('AvatarLab');

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
