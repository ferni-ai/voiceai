#!/usr/bin/env node
/**
 * Sync Design Tokens to Promo Website
 *
 * Copies essential design tokens from design-system to apps/website/ferni-website
 * for brand consistency.
 *
 * Usage:
 *   node design-system/sync-promo-tokens.js
 *   npm run sync:promo
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
  // Source: design-system/tokens/colors.json
  sourceColors: path.join(__dirname, 'tokens/colors.json'),
  sourceSpacing: path.join(__dirname, 'tokens/spacing.json'),
  sourceTypography: path.join(__dirname, 'tokens/typography.json'),
  sourceAnimation: path.join(__dirname, 'tokens/animation.json'),

  // Output files (multiple destinations for consistency)
  outputs: [
    path.join(PROJECT_ROOT, 'apps/website/ferni-website/css/design-tokens.css'),
    path.join(PROJECT_ROOT, 'apps/website/ferni-website/src/css/_tokens.css'),
    path.join(PROJECT_ROOT, 'brand/ferni-design-tokens.css'),
  ],
};

// ============================================================================
// GENERATORS
// ============================================================================

function loadJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function generateColorVars(colors) {
  const lines = [];
  const zen = colors.themes.zen;

  // Background colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Background');
  lines.push('     ============================================ */');
  lines.push(`  --color-bg-primary: ${zen.background.primary};`);
  lines.push(`  --color-bg-secondary: ${zen.background.secondary};`);
  lines.push(`  --color-bg-elevated: ${zen.background.elevated};`);
  lines.push(`  --color-bg-glass: ${zen.background.glass};`);
  lines.push(`  --color-bg-overlay: ${zen.background.overlay};`);
  lines.push('');

  // Text colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Text');
  lines.push('     ============================================ */');
  lines.push(`  --color-text-primary: ${zen.text.primary};`);
  lines.push(`  --color-text-secondary: ${zen.text.secondary};`);
  lines.push(`  --color-text-muted: ${zen.text.muted};`);
  lines.push(`  --color-text-dimmed: ${zen.text.dimmed};`);
  lines.push(`  --color-text-inverse: ${zen.text.inverse};`);
  lines.push('');

  // Accent colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Accent');
  lines.push('     ============================================ */');
  lines.push(`  --color-accent: ${zen.accent.primary};`);
  lines.push(`  --color-accent-hover: ${zen.accent.hover};`);
  lines.push(`  --color-accent-pressed: ${zen.accent.pressed};`);
  lines.push(`  --color-accent-glow: ${zen.accent.glow};`);
  lines.push(`  --color-accent-subtle: ${zen.accent.subtle};`);
  lines.push('');

  // Border colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Borders');
  lines.push('     ============================================ */');
  lines.push(`  --color-border-subtle: ${zen.border.subtle};`);
  lines.push(`  --color-border-medium: ${zen.border.medium};`);
  lines.push(`  --color-border-strong: ${zen.border.strong};`);
  lines.push('');

  // Semantic colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Semantic');
  lines.push('     ============================================ */');
  lines.push(`  --color-success: ${zen.semantic.success};`);
  lines.push(`  --color-success-bg: ${zen.semantic.successGlow};`);
  lines.push(`  --color-error: ${zen.semantic.error};`);
  lines.push(`  --color-error-bg: ${zen.semantic.errorGlow};`);
  lines.push(`  --color-warning: ${zen.semantic.warning};`);
  lines.push(`  --color-warning-bg: ${zen.semantic.warningGlow};`);
  lines.push('');

  // Persona colors (with theme-aware text variants)
  lines.push('  /* ============================================');
  lines.push('     COLORS - Personas');
  lines.push('     Theme-aware: --color-{persona}-text adapts');
  lines.push('     to light/dark mode for WCAG AA contrast');
  lines.push('     ============================================ */');
  for (const [personaId, persona] of Object.entries(colors.personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0]; // ferni, jack, peter, etc.
    lines.push(`  --color-${shortId}: ${persona.primary};`);
    lines.push(`  --color-${shortId}-secondary: ${persona.secondary};`);
    lines.push(`  --color-${shortId}-glow: ${persona.glow};`);
    // Theme-aware text color (defaults to primary for light mode)
    lines.push(`  --color-${shortId}-text: ${persona.primary};`);
    lines.push('');
  }

  return lines;
}

/**
 * Generate dark theme color overrides
 * Uses midnight theme values + textOnDark persona variants for WCAG AA contrast
 */
