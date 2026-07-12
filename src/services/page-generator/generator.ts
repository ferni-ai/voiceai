/**
 * Agent Page Generator
 *
 * Generates standalone HTML pages for agent hosting.
 * Takes an AgentPageConfig and produces a complete, self-contained HTML file
 * similar to meet-joel/index.html.
 */

import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type {
  AgentPageConfig,
  GeneratedPage,
  TemplateContext,
  DerivedBrandColors,
  MultiAdvisorPageConfig,
  GeneratedMultiAdvisorPage,
  MultiAdvisorTemplateContext,
  AdvisorConfig,
} from './types.js';
import { deriveBrandColors, generatePersonaCss, hexToRgba } from './color-utils.js';
import { generateFavicon, generateAppleTouchIcon } from './favicon-generator.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'page-generator' });

// Resolve template directory relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, 'templates');

// Cache compiled templates
let compiledTemplate: Handlebars.TemplateDelegate<TemplateContext> | null = null;
let compiledMultiAdvisorTemplate: Handlebars.TemplateDelegate<MultiAdvisorTemplateContext> | null =
  null;

/**
 * Load and compile the Handlebars template
 * Caches the result for subsequent calls
 */
function getCompiledTemplate(): Handlebars.TemplateDelegate<TemplateContext> {
  if (compiledTemplate) {
    return compiledTemplate;
  }

  const templatePath = join(TEMPLATES_DIR, 'base.hbs');
  const templateSource = readFileSync(templatePath, 'utf-8');

  // Register helper for safe JSON output in script tags
  Handlebars.registerHelper('json', (context: unknown) => {
    return new Handlebars.SafeString(JSON.stringify(context, null, 2));
  });

  // Register helper for triple-brace raw HTML (already supported, but explicit)
  Handlebars.registerHelper('raw', (content: string) => {
    return new Handlebars.SafeString(content);
  });

  // Register helper for current year in footer
  Handlebars.registerHelper('currentYear', () => {
    return new Date().getFullYear();
  });

  compiledTemplate = Handlebars.compile<TemplateContext>(templateSource);
  return compiledTemplate;
}

/**
 * Validate agent page configuration
 */
function validateConfig(config: AgentPageConfig): void {
  if (!config.agent?.id) {
    throw new Error('agent.id is required');
  }
  if (!config.agent?.name) {
    throw new Error('agent.name is required');
  }
  if (!config.agent?.initials) {
    throw new Error('agent.initials is required');
  }
  if (!config.brand?.primary) {
    throw new Error('brand.primary color is required');
  }

  // Validate hex color format
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (!hexPattern.test(config.brand.primary)) {
    throw new Error(
      `Invalid primary color format: ${config.brand.primary}. Use hex format like #96151D`
    );
  }
}

/**
 * Derive the token endpoint based on environment
 */
function getTokenEndpoint(config: AgentPageConfig): string {
  if (config.deployment?.tokenEndpoint) {
    return config.deployment.tokenEndpoint;
  }

  const env = config.deployment?.environment || 'production';

  switch (env) {
    case 'development':
      // Use relative URL - proxy server forwards /token to token server
      return '/token';
    case 'production':
      // Use relative URL - works on any host (Cloud Run, ferni.ai, etc.)
      return '/token';
    case 'custom':
      throw new Error('Custom environment requires explicit tokenEndpoint');
    default:
      return '/token';
  }
}

/**
 * Derive the LiveKit URL based on environment
 */
function getLivekitUrl(config: AgentPageConfig): string {
  if (config.deployment?.livekitUrl) {
    return config.deployment.livekitUrl;
  }

  const env = config.deployment?.environment || 'production';

  switch (env) {
    case 'development':
      return 'wss://dev-8sm1ba0z.livekit.cloud';
    case 'production':
      return 'wss://test-rvg91u1z.livekit.cloud';
    default:
      return 'wss://test-rvg91u1z.livekit.cloud';
  }
}

/**
 * Build the complete template context from config
 */
function buildTemplateContext(config: AgentPageConfig): TemplateContext {
  // Derive brand colors from primary
  const brandColors: DerivedBrandColors = deriveBrandColors(
    config.brand.primary,
    config.brand.secondary
  );

  // Generate persona CSS block
  const personaCss = generatePersonaCss(config.agent.id, brandColors);

  // Generate favicon
  const favicon = generateFavicon(config.agent.initials, config.brand.primary);

  // Determine display name (first name or custom)
  const displayName = config.agent.displayName || config.agent.name.split(' ')[0];

  // Build deployment config
  const tokenEndpoint = getTokenEndpoint(config);
  const livekitUrl = getLivekitUrl(config);
  const isProduction = config.deployment?.environment !== 'development';

  // Build SEO config with defaults
  const seoTitle = config.seo?.title || `Meet ${config.agent.name}`;
  const seoDescription = config.seo?.description || config.agent.description;

  return {
    agent: {
      ...config.agent,
      displayName,
    },
    brand: {
      ...brandColors,
      fonts: config.brand.fonts,
      logoUrl: config.brand.logoUrl,
    },
    voice: config.voice || {},
    theme: config.theme || 'zen',
    deployment: {
      tokenEndpoint,
      livekitUrl,
      isProduction,
    },
    seo: {
      title: seoTitle,
      description: seoDescription,
      ogImage: config.seo?.ogImage,
      twitterCard: config.seo?.twitterCard || 'summary_large_image',
    },
    footer: config.footer,
    favicon,
    personaCss,
    customCss: config.customCss,
    customJs: config.customJs,
  };
}

