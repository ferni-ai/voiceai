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
  // Light theme (Zen Garden) - for consumer-facing sites
  lightThemeOutputs: [
    path.join(PROJECT_ROOT, 'apps/website/ferni-website/css/design-tokens.css'),
    path.join(PROJECT_ROOT, 'apps/website/ferni-website/src/css/_tokens.css'),
    path.join(PROJECT_ROOT, 'brand/ferni-design-tokens.css'),
  ],
  // Dark theme (Cedar Night) - for developer-facing sites
  darkThemeOutputs: [
    path.join(PROJECT_ROOT, 'apps/website/developers-portal/src/css/tokens.css'),
    path.join(PROJECT_ROOT, 'apps/website/design-system-portal/src/css/tokens.css'),
  ],
  // Marketplace uses light theme with additional persona colors
  marketplaceOutputs: [
    path.join(PROJECT_ROOT, 'apps/website/marketplace-portal/src/css/tokens.css'),
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
  const midnight = colors.themes.midnight;

  // Background colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - Background');
  lines.push('     ============================================ */');
  lines.push(`  --color-bg-primary: ${zen.background.primary};`);
  lines.push(`  --color-bg-secondary: ${zen.background.secondary};`);
  lines.push(`  --color-bg-tertiary: ${zen.background.tertiary};`);
  lines.push(`  --color-bg-elevated: ${zen.background.elevated};`);
  lines.push(`  --color-bg-glass: ${zen.background.glass};`);
  lines.push(`  --color-bg-overlay: ${zen.background.overlay};`);
  // Aliases for common usage
  lines.push(`  --color-bg: ${zen.background.primary};`);
  lines.push(`  --color-bg-surface: ${zen.background.secondary};`);
  lines.push(`  --color-bg-hover: rgba(44, 37, 32, 0.04);`);
  lines.push(`  --color-bg-warm: ${zen.background.tertiary};`);
  lines.push(`  --color-bg-code: #f5f2ed;`);
  lines.push(`  --color-bg-sage-subtle: rgba(61, 90, 69, 0.04);`);
  lines.push(`  --color-background: ${zen.background.primary};`);
  lines.push(`  --color-background-subtle: ${zen.background.secondary};`);
  lines.push(`  --color-background-muted: ${zen.background.tertiary};`);
  lines.push(`  --color-background-surface: ${zen.background.secondary};`);
  lines.push(`  --color-background-elevated: ${zen.background.elevated};`);
  lines.push(`  --color-background-hover: rgba(44, 37, 32, 0.04);`);
  lines.push(`  --color-background-deep: #2c2520;`);
  lines.push(`  --color-elevated: ${zen.background.elevated};`);
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
  // Aliases
  lines.push(`  --color-text: ${zen.text.primary};`);
  lines.push(`  --color-text-light: ${zen.text.muted};`);
  lines.push(`  --color-text-dark: ${zen.text.primary};`);
  lines.push(`  --color-text-secondary-light: ${zen.text.secondary};`);
  lines.push(`  --color-text-error: #b5453a;`);
  lines.push(`  --color-natural-ink: ${zen.natural.ink};`);
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
  lines.push(`  --color-accent-light: ${zen.accent.hover};`);
  lines.push(`  --color-accent-dark: ${zen.accent.pressed};`);
  lines.push(`  --color-sage: ${zen.accent.primary};`);
  lines.push(`  --color-sage-dark: ${zen.accent.pressed};`);
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

  // Success/Error extended
  lines.push(`  --color-success-light: ${colors.personas.ferni.textOnDark || '#a5c99a'};`);
  lines.push(`  --color-success-dark: #3d7a52;`);
  lines.push(`  --color-error-dark: #b5453a;`);
  lines.push(`  --color-error-muted: rgba(181, 69, 58, 0.5);`);
  lines.push(`  --color-error-warm: #B85C3C;`);
  lines.push(`  --color-info: ${zen.semantic.info};`);
  lines.push(`  --color-info-bg: ${zen.semantic.infoGlow};`);
  lines.push(`  --color-info-dark: #3a6b9c;`);
  lines.push(`  --color-info-light: #a8b8d8;`);
  lines.push(`  --color-info-muted: #a0b0c0;`);
  lines.push('');

  // Border alias
  lines.push(`  --color-border: ${zen.border.medium};`);
  lines.push('');

  // Gray scale
  lines.push('  /* ============================================');
  lines.push('     COLORS - Gray Scale');
  lines.push('     ============================================ */');
  lines.push('  --color-gray-100: #eceef2;');
  lines.push('  --color-gray-300: #D1D1D6;');
  lines.push('  --color-gray-400: #AEAEB2;');
  lines.push('  --color-gray-500: #6E6E73;');
  lines.push('  --color-gray-700: #3A3A3C;');
  lines.push('  --color-gray-800: #2D3748;');
  lines.push('  --color-gray-900: #1A252F;');
  lines.push('');

  // External brand colors
  lines.push('  /* ============================================');
  lines.push('     COLORS - External Brands');
  lines.push('     ============================================ */');
  if (colors.external) {
    if (colors.external.google) {
      lines.push(`  --color-google-blue: ${colors.external.google.primary};`);
      lines.push(`  --color-google-red: ${colors.external.google.red};`);
      lines.push(`  --color-google-yellow: ${colors.external.google.yellow};`);
      lines.push(`  --color-google-green: ${colors.external.google.green};`);
    }
    if (colors.external.apple) {
      lines.push(`  --color-apple-blue: ${colors.external.apple.blue};`);
      lines.push(`  --color-apple-gray: ${colors.external.apple.gray};`);
    }
    if (colors.external.gpt) {
      lines.push(`  --color-openai: ${colors.external.gpt.primary};`);
    }
  }
  lines.push(`  --color-purple: #7c3aed;`);
  lines.push(`  --color-purple-light: #a78bfa;`);
  lines.push('');

  // Dark Theme / Cedar Night Accents (for dark sections on light pages)
  lines.push('  /* ============================================');
  lines.push('     COLORS - Dark Theme / Cedar Night Accents');
  lines.push('     Used for dark sections and dark mode');
  lines.push('     ============================================ */');
  lines.push(`  --color-accent-gold: ${midnight.accent.primary};`);
  lines.push(`  --color-accent-gold-hover: ${midnight.accent.hover};`);
  lines.push(`  --color-cedar: ${midnight.background.elevated};`);
  lines.push(`  --color-cedar-dark: ${midnight.background.primary};`);
  lines.push(`  --color-cedar-deep: #1f1a16;`);
  lines.push(`  --color-ink-deep: #1a1613;`);
  // Dark theme background variants
  lines.push(`  --color-dark-bg: ${midnight.background.primary};`);
  lines.push(`  --color-dark-bg-elevated: ${midnight.background.elevated};`);
  lines.push(`  --color-dark-accent: ${midnight.accent.primary};`);
  lines.push(`  --color-dark-text: ${midnight.text.primary};`);
  lines.push(`  --color-dark-text-secondary: ${midnight.text.secondary};`);
  lines.push(`  --color-dark-text-muted: ${midnight.text.muted};`);
  lines.push(`  --color-dark-gradient-start: ${midnight.background.primary};`);
  lines.push(`  --color-dark-gradient-mid: #4a3a35;`);
  lines.push(`  --color-bg-dark: ${midnight.background.primary};`);
  lines.push(`  --color-bg-dark-elevated: ${midnight.background.elevated};`);
  lines.push(`  --color-bg-dark-surface: ${midnight.background.secondary};`);
  lines.push(`  --color-bg-darker: #2a2420;`);
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
    // Add subtle variant if present
    if (persona.subtle || persona.tint) {
      lines.push(`  --color-${shortId}-subtle: ${persona.subtle || persona.tint};`);
    }
    // Add light variant if present
    if (persona.light) {
      lines.push(`  --color-${shortId}-light: ${persona.light};`);
    }
    // Add dark variant from secondary
    lines.push(`  --color-${shortId}-dark: ${persona.secondary};`);
    // Add muted variant (secondary with opacity for some)
    if (shortId === 'maya' || shortId === 'jordan') {
      lines.push(`  --color-${shortId}-muted: ${persona.secondary};`);
    }
    lines.push('');
  }
  // Additional persona aliases (Ferni-specific)
  lines.push(`  --color-ferni-green: ${colors.personas.ferni.primary};`);
  lines.push(`  --color-ferni-pale: rgba(74, 103, 65, 0.08);`);
  lines.push(`  --color-ferni-border: rgba(74, 103, 65, 0.15);`);
  lines.push(`  --color-forest-dark: #1E3D32;`);
  lines.push(`  --color-gold: #a6854a;`);
  // Peter-specific
  lines.push(`  --color-peter-pale: #e8f0f0;`);
  // Nayan-specific
  lines.push(`  --color-nayan-light: #e8d0a8;`);
  // Amara-specific
  lines.push(`  --color-amara-light: #c0b0d8;`);
  // Peach colors
  lines.push(`  --color-peach: #f0c0a0;`);
  lines.push(`  --color-peach-light: #f0d0a8;`);
  lines.push(`  --color-peach-warm: #f8b898;`);
  // Warm white
  lines.push(`  --color-warm-white: #f2ebe8;`);
  lines.push('');

  // Natural colors (from zen theme)
  if (zen.natural) {
    lines.push('  /* ============================================');
    lines.push('     COLORS - Natural Palette');
    lines.push('     Japanese garden inspired earthy tones');
    lines.push('     ============================================ */');
    for (const [colorName, colorValue] of Object.entries(zen.natural)) {
      if (colorName.startsWith('_')) continue;
      // Convert camelCase to kebab-case
      const kebabName = colorName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      lines.push(`  --color-${kebabName}: ${colorValue};`);
    }
    lines.push('');
  }

  // Cinematic colors (for hero sections)
  if (colors.cinematic) {
    lines.push('  /* ============================================');
    lines.push('     COLORS - Cinematic (Hero Sections)');
    lines.push('     Storytelling and dramatic reveals');
    lines.push('     ============================================ */');
    if (colors.cinematic.black) {
      for (const [key, value] of Object.entries(colors.cinematic.black)) {
        if (key.startsWith('_')) continue;
        lines.push(`  --color-cinematic-${key}: ${value};`);
      }
    }
    // Additional cinematic aliases
    lines.push(`  --color-cinematic-black: ${colors.cinematic.black?.primary || '#0a0908'};`);
    lines.push(`  --color-cinematic-dark: ${colors.cinematic.black?.deep || '#141210'};`);
    lines.push(`  --color-cinematic-surface: ${colors.cinematic.black?.rich || '#1a1613'};`);
    // Cinematic overlays
    lines.push(`  --color-cinematic-overlay-light: rgba(10, 9, 8, 0.3);`);
    lines.push(`  --color-cinematic-overlay-medium: rgba(10, 9, 8, 0.5);`);
    lines.push(`  --color-cinematic-overlay-heavy: rgba(10, 9, 8, 0.7);`);
    lines.push(`  --color-cinematic-overlay-vignette: radial-gradient(ellipse at center, transparent 40%, rgba(10, 9, 8, 0.4) 100%);`);

    if (colors.cinematic.text) {
      for (const [key, value] of Object.entries(colors.cinematic.text)) {
        if (key.startsWith('_')) continue;
        const kebabKey = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
        lines.push(`  --color-cinematic-text-${kebabKey}: ${value};`);
      }
      // Text aliases
      lines.push(`  --color-cinematic-text: ${colors.cinematic.text?.hero || '#ffffff'};`);
      lines.push(`  --color-cinematic-text-muted: ${colors.cinematic.text?.heroMuted || 'rgba(255, 255, 255, 0.7)'};`);
      lines.push(`  --color-cinematic-text-secondary: ${colors.cinematic.text?.heroSubtle || 'rgba(255, 255, 255, 0.9)'};`);
      lines.push(`  --color-cinematic-text-subtle: rgba(255, 255, 255, 0.6);`);
    }
    if (colors.cinematic.glow) {
      for (const [key, value] of Object.entries(colors.cinematic.glow)) {
        if (key.startsWith('_')) continue;
        lines.push(`  --color-cinematic-glow-${key}: ${value};`);
      }
    }
    // Ferni-specific cinematic variants
    lines.push(`  --color-ferni-cinematic-black: #0a0908;`);
    lines.push(`  --color-ferni-cinematic-dark: #141210;`);
    lines.push(`  --color-ferni-cinematic-deep: #1a1613;`);
    lines.push(`  --color-ferni-cinematic-surface: #1f1a16;`);
    lines.push(`  --color-ferni-cinematic-elevated: #2a2420;`);
    lines.push(`  --color-ferni-cinematic-text: #ffffff;`);
    lines.push(`  --color-ferni-cinematic-text-secondary: rgba(255, 255, 255, 0.9);`);
    lines.push(`  --color-ferni-cinematic-text-muted: rgba(255, 255, 255, 0.7);`);
    lines.push(`  --color-ferni-cinematic-text-accent: #e8c870;`);
    lines.push(`  --color-ferni-overlay-vignette: radial-gradient(ellipse at center, transparent 40%, rgba(10, 9, 8, 0.4) 100%);`);
    lines.push('');
  }

  // Comparison colors (for before/after, good/bad features)
  if (colors.comparison) {
    lines.push('  /* ============================================');
    lines.push('     COLORS - Comparison');
    lines.push('     Before/After, Good/Bad features');
    lines.push('     ============================================ */');
    for (const [compType, compData] of Object.entries(colors.comparison)) {
      if (compType.startsWith('_')) continue;
      for (const [key, value] of Object.entries(compData)) {
        if (key.startsWith('_')) continue;
        lines.push(`  --color-comparison-${compType}-${key}: ${value};`);
      }
    }
    // Shorthand alias
    lines.push(`  --color-comparison-bad: ${colors.comparison.bad?.background || 'rgba(181, 69, 58, 0.06)'};`);
    lines.push('');
  }

  // Extended natural palette additions
  lines.push('  /* ============================================');
  lines.push('     COLORS - Extended Natural Palette');
  lines.push('     ============================================ */');
  lines.push(`  --color-sand-dark: #cec5ba;`);
  lines.push(`  --color-sand-warm: #ebe6df;`);
  lines.push(`  --color-stone-dark: #6b635a;`);
  lines.push(`  --color-paper-light: #f5f5f5;`);
  lines.push(`  --color-paper-sand: ${zen.natural.paperCream};`);
  lines.push('');

  // Legacy aliases
  lines.push('  /* ============================================');
  lines.push('     COLORS - Legacy Aliases');
  lines.push('     ============================================ */');
  lines.push(`  --color-jaggi: var(--color-nayan);`);
  lines.push(`  --color-jaggi-secondary: var(--color-jack);`);
  lines.push('');

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

