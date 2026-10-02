#!/usr/bin/env node
/**
 * Generate Tailwind Config for Promo Website
 *
 * Auto-generates apps/website/ferni-website/tailwind.config.generated.js
 * from design-system/tokens/*.json
 *
 * IMPORTANT: This generator outputs CSS variable references (not hardcoded hex)
 * so colors auto-update when design-tokens.css changes.
 *
 * Usage:
 *   node design-system/generate-tailwind-config.js
 *   npm run build:tailwind-config
 */

import fs from 'fs';
import { writeIfChanged } from './lib/write-if-changed.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStamp } from './build/build-stamp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  sourceColors: path.join(__dirname, 'tokens/colors.json'),
  sourceSpacing: path.join(__dirname, 'tokens/spacing.json'),
  sourceTypography: path.join(__dirname, 'tokens/typography.json'),
  sourceAnimation: path.join(__dirname, 'tokens/animation.json'),
  output: path.join(PROJECT_ROOT, 'apps/website/ferni-website/tailwind.config.generated.js'),
};

// ============================================================================
// GENERATORS
// ============================================================================

function loadJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

/**
 * Generate colors using CSS variable references
 * This ensures Tailwind classes auto-update when design-tokens.css changes
 */
/**
 * Wrap a CSS variable so Tailwind opacity modifiers work (`bg-ferni/20`,
 * `from-accent/10`). Tailwind substitutes <alpha-value>; a bare var() would
 * silently drop the modifier.
 */
function cssVarColor(name) {
  return `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`;
}

function generateColors(colors) {
  const personas = colors.personas;

  // Note: We use CSS variable references instead of hardcoded hex values
  // This means colors automatically update when design-tokens.css is regenerated
  const colorObj = {
    // Paper/Background colors - reference CSS vars from design-tokens.css
    paper: {
      DEFAULT: cssVarColor('color-bg-primary'),
      cream: cssVarColor('color-bg-elevated'),
      sand: cssVarColor('color-bg-secondary'),
      warm: cssVarColor('color-bg-tertiary'),
    },
    // Ink/Text colors
    ink: {
      DEFAULT: cssVarColor('color-text-primary'),
      muted: cssVarColor('color-text-secondary'),
      light: cssVarColor('color-text-muted'),
      faded: cssVarColor('color-text-dimmed'),
    },
    // Accent colors (CTA buttons, links)
    accent: {
      DEFAULT: cssVarColor('color-accent'),
      hover: cssVarColor('color-accent-hover'),
      pressed: cssVarColor('color-accent-pressed'),
      glow: cssVarColor('color-accent-glow'),
      subtle: cssVarColor('color-accent-subtle'),
    },
    // Border colors
    border: {
      subtle: cssVarColor('color-border-subtle'),
      medium: cssVarColor('color-border-medium'),
      strong: cssVarColor('color-border-strong'),
    },
    // Semantic colors
    success: {
      DEFAULT: cssVarColor('color-success'),
      bg: cssVarColor('color-success-bg'),
    },
    error: {
      DEFAULT: cssVarColor('color-error'),
      bg: cssVarColor('color-error-bg'),
    },
    warning: {
      DEFAULT: cssVarColor('color-warning'),
      bg: cssVarColor('color-warning-bg'),
    },
  };

  // Add persona colors - all using CSS variable references
  for (const [personaId, _persona] of Object.entries(personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0]; // ferni, peter, alex, etc.
    colorObj[shortId] = {
      DEFAULT: cssVarColor(`color-${shortId}`),
      dark: cssVarColor(`color-${shortId}-secondary`),
      glow: cssVarColor(`color-${shortId}-glow`),
    };
  }

  return colorObj;
}

function generateSpacing(spacing) {
  const result = {};
  for (const [key, value] of Object.entries(spacing.spacing)) {
    // Convert key from "0.5" to "0_5" for valid JS property
    const safeKey = key.replace('.', '_');
    result[safeKey] = `var(--space-${safeKey})`;
  }
  return result;
}

function generateBorderRadius(spacing) {
  const result = {};
  for (const [key, _value] of Object.entries(spacing.borderRadius)) {
    result[key] = `var(--radius-${key})`;
  }
  return result;
}

function generateFontFamily(typography) {
  return {
    display: 'var(--font-display)',
    body: 'var(--font-body)',
    mono: 'var(--font-mono)',
    accent: 'var(--font-accent)',
  };
}

