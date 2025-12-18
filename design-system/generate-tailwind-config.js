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
import path from 'path';
import { fileURLToPath } from 'url';

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
function generateColors(colors) {
  const personas = colors.personas;

  // Note: We use CSS variable references instead of hardcoded hex values
  // This means colors automatically update when design-tokens.css is regenerated
  const colorObj = {
    // Paper/Background colors - reference CSS vars from design-tokens.css
    paper: {
      DEFAULT: 'var(--color-bg-primary)',
      cream: 'var(--color-bg-elevated)',
      sand: 'var(--color-bg-secondary)',
      warm: 'var(--color-bg-glass)',
    },
    // Ink/Text colors
    ink: {
      DEFAULT: 'var(--color-text-primary)',
      muted: 'var(--color-text-secondary)',
      light: 'var(--color-text-muted)',
      faded: 'var(--color-text-dimmed)',
    },
    // Accent colors (CTA buttons, links)
    accent: {
      DEFAULT: 'var(--color-accent)',
      hover: 'var(--color-accent-hover)',
      pressed: 'var(--color-accent-pressed)',
      glow: 'var(--color-accent-glow)',
      subtle: 'var(--color-accent-subtle)',
    },
    // Border colors
    border: {
      subtle: 'var(--color-border-subtle)',
      medium: 'var(--color-border-medium)',
      strong: 'var(--color-border-strong)',
    },
    // Semantic colors
    success: {
      DEFAULT: 'var(--color-success)',
      bg: 'var(--color-success-bg)',
    },
    error: {
      DEFAULT: 'var(--color-error)',
      bg: 'var(--color-error-bg)',
    },
    warning: {
      DEFAULT: 'var(--color-warning)',
      bg: 'var(--color-warning-bg)',
    },
  };

  // Add persona colors - all using CSS variable references
  for (const [personaId, _persona] of Object.entries(personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0]; // ferni, peter, alex, etc.
    colorObj[shortId] = {
      DEFAULT: `var(--color-${shortId})`,
      dark: `var(--color-${shortId}-secondary)`,
      glow: `var(--color-${shortId}-glow)`,
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
    ` * Generated: ${new Date().toISOString()}`,
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
  fs.writeFileSync(CONFIG.output, output.join('\n'));
  console.log(`  ✅ Generated: ${CONFIG.output}`);
  console.log('     → Uses CSS variable references for auto-sync with design-tokens.css');

  console.log('\n✅ Tailwind config generation complete!\n');
}

build();