/**
 * Generate dark theme (Cedar Night) tokens for developer portals
 */
function generateDarkThemeFile(colors, spacing, typography, animation) {
  const midnight = colors.themes.midnight;

  const lines = [
    '/**',
    ' * Ferni Design Tokens - Cedar Night (Dark Theme)',
    ' * For developer-facing portals',
    ' *',
    ' * 🎨 AUTO-GENERATED FROM design-system/tokens/',
    ' * Do not edit directly - run: pnpm tokens:sync',
    ` * Generated: ${new Date().toISOString()}`,
    ' */',
    '',
    ':root {',
    '  /* ========================================',
    '     COLORS - Cedar Night Theme',
    '     ======================================== */',
    '',
    '  /* Backgrounds */',
    `  --bg-primary: ${midnight.background.primary};`,
    `  --bg-secondary: ${midnight.background.secondary};`,
    `  --bg-tertiary: ${midnight.background.tertiary};`,
    `  --bg-elevated: ${midnight.background.elevated};`,
    `  --bg-glass: ${midnight.background.glass};`,
    `  --bg-overlay: ${midnight.background.overlay};`,
    '  --bg-code: #2a2420;',
    '  --bg-code-inline: rgba(230, 195, 160, 0.12);',
    '',
    '  /* Text */',
    `  --text-primary: ${midnight.text.primary};`,
    `  --text-secondary: ${midnight.text.secondary};`,
    `  --text-muted: ${midnight.text.muted};`,
    `  --text-dimmed: ${midnight.text.dimmed};`,
    `  --text-inverse: ${midnight.text.inverse};`,
    '',
    '  /* Accent - Gold */',
    `  --accent-primary: ${midnight.accent.primary};`,
    `  --accent-hover: ${midnight.accent.hover};`,
    `  --accent-pressed: ${midnight.accent.pressed};`,
    `  --accent-glow: ${midnight.accent.glow};`,
    `  --accent-subtle: ${midnight.accent.subtle};`,
    '  --accent-text: #e8c870;',
    '',
    '  /* Borders */',
    `  --border-subtle: ${midnight.border.subtle};`,
    `  --border-medium: ${midnight.border.medium};`,
    `  --border-strong: ${midnight.border.strong};`,
    '',
    '  /* Semantic */',
    `  --success: ${midnight.semantic.success};`,
    `  --success-glow: ${midnight.semantic.successGlow};`,
    `  --error: ${midnight.semantic.error};`,
    `  --error-glow: ${midnight.semantic.errorGlow};`,
    `  --warning: ${midnight.semantic.warning};`,
    `  --warning-glow: ${midnight.semantic.warningGlow};`,
    '  --info: #7da6cf;',
    '  --info-glow: rgba(125, 166, 207, 0.22);',
    '',
    '  /* Personas */',
  ];

  // Add persona colors
  for (const [personaId, persona] of Object.entries(colors.personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0];
    lines.push(`  --persona-${shortId}: ${persona.primary};`);
    lines.push(`  --persona-${shortId}-glow: ${persona.glow};`);
  }

  // Add spacing, typography, animation
  lines.push('');
  lines.push(...generateSpacingVars(spacing));
  lines.push(...generateTypographyVars(typography));
  lines.push(...generateAnimationVars(animation));

  // Add layout
  lines.push('  /* ========================================');
  lines.push('     LAYOUT');
  lines.push('     ======================================== */');
  lines.push('  --container-max: 1280px;');
  lines.push('  --container-narrow: 768px;');
  lines.push('  --sidebar-width: 280px;');
  lines.push('  --header-height: 64px;');

  lines.push('}');
  return lines.join('\n');
}

