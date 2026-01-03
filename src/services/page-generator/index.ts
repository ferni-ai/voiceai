/**
 * Agent Page Generator
 *
 * Generates standalone HTML pages for agent hosting.
 * Converts AgentPageConfig into complete, self-contained HTML files
 * ready for deployment to Firebase Hosting or any static host.
 *
 * @example
 * ```typescript
 * import { generateAgentPage } from './services/page-generator/index.js';
 *
 * const page = await generateAgentPage({
 *   agent: {
 *     id: 'joel-dickson',
 *     name: 'Joel Dickson',
 *     initials: 'JD',
 *     tagline: 'Global Head of Investment Strategy',
 *     description: 'Expert in investment research',
 *   },
 *   brand: {
 *     primary: '#96151D',
 *   },
 * });
 *
 * // page.html contains ~100KB standalone HTML
 * // page.size is the byte count
 * // page.generatedAt is the timestamp
 * ```
 */

// Main generator
export {
  generateAgentPage,
  generatePreviewSnippet,
  clearTemplateCache,
  warmTemplateCache,
} from './generator.js';

// Types
export type {
  AgentPageConfig,
  BrandConfig,
  FontConfig,
  VoiceConfig,
  DeploymentConfig,
  SEOConfig,
  GeneratedPage,
  DerivedBrandColors,
  TemplateContext,
} from './types.js';

// Color utilities (for advanced customization)
export {
  parseHex,
  hexToRgba,
  lightenColor,
  darkenColor,
  deriveSecondaryColor,
  deriveBrandColors,
  generatePersonaCss,
  isDarkColor,
  getContrastTextColor,
} from './color-utils.js';

// Favicon utilities
export {
  generateFavicon,
  generateAppleTouchIcon,
  generateMsTileIcon,
  generateAllFavicons,
} from './favicon-generator.js';
