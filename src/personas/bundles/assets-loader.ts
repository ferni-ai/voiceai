/**
 * Agent Assets Loader
 *
 * Loads agent-specific theme and asset configurations.
 * Assets include:
 * - Theme: Colors, typography, avatar settings
 * - Sounds: Audio cues for various events
 * - Icons: Custom icons for the agent
 * - Images: Avatar images and other visuals
 *
 * Directory structure:
 *   assets/
 *     theme.json         - Theme configuration
 *     sounds.json        - Sound mappings
 *     icons/             - Custom icons
 *     images/            - Custom images (avatar, etc.)
 *
 * @module personas/bundles/assets-loader
 */

import { readFile, stat, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  BundleAssets,
  BundleTheme,
  BundleSounds,
} from './types/commands.js';

const log = getLogger();

// ============================================================================
// THEME LOADER
// ============================================================================

/**
 * Load theme configuration from theme.json
 */
export async function loadTheme(assetsDir: string): Promise<BundleTheme | null> {
  try {
    const themePath = join(assetsDir, 'theme.json');
    const themeStat = await stat(themePath).catch(() => null);

    if (!themeStat?.isFile()) {
      return null;
    }

    const content = await readFile(themePath, 'utf-8');
    const theme = JSON.parse(content) as BundleTheme;

    // Validate required fields
    if (!theme.id || !theme.colors) {
      log.warn({ assetsDir }, 'Invalid theme: missing required fields');
      return null;
    }

    return theme;
  } catch (error) {
    log.error({ error, assetsDir }, 'Failed to load theme');
    return null;
  }
}

// ============================================================================
// SOUNDS LOADER
// ============================================================================

/**
 * Load sound configuration from sounds.json
 */
export async function loadSounds(assetsDir: string): Promise<BundleSounds | null> {
  try {
    const soundsPath = join(assetsDir, 'sounds.json');
    const soundsStat = await stat(soundsPath).catch(() => null);

    if (!soundsStat?.isFile()) {
      return null;
    }

    const content = await readFile(soundsPath, 'utf-8');
    const sounds = JSON.parse(content) as BundleSounds;

    return sounds;
  } catch (error) {
    log.error({ error, assetsDir }, 'Failed to load sounds');
    return null;
  }
}

// ============================================================================
// ICONS/IMAGES LOADER
// ============================================================================

/**
 * Scan a directory for image files and return a map of name -> path
 */
async function scanImageDirectory(dir: string): Promise<Record<string, string>> {
  const images: Record<string, string> = {};

  try {
    const dirStat = await stat(dir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return images;
    }

    const files = await readdir(dir);
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (imageExtensions.includes(ext)) {
        const name = file.replace(ext, '');
        images[name] = join(dir, file);
      }
    }
  } catch (error) {
    log.debug({ error, dir }, 'Failed to scan image directory');
  }

  return images;
}

// ============================================================================
// MAIN LOADER
// ============================================================================

/**
 * Load all assets for an agent
 */
export async function loadAssets(assetsDir: string): Promise<BundleAssets | null> {
  try {
    // Check if directory exists
    const dirStat = await stat(assetsDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      return null;
    }

    const [theme, sounds, icons, images] = await Promise.all([
      loadTheme(assetsDir),
      loadSounds(assetsDir),
      scanImageDirectory(join(assetsDir, 'icons')),
      scanImageDirectory(join(assetsDir, 'images')),
    ]);

    // If nothing was loaded, return null
    if (!theme && !sounds && Object.keys(icons).length === 0 && Object.keys(images).length === 0) {
      return null;
    }

    const assets: BundleAssets = {};

    if (theme) {
      assets.theme = theme;
    }

    if (sounds) {
      assets.sounds = sounds;
    }

    if (Object.keys(icons).length > 0) {
      assets.icons = icons;
    }

    if (Object.keys(images).length > 0) {
      assets.images = images;
    }

    log.info(
      {
        assetsDir,
        hasTheme: !!theme,
        hasSounds: !!sounds,
        iconCount: Object.keys(icons).length,
        imageCount: Object.keys(images).length,
      },
      'Loaded agent assets'
    );

    return assets;
  } catch (error) {
    log.error({ error, assetsDir }, 'Failed to load assets');
    return null;
  }
}

/**
 * Load assets for a persona bundle
 */
export async function loadBundleAssets(bundlePath: string): Promise<BundleAssets | null> {
  const assetsDir = join(bundlePath, 'assets');
  return loadAssets(assetsDir);
}

// ============================================================================
// ASSET CACHE
// ============================================================================

const assetsCache = new Map<string, BundleAssets | null>();

/**
 * Get assets for a bundle (with caching)
 */
export async function getAssets(
  bundlePath: string,
  forceReload = false
): Promise<BundleAssets | null> {
  if (!forceReload && assetsCache.has(bundlePath)) {
    return assetsCache.get(bundlePath) ?? null;
  }

  const assets = await loadBundleAssets(bundlePath);
  assetsCache.set(bundlePath, assets);
  return assets;
}

/**
 * Clear assets cache for a bundle
 */
export function clearAssetsCache(bundlePath?: string): void {
  if (bundlePath) {
    assetsCache.delete(bundlePath);
  } else {
    assetsCache.clear();
  }
}

// ============================================================================
// CSS VARIABLE GENERATION
// ============================================================================

/**
 * Generate CSS variables from a theme
 */
export function themeToCSSVariables(theme: BundleTheme, prefix = 'agent'): string {
  const lines: string[] = [];

  lines.push(`:root {`);
  lines.push(`  --${prefix}-primary: ${theme.colors.primary};`);
  lines.push(`  --${prefix}-secondary: ${theme.colors.secondary};`);
  lines.push(`  --${prefix}-accent: ${theme.colors.accent};`);

  if (theme.colors.background) {
    lines.push(`  --${prefix}-background: ${theme.colors.background};`);
  }
  if (theme.colors.text) {
    lines.push(`  --${prefix}-text: ${theme.colors.text};`);
  }
  if (theme.colors.muted) {
    lines.push(`  --${prefix}-muted: ${theme.colors.muted};`);
  }

  lines.push(`}`);

  return lines.join('\n');
}

export default {
  loadTheme,
  loadSounds,
  loadAssets,
  loadBundleAssets,
  getAssets,
  clearAssetsCache,
  themeToCSSVariables,
};