function build() {
  console.log('🎨 Syncing design tokens to all portals...\n');

  // Load source tokens
  const colors = loadJson(CONFIG.sourceColors);
  const spacing = loadJson(CONFIG.sourceSpacing);
  const typography = loadJson(CONFIG.sourceTypography);
  const animation = loadJson(CONFIG.sourceAnimation);

  // Generate light theme CSS (Zen Garden) for consumer sites
  const lightThemeOutput = [
    '/**',
    ' * Ferni Design Tokens',
    ' * CSS Custom Properties implementing brand guidelines',
    ' *',
    ' * 🎨 AUTO-GENERATED FROM design-system/tokens/',
    ' * Do not edit directly - run: pnpm tokens:sync',
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

  // Generate dark theme CSS (Cedar Night) for developer sites
  const darkThemeContent = generateDarkThemeFile(colors, spacing, typography, animation);

  // Helper to write file
  function writeOutput(outputFile, content) {
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputFile, content);
    console.log(`  ✅ Generated: ${outputFile}`);
  }

  console.log('📝 Light theme (Zen Garden):');
  const lightContent = lightThemeOutput.join('\n');
  for (const outputFile of CONFIG.lightThemeOutputs) {
    writeOutput(outputFile, lightContent);
  }

  console.log('\n📝 Dark theme (Cedar Night):');
  for (const outputFile of CONFIG.darkThemeOutputs) {
    writeOutput(outputFile, darkThemeContent);
  }

  // Marketplace keeps its own tokens for now (has extra persona colors)
  console.log('\n📝 Marketplace (custom - not auto-generated):');
  console.log('  ℹ️  Marketplace tokens have custom persona colors');
  console.log('     Edit manually: apps/website/marketplace-portal/src/css/tokens.css');

  console.log('\n✅ All token files synced!\n');
}

build();