function generateFontSize(typography) {
  const result = {};
  for (const [key, _value] of Object.entries(typography.fontSizes)) {
    result[key] = `var(--text-${key})`;
  }
  return result;
}

function generateTransitionDuration() {
  return {
    instant: 'var(--duration-instant)',
    fastest: 'var(--duration-fastest)',
    faster: 'var(--duration-faster)',
    fast: 'var(--duration-fast)',
    normal: 'var(--duration-normal)',
    slow: 'var(--duration-slow)',
    slower: 'var(--duration-slower)',
    slowest: 'var(--duration-slowest)',
    deliberate: 'var(--duration-deliberate)',
    dramatic: 'var(--duration-dramatic)',
  };
}

function generateTransitionTimingFunction() {
  return {
    linear: 'var(--ease-linear)',
    'ease-in': 'var(--ease-ease-in)',
    'ease-out': 'var(--ease-ease-out)',
    'ease-in-out': 'var(--ease-ease-in-out)',
    'ease-out-expo': 'var(--ease-ease-out-expo)',
    'ease-out-back': 'var(--ease-ease-out-back)',
    spring: 'var(--ease-spring)',
    'spring-bouncy': 'var(--ease-spring-bouncy)',
    smooth: 'var(--ease-smooth)',
    organic: 'var(--ease-organic)',
    elastic: 'var(--ease-elastic)',
    gentle: 'var(--ease-gentle)',
    playful: 'var(--ease-playful)',
  };
}

function generateAnimation(animation) {
  return {
    keyframes: {
      fadeIn: animation.keyframes.fadeIn,
      fadeOut: animation.keyframes.fadeOut,
      slideUp: animation.keyframes.slideUp,
      scaleIn: animation.keyframes.scaleIn,
      pulse: animation.keyframes.pulse,
      breathe: animation.keyframes.breathe,
      shimmer: animation.keyframes.shimmer,
      float: animation.keyframes.float,
      celebrate: animation.keyframes.celebrate,
    },
    animation: {
      fadeIn: animation.animations.fadeIn,
      fadeOut: animation.animations.fadeOut,
      slideUp: animation.animations.slideUp,
      scaleIn: animation.animations.scaleIn,
      pulse: animation.animations.pulse,
      breathe: animation.animations.breathe,
      shimmer: animation.animations.shimmer,
      float: animation.animations.float,
      celebrate: animation.animations.celebrate,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🎨 Generating Tailwind config from design tokens...\n');

  // Load sources
  const colors = loadJson(CONFIG.sourceColors);
  const spacing = loadJson(CONFIG.sourceSpacing);
  const typography = loadJson(CONFIG.sourceTypography);
  const animation = loadJson(CONFIG.sourceAnimation);

  // Generate config object - using CSS variable references
  const config = {
    colors: generateColors(colors),
    spacing: generateSpacing(spacing),
    borderRadius: generateBorderRadius(spacing),
    fontFamily: generateFontFamily(typography),
    fontSize: generateFontSize(typography),
    transitionDuration: generateTransitionDuration(),
    transitionTimingFunction: generateTransitionTimingFunction(),
    ...generateAnimation(animation),
  };

  // Generate output
  const output = [
    '/**',
    ' * Tailwind Theme Extension - Auto-Generated',
    ' * ',
    ' * 🎨 AUTO-GENERATED FROM design-system/tokens/',
    ' * Do not edit directly - run: npm run build:tailwind-config',
    ` * Generated: ${buildStamp()}`,
    ' * ',
    ' * IMPORTANT: This file uses CSS variable references (not hardcoded hex values)',
    ' * so colors automatically update when design-tokens.css is regenerated.',
    ' * ',
    ' * Import this in your tailwind.config.js:',
    ' *   const generated = require(\'./tailwind.config.generated.js\');',
    ' *   module.exports = { theme: { extend: generated } };',
    ' */',
    '',
    'module.exports = ' + JSON.stringify(config, null, 2) + ';',
    '',
  ];

  // Write output
  writeIfChanged(CONFIG.output, output.join('\n'));
  console.log(`  ✅ Generated: ${CONFIG.output}`);
  console.log('     → Uses CSS variable references for auto-sync with design-tokens.css');

  console.log('\n✅ Tailwind config generation complete!\n');
}

build();