function generateDarkThemeVars(colors) {
  const lines = [];
  const midnight = colors.themes.midnight;

  lines.push('');
  lines.push('/* ============================================================================');
  lines.push('   DARK THEME OVERRIDES');
  lines.push('   Midnight theme (Cedar Night) - warm cedar tones under moonlight');
  lines.push('   All persona text colors are WCAG AA compliant (4.5:1+ contrast)');
  lines.push('   ============================================================================ */');
  lines.push('');
  lines.push('@media (prefers-color-scheme: dark) {');
  lines.push('  :root {');

  // Background colors
  lines.push('    /* Background */');
  lines.push(`    --color-bg-primary: ${midnight.background.primary};`);
  lines.push(`    --color-bg-secondary: ${midnight.background.secondary};`);
  lines.push(`    --color-bg-elevated: ${midnight.background.elevated};`);
  lines.push(`    --color-bg-glass: ${midnight.background.glass};`);
  lines.push(`    --color-bg-overlay: ${midnight.background.overlay};`);
  lines.push('');

  // Text colors
  lines.push('    /* Text */');
  lines.push(`    --color-text-primary: ${midnight.text.primary};`);
  lines.push(`    --color-text-secondary: ${midnight.text.secondary};`);
  lines.push(`    --color-text-muted: ${midnight.text.muted};`);
  lines.push(`    --color-text-dimmed: ${midnight.text.dimmed};`);
  lines.push(`    --color-text-inverse: ${midnight.text.inverse};`);
  lines.push('');

  // Accent colors
  lines.push('    /* Accent */');
  lines.push(`    --color-accent: ${midnight.accent.primary};`);
  lines.push(`    --color-accent-hover: ${midnight.accent.hover};`);
  lines.push(`    --color-accent-pressed: ${midnight.accent.pressed};`);
  lines.push(`    --color-accent-glow: ${midnight.accent.glow};`);
  lines.push(`    --color-accent-subtle: ${midnight.accent.subtle};`);
  lines.push('');

  // Border colors
  lines.push('    /* Borders */');
  lines.push(`    --color-border-subtle: ${midnight.border.subtle};`);
  lines.push(`    --color-border-medium: ${midnight.border.medium};`);
  lines.push(`    --color-border-strong: ${midnight.border.strong};`);
  lines.push('');

  // Semantic colors
  lines.push('    /* Semantic */');
  lines.push(`    --color-success: ${midnight.semantic.success};`);
  lines.push(`    --color-success-bg: ${midnight.semantic.successGlow};`);
  lines.push(`    --color-error: ${midnight.semantic.error};`);
  lines.push(`    --color-error-bg: ${midnight.semantic.errorGlow};`);
  lines.push(`    --color-warning: ${midnight.semantic.warning};`);
  lines.push(`    --color-warning-bg: ${midnight.semantic.warningGlow};`);
  lines.push('');

  // Persona text colors (WCAG AA compliant on dark backgrounds)
  lines.push('    /* Persona Text Colors - WCAG AA on dark backgrounds */');
  for (const [personaId, persona] of Object.entries(colors.personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0];
    if (persona.textOnDark) {
      lines.push(`    --color-${shortId}-text: ${persona.textOnDark};`);
    }
  }

  lines.push('  }');
  lines.push('}');
  lines.push('');

  // Also add [data-theme="dark"] selector for manual toggle
  lines.push('[data-theme="dark"] {');

  // Background colors
  lines.push('  /* Background */');
  lines.push(`  --color-bg-primary: ${midnight.background.primary};`);
  lines.push(`  --color-bg-secondary: ${midnight.background.secondary};`);
  lines.push(`  --color-bg-elevated: ${midnight.background.elevated};`);
  lines.push(`  --color-bg-glass: ${midnight.background.glass};`);
  lines.push(`  --color-bg-overlay: ${midnight.background.overlay};`);
  lines.push('');

  // Text colors
  lines.push('  /* Text */');
  lines.push(`  --color-text-primary: ${midnight.text.primary};`);
  lines.push(`  --color-text-secondary: ${midnight.text.secondary};`);
  lines.push(`  --color-text-muted: ${midnight.text.muted};`);
  lines.push(`  --color-text-dimmed: ${midnight.text.dimmed};`);
  lines.push(`  --color-text-inverse: ${midnight.text.inverse};`);
  lines.push('');

  // Accent colors
  lines.push('  /* Accent */');
  lines.push(`  --color-accent: ${midnight.accent.primary};`);
  lines.push(`  --color-accent-hover: ${midnight.accent.hover};`);
  lines.push(`  --color-accent-pressed: ${midnight.accent.pressed};`);
  lines.push(`  --color-accent-glow: ${midnight.accent.glow};`);
  lines.push(`  --color-accent-subtle: ${midnight.accent.subtle};`);
  lines.push('');

  // Border colors
  lines.push('  /* Borders */');
  lines.push(`  --color-border-subtle: ${midnight.border.subtle};`);
  lines.push(`  --color-border-medium: ${midnight.border.medium};`);
  lines.push(`  --color-border-strong: ${midnight.border.strong};`);
  lines.push('');

  // Semantic colors
  lines.push('  /* Semantic */');
  lines.push(`  --color-success: ${midnight.semantic.success};`);
  lines.push(`  --color-success-bg: ${midnight.semantic.successGlow};`);
  lines.push(`  --color-error: ${midnight.semantic.error};`);
  lines.push(`  --color-error-bg: ${midnight.semantic.errorGlow};`);
  lines.push(`  --color-warning: ${midnight.semantic.warning};`);
  lines.push(`  --color-warning-bg: ${midnight.semantic.warningGlow};`);
  lines.push('');

  // Persona text colors
  lines.push('  /* Persona Text Colors - WCAG AA on dark backgrounds */');
  for (const [personaId, persona] of Object.entries(colors.personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0];
    if (persona.textOnDark) {
      lines.push(`  --color-${shortId}-text: ${persona.textOnDark};`);
    }
  }

  lines.push('}');

  return lines;
}

