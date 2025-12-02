#!/usr/bin/env node
/**
 * Design System Token Builder
 *
 * Generates CSS custom properties from JSON design tokens.
 * Supports multiple themes with runtime switching.
 *
 * Usage:
 *   node design-system/build.js
 *   npm run build:tokens
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load token files
const colors = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/colors.json'), 'utf8'));
const typography = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/typography.json'), 'utf8'));
const spacing = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/spacing.json'), 'utf8'));
const animation = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/animation.json'), 'utf8'));

// ============================================================================
// CSS GENERATION HELPERS
// ============================================================================

function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}-${camelToKebab(key)}` : camelToKebab(key);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function generateCSSVariables(tokens, prefix = '') {
  const lines = [];
  for (const [key, value] of Object.entries(tokens)) {
    const varName = prefix ? `--${prefix}-${key}` : `--${key}`;
    lines.push(`  ${varName}: ${value};`);
  }
  return lines.join('\n');
}

// ============================================================================
// THEME CSS GENERATION
// ============================================================================

function generateThemeCSS(themeName, theme) {
  const { meta, ...colorGroups } = theme;
  const flattened = flattenObject(colorGroups, 'color');

  return `
/* Theme: ${meta.name} */
/* ${meta.description} */
[data-theme="${themeName}"] {
  color-scheme: ${meta.mode};
${generateCSSVariables(flattened)}
}
`.trim();
}

function generatePersonaCSS(personas) {
  const lines = [];
  for (const [personaId, colors] of Object.entries(personas)) {
    const kebabId = camelToKebab(personaId);
    lines.push(`
