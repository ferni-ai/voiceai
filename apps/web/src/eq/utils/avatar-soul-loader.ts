/**
 * Avatar Soul Loader
 *
 * Lazy loads the avatar soul module to avoid circular dependencies.
 * The avatar soul is the visual animation system for Ferni's avatar.
 *
 * @module @ferni/eq/utils/avatar-soul-loader
 */

// Avatar Soul integration - will be loaded dynamically to avoid circular deps
let avatarSoulModule: typeof import('../../ui/avatar-soul.ui.js') | null = null;

/**
 * Lazy load avatar soul to avoid circular dependency
 */
export async function getAvatarSoul() {
  if (!avatarSoulModule) {
    try {
      avatarSoulModule = await import('../../ui/avatar-soul.ui.js');
    } catch {
      // Avatar soul not available yet - that's OK
    }
  }
  return avatarSoulModule?.avatarSoul;
}

/**
 * Reset the cached module (for testing)
 */
export function resetAvatarSoulCache(): void {
  avatarSoulModule = null;
}
