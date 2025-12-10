#!/usr/bin/env node
/**
 * Generate Tailwind Config for Promo Website
 * 
 * Auto-generates promo/ferni-website/tailwind.config.generated.js
 * from design-system/tokens/*.json
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
  output: path.join(PROJECT_ROOT, 'promo/ferni-website/tailwind.config.generated.js'),
};

// ============================================================================
// GENERATORS
// ============================================================================

function loadJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function generateColors(colors) {
  const zen = colors.themes.zen;
  const personas = colors.personas;
  
  const colorObj = {
    // Paper/Background colors
    paper: {
      DEFAULT: zen.background.primary,
      cream: zen.background.elevated,
      sand: zen.background.secondary,
      warm: zen.background.tertiary,
    },
    // Ink/Text colors
    ink: {
      DEFAULT: zen.text.primary,
      muted: zen.text.secondary,
      light: zen.text.muted,
      faded: zen.text.dimmed,
    },
    // Accent colors
    accent: {
      DEFAULT: zen.accent.primary,
      hover: zen.accent.hover,
      pressed: zen.accent.pressed,
      glow: zen.accent.glow,
      subtle: zen.accent.subtle,
    },
    // Border colors
    border: {
      subtle: zen.border.subtle,
      medium: zen.border.medium,
      strong: zen.border.strong,
    },
    // Semantic colors
    success: zen.semantic.success,
    error: zen.semantic.error,
    warning: zen.semantic.warning,
  };
  
  // Add persona colors
  for (const [personaId, persona] of Object.entries(personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0]; // ferni, peter, alex, etc.
    colorObj[shortId] = {
      DEFAULT: persona.primary,
      dark: persona.secondary,
      light: adjustBrightness(persona.primary, 20),
      glow: persona.glow,
      tint: persona.tint,
    };
  }
  
  return colorObj;
}

function adjustBrightness(hex, percent) {
  // Simple brightness adjustment
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function generateSpacing(spacing) {
  const result = {};
  for (const [key, value] of Object.entries(spacing.spacing)) {
    // Convert key from "0.5" to "0_5" for valid JS property
    const safeKey = key.replace('.', '_');
    result[safeKey] = value;
  }
  return result;
}

function generateBorderRadius(spacing) {
  return spacing.borderRadius;
}

function generateFontFamily(typography) {
  const families = typography.fontFamilies;
  return {
    display: families.display.zen || families.display,
    body: families.body.zen || families.body,
    mono: families.mono,
    accent: families.accent || families.display.zen || families.display,
  };
}

function generateFontSize(typography) {
  const result = {};
  for (const [key, value] of Object.entries(typography.fontSizes)) {
    result[key] = value;
  }
  return result;
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

  // Generate config object
  const config = {
    colors: generateColors(colors),
    spacing: generateSpacing(spacing),
    borderRadius: generateBorderRadius(spacing),
    fontFamily: generateFontFamily(typography),
    fontSize: generateFontSize(typography),
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

  console.log('\n✅ Tailwind config generation complete!\n');
  console.log('📝 Update your tailwind.config.js to import this file:');
  console.log('   const generated = require(\'./tailwind.config.generated.js\');');
  console.log('   module.exports = { theme: { extend: { ...generated } } };');
  console.log('');
}

build();