function generateSpacingVars(spacing) {
  const lines = [];

  // Spacing scale
  lines.push('  /* ============================================');
  lines.push('     SPACING');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(spacing.spacing)) {
    const varName = key.replace('.', '_');
    lines.push(`  --space-${varName}: ${value};`);
  }
  lines.push('');

  // Border radius
  lines.push('  /* ============================================');
  lines.push('     BORDER RADIUS');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(spacing.borderRadius)) {
    lines.push(`  --radius-${key}: ${value};`);
  }
  lines.push('');

  // Shadows (zen theme)
  lines.push('  /* ============================================');
  lines.push('     SHADOWS');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(spacing.shadows.zen)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  lines.push('');

  return lines;
}

function generateTypographyVars(typography) {
  const lines = [];

  // Font families
  lines.push('  /* ============================================');
  lines.push('     TYPOGRAPHY - Fonts');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(typography.fontFamilies)) {
    const font = typeof value === 'object' ? value.zen : value;
    lines.push(`  --font-${key}: ${font};`);
  }
  lines.push('');

  // Font sizes
  lines.push('  /* ============================================');
  lines.push('     TYPOGRAPHY - Sizes');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(typography.fontSizes)) {
    lines.push(`  --text-${key}: ${value};`);
  }
  lines.push('');

  // Font weights
  lines.push('  /* ============================================');
  lines.push('     TYPOGRAPHY - Weights');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(typography.fontWeights)) {
    lines.push(`  --font-weight-${key}: ${value};`);
  }
  lines.push('');

  return lines;
}

function generateAnimationVars(animation) {
  const lines = [];

  // Easings
  lines.push('  /* ============================================');
  lines.push('     ANIMATION - Easings');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(animation.easings)) {
    const varName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    lines.push(`  --ease-${varName}: ${value};`);
  }
  lines.push('');

  // Durations
  lines.push('  /* ============================================');
  lines.push('     ANIMATION - Durations');
  lines.push('     ============================================ */');
  for (const [key, value] of Object.entries(animation.durations)) {
    const varName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    lines.push(`  --duration-${varName}: ${value};`);
  }
  lines.push('');

  return lines;
}

// ============================================================================
// MAIN
// ============================================================================

function build() {
  console.log('🎨 Syncing design tokens to promo website...\n');

  // Load source tokens
  const colors = loadJson(CONFIG.sourceColors);
  const spacing = loadJson(CONFIG.sourceSpacing);
  const typography = loadJson(CONFIG.sourceTypography);
  const animation = loadJson(CONFIG.sourceAnimation);

  // Generate CSS
  const output = [
    '/**',
    ' * Ferni Design Tokens',
    ' * CSS Custom Properties implementing brand guidelines',
    ' *',
    ' * 🎨 AUTO-GENERATED FROM design-system/tokens/',
    ' * Do not edit directly - run: npm run sync:promo',
    ` * Generated: ${new Date().toISOString()}`,
    ' */',
    '',
    ':root {',
    ...generateColorVars(colors),
    ...generateSpacingVars(spacing),
    ...generateTypographyVars(typography),
    ...generateAnimationVars(animation),
    '}',
    ...generateDarkThemeVars(colors),
  ];

  // Write to all output destinations
  const content = output.join('\n');
  for (const outputFile of CONFIG.outputs) {
    // Ensure directory exists
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputFile, content);
    console.log(`  ✅ Generated: ${outputFile}`);
  }

  console.log('\n✅ All token files synced!\n');
}

build();