/**
 * Generate a standalone HTML page for an agent
 *
 * @param config - The agent page configuration
 * @returns Generated page with HTML and metadata
 *
 * @example
 * ```typescript
 * const page = await generateAgentPage({
 *   agent: {
 *     id: 'joel-dickson',
 *     name: 'Joel Dickson',
 *     initials: 'JD',
 *     tagline: 'Global Head of Investment Strategy',
 *     description: 'Expert in investment research and strategy',
 *   },
 *   brand: {
 *     primary: '#96151D',
 *   },
 *   theme: 'zen',
 * });
 *
 * // Deploy or save the HTML
 * await writeFile('joel-dickson.html', page.html);
 * ```
 */
export async function generateAgentPage(config: AgentPageConfig): Promise<GeneratedPage> {
  const startTime = Date.now();

  try {
    // Validate configuration
    validateConfig(config);

    log.debug({ agentId: config.agent.id }, 'Generating agent page');

    // Build template context
    const context = buildTemplateContext(config);

    // Compile template and render
    const template = getCompiledTemplate();
    const html = template(context);

    const size = Buffer.byteLength(html, 'utf-8');
    const duration = Date.now() - startTime;

    log.info(
      { agentId: config.agent.id, sizeKb: Math.round(size / 1024), durationMs: duration },
      'Agent page generated successfully'
    );

    return {
      html,
      size,
      generatedAt: new Date(),
      config,
    };
  } catch (error) {
    log.error({ error: String(error), agentId: config.agent?.id }, 'Failed to generate agent page');
    throw error;
  }
}

/**
 * Generate a preview snippet (just the head and avatar section)
 * Useful for live previews in a page builder UI
 */
export async function generatePreviewSnippet(
  config: AgentPageConfig
): Promise<{ css: string; avatarHtml: string }> {
  validateConfig(config);

  const brandColors = deriveBrandColors(config.brand.primary, config.brand.secondary);
  const personaCss = generatePersonaCss(config.agent.id, brandColors);

  // Build avatar HTML snippet
  const displayName = config.agent.displayName || config.agent.name.split(' ')[0];
  const avatarHtml = `
    <div id="coach" class="coach-avatar" data-persona="${config.agent.id}" data-theme="${config.theme || 'zen'}">
      <div id="avatarRing" class="avatar-ring"></div>
      <div id="coachAvatar" class="avatar-circle">
        <span id="avatarText" class="avatar-text">${config.agent.initials}</span>
      </div>
      <div class="avatar-label">
        <span class="avatar-name">${displayName}</span>
        <span class="avatar-status">Available</span>
      </div>
    </div>
  `;

  return {
    css: personaCss,
    avatarHtml,
  };
}

/**
 * Clear the template cache (useful for development hot reload)
 */
export function clearTemplateCache(): void {
  compiledTemplate = null;
  log.debug('Template cache cleared');
}

/**
 * Pre-warm the template cache
 * Call this at server startup for faster first requests
 */
export function warmTemplateCache(): void {
  getCompiledTemplate();
  log.debug('Template cache warmed');
}

// =============================================================================
// MULTI-ADVISOR PAGE GENERATION
// =============================================================================

/**
 * Load and compile the multi-advisor Handlebars template
 */
function getCompiledMultiAdvisorTemplate(): Handlebars.TemplateDelegate<MultiAdvisorTemplateContext> {
  if (compiledMultiAdvisorTemplate) {
    return compiledMultiAdvisorTemplate;
  }

  const templatePath = join(TEMPLATES_DIR, 'financial-legends.hbs');
  const templateSource = readFileSync(templatePath, 'utf-8');

  // Register helpers if not already registered
  if (!Handlebars.helpers['json']) {
    Handlebars.registerHelper('json', (context: unknown) => {
      return new Handlebars.SafeString(JSON.stringify(context, null, 2));
    });
  }

  if (!Handlebars.helpers['eq']) {
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  }

  compiledMultiAdvisorTemplate = Handlebars.compile<MultiAdvisorTemplateContext>(templateSource);
  return compiledMultiAdvisorTemplate;
}

/**
 * Validate multi-advisor page configuration
 */