/* Persona: ${personaId} */
[data-persona="${kebabId}"] {
  --persona-primary: ${colors.primary};
  --persona-secondary: ${colors.secondary};
  --persona-glow: ${colors.glow};
  --persona-tint: ${colors.tint};
}`);
  }
  return lines.join('\n');
}

// ============================================================================
// TYPOGRAPHY CSS GENERATION
// ============================================================================

function generateTypographyCSS(typography) {
  const lines = [];

  // Font families
  lines.push('/* Font Families */');
  lines.push(':root {');
  for (const [key, value] of Object.entries(typography.fontFamilies)) {
    if (typeof value === 'object') {
      // Theme-specific fonts - use midnight as default
      lines.push(`  --font-${camelToKebab(key)}: ${value.midnight};`);
    } else {
      lines.push(`  --font-${camelToKebab(key)}: ${value};`);
    }
  }

  // Font weights
  lines.push('');
  lines.push('  /* Font Weights */');
  for (const [key, value] of Object.entries(typography.fontWeights)) {
    lines.push(`  --font-weight-${camelToKebab(key)}: ${value};`);
  }

  // Font sizes
  lines.push('');
  lines.push('  /* Font Sizes */');
  for (const [key, value] of Object.entries(typography.fontSizes)) {
    lines.push(`  --text-${key}: ${value};`);
  }

  // Line heights
  lines.push('');
  lines.push('  /* Line Heights */');
  for (const [key, value] of Object.entries(typography.lineHeights)) {
    lines.push(`  --leading-${camelToKebab(key)}: ${value};`);
  }

  // Letter spacing
  lines.push('');
  lines.push('  /* Letter Spacing */');
  for (const [key, value] of Object.entries(typography.letterSpacing)) {
    lines.push(`  --tracking-${camelToKebab(key)}: ${value};`);
  }

  lines.push('}');

  // Theme-specific font overrides
  lines.push('');
  lines.push('/* Theme-specific fonts */');
  lines.push('[data-theme="zen"] {');
  for (const [key, value] of Object.entries(typography.fontFamilies)) {
    if (typeof value === 'object' && value.zen) {
      lines.push(`  --font-${camelToKebab(key)}: ${value.zen};`);
    }
  }
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// SPACING CSS GENERATION
// ============================================================================

function generateSpacingCSS(spacing) {
  const lines = [];

  lines.push(':root {');

  // Spacing scale
  lines.push('  /* Spacing Scale */');
  for (const [key, value] of Object.entries(spacing.spacing)) {
    lines.push(`  --space-${key.replace('.', '_')}: ${value};`);
  }

  // Semantic spacing
  lines.push('');
  lines.push('  /* Semantic Spacing */');
  for (const [key, value] of Object.entries(spacing.semanticSpacing)) {
    lines.push(`  --spacing-${key}: ${value};`);
  }

  // Border radius
  lines.push('');
  lines.push('  /* Border Radius */');
  for (const [key, value] of Object.entries(spacing.borderRadius)) {
    lines.push(`  --radius-${key}: ${value};`);
  }

  // Z-index
  lines.push('');
  lines.push('  /* Z-Index Scale */');
  for (const [key, value] of Object.entries(spacing.zIndex)) {
    lines.push(`  --z-${camelToKebab(key)}: ${value};`);
  }

  // Breakpoints (as custom properties for JS access)
  lines.push('');
  lines.push('  /* Breakpoints */');
  for (const [key, value] of Object.entries(spacing.breakpoints)) {
    lines.push(`  --breakpoint-${key}: ${value};`);
  }

  // Container sizes
  lines.push('');
  lines.push('  /* Container Sizes */');
  for (const [key, value] of Object.entries(spacing.containers)) {
    lines.push(`  --container-${key}: ${value};`);
  }

  lines.push('}');

  // Theme-specific shadows
  lines.push('');
  lines.push('/* Shadows - Midnight Theme */');
  lines.push('[data-theme="midnight"] {');
  for (const [key, value] of Object.entries(spacing.shadows.midnight)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  lines.push('}');

  lines.push('');
  lines.push('/* Shadows - Zen Theme */');
  lines.push('[data-theme="zen"] {');
  for (const [key, value] of Object.entries(spacing.shadows.zen)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// ANIMATION CSS GENERATION
// ============================================================================

function generateAnimationCSS(animation) {
  const lines = [];

  lines.push(':root {');

  // Easings
  lines.push('  /* Easing Functions */');
  for (const [key, value] of Object.entries(animation.easings)) {
    lines.push(`  --ease-${camelToKebab(key)}: ${value};`);
  }

  // Durations
  lines.push('');
  lines.push('  /* Durations */');
  for (const [key, value] of Object.entries(animation.durations)) {
    lines.push(`  --duration-${camelToKebab(key)}: ${value};`);
  }

  // Transitions
  lines.push('');
  lines.push('  /* Transitions */');
  for (const [key, value] of Object.entries(animation.transitions)) {
    lines.push(`  --transition-${camelToKebab(key)}: ${value};`);
  }

  lines.push('}');

  // Keyframes
  lines.push('');
  lines.push('/* Keyframe Animations */');
  for (const [name, frames] of Object.entries(animation.keyframes)) {
    lines.push(`@keyframes ${name} {`);
    for (const [frame, properties] of Object.entries(frames)) {
      const props = Object.entries(properties)
        .map(([prop, val]) => `${camelToKebab(prop)}: ${val}`)
        .join('; ');
      lines.push(`  ${frame} { ${props}; }`);
    }
    lines.push('}');
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILD
// ============================================================================

function build() {
  console.log('🎨 Building design system...\n');

  const output = [];

  // Header
  output.push(`/**
 * VoiceAI Design System
 *
 * Auto-generated from design tokens.
 * DO NOT EDIT DIRECTLY - modify tokens/*.json and rebuild.
 *
 * Build: ${new Date().toISOString()}
 */
`);

  // Default theme (midnight)
  output.push('/* ========================================');
  output.push('   DEFAULT THEME (Midnight)');
  output.push('   ======================================== */');
  output.push(':root {');
  const { meta, ...defaultColors } = colors.themes.midnight;
  const flatDefault = flattenObject(defaultColors, 'color');
  output.push(generateCSSVariables(flatDefault));
  output.push('  color-scheme: dark;');
  output.push('}');
  output.push('');

  // All themes
  output.push('/* ========================================');
  output.push('   THEME VARIANTS');
  output.push('   ======================================== */');
  for (const [themeName, theme] of Object.entries(colors.themes)) {
    output.push(generateThemeCSS(themeName, theme));
    output.push('');
  }

  // Persona colors
  output.push('/* ========================================');
  output.push('   PERSONA THEMES');
  output.push('   ======================================== */');
  output.push(generatePersonaCSS(colors.personas));
  output.push('');

  // Typography
  output.push('/* ========================================');
  output.push('   TYPOGRAPHY');
  output.push('   ======================================== */');
  output.push(generateTypographyCSS(typography));
  output.push('');

  // Spacing
  output.push('/* ========================================');
  output.push('   SPACING & LAYOUT');
  output.push('   ======================================== */');
  output.push(generateSpacingCSS(spacing));
  output.push('');

  // Animation
  output.push('/* ========================================');
  output.push('   ANIMATION');
  output.push('   ======================================== */');
  output.push(generateAnimationCSS(animation));

  // Write output
  const outputDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'tokens.css');
  fs.writeFileSync(outputPath, output.join('\n'));
  console.log(`✅ Generated: ${outputPath}`);

  // Also generate TypeScript types
  generateTypeScript();

  console.log('\n🎉 Design system built successfully!');
  console.log('\nUsage:');
  console.log('  1. Import CSS: <link rel="stylesheet" href="design-system/dist/tokens.css">');
  console.log('  2. Set theme: <html data-theme="zen">');
  console.log('  3. Set persona: <body data-persona="ferni">');
}

// ============================================================================
// TYPESCRIPT GENERATION
// ============================================================================

function generateTypeScript() {
  const themeNames = Object.keys(colors.themes);
  const personaIds = Object.keys(colors.personas);

  const ts = `/**
 * VoiceAI Design System Types
 *
 * Auto-generated from design tokens.
 * DO NOT EDIT DIRECTLY.
 */

export type ThemeName = ${themeNames.map(t => `'${t}'`).join(' | ')};
export type PersonaId = ${personaIds.map(p => `'${p}'`).join(' | ')};

export interface ThemeMeta {
  name: string;
  description: string;
  mode: 'light' | 'dark';
}

export const THEMES: Record<ThemeName, ThemeMeta> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(colors.themes).map(([k, v]) => [k, v.meta])
    ),
    null,
    2
  )};

export const PERSONA_IDS: PersonaId[] = ${JSON.stringify(personaIds)};

/**
 * Set the active theme
 */
export function setTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('voiceai-theme', theme);
}

/**
 * Get the current theme
 */
export function getTheme(): ThemeName {
  return (document.documentElement.getAttribute('data-theme') as ThemeName) || 'midnight';
}

/**
 * Set the active persona (for persona-specific colors)
 */
export function setPersona(persona: PersonaId): void {
  document.body.setAttribute('data-persona', persona);
}

/**
 * Initialize theme from localStorage or system preference
 */
export function initTheme(): ThemeName {
  const stored = localStorage.getItem('voiceai-theme') as ThemeName | null;
  if (stored && THEMES[stored]) {
    setTheme(stored);
    return stored;
  }

  // Check system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme: ThemeName = prefersDark ? 'midnight' : 'zen';
  setTheme(theme);
  return theme;
}
`;

  const tsPath = path.join(__dirname, 'dist/tokens.ts');
  fs.writeFileSync(tsPath, ts);
  console.log(`✅ Generated: ${tsPath}`);
}

// ============================================================================
// TAILWIND CONFIG GENERATION
// ============================================================================

function generateTailwindConfig() {
  const config = {
    theme: {
      extend: {
        colors: {
          // Map to CSS variables for theme switching
          background: {
            primary: 'var(--color-background-primary)',
            secondary: 'var(--color-background-secondary)',
            tertiary: 'var(--color-background-tertiary)',
            elevated: 'var(--color-background-elevated)',
            glass: 'var(--color-background-glass)',
            overlay: 'var(--color-background-overlay)',
          },
          text: {
            primary: 'var(--color-text-primary)',
            secondary: 'var(--color-text-secondary)',
            muted: 'var(--color-text-muted)',
            dimmed: 'var(--color-text-dimmed)',
            inverse: 'var(--color-text-inverse)',
          },
          border: {
            subtle: 'var(--color-border-subtle)',
            medium: 'var(--color-border-medium)',
            strong: 'var(--color-border-strong)',
          },
          accent: {
            DEFAULT: 'var(--color-accent-primary)',
            hover: 'var(--color-accent-hover)',
            pressed: 'var(--color-accent-pressed)',
            glow: 'var(--color-accent-glow)',
            subtle: 'var(--color-accent-subtle)',
          },
          success: {
            DEFAULT: 'var(--color-semantic-success)',
            glow: 'var(--color-semantic-success-glow)',
          },
          error: {
            DEFAULT: 'var(--color-semantic-error)',
            glow: 'var(--color-semantic-error-glow)',
          },
          warning: {
            DEFAULT: 'var(--color-semantic-warning)',
            glow: 'var(--color-semantic-warning-glow)',
          },
          info: {
            DEFAULT: 'var(--color-semantic-info)',
            glow: 'var(--color-semantic-info-glow)',
          },
          // Persona colors
          persona: {
            primary: 'var(--persona-primary)',
            secondary: 'var(--persona-secondary)',
            glow: 'var(--persona-glow)',
            tint: 'var(--persona-tint)',
          },
          // Zen natural colors
          natural: {
            wood: 'var(--color-natural-wood)',
            'wood-light': 'var(--color-natural-wood-light)',
            bamboo: 'var(--color-natural-bamboo)',
            stone: 'var(--color-natural-stone)',
            sand: 'var(--color-natural-sand)',
            moss: 'var(--color-natural-moss)',
          },
        },
        fontFamily: {
          display: 'var(--font-display)',
          body: 'var(--font-body)',
          mono: 'var(--font-mono)',
        },
        fontSize: Object.fromEntries(
          Object.entries(typography.fontSizes).map(([key, value]) => [key, value])
        ),
        fontWeight: typography.fontWeights,
        lineHeight: Object.fromEntries(
          Object.entries(typography.lineHeights).map(([key, value]) => [camelToKebab(key), String(value)])
        ),
        letterSpacing: Object.fromEntries(
          Object.entries(typography.letterSpacing).map(([key, value]) => [camelToKebab(key), value])
        ),
        spacing: Object.fromEntries(
          Object.entries(spacing.spacing).map(([key, value]) => [key.replace('.', '_'), value])
        ),
        borderRadius: Object.fromEntries(
          Object.entries(spacing.borderRadius).map(([key, value]) => [key, value])
        ),
        boxShadow: {
          xs: 'var(--shadow-xs)',
          sm: 'var(--shadow-sm)',
          md: 'var(--shadow-md)',
          lg: 'var(--shadow-lg)',
          xl: 'var(--shadow-xl)',
          '2xl': 'var(--shadow-2xl)',
          glow: 'var(--shadow-glow)',
          inner: 'var(--shadow-inner)',
        },
        zIndex: spacing.zIndex,
        transitionTimingFunction: Object.fromEntries(
          Object.entries(animation.easings).map(([key, value]) => [camelToKebab(key), value])
        ),
        transitionDuration: Object.fromEntries(
          Object.entries(animation.durations).map(([key, value]) => [camelToKebab(key), value])
        ),
        animation: Object.fromEntries(
          Object.entries(animation.animations).map(([key, value]) => [camelToKebab(key), value])
        ),
        keyframes: animation.keyframes,
        screens: spacing.breakpoints,
      },
    },
  };

  const configStr = `/** @type {import('tailwindcss').Config} */