function validateMultiAdvisorConfig(config: MultiAdvisorPageConfig): void {
  if (!config.title) {
    throw new Error('title is required');
  }
  if (!config.advisors || config.advisors.length < 2) {
    throw new Error('At least 2 advisors are required');
  }
  if (!config.brand?.primary) {
    throw new Error('brand.primary color is required');
  }

  // Validate each advisor
  for (const advisor of config.advisors) {
    if (!advisor.id) {
      throw new Error('Each advisor must have an id');
    }
    if (!advisor.name) {
      throw new Error(`Advisor ${advisor.id} must have a name`);
    }
    if (!advisor.initials) {
      throw new Error(`Advisor ${advisor.id} must have initials`);
    }
    if (!advisor.color) {
      throw new Error(`Advisor ${advisor.id} must have a color`);
    }

    // Validate hex color format
    const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    if (!hexPattern.test(advisor.color)) {
      throw new Error(`Invalid color format for ${advisor.id}: ${advisor.color}`);
    }
  }
}

/**
 * Build template context for multi-advisor page
 */
function buildMultiAdvisorTemplateContext(
  config: MultiAdvisorPageConfig
): MultiAdvisorTemplateContext {
  // Derive brand colors from primary
  const brandColors: DerivedBrandColors = deriveBrandColors(
    config.brand.primary,
    config.brand.secondary
  );

  // Generate favicon (use first letter of title)
  const faviconInitials = config.title
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  const favicon = generateFavicon(faviconInitials, config.brand.primary);

  // Build deployment config
  const env = config.deployment?.environment || 'production';
  const tokenEndpoint =
    config.deployment?.tokenEndpoint ||
    (env === 'development' ? 'http://localhost:3002/token' : '/token');
  const livekitUrl =
    config.deployment?.livekitUrl ||
    (env === 'development'
      ? 'wss://dev-8sm1ba0z.livekit.cloud'
      : 'wss://test-rvg91u1z.livekit.cloud');
  const isProduction = env !== 'development';

  // Build SEO config
  const seoTitle = config.seo?.title || config.title;
  const seoDescription = config.seo?.description || config.description;

  // Add CSS vars to each advisor
  const advisorsWithCss = config.advisors.map((advisor) => ({
    ...advisor,
    cssVars: `--advisor-color: ${advisor.color}; --advisor-glow: ${advisor.color}40;`,
  }));

  return {
    title: config.title,
    description: config.description,
    advisors: advisorsWithCss,
    brand: {
      ...brandColors,
      fonts: config.brand.fonts,
      logoUrl: config.brand.logoUrl,
    },
    theme: config.theme || 'zen',
    deployment: {
      tokenEndpoint,
      livekitUrl,
      isProduction,
    },
    seo: {
      title: seoTitle,
      description: seoDescription,
      ogImage: config.seo?.ogImage,
      twitterCard: config.seo?.twitterCard || 'summary_large_image',
    },
    favicon,
    customCss: config.customCss,
    customJs: config.customJs,
  };
}

/**
 * Generate a multi-advisor landing page
 *
 * @param config - The multi-advisor page configuration
 * @returns Generated page with HTML and metadata
 *
 * @example
 * ```typescript
 * const page = await generateMultiAdvisorPage({
 *   title: 'Financial Legends',
 *   description: 'Get wisdom from investment masters',
 *   advisors: [
 *     {
 *       id: 'peter-lynch',
 *       name: 'Peter Lynch',
 *       initials: 'PL',
 *       tagline: 'The Stock Picker',
 *       description: 'Master of finding great companies...',
 *       color: '#1a5f2a',
 *     },
 *     // ...more advisors
 *   ],
 *   brand: { primary: '#1a365d' },
 * });
 *
 * await writeFile('financial-legends.html', page.html);
 * ```
 */
export async function generateMultiAdvisorPage(
  config: MultiAdvisorPageConfig
): Promise<GeneratedMultiAdvisorPage> {
  const startTime = Date.now();

  try {
    // Validate configuration
    validateMultiAdvisorConfig(config);

    log.debug(
      { title: config.title, advisorCount: config.advisors.length },
      'Generating multi-advisor page'
    );

    // Build template context
    const context = buildMultiAdvisorTemplateContext(config);

    // Compile template and render
    const template = getCompiledMultiAdvisorTemplate();
    const html = template(context);

    const size = Buffer.byteLength(html, 'utf-8');
    const duration = Date.now() - startTime;

    log.info(
      {
        title: config.title,
        advisorCount: config.advisors.length,
        sizeKb: Math.round(size / 1024),
        durationMs: duration,
      },
      'Multi-advisor page generated successfully'
    );

    return {
      html,
      size,
      generatedAt: new Date(),
      config,
    };
  } catch (error) {
    log.error(
      { error: String(error), title: config?.title },
      'Failed to generate multi-advisor page'
    );
    throw error;
  }
}

/**
 * Clear multi-advisor template cache
 */
export function clearMultiAdvisorTemplateCache(): void {
  compiledMultiAdvisorTemplate = null;
  log.debug('Multi-advisor template cache cleared');
}

/**
 * Pre-warm multi-advisor template cache
 */
export function warmMultiAdvisorTemplateCache(): void {
  getCompiledMultiAdvisorTemplate();
  log.debug('Multi-advisor template cache warmed');
}