// Auto-generated from design tokens - DO NOT EDIT DIRECTLY
// Rebuild with: npm run build:tokens

export default ${JSON.stringify(config, null, 2)};
`;

  const configPath = path.join(__dirname, 'dist/tailwind.config.js');
  fs.writeFileSync(configPath, configStr);
  console.log(`✅ Generated: ${configPath}`);
}

// ============================================================================
// ACCESSIBILITY VALIDATION
// ============================================================================

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return null;

  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function validateAccessibility() {
  console.log('\n🔍 Validating accessibility...\n');

  const results = [];
  let hasErrors = false;

  // Define contrast pairs to check for each theme
  const themePairs = {
    midnight: [
      { text: colors.themes.midnight.text.primary, bg: colors.themes.midnight.background.primary, label: 'Primary text on background', level: 'AA' },
      { text: colors.themes.midnight.text.secondary, bg: colors.themes.midnight.background.primary, label: 'Secondary text on background', level: 'AA' },
      { text: colors.themes.midnight.text.inverse, bg: colors.themes.midnight.accent.primary, label: 'Inverse text on accent', level: 'AA' },
    ],
    zen: [
      { text: colors.themes.zen.text.primary, bg: colors.themes.zen.background.primary, label: 'Primary text on background', level: 'AA' },
      { text: colors.themes.zen.text.secondary, bg: colors.themes.zen.background.primary, label: 'Secondary text on background', level: 'AA' },
      { text: colors.themes.zen.text.inverse, bg: colors.themes.zen.accent.primary, label: 'Inverse text on accent', level: 'AA' },
    ]
  };

  const WCAG_AA = 4.5;
  const WCAG_AAA = 7;

  Object.entries(themePairs).forEach(([themeName, pairs]) => {
    console.log(`  ${themeName.toUpperCase()} theme:`);

    pairs.forEach(pair => {
      const ratio = getContrastRatio(pair.text, pair.bg);
      if (ratio) {
        const pass = ratio >= WCAG_AA;
        const level = ratio >= WCAG_AAA ? 'AAA' : (ratio >= WCAG_AA ? 'AA' : 'FAIL');
        const icon = pass ? '✅' : '❌';

        console.log(`    ${icon} ${pair.label}: ${ratio.toFixed(2)}:1 (${level})`);

        if (!pass) {
          hasErrors = true;
          results.push({
            theme: themeName,
            pair: pair.label,
            ratio: ratio.toFixed(2),
            required: WCAG_AA
          });
        }
      }
    });

    console.log('');
  });

  if (hasErrors) {
    console.log('⚠️  Some color combinations do not meet WCAG AA standards.\n');
  } else {
    console.log('✅ All color combinations meet WCAG AA standards.\n');
  }

  return { passed: !hasErrors, results };
}

// Run build
build();
generateTailwindConfig();
validateAccessibility();
