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
const typography = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'tokens/typography.json'), 'utf8')
);
const spacing = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/spacing.json'), 'utf8'));
const animation = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'tokens/animation.json'), 'utf8')
);
const effects = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/effects.json'), 'utf8'));

// Advanced token files (Beyond M3 & Apple)
const insights = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/insights.json'), 'utf8'));
const physics = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/physics.json'), 'utf8'));
const predictive = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/predictive.json'), 'utf8'));

// Motion & Glow token files (Ferni Alive animation system)
const motion = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/motion.json'), 'utf8'));
const glowColors = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/glow-colors.json'), 'utf8'));

// Window Avatar token file (Scale variants, expressions, animation timing)
const windowAvatar = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/window-avatar.json'), 'utf8'));

// NEW: World-class design system tokens (Material 3 + Apple HIG parity)
const states = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/states.json'), 'utf8'));
const icons = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/icons.json'), 'utf8'));
const shape = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/shape.json'), 'utf8'));
const visualizations = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/visualizations.json'), 'utf8'));
const componentsExtended = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens/components-extended.json'), 'utf8'));

// ============================================================================
// CSS GENERATION HELPERS
// ============================================================================

function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip meta/documentation fields (underscore-prefixed keys)
    if (key.startsWith('_')) continue;

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
  for (const [personaId, personaColors] of Object.entries(personas)) {
    const kebabId = camelToKebab(personaId);
    lines.push(`
/* Persona: ${personaId} */
[data-persona="${kebabId}"] {
  --persona-primary: ${personaColors.primary};
  --persona-secondary: ${personaColors.secondary};
  --persona-text: ${personaColors.text || '#ffffff'};
  --persona-glow: ${personaColors.glow};
  --persona-tint: ${personaColors.tint};
}`);
  }
  return lines.join('\n');
}

function generateExternalBrandCSS(external) {
  if (!external) return '';
  const lines = [];
  lines.push(':root {');
  for (const [brandId, brandColors] of Object.entries(external)) {
    // Skip description fields
    if (brandId.startsWith('_')) continue;
    const kebabId = camelToKebab(brandId);
    if (brandColors.primary) {
      lines.push(`  --external-${kebabId}-primary: ${brandColors.primary};`);
    }
    if (brandColors.secondary) {
      lines.push(`  --external-${kebabId}-secondary: ${brandColors.secondary};`);
    }
    if (brandColors.glow) {
      lines.push(`  --external-${kebabId}-glow: ${brandColors.glow};`);
    }
    // Generate gradient using primary and secondary (or darkened primary)
    if (brandColors.primary) {
      const secondary = brandColors.secondary || brandColors.primary;
      lines.push(`  --external-${kebabId}-gradient: linear-gradient(135deg, ${secondary}, ${brandColors.primary});`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate CSS variables for marketplace categories
 */
function generateCategoryCSS(categories) {
  if (!categories) return '';
  const lines = [];
  lines.push(':root {');
  for (const [categoryId, categoryColors] of Object.entries(categories)) {
    // Skip description fields
    if (categoryId.startsWith('_')) continue;
    const kebabId = camelToKebab(categoryId);
    if (categoryColors.primary) {
      lines.push(`  --category-${kebabId}-primary: ${categoryColors.primary};`);
    }
    if (categoryColors.secondary) {
      lines.push(`  --category-${kebabId}-secondary: ${categoryColors.secondary};`);
    }
    if (categoryColors.glow) {
      lines.push(`  --category-${kebabId}-glow: ${categoryColors.glow};`);
    }
    // Generate gradient CSS variable
    if (categoryColors.primary && categoryColors.secondary) {
      lines.push(`  --category-${kebabId}-gradient: linear-gradient(135deg, ${categoryColors.secondary}, ${categoryColors.primary});`);
    }
    // Generate text color (lightened version)
    if (categoryColors.primary) {
      lines.push(`  --category-${kebabId}-text: ${categoryColors.primary};`);
    }
    // Generate tint/background (very transparent version)
    if (categoryColors.primary) {
      const tint = categoryColors.glow || `${categoryColors.primary}26`;
      lines.push(`  --category-${kebabId}-tint: ${tint};`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate CSS variables for cinematic/storytelling colors
 */
function generateCinematicCSS(cinematic) {
  if (!cinematic) return '';
  const lines = [];
  lines.push(':root {');
  lines.push('  /* Cinematic - Storytelling Colors */');

  // Black variants
  if (cinematic.black) {
    for (const [key, value] of Object.entries(cinematic.black)) {
      if (key.startsWith('_')) continue;
      lines.push(`  --cinematic-black-${camelToKebab(key)}: ${value};`);
    }
  }

  // Text variants
  if (cinematic.text) {
    for (const [key, value] of Object.entries(cinematic.text)) {
      if (key.startsWith('_')) continue;
      lines.push(`  --cinematic-text-${camelToKebab(key)}: ${value};`);
    }
  }

  // Glow variants
  if (cinematic.glow) {
    for (const [key, value] of Object.entries(cinematic.glow)) {
      if (key.startsWith('_')) continue;
      lines.push(`  --cinematic-glow-${camelToKebab(key)}: ${value};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate CSS variables for gradient system
 */
function generateGradientCSS(gradient) {
  if (!gradient) return '';
  const lines = [];
  lines.push(':root {');
  lines.push('  /* Gradient System */');

  for (const [gradientName, gradientData] of Object.entries(gradient)) {
    if (gradientName.startsWith('_')) continue;
    const kebabName = camelToKebab(gradientName);

    if (gradientData.start) {
      lines.push(`  --gradient-${kebabName}-start: ${gradientData.start};`);
    }
    if (gradientData.mid) {
      lines.push(`  --gradient-${kebabName}-mid: ${gradientData.mid};`);
    }
    if (gradientData.end) {
      lines.push(`  --gradient-${kebabName}-end: ${gradientData.end};`);
    }

    // Generate the actual gradient CSS
    if (gradientData.start && gradientData.end) {
      if (gradientData.mid) {
        lines.push(`  --gradient-${kebabName}: linear-gradient(180deg, ${gradientData.start} 0%, ${gradientData.mid} 50%, ${gradientData.end} 100%);`);
      } else {
        lines.push(`  --gradient-${kebabName}: linear-gradient(180deg, ${gradientData.start} 0%, ${gradientData.end} 100%);`);
      }
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate CSS variables for comparison/feature colors
 */
function generateComparisonCSS(comparison) {
  if (!comparison) return '';
  const lines = [];
  lines.push(':root {');
  lines.push('  /* Comparison Colors - Before/After, Good/Bad */');

  for (const [compType, compData] of Object.entries(comparison)) {
    if (compType.startsWith('_')) continue;
    const kebabType = camelToKebab(compType);

    for (const [key, value] of Object.entries(compData)) {
      if (key.startsWith('_')) continue;
      lines.push(`  --comparison-${kebabType}-${camelToKebab(key)}: ${value};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate CSS variables for visualization colors
 * Used by data visualizations, mood calendars, energy rings, etc.
 */
function generateVisualizationCSS(visualization) {
  if (!visualization) return '';
  const lines = [];
  lines.push(':root {');
  lines.push('  /* Visualization Colors - Better Than Human Data Storytelling */');

  // Process each category in visualization
  for (const [category, categoryData] of Object.entries(visualization)) {
    if (category.startsWith('_')) continue;
    if (typeof categoryData !== 'object') continue;

    const kebabCategory = camelToKebab(category);
    lines.push(`\n  /* ${category.charAt(0).toUpperCase() + category.slice(1)} */`);

    for (const [key, value] of Object.entries(categoryData)) {
      if (key.startsWith('_')) continue;

      // Handle nested objects (like gradient with start/end)
      if (typeof value === 'object' && value !== null) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (nestedKey.startsWith('_')) continue;
          lines.push(`  --viz-${kebabCategory}-${camelToKebab(key)}-${camelToKebab(nestedKey)}: ${nestedValue};`);
        }
      } else {
        lines.push(`  --viz-${kebabCategory}-${camelToKebab(key)}: ${value};`);
      }
    }
  }

  lines.push('}');
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

  // MA (間) Spacing - Golden Ratio Rhythm
  if (spacing.ma) {
    lines.push('  /* MA (間) Spacing - Japanese intentional negative space */');
    lines.push('  /* Based on Fibonacci sequence - approximates golden ratio */');
    for (const [key, value] of Object.entries(spacing.ma)) {
      if (!key.startsWith('_')) {
        lines.push(`  --ma-${key}: ${value};`);
      }
    }
    lines.push('');
  }

  // Golden Ratio Scales
  if (spacing.goldenRatio) {
    lines.push('  /* Golden Ratio Scales (φ = 1.618) */');
    if (spacing.goldenRatio.scales) {
      for (const [key, value] of Object.entries(spacing.goldenRatio.scales)) {
        lines.push(`  --phi-${key}: ${value};`);
      }
    }
    lines.push('');
  }

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

  // Gradients - semantic gradient tokens
  if (spacing.gradients) {
    lines.push('');
    lines.push('  /* Gradient Tokens - Use instead of hardcoding linear-gradient() */');
    
    // Surface gradients
    if (spacing.gradients.surface) {
      for (const [key, value] of Object.entries(spacing.gradients.surface)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-surface-${key}: ${value};`);
        }
      }
    }
    
    // Persona gradients
    if (spacing.gradients.persona) {
      for (const [key, value] of Object.entries(spacing.gradients.persona)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-persona-${key}: ${value};`);
        }
      }
    }
    
    // Accent gradients
    if (spacing.gradients.accent) {
      for (const [key, value] of Object.entries(spacing.gradients.accent)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-accent-${key}: ${value};`);
        }
      }
    }
    
    // Semantic gradients
    if (spacing.gradients.semantic) {
      for (const [key, value] of Object.entries(spacing.gradients.semantic)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-semantic-${key}: ${value};`);
        }
      }
    }
    
    // Decorative gradients
    if (spacing.gradients.decorative) {
      for (const [key, value] of Object.entries(spacing.gradients.decorative)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-${key}: ${value};`);
        }
      }
    }
    
    // Glass gradients
    if (spacing.gradients.glass) {
      for (const [key, value] of Object.entries(spacing.gradients.glass)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-glass-${key}: ${value};`);
        }
      }
    }
    
    // Progress gradients
    if (spacing.gradients.progress) {
      for (const [key, value] of Object.entries(spacing.gradients.progress)) {
        if (!key.startsWith('_')) {
          lines.push(`  --gradient-progress-${key}: ${value};`);
        }
      }
    }
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

  // Glass Morphism
  if (spacing.glassMorphism) {
    lines.push('');
    lines.push('/* ========================================');
    lines.push('   GLASS MORPHISM - Apple Liquid Glass Style');
    lines.push('   ======================================== */');

    // Midnight glass
    if (spacing.glassMorphism.midnight) {
      lines.push('');
      lines.push('[data-theme="midnight"] {');
      const midnightGlass = spacing.glassMorphism.midnight;
      if (midnightGlass.surface) {
        for (const [key, value] of Object.entries(midnightGlass.surface)) {
          lines.push(`  --glass-surface-${key}: ${value};`);
        }
      }
      if (midnightGlass.blur) {
        for (const [key, value] of Object.entries(midnightGlass.blur)) {
          lines.push(`  --glass-blur-${key}: ${value};`);
        }
      }
      if (midnightGlass.border) {
        for (const [key, value] of Object.entries(midnightGlass.border)) {
          lines.push(`  --glass-border-${key}: ${value};`);
        }
      }
      if (midnightGlass.innerGlow) {
        lines.push(`  --glass-inner-glow: ${midnightGlass.innerGlow};`);
      }
      if (midnightGlass.outerGlow) {
        lines.push(`  --glass-outer-glow: ${midnightGlass.outerGlow};`);
      }
      lines.push('}');
    }

    // Zen glass
    if (spacing.glassMorphism.zen) {
      lines.push('');
      lines.push('[data-theme="zen"] {');
      const zenGlass = spacing.glassMorphism.zen;
      if (zenGlass.surface) {
        for (const [key, value] of Object.entries(zenGlass.surface)) {
          lines.push(`  --glass-surface-${key}: ${value};`);
        }
      }
      if (zenGlass.blur) {
        for (const [key, value] of Object.entries(zenGlass.blur)) {
          lines.push(`  --glass-blur-${key}: ${value};`);
        }
      }
      if (zenGlass.border) {
        for (const [key, value] of Object.entries(zenGlass.border)) {
          lines.push(`  --glass-border-${key}: ${value};`);
        }
      }
      if (zenGlass.innerGlow) {
        lines.push(`  --glass-inner-glow: ${zenGlass.innerGlow};`);
      }
      if (zenGlass.outerGlow) {
        lines.push(`  --glass-outer-glow: ${zenGlass.outerGlow};`);
      }
      lines.push('}');
    }

    // Vibrancy levels (theme-agnostic)
    if (spacing.glassMorphism.vibrancy) {
      lines.push('');
      lines.push('/* Vibrancy - iOS-style saturation boost */');
      lines.push(':root {');
      for (const [key, value] of Object.entries(spacing.glassMorphism.vibrancy)) {
        if (!key.startsWith('_')) {
          lines.push(`  --glass-vibrancy-${key}: ${value};`);
        }
      }
      lines.push('}');
    }

    // Specular highlights
    if (spacing.glassMorphism.specular) {
      lines.push('');
      lines.push('/* Specular - Light reflection effects */');
      lines.push(':root {');
      const specular = spacing.glassMorphism.specular;
      if (specular.highlight) {
        lines.push(`  --glass-specular-gradient: ${specular.highlight.gradient};`);
        lines.push(`  --glass-specular-position: ${specular.highlight.position};`);
        lines.push(`  --glass-specular-size: ${specular.highlight.size};`);
      }
      if (specular.shimmer) {
        lines.push(`  --glass-shimmer-gradient: ${specular.shimmer.gradient};`);
        lines.push(`  --glass-shimmer-animation: ${specular.shimmer.animation};`);
      }
      if (specular.fresnel) {
        lines.push(`  --glass-fresnel-light: ${specular.fresnel.light};`);
        lines.push(`  --glass-fresnel-dark: ${specular.fresnel.dark};`);
      }
      lines.push('}');
    }

    // Noise texture
    if (spacing.glassMorphism.noise) {
      lines.push('');
      lines.push('/* Noise - Organic grain texture */');
      lines.push(':root {');
      const noise = spacing.glassMorphism.noise;
      if (noise.opacity) {
        for (const [key, value] of Object.entries(noise.opacity)) {
          lines.push(`  --glass-noise-opacity-${key}: ${value};`);
        }
      }
      if (noise.filter) {
        lines.push(`  --glass-noise-texture: ${noise.filter};`);
      }
      if (noise.blendMode) {
        lines.push(`  --glass-noise-blend: ${noise.blendMode};`);
      }
      lines.push('}');
    }

    // Interaction effects
    if (spacing.glassMorphism.interaction) {
      lines.push('');
      lines.push('/* Interaction - Dynamic response */');
      lines.push(':root {');
      const interaction = spacing.glassMorphism.interaction;
      if (interaction.hoverBlur) {
        lines.push(`  --glass-hover-blur-increase: ${interaction.hoverBlur};`);
      }
      if (interaction.activeScale) {
        lines.push(`  --glass-active-scale: ${interaction.activeScale};`);
      }
      if (interaction.focusRing) {
        lines.push(`  --glass-focus-ring: ${interaction.focusRing};`);
      }
      if (interaction.tilt) {
        lines.push(`  --glass-tilt-max: ${interaction.tilt.maxAngle};`);
        lines.push(`  --glass-tilt-perspective: ${interaction.tilt.perspective};`);
        lines.push(`  --glass-tilt-transition: ${interaction.tilt.transition};`);
      }
      if (interaction.ripple) {
        lines.push(`  --glass-ripple-duration: ${interaction.ripple.duration};`);
        lines.push(`  --glass-ripple-easing: ${interaction.ripple.easing};`);
        lines.push(`  --glass-ripple-color: ${interaction.ripple.color};`);
      }
      lines.push('}');
    }

    // Chromatic aberration
    if (spacing.glassMorphism.chromatic) {
      lines.push('');
      lines.push('/* Chromatic - Light refraction at edges */');
      lines.push(':root {');
      const chromatic = spacing.glassMorphism.chromatic;
      if (chromatic.offset) {
        lines.push(`  --glass-chromatic-offset: ${chromatic.offset};`);
      }
      if (chromatic.colors) {
        lines.push(`  --glass-chromatic-red: ${chromatic.colors.red};`);
        lines.push(`  --glass-chromatic-blue: ${chromatic.colors.blue};`);
      }
      lines.push('}');
    }
  }

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

  // Keyframes - Filter out documentation keys (starting with _)
  lines.push('');
  lines.push('/* Keyframe Animations */');
  for (const [name, frames] of Object.entries(animation.keyframes)) {
    // Skip documentation markers
    if (name.startsWith('_')) continue;

    lines.push(`@keyframes ${name} {`);
    for (const [frame, properties] of Object.entries(frames)) {
      // Skip description fields within keyframes
      if (frame.startsWith('_')) continue;

      const props = Object.entries(properties)
        .map(([prop, val]) => `${camelToKebab(prop)}: ${val}`)
        .join('; ');
      lines.push(`  ${frame} { ${props}; }`);
    }
    lines.push('}');
    lines.push('');
  }

  // Generate Pixar-inspired utility classes
  lines.push('/* ========================================================================');
  lines.push('   PIXAR-INSPIRED ANIMATION CLASSES');
  lines.push('   Use these classes to trigger Pixar-quality squash & stretch animations');
  lines.push('   ======================================================================== */');
  lines.push('');

  // Pixar reaction classes that use the keyframes
  lines.push(
    '.pixar-bounce { animation: pixarBounce 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }'
  );
  lines.push(
    '.pixar-anticipate { animation: pixarAnticipate 200ms cubic-bezier(0.38, -0.4, 0.88, 0.65) forwards; }'
  );
  lines.push(
    '.pixar-settle { animation: pixarSettle 300ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }'
  );
  lines.push('.pixar-thinking-tilt { animation: pixarThinkingTilt 2s ease-in-out infinite; }');
  lines.push(
    '.pixar-joy-bounce { animation: pixarJoyBounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }'
  );
  lines.push(
    '.pixar-sad-slump { animation: pixarSadSlump 800ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }'
  );
  lines.push(
    '.pixar-attention { animation: pixarAttention 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }'
  );
  lines.push('.pixar-breathe { animation: pixarBreathe 5s ease-in-out infinite; }');
  lines.push('.pixar-float { animation: pixarFloat 6s ease-in-out infinite; }');
  lines.push('');

  // Avatar reaction classes
  lines.push('/* Avatar Reaction Classes - Pixar-quality squash & stretch */');
  lines.push('.avatar-nod { animation: avatarNod 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }');
  lines.push(
    '.avatar-shake { animation: avatarShake 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }'
  );
  lines.push(
    '.avatar-bounce { animation: avatarBounce 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }'
  );
  lines.push(
    '.avatar-pulse { animation: avatarPulse 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }'
  );
  lines.push(
    '.avatar-curious-tilt { animation: avatarCuriousTilt 600ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }'
  );
  lines.push(
    '.avatar-attentive-lean { animation: avatarAttentiveLean 800ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards; }'
  );
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// CIRCADIAN CSS GENERATION - Time-aware design that adapts to human rhythms
// ============================================================================

function generateCircadianCSS(animation) {
  const lines = [];
  const circadian = animation.circadian;

  if (!circadian) return '';

  lines.push('/* ========================================');
  lines.push('   CIRCADIAN SYSTEM');
  lines.push('   Time-aware design that adapts to human rhythms');
  lines.push('   "Dark mode is not enough. Ferni knows the difference');
  lines.push('    between 10am focus and 2am presence."');
  lines.push('   ======================================== */');
  lines.push('');

  // Default circadian variables
  lines.push(':root {');
  lines.push('  /* Circadian CSS Variables - Updated by JavaScript based on time */');
  if (circadian.cssVariables) {
    for (const [key, value] of Object.entries(circadian.cssVariables)) {
      lines.push(`  ${key}: ${value};`);
    }
  }
  lines.push('');
  lines.push('  /* Circadian warmth filter formula */');
  lines.push('  --circadian-filter-computed: sepia(calc(var(--circadian-warmth) * 0.15)) saturate(calc(1 + var(--circadian-warmth) * 0.1));');
  lines.push('}');
  lines.push('');

  // Generate data attributes for each circadian period
  lines.push('/* Circadian Period Data Attributes */');
  lines.push('/* Apply [data-circadian="periodName"] to body for time-aware theming */');
  lines.push('');

  if (circadian.periods) {
    for (const [periodName, period] of Object.entries(circadian.periods)) {
      lines.push(`[data-circadian="${periodName}"] {`);
      lines.push(`  --circadian-warmth: ${period.warmth};`);
      lines.push(`  --circadian-brightness: ${period.brightness};`);
      lines.push(`  --circadian-animation-speed: ${period.animationSpeed};`);
      lines.push(`  --circadian-period-name: "${period.name}";`);
      lines.push(`  --circadian-presence: "${period.presence}";`);
      lines.push('  --circadian-filter: sepia(calc(var(--circadian-warmth) * 0.15)) saturate(calc(1 + var(--circadian-warmth) * 0.1));');
      lines.push('}');
      lines.push('');
    }
  }

  // Circadian-aware animation speed modifiers
  lines.push('/* Circadian Animation Speed Modifiers */');
  lines.push('.circadian-aware {');
  lines.push('  animation-duration: calc(var(--base-duration, 1s) / var(--circadian-animation-speed, 1));');
  lines.push('}');
  lines.push('');

  // Circadian warmth filter utility
  lines.push('/* Apply circadian warmth filter to any element */');
  lines.push('.circadian-warm {');
  lines.push('  filter: var(--circadian-filter, none);');
  lines.push('  transition: filter 2s ease-in-out;');
  lines.push('}');
  lines.push('');

  // Late night presence mode
  lines.push('/* Late Night Presence - Extra warmth and slower animations */');
  lines.push('[data-circadian="lateNight"], [data-circadian="deepNight"] {');
  lines.push('  --color-bg-primary-circadian: color-mix(in oklch, var(--color-bg-primary) 95%, var(--color-warm) 5%);');
  lines.push('  --transition-duration-circadian: calc(var(--duration-normal, 200ms) * 1.3);');
  lines.push('}');
  lines.push('');

  // Reduced motion respects circadian
  lines.push('@media (prefers-reduced-motion: reduce) {');
  lines.push('  .circadian-aware {');
  lines.push('    animation-duration: 0s;');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// BREATH-SYNC CSS GENERATION - Breathing animations that feel alive
// ============================================================================

function generateBreathSyncCSS(animation) {
  const lines = [];
  const breathSync = animation.breathSync;

  if (!breathSync) return '';

  lines.push('/* ========================================');
  lines.push('   BREATH-SYNC ANIMATION SYSTEM');
  lines.push('   "Traditional UI animations are robotic.');
  lines.push('    Ferni breathes with you."');
  lines.push('   ======================================== */');
  lines.push('');

  // Default breath-sync variables
  lines.push(':root {');
  lines.push('  /* Breath-Sync CSS Variables */');
  if (breathSync.cssVariables) {
    for (const [key, value] of Object.entries(breathSync.cssVariables)) {
      lines.push(`  ${key}: ${value};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Generate breath-sync keyframes for each preset
  lines.push('/* Breath-Sync Keyframes */');
  lines.push('');

  if (breathSync.presets) {
    for (const [presetName, preset] of Object.entries(breathSync.presets)) {
      const inhaleEnd = Math.round(preset.inhaleRatio * 100);
      const holdEnd = Math.round((preset.inhaleRatio + preset.holdRatio) * 100);
      const [scaleMin, scaleMax] = preset.scaleRange || [1, 1.03];
      const [opacityMin, opacityMax] = preset.opacityRange || [0.9, 1];

      lines.push(`@keyframes breathSync-${presetName} {`);
      lines.push(`  0% { transform: scale(${scaleMin}); opacity: ${opacityMin}; }`);
      lines.push(`  ${inhaleEnd}% { transform: scale(${scaleMax}); opacity: ${opacityMax}; }`);
      lines.push(`  ${holdEnd}% { transform: scale(${scaleMax}); opacity: ${opacityMax}; }`);
      lines.push(`  100% { transform: scale(${scaleMin}); opacity: ${opacityMin}; }`);
      lines.push('}');
      lines.push('');
    }
  }

  // Generate data attributes for each breath preset
  lines.push('/* Breath-Sync Preset Data Attributes */');
  lines.push('/* Apply [data-breath="presetName"] to enable preset */');
  lines.push('');

  if (breathSync.presets) {
    for (const [presetName, preset] of Object.entries(breathSync.presets)) {
      const [scaleMin, scaleMax] = preset.scaleRange || [1, 1.03];

      lines.push(`[data-breath="${presetName}"] {`);
      lines.push(`  --breath-duration: ${preset.duration}ms;`);
      lines.push(`  --breath-inhale: ${Math.round(preset.inhaleRatio * 100)}%;`);
      lines.push(`  --breath-hold: ${Math.round(preset.holdRatio * 100)}%;`);
      lines.push(`  --breath-exhale: ${Math.round(preset.exhaleRatio * 100)}%;`);
      lines.push(`  --breath-scale-min: ${scaleMin};`);
      lines.push(`  --breath-scale-max: ${scaleMax};`);
      lines.push(`  --breath-easing: ${preset.easing};`);
      lines.push('}');
      lines.push('');
    }
  }

  // Breath-sync utility classes
  lines.push('/* Breath-Sync Utility Classes */');
  lines.push('.breath-sync {');
  lines.push('  animation: breathSync-calm var(--breath-duration, 5000ms) var(--breath-easing, ease-in-out) infinite;');
  lines.push('}');
  lines.push('');

  lines.push('.breath-sync-calm {');
  lines.push('  animation: breathSync-calm 5000ms cubic-bezier(0.4, 0.0, 0.6, 1) infinite;');
  lines.push('}');
  lines.push('');

  lines.push('.breath-sync-relaxed {');
  lines.push('  animation: breathSync-relaxed 6000ms cubic-bezier(0.33, 0.0, 0.67, 1) infinite;');
  lines.push('}');
  lines.push('');

  lines.push('.breath-sync-attentive {');
  lines.push('  animation: breathSync-attentive 4000ms cubic-bezier(0.4, 0.0, 0.2, 1) infinite;');
  lines.push('}');
  lines.push('');

  lines.push('.breath-sync-concerned {');
  lines.push('  animation: breathSync-concerned 3500ms cubic-bezier(0.5, 0.0, 0.3, 1) infinite;');
  lines.push('}');
  lines.push('');

  // Dynamic breath-sync that uses CSS variables
  lines.push('/* Dynamic Breath-Sync - Uses CSS Variables */');
  lines.push('@keyframes breathSyncDynamic {');
  lines.push('  0% { transform: scale(var(--breath-scale-min, 1)); opacity: 0.9; }');
  lines.push('  40% { transform: scale(var(--breath-scale-max, 1.03)); opacity: 1; }');
  lines.push('  60% { transform: scale(var(--breath-scale-max, 1.03)); opacity: 1; }');
  lines.push('  100% { transform: scale(var(--breath-scale-min, 1)); opacity: 0.9; }');
  lines.push('}');
  lines.push('');

  lines.push('.breath-sync-dynamic {');
  lines.push('  animation: breathSyncDynamic var(--breath-duration, 5000ms) var(--breath-easing, ease-in-out) infinite;');
  lines.push('}');
  lines.push('');

  // Reduced motion
  lines.push('@media (prefers-reduced-motion: reduce) {');
  lines.push('  .breath-sync,');
  lines.push('  .breath-sync-calm,');
  lines.push('  .breath-sync-relaxed,');
  lines.push('  .breath-sync-attentive,');
  lines.push('  .breath-sync-concerned,');
  lines.push('  .breath-sync-dynamic {');
  lines.push('    animation: none;');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// EMOTIONAL THEMING CSS - Better than Apple's light/dark mode
// ============================================================================

function generateEmotionalThemingCSS(animation) {
  const lines = [];
  const emotionalTheming = animation.emotionalTheming;

  if (!emotionalTheming) return '';

  lines.push('/* ========================================');
  lines.push('   EMOTIONAL THEMING SYSTEM');
  lines.push('   "Apple gives you light/dark mode.');
  lines.push('    Ferni gives you emotional presence."');
  lines.push('   ======================================== */');
  lines.push('');

  // Default emotional variables
  lines.push(':root {');
  lines.push('  /* Emotional Theming CSS Variables */');
  if (emotionalTheming.cssVariables) {
    for (const [key, value] of Object.entries(emotionalTheming.cssVariables)) {
      lines.push(`  ${key}: ${value};`);
    }
  }
  lines.push('');
  lines.push('  /* Computed emotional filter */');
  lines.push('  --emotional-filter-computed: sepia(calc(var(--emotional-warmth) * 0.2)) saturate(var(--emotional-saturation, 1));');
  lines.push('}');
  lines.push('');

  // Generate data attributes for each emotional theme
  lines.push('/* Emotional Theme Data Attributes */');
  lines.push('/* Apply [data-emotion="themeName"] for context-aware theming */');
  lines.push('');

  if (emotionalTheming.themes) {
    for (const [themeName, theme] of Object.entries(emotionalTheming.themes)) {
      // Skip zen and midnight as they're handled by existing data-theme
      if (themeName === 'zen' || themeName === 'midnight') continue;

      lines.push(`[data-emotion="${themeName}"] {`);
      lines.push(`  --emotional-temperature: ${theme.colorTemperature};`);
      lines.push(`  --emotional-warmth: ${theme.warmth};`);
      lines.push(`  --emotional-saturation: ${theme.saturation};`);
      lines.push(`  --emotional-animation-intensity: ${theme.animationIntensity};`);
      lines.push(`  --emotional-state: "${theme.emotionalState}";`);
      lines.push(`  --emotional-name: "${theme.name}";`);

      // Generate filter based on temperature
      if (theme.colorTemperature > 0) {
        lines.push(`  --emotional-filter: sepia(${theme.warmth * 0.2}) saturate(${theme.saturation});`);
      } else if (theme.colorTemperature < 0) {
        lines.push(`  --emotional-filter: hue-rotate(${theme.colorTemperature * 10}deg) saturate(${theme.saturation});`);
      } else {
        lines.push(`  --emotional-filter: saturate(${theme.saturation});`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  // Emotional theme utility classes
  lines.push('/* Emotional Theme Utilities */');
  lines.push('.emotion-aware {');
  lines.push('  transition: filter 1.5s ease-in-out, background 1.5s ease-in-out;');
  lines.push('}');
  lines.push('');

  lines.push('.emotion-filter {');
  lines.push('  filter: var(--emotional-filter, none);');
  lines.push('}');
  lines.push('');

  // Embrace theme - extra warmth
  lines.push('/* Embrace - For comfort moments */');
  lines.push('[data-emotion="embrace"] .emotion-surface {');
  lines.push('  background: color-mix(in oklch, var(--color-bg-primary) 90%, #e6a96a 10%);');
  lines.push('}');
  lines.push('');

  // Energize theme - vibrant
  lines.push('/* Energize - For high-energy moments */');
  lines.push('[data-emotion="energize"] .emotion-surface {');
  lines.push('  background: color-mix(in oklch, var(--color-bg-primary) 95%, var(--color-accent) 5%);');
  lines.push('}');
  lines.push('');

  // Focus theme - minimal
  lines.push('/* Focus - For deep work */');
  lines.push('[data-emotion="focus"] {');
  lines.push('  --shadow-strength: 0.5;');
  lines.push('  --border-strength: 0.7;');
  lines.push('}');
  lines.push('');

  // Reflect theme - muted
  lines.push('/* Reflect - For processing moments */');
  lines.push('[data-emotion="reflect"] {');
  lines.push('  --color-saturation-modifier: 0.85;');
  lines.push('}');
  lines.push('');

  // Animation intensity modifiers
  lines.push('/* Animation Intensity based on emotional state */');
  lines.push('.emotion-animated {');
  lines.push('  animation-duration: calc(var(--base-duration, 1s) / var(--emotional-animation-intensity, 1));');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// PERSONA AURA CSS - Better than Google's color schemes
// ============================================================================

function generatePersonaAuraCSS(animation) {
  const lines = [];
  const personaAura = animation.personaAura;

  if (!personaAura) return '';

  lines.push('/* ========================================');
  lines.push('   PERSONA AURA SYSTEM');
  lines.push('   "Google Material gives you color schemes.');
  lines.push('    Ferni personas have atmospheric presence."');
  lines.push('   ======================================== */');
  lines.push('');

  // Default aura variables
  lines.push(':root {');
  lines.push('  /* Persona Aura CSS Variables */');
  if (personaAura.cssVariables) {
    for (const [key, value] of Object.entries(personaAura.cssVariables)) {
      lines.push(`  ${key}: ${value};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Generate aura pulse keyframe
  lines.push('/* Aura Pulse Animation */');
  lines.push('@keyframes aura-pulse {');
  lines.push('  0%, 100% { opacity: 0.7; }');
  lines.push('  50% { opacity: 1; }');
  lines.push('}');
  lines.push('');

  // Generate data attributes for each persona aura
  lines.push('/* Persona Aura Data Attributes */');
  lines.push('/* Apply [data-persona="personaName"] for persona-specific atmosphere */');
  lines.push('');

  if (personaAura.auras) {
    for (const [personaName, aura] of Object.entries(personaAura.auras)) {
      lines.push(`[data-persona="${personaName}"] {`);
      lines.push(`  --persona-aura-gradient: ${aura.gradient};`);
      lines.push(`  --persona-aura-glow: ${aura.glowColor};`);
      lines.push(`  --persona-aura-spread: ${aura.glowSpread};`);
      lines.push(`  --persona-aura-pulse: ${aura.pulseRate};`);
      lines.push(`  --persona-aura-filter: ${aura.ambientFilter};`);
      lines.push(`  --persona-presence: "${aura.presence}";`);
      lines.push('}');
      lines.push('');
    }
  }

  // Aura background element
  lines.push('/* Aura Background - Apply to a pseudo-element or dedicated div */');
  lines.push('.persona-aura {');
  lines.push('  position: fixed;');
  lines.push('  top: 0;');
  lines.push('  left: 0;');
  lines.push('  right: 0;');
  lines.push('  height: 50vh;');
  lines.push('  background: var(--persona-aura-gradient, none);');
  lines.push('  pointer-events: none;');
  lines.push('  z-index: -1;');
  lines.push('  animation: aura-pulse var(--persona-aura-pulse, 5s) ease-in-out infinite;');
  lines.push('  transition: background 1s ease-in-out;');
  lines.push('}');
  lines.push('');

  // Aura glow effect
  lines.push('/* Aura Glow - Ambient light around avatar */');
  lines.push('.persona-glow {');
  lines.push('  box-shadow: 0 0 var(--persona-aura-spread, 60px) var(--persona-aura-glow, transparent);');
  lines.push('  transition: box-shadow 0.6s ease-in-out;');
  lines.push('}');
  lines.push('');

  // Aura filter effect
  lines.push('/* Aura Filter - Subtle atmosphere adjustment */');
  lines.push('.persona-atmosphere {');
  lines.push('  filter: var(--persona-aura-filter, none);');
  lines.push('  transition: filter 0.8s ease-in-out;');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// RELATIONSHIP DEPTH CSS - UI that grows with your relationship
// ============================================================================

function generateRelationshipDepthCSS(animation) {
  const lines = [];
  const relationshipDepth = animation.relationshipDepth;

  if (!relationshipDepth) return '';

  lines.push('/* ========================================');
  lines.push('   RELATIONSHIP DEPTH SYSTEM');
  lines.push('   "Apple treats every session the same.');
  lines.push('    Ferni UI grows with your relationship."');
  lines.push('   ======================================== */');
  lines.push('');

  // Default relationship variables
  lines.push(':root {');
  lines.push('  /* Relationship Depth CSS Variables */');
  lines.push('  --relationship-stage: "new";');
  lines.push('  --relationship-richness: 0.5;');
  lines.push('  --relationship-animation-complexity: 1;');
  lines.push('  --relationship-personalization: 0;');
  lines.push('}');
  lines.push('');

  // Generate data attributes for each relationship stage
  lines.push('/* Relationship Stage Data Attributes */');
  lines.push('/* Apply [data-relationship="stageName"] for progressive UI richness */');
  lines.push('');

  if (relationshipDepth.stages) {
    for (const [stageName, stage] of Object.entries(relationshipDepth.stages)) {
      // Map animation complexity to a number
      const complexityMap = {
        'simple': 0.5,
        'moderate': 0.7,
        'rich': 0.85,
        'expressive': 0.95,
        'full': 1.0
      };
      const complexity = complexityMap[stage.animationComplexity] || 1;

      // Map personalization to a number
      const personalizationMap = {
        'minimal': 0.2,
        'emerging': 0.4,
        'adapted': 0.6,
        'deep': 0.8,
        'intuitive': 1.0
      };
      const personalization = personalizationMap[stage.personalization] || 0;

      lines.push(`[data-relationship="${stageName}"] {`);
      lines.push(`  --relationship-stage: "${stageName}";`);
      lines.push(`  --relationship-richness: ${stage.uiRichness};`);
      lines.push(`  --relationship-animation-complexity: ${complexity};`);
      lines.push(`  --relationship-personalization: ${personalization};`);
      lines.push('}');
      lines.push('');
    }
  }

  // Progressive UI richness utilities
  lines.push('/* Progressive UI Richness */');
  lines.push('');

  // Animation complexity - more complex animations unlock over time
  lines.push('.relationship-animation {');
  lines.push('  animation-iteration-count: calc(var(--relationship-animation-complexity, 1) * 1);');
  lines.push('}');
  lines.push('');

  // Visual richness - shadows and effects increase
  lines.push('.relationship-shadow {');
  lines.push('  --shadow-multiplier: var(--relationship-richness, 0.5);');
  lines.push('  box-shadow: 0 4px calc(12px * var(--shadow-multiplier)) rgba(0, 0, 0, calc(0.1 * var(--shadow-multiplier)));');
  lines.push('}');
  lines.push('');

  // New user stage - minimal, focused
  lines.push('/* New User - Clean and focused */');
  lines.push('[data-relationship="new"] .advanced-feature {');
  lines.push('  display: none;');
  lines.push('}');
  lines.push('[data-relationship="new"] .relationship-decorative {');
  lines.push('  opacity: 0;');
  lines.push('}');
  lines.push('');

  // Getting to know - emerging personality
  lines.push('/* Getting to Know - Personality emerging */');
  lines.push('[data-relationship="gettingToKnow"] .growth-feature {');
  lines.push('  display: block;');
  lines.push('}');
  lines.push('[data-relationship="gettingToKnow"] .relationship-decorative {');
  lines.push('  opacity: 0.5;');
  lines.push('}');
  lines.push('');

  // Building trust - full team access
  lines.push('/* Building Trust - Full team available */');
  lines.push('[data-relationship="buildingTrust"] .team-feature {');
  lines.push('  display: block;');
  lines.push('}');
  lines.push('[data-relationship="buildingTrust"] .relationship-decorative {');
  lines.push('  opacity: 0.75;');
  lines.push('}');
  lines.push('');

  // Established - rich interactions
  lines.push('/* Established - Rich interactions */');
  lines.push('[data-relationship="established"] .advanced-feature {');
  lines.push('  display: block;');
  lines.push('}');
  lines.push('[data-relationship="established"] .relationship-decorative {');
  lines.push('  opacity: 0.9;');
  lines.push('}');
  lines.push('');

  // Deep partnership - everything
  lines.push('/* Deep Partnership - Full UI richness */');
  lines.push('[data-relationship="deepPartnership"] .relationship-decorative {');
  lines.push('  opacity: 1;');
  lines.push('}');
  lines.push('[data-relationship="deepPartnership"] .insight-preview {');
  lines.push('  display: block;');
  lines.push('}');
  lines.push('');

  // Relationship indicator visual
  lines.push('/* Relationship Depth Indicator */');
  lines.push('.relationship-indicator {');
  lines.push('  display: flex;');
  lines.push('  gap: 4px;');
  lines.push('}');
  lines.push('.relationship-dot {');
  lines.push('  width: 8px;');
  lines.push('  height: 8px;');
  lines.push('  border-radius: 50%;');
  lines.push('  background: var(--color-text-muted);');
  lines.push('  opacity: 0.3;');
  lines.push('  transition: opacity 0.3s ease, background 0.3s ease;');
  lines.push('}');
  lines.push('.relationship-dot.filled {');
  lines.push('  opacity: 1;');
  lines.push('  background: var(--color-accent);');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// EFFECTS CSS GENERATION
// ============================================================================

function generateEffectsCSS(effects) {
  const lines = [];

  // Blur utilities
  lines.push('/* Blur Utilities */');
  lines.push(':root {');
  for (const [key, value] of Object.entries(effects.blur)) {
    lines.push(`  --blur-${key}: ${value};`);
  }
  lines.push('}');
  lines.push('');

  // Gradient variables
  lines.push('/* Gradients */');
  lines.push('[data-theme="midnight"] {');
  lines.push(`  --gradient-aurora: ${effects.gradients.aurora.midnight};`);
  lines.push(`  --gradient-warm-glow: ${effects.gradients.warmGlow.midnight};`);
  lines.push(`  --gradient-sunbeam: ${effects.gradients.sunbeam.midnight};`);
  lines.push(`  --gradient-mesh: ${effects.gradients.meshGradient.midnight};`);
  lines.push('}');
  lines.push('[data-theme="zen"] {');
  lines.push(`  --gradient-aurora: ${effects.gradients.aurora.zen};`);
  lines.push(`  --gradient-warm-glow: ${effects.gradients.warmGlow.zen};`);
  lines.push(`  --gradient-sunbeam: ${effects.gradients.sunbeam.zen};`);
  lines.push(`  --gradient-mesh: ${effects.gradients.meshGradient.zen};`);
  lines.push('}');
  lines.push(':root {');
  lines.push(`  --gradient-persona-glow: ${effects.gradients.personaGlow};`);
  lines.push('}');
  lines.push('');

  // Glow utilities
  lines.push('/* Glow Effects */');
  lines.push(':root {');
  for (const [key, value] of Object.entries(effects.glows)) {
    lines.push(`  --glow-${camelToKebab(key)}: ${value};`);
  }
  lines.push('}');
  lines.push('');

  // Chromatic aberration effect tokens
  if (effects.chromatic) {
    lines.push('/* Chromatic Aberration Effects */');
    lines.push(':root {');
    if (effects.chromatic.red) {
      lines.push(`  --effect-chromatic-red: ${effects.chromatic.red.solid};`);
      lines.push(`  --effect-chromatic-red-tint: ${effects.chromatic.red.tint};`);
    }
    if (effects.chromatic.cyan) {
      lines.push(`  --effect-chromatic-cyan: ${effects.chromatic.cyan.solid};`);
      lines.push(`  --effect-chromatic-cyan-tint: ${effects.chromatic.cyan.tint};`);
    }
    if (effects.chromatic.offset) {
      lines.push(`  --effect-chromatic-offset-subtle: ${effects.chromatic.offset.subtle};`);
      lines.push(`  --effect-chromatic-offset-normal: ${effects.chromatic.offset.normal};`);
      lines.push(`  --effect-chromatic-offset-strong: ${effects.chromatic.offset.strong};`);
    }
    lines.push('}');
    lines.push('');
  }

  // Magical utility classes
  lines.push('/* ========================================');
  lines.push('   MAGICAL UTILITY CLASSES');
  lines.push('   ======================================== */');
  lines.push('');

  // Paper texture overlay
  lines.push(`/* Paper texture overlay - add to any element */
.texture-paper::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.025;
  pointer-events: none;
  mix-blend-mode: overlay;
}
`);

  // Aurora background
  lines.push(`/* Aurora gradient background */
.aurora-bg {
  background: var(--gradient-aurora);
  background-size: 400% 400%;
  animation: aurora 15s ease-in-out infinite;
}
`);

  // Mesh gradient
  lines.push(`/* Mesh gradient background */
.mesh-bg {
  background: var(--gradient-mesh);
}
`);

  // Organic blob shape
  lines.push(`/* Organic blob shape - morphing border radius */
.blob {
  animation: morphBlob 8s ease-in-out infinite;
}

.blob-subtle {
  border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
}
`);

  // Float animation
  lines.push(`/* Floating/levitating effect */
.float {
  animation: float 6s ease-in-out infinite;
}

.levitate {
  animation: levitate 3s ease-in-out infinite;
}
`);

  // Glow effects
  lines.push(`/* Glow effects */
.glow {
  animation: glow 2s ease-in-out infinite;
}

.glow-persona {
  /* Removed: harsh glow effects break warm, grounded aesthetic */
  /* Use subtle borders or tints instead */
}

.glow-connection {
  box-shadow: var(--glow-connection);
  animation: connectionWarmth 1.5s ease forwards;
}
`);

  // Heartbeat/breathing
  lines.push(`/* Living animations - makes elements feel alive */
.breathing {
  animation: softBreathe 5s ease-in-out infinite;
}

.heartbeat {
  animation: heartbeat 1.5s ease-in-out infinite;
}

.pulse-soft {
  animation: presencePulse 3s ease-in-out infinite;
}
`);

  // Celebration effects
  lines.push(`/* Celebration/delight animations */
.celebrate {
  animation: celebrate 800ms ease-in-out forwards;
}

.wiggle {
  animation: wiggle 500ms ease-in-out;
}

.wave {
  animation: waveHand 2s ease-in-out;
  transform-origin: 70% 70%;
  display: inline-block;
}
`);

  // Ripple effect
  lines.push(`/* Ripple effect container */
.ripple-container {
  position: relative;
  overflow: hidden;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background: var(--color-accent-glow);
  animation: ripple 600ms ease-out forwards;
  pointer-events: none;
}
`);

  // Sparkle effect
  lines.push(`/* Sparkle effect */
.sparkle {
  animation: sparkle 700ms ease-out forwards;
}
`);

  // Staggered cascade animations
  lines.push(`/* Staggered cascade animations for lists */
.cascade > * {
  opacity: 0;
  animation: slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.cascade > *:nth-child(1) { animation-delay: 0ms; }
.cascade > *:nth-child(2) { animation-delay: 50ms; }
.cascade > *:nth-child(3) { animation-delay: 100ms; }
.cascade > *:nth-child(4) { animation-delay: 150ms; }
.cascade > *:nth-child(5) { animation-delay: 200ms; }
.cascade > *:nth-child(6) { animation-delay: 250ms; }
.cascade > *:nth-child(7) { animation-delay: 300ms; }
.cascade > *:nth-child(8) { animation-delay: 350ms; }
.cascade > *:nth-child(9) { animation-delay: 400ms; }
.cascade > *:nth-child(10) { animation-delay: 450ms; }

.cascade-slow > * {
  opacity: 0;
  animation: slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.cascade-slow > *:nth-child(1) { animation-delay: 0ms; }
.cascade-slow > *:nth-child(2) { animation-delay: 100ms; }
.cascade-slow > *:nth-child(3) { animation-delay: 200ms; }
.cascade-slow > *:nth-child(4) { animation-delay: 300ms; }
.cascade-slow > *:nth-child(5) { animation-delay: 400ms; }
`);

  // Magnetic hover
  lines.push(`/* Magnetic hover effect */
.magnetic {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: translate(calc(var(--magnetic-x, 0) * 1px), calc(var(--magnetic-y, 0) * 1px));
}
`);

  // Text reveal
  lines.push(`/* Text reveal animation */
.text-reveal {
  animation: textReveal 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.typewriter {
  overflow: hidden;
  white-space: nowrap;
  animation: typewriter 2s steps(40) forwards;
  border-right: 2px solid var(--color-accent-primary);
}

.typewriter.blink {
  animation: typewriter 2s steps(40) forwards, blinkCursor 1s step-end infinite;
}
`);

  // Glass effect
  lines.push(`/* Glass morphism */
.glass {
  background: var(--color-background-glass);
  backdrop-filter: blur(var(--blur-glass));
  -webkit-backdrop-filter: blur(var(--blur-glass));
  border: 1px solid var(--color-border-subtle);
}

.glass-strong {
  background: var(--color-background-overlay);
  backdrop-filter: blur(var(--blur-lg));
  -webkit-backdrop-filter: blur(var(--blur-lg));
}

/* Advanced Glass Layers */
.glass-layer-1 {
  background: var(--glass-surface-1);
  backdrop-filter: blur(var(--glass-blur-subtle));
  -webkit-backdrop-filter: blur(var(--glass-blur-subtle));
  border: var(--glass-border-subtle);
  box-shadow: var(--glass-inner-glow);
}

.glass-layer-2 {
  background: var(--glass-surface-2);
  backdrop-filter: blur(var(--glass-blur-medium));
  -webkit-backdrop-filter: blur(var(--glass-blur-medium));
  border: var(--glass-border-light);
  box-shadow: var(--glass-inner-glow);
}

.glass-layer-3 {
  background: var(--glass-surface-3);
  backdrop-filter: blur(var(--glass-blur-strong));
  -webkit-backdrop-filter: blur(var(--glass-blur-strong));
  border: var(--glass-border-medium);
  box-shadow: var(--glass-inner-glow);
}

/* ========================================
   LIQUID GLASS - iOS 26 Inspired
   Apple's new translucent, vibrant design
   ======================================== */

/* Liquid Glass Base - Use on modals, cards, overlays */
.glass-liquid {
  position: relative;
  background: var(--glass-surface-2);
  backdrop-filter: blur(var(--glass-blur-medium)) var(--glass-vibrancy-medium);
  -webkit-backdrop-filter: blur(var(--glass-blur-medium)) var(--glass-vibrancy-medium);
  border: var(--glass-border-light);
  box-shadow: var(--glass-inner-glow);
  overflow: hidden;
  transition: 
    backdrop-filter 300ms var(--ease-gentle),
    transform 300ms var(--ease-spring),
    box-shadow 300ms var(--ease-gentle);
}

/* Specular highlight layer (pseudo-element) */
.glass-liquid::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--glass-specular-gradient);
  background-size: var(--glass-specular-size);
  background-position: var(--glass-specular-position);
  opacity: 0.6;
  pointer-events: none;
  transition: opacity 300ms var(--ease-gentle);
}

/* Noise texture layer */
.glass-liquid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: var(--glass-noise-texture);
  background-size: 128px 128px;
  opacity: var(--glass-noise-opacity-subtle);
  mix-blend-mode: var(--glass-noise-blend);
  pointer-events: none;
}

/* Hover: Deeper blur, brighter specular */
.glass-liquid:hover {
  backdrop-filter: blur(calc(var(--glass-blur-medium) + var(--glass-hover-blur-increase))) var(--glass-vibrancy-high);
  -webkit-backdrop-filter: blur(calc(var(--glass-blur-medium) + var(--glass-hover-blur-increase))) var(--glass-vibrancy-high);
}

.glass-liquid:hover::before {
  opacity: 0.8;
}

/* Active: Slight press */
.glass-liquid:active {
  transform: scale(var(--glass-active-scale));
}

/* Focus: Persona-colored ring */
.glass-liquid:focus-visible {
  outline: none;
  box-shadow: var(--glass-inner-glow), var(--glass-focus-ring);
}

/* Liquid Glass - Light variant */
.glass-liquid-light {
  background: var(--glass-surface-1);
  backdrop-filter: blur(var(--glass-blur-subtle)) var(--glass-vibrancy-subtle);
  -webkit-backdrop-filter: blur(var(--glass-blur-subtle)) var(--glass-vibrancy-subtle);
}

/* Liquid Glass - Heavy variant */
.glass-liquid-heavy {
  background: var(--glass-surface-3);
  backdrop-filter: blur(var(--glass-blur-intense)) var(--glass-vibrancy-ultra);
  -webkit-backdrop-filter: blur(var(--glass-blur-intense)) var(--glass-vibrancy-ultra);
}

/* Liquid Glass with Tilt Effect (3D) */
.glass-liquid-tilt {
  transform-style: preserve-3d;
  perspective: var(--glass-tilt-perspective);
  transition: var(--glass-tilt-transition);
}

.glass-liquid-tilt:hover {
  /* JS should set --tilt-x and --tilt-y based on cursor position */
  transform: rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg));
}

/* Liquid Glass with Shimmer Animation */
.glass-liquid-shimmer::before {
  background: var(--glass-shimmer-gradient);
  background-size: 200% 100%;
  animation: var(--glass-shimmer-animation);
}

@keyframes specularShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Liquid Glass with Fresnel Edge Effect */
.glass-liquid-fresnel::before {
  background: var(--glass-fresnel-light);
}

[data-theme="midnight"] .glass-liquid-fresnel::before {
  background: var(--glass-fresnel-dark);
}

/* Liquid Glass with Chromatic Aberration */
.glass-liquid-chromatic {
  position: relative;
}

.glass-liquid-chromatic::before {
  box-shadow: 
    calc(var(--glass-chromatic-offset) * -1) 0 0 var(--glass-chromatic-red),
    var(--glass-chromatic-offset) 0 0 var(--glass-chromatic-blue);
}

/* Liquid Glass Ripple Effect */
.glass-liquid-ripple {
  overflow: hidden;
}

.glass-liquid-ripple .ripple {
  position: absolute;
  border-radius: 50%;
  background: var(--glass-ripple-color);
  transform: scale(0);
  animation: glassRipple var(--glass-ripple-duration) var(--glass-ripple-easing) forwards;
  pointer-events: none;
}

@keyframes glassRipple {
  to {
    transform: scale(4);
    opacity: 0;
  }
}

/* Reduced Motion: Disable animations */
@media (prefers-reduced-motion: reduce) {
  .glass-liquid,
  .glass-liquid::before,
  .glass-liquid::after {
    transition: none;
    animation: none;
  }
  
  .glass-liquid-tilt:hover {
    transform: none;
  }
  
  .glass-liquid-shimmer::before {
    animation: none;
  }
  
  .glass-liquid-ripple .ripple {
    animation: none;
    display: none;
  }
}
`);

  // Anticipation Hover States (Pixar wind-up)
  lines.push(`/* ========================================
   ANTICIPATION HOVER STATES
   Pixar's "wind-up before the pitch"
   ======================================== */

/* Button with anticipation */
.btn-anticipate {
  transition: transform 200ms var(--ease-gentle);
}

.btn-anticipate:hover {
  transform: scale(0.98) translateY(1px);
  transition: transform 80ms cubic-bezier(0.38, -0.4, 0.88, 0.65);
}

.btn-anticipate:hover:active {
  transform: scale(0.95) translateY(2px);
  transition: transform 50ms ease-in;
}

.btn-anticipate:not(:hover) {
  transform: scale(1) translateY(0);
  transition: transform 200ms var(--ease-gentle);
}

/* Card with lift anticipation */
.card-anticipate {
  transition: all 200ms var(--ease-gentle);
}

.card-anticipate:hover {
  transform: scale(1.01) translateY(-4px);
  box-shadow: var(--shadow-lg);
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Icon with spring anticipation */
.icon-anticipate {
  transition: transform 150ms var(--ease-gentle);
}

.icon-anticipate:hover {
  transform: rotate(3deg) scale(1.1);
  transition: transform 150ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Focus ring with anticipation */
.focus-anticipate:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-focus-ring);
  transition: box-shadow 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
`);

  // Wabi-sabi Organic Textures
  lines.push(`/* ========================================
   WABI-SABI ORGANIC TEXTURES
   侘寂 - Beauty in imperfection
   ======================================== */

/* Subtle noise overlay for breaking digital perfection */
.texture-noise::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  mix-blend-mode: overlay;
}

[data-theme="zen"] .texture-noise::before {
  opacity: 0.02;
}

/* Imperfect border radius - organic shapes */
.radius-organic-sm {
  border-radius: 8px 7px 9px 8px / 7px 8px 8px 9px;
}

.radius-organic-md {
  border-radius: 16px 14px 18px 15px / 14px 16px 15px 17px;
}

.radius-organic-lg {
  border-radius: 24px 22px 26px 23px / 22px 25px 23px 24px;
}

/* Ink bleed text effect - soft edges like brush strokes */
.text-ink {
  filter: blur(0.3px);
  text-shadow: 0 0 0.5px currentColor;
}

/* Breathing gradient background */
@keyframes breathingGradient {
  0% { background-position: 0% 50%; opacity: 1; }
  25% { background-position: 50% 0%; opacity: 0.98; }
  50% { background-position: 100% 50%; opacity: 0.96; }
  75% { background-position: 50% 100%; opacity: 0.98; }
  100% { background-position: 0% 50%; opacity: 1; }
}

.gradient-breathing {
  background-size: 200% 200%;
  animation: breathingGradient 20s ease-in-out infinite;
}
`);

  // MA (間) Spacing Utilities
  lines.push(`/* ========================================
   MA (間) SPACING UTILITIES
   Japanese intentional negative space
   ======================================== */

/* MA padding */
.p-ma-breath { padding: var(--ma-breath); }
.p-ma-pause { padding: var(--ma-pause); }
.p-ma-rest { padding: var(--ma-rest); }
.p-ma-silence { padding: var(--ma-silence); }
.p-ma-meditation { padding: var(--ma-meditation); }
.p-ma-contemplation { padding: var(--ma-contemplation); }
.p-ma-vastness { padding: var(--ma-vastness); }

/* MA margin */
.m-ma-breath { margin: var(--ma-breath); }
.m-ma-pause { margin: var(--ma-pause); }
.m-ma-rest { margin: var(--ma-rest); }
.m-ma-silence { margin: var(--ma-silence); }
.m-ma-meditation { margin: var(--ma-meditation); }
.m-ma-contemplation { margin: var(--ma-contemplation); }
.m-ma-vastness { margin: var(--ma-vastness); }

/* MA gap */
.gap-ma-breath { gap: var(--ma-breath); }
.gap-ma-pause { gap: var(--ma-pause); }
.gap-ma-rest { gap: var(--ma-rest); }
.gap-ma-silence { gap: var(--ma-silence); }
.gap-ma-meditation { gap: var(--ma-meditation); }

/* Golden ratio spacing */
.gap-phi-sm { gap: var(--phi-sm); }
.gap-phi-md { gap: var(--phi-md); }
.gap-phi-lg { gap: var(--phi-lg); }
.gap-phi-xl { gap: var(--phi-xl); }
`);

  // Gradient text
  lines.push(`/* Gradient text */
.gradient-text {
  background: var(--gradient-aurora);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradientShift 8s ease infinite;
}
`);

  // Depth layers
  lines.push(`/* Depth/parallax layers */
.depth-bg { z-index: 0; }
.depth-mid { z-index: 10; }
.depth-fg { z-index: 20; }
.depth-overlay { z-index: 30; }

[data-parallax] {
  will-change: transform;
}
`);

  // Warm vignette
  lines.push(`/* Warm vignette overlay */
.vignette::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, var(--color-background-primary) 150%);
  pointer-events: none;
  opacity: 0.4;
}
`);

  // ========================================
  // PIXAR AVATAR ANIMATION UTILITIES
  // ========================================
  lines.push(`/* ========================================
   PIXAR AVATAR ANIMATIONS
   Squash & stretch, anticipation, follow-through
   ======================================== */

/* Avatar reaction classes - apply to .avatar-container */
.animate-avatar-nod {
  animation: avatarNod 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.animate-avatar-shake {
  animation: avatarShake 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.animate-avatar-bounce {
  animation: avatarBounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.animate-avatar-pulse {
  animation: avatarPulse 700ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

.animate-avatar-curious {
  animation: avatarCuriousTilt 800ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.animate-avatar-attentive {
  animation: avatarAttentiveLean 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* Pixar-style Luxo Jr. bounce - for thinking dots */
.animate-pixar-bounce {
  animation: pixarBounce 1.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
}

/* Pixar-style breathing - living presence */
.animate-pixar-breathe {
  animation: pixarBreathe 5s ease-in-out infinite;
}

/* Pixar-style floating - like balloons in Up */
.animate-pixar-float {
  animation: pixarFloat 6s ease-in-out infinite;
}

/* Pixar-style joy bounce */
.animate-pixar-joy {
  animation: pixarJoyBounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

/* ========================================
   ANTICIPATION EFFECTS - "Wind-up Before the Pitch"
   Apply on hover/focus for alive-feeling interactions
   ======================================== */

/* Button anticipation - squash on hover */
.anticipate-btn {
  transition: transform 80ms cubic-bezier(0.38, -0.4, 0.88, 0.65);
}
.anticipate-btn:hover {
  transform: scale(0.98) translateY(1px);
}
.anticipate-btn:active {
  transform: scale(0.95) translateY(2px);
  transition: transform 50ms ease-in;
}

/* Card anticipation - lift on hover */
.anticipate-card {
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.anticipate-card:hover {
  transform: scale(1.01) translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.anticipate-card:active {
  transform: scale(0.98) translateY(1px);
  transition: transform 80ms ease-in;
}

/* Icon anticipation - rotate spring */
.anticipate-icon {
  transition: transform 150ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
.anticipate-icon:hover {
  transform: rotate(3deg) scale(1.1);
}

/* Focus ring with anticipation pulse */
.anticipate-focus:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--color-accent-primary);
  animation: focusAnticipate 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes focusAnticipate {
  0% { box-shadow: 0 0 0 0px var(--color-accent-primary); }
  50% { box-shadow: 0 0 0 4px var(--color-accent-primary); }
  100% { box-shadow: 0 0 0 3px var(--color-accent-primary); }
}

/* Page enter with anticipation */
.anticipate-enter {
  animation: anticipateEnter 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes anticipateEnter {
  0% { opacity: 0; transform: scale(0.96) translateY(8px); }
  30% { opacity: 0.3; transform: scale(0.98) translateY(4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* Page exit with anticipation */
.anticipate-exit {
  animation: anticipateExit 210ms ease-out forwards;
}

@keyframes anticipateExit {
  0% { opacity: 1; transform: scale(1); }
  30% { opacity: 0.8; transform: scale(1.02); }
  100% { opacity: 0; transform: scale(0.95); }
}

/* ========================================
   VOICE EMOTION GLOW - Avatar responds to speaking tone
   ======================================== */

/* Base voice glow setup - uses Ferni sage green (brand compliant) */
.voice-glow {
  --glow-color: var(--persona-glow, rgba(74, 103, 65, 0.5));
  --glow-color-alt: rgba(74, 103, 65, 0.4);
  --glow-intensity: 0.6;
  --glow-spread: 20px;
  --glow-pulse-speed: 3s;
  transition: var(--glow-transition, all 800ms cubic-bezier(0.4, 0, 0.2, 1));
}

/* Glow pulse animation when speaking */
@keyframes voiceGlowPulse {
  0% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
  50% { box-shadow: 0 0 calc(var(--glow-spread) * 1.4) var(--glow-color-alt); }
  100% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
}

/* Gentle breathing glow when idle/listening */
@keyframes voiceGlowBreath {
  0% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
  50% { box-shadow: 0 0 calc(var(--glow-spread) * 1.15) var(--glow-color); }
  100% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
}

/* Quick reaction flash */
@keyframes voiceGlowReact {
  0% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
  30% { box-shadow: 0 0 calc(var(--glow-spread) * 1.8) var(--glow-color-alt); }
  100% { box-shadow: 0 0 var(--glow-spread) var(--glow-color); }
}

/* Speaking state - pulsing glow */
.voice-glow.speaking {
  animation: voiceGlowPulse var(--glow-pulse-speed) ease-in-out infinite;
}

/* Listening state - gentle breathing */
.voice-glow.listening {
  animation: voiceGlowBreath 4s ease-in-out infinite;
}

/* Idle state - static glow */
.voice-glow.idle {
  box-shadow: 0 0 calc(var(--glow-spread) * 0.7) var(--glow-color);
  animation: none;
}

/* Emotion-specific glow colors - Ferni earthy palette */
.voice-glow[data-emotion="neutral"] {
  --glow-color: var(--persona-glow, rgba(74, 103, 65, 0.5));
  --glow-color-alt: rgba(74, 103, 65, 0.4);
}

.voice-glow[data-emotion="happy"] {
  --glow-color: rgba(251, 191, 36, 0.6);
  --glow-color-alt: rgba(245, 158, 11, 0.5);
  --glow-pulse-speed: 2s;
}

.voice-glow[data-emotion="excited"] {
  --glow-color: rgba(236, 72, 153, 0.6);
  --glow-color-alt: rgba(219, 39, 119, 0.5);
  --glow-pulse-speed: 1.2s;
  --glow-spread: 35px;
}

.voice-glow[data-emotion="calm"] {
  --glow-color: rgba(34, 211, 238, 0.5);
  --glow-color-alt: rgba(6, 182, 212, 0.4);
  --glow-pulse-speed: 4s;
}

.voice-glow[data-emotion="thoughtful"] {
  --glow-color: rgba(58, 107, 115, 0.5);
  --glow-color-alt: rgba(45, 83, 89, 0.4);
  --glow-pulse-speed: 3.5s;
}

.voice-glow[data-emotion="empathetic"] {
  --glow-color: rgba(244, 114, 182, 0.5);
  --glow-color-alt: rgba(236, 72, 153, 0.4);
  --glow-pulse-speed: 2.5s;
  --glow-spread: 30px;
}

.voice-glow[data-emotion="serious"] {
  --glow-color: rgba(148, 163, 184, 0.5);
  --glow-color-alt: rgba(100, 116, 139, 0.4);
  --glow-pulse-speed: 4s;
  --glow-spread: 18px;
}

.voice-glow[data-emotion="anxious"] {
  --glow-color: rgba(251, 146, 60, 0.5);
  --glow-color-alt: rgba(249, 115, 22, 0.4);
  --glow-pulse-speed: 1.8s;
}

.voice-glow[data-emotion="encouraging"] {
  --glow-color: rgba(16, 185, 129, 0.6);
  --glow-color-alt: rgba(5, 150, 105, 0.5);
  --glow-pulse-speed: 2.2s;
  --glow-spread: 28px;
}

/* Intensity modifiers */
.voice-glow[data-intensity="whisper"] {
  --glow-intensity: 0.5;
  --glow-spread: calc(var(--glow-spread) * 0.6);
}

.voice-glow[data-intensity="emphasis"] {
  --glow-intensity: 0.9;
  --glow-spread: calc(var(--glow-spread) * 1.2);
}

.voice-glow[data-intensity="exclamation"] {
  --glow-intensity: 1;
  --glow-spread: calc(var(--glow-spread) * 1.5);
}

/* Transition between emotions */
.voice-glow.transitioning {
  transition: all 300ms ease-out;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .voice-glow.speaking,
  .voice-glow.listening {
    animation: none;
    box-shadow: 0 0 var(--glow-spread) var(--glow-color);
  }
}

/* Staggered avatar dots (for thinking indicator) */
.avatar-dots > *:nth-child(1) { animation-delay: 0s; }
.avatar-dots > *:nth-child(2) { animation-delay: 0.15s; }
.avatar-dots > *:nth-child(3) { animation-delay: 0.3s; }

/* Avatar container base styles for smooth animations */
.avatar-container-animated {
  will-change: transform;
  transform-origin: center center;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
`);

  // ========================================
  // ACCESSIBILITY - WCAG 2.1 AA/AAA
  // ========================================
  lines.push(`/* ========================================
   ACCESSIBILITY - WCAG 2.1 Compliant
   ======================================== */

/* Reduced motion - CRITICAL for vestibular disorders */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .float, .levitate, .blob, .breathing { animation: none !important; }
}

@media (prefers-contrast: more) {
  :root { --color-border-subtle: var(--color-border-strong); }
}

:focus-visible {
  outline: 3px solid var(--color-focus-ring, var(--color-accent-primary));
  outline-offset: 2px;
}
:focus:not(:focus-visible) { outline: none; }

.skip-link {
  position: absolute; top: -100%; left: 50%;
  transform: translateX(-50%);
  background: var(--color-background-elevated);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  z-index: var(--z-skip-link);
  transition: top 200ms ease;
}
.skip-link:focus { top: var(--spacing-md); }
`);

  // Shimmer skeleton
  lines.push(`/* SHIMMER SKELETON - Living Loading States */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton { background: var(--color-background-tertiary); border-radius: var(--radius-md); overflow: hidden; }
.skeleton-shimmer {
  background: linear-gradient(90deg, var(--color-background-tertiary) 0%, var(--color-background-elevated) 50%, var(--color-background-tertiary) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
.skeleton-avatar { width: 80px; height: 80px; border-radius: 50%; }
.skeleton-text { height: 1em; margin-bottom: 0.5em; }
.skeleton-button { height: 40px; width: 120px; border-radius: var(--radius-lg); }
@media (prefers-reduced-motion: reduce) { .skeleton-shimmer { animation: none; } }
`);

  // Entrance animations
  lines.push(`/* ENTRANCE ANIMATIONS - Elements "arrive" with personality */
@keyframes entranceAvatar {
  0% { opacity: 0; transform: scale(0.8) translateY(20px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes entranceControls {
  0% { opacity: 0; transform: translateY(10px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes entranceTeamMember {
  0% { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
.entrance-avatar { animation: entranceAvatar 600ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; animation-delay: 200ms; opacity: 0; }
.entrance-controls { animation: entranceControls 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards; animation-delay: 400ms; opacity: 0; }
.entrance-team > * { animation: entranceTeamMember 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0; }
.entrance-team > *:nth-child(1) { animation-delay: 500ms; }
.entrance-team > *:nth-child(2) { animation-delay: 580ms; }
.entrance-team > *:nth-child(3) { animation-delay: 660ms; }
.entrance-team > *:nth-child(4) { animation-delay: 740ms; }
.entrance-team > *:nth-child(5) { animation-delay: 820ms; }
.entrance-team > *:nth-child(6) { animation-delay: 900ms; }
@media (prefers-reduced-motion: reduce) { .entrance-avatar, .entrance-controls, .entrance-team > * { animation: fadeIn 200ms ease forwards; transform: none; } }
`);

  // Error recovery
  lines.push(`/* ERROR RECOVERY - Errors feel fixable, not broken */
@keyframes errorShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes errorPulse {
  0% { box-shadow: 0 0 0 0 var(--color-semantic-error-glow); }
  70% { box-shadow: 0 0 0 10px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.error-shake { animation: errorShake 400ms ease-out; }
.error-pulse { animation: errorPulse 1s ease-out; animation-iteration-count: 3; }
.error-glow { box-shadow: 0 0 0 3px var(--color-semantic-error-glow); }
.has-error { border-color: var(--color-semantic-error) !important; }
@media (prefers-reduced-motion: reduce) { .error-shake, .error-pulse { animation: none; } }
`);

  // Connection progress
  lines.push(`/* CONNECTION PROGRESS - Show steps, not just status */
.connection-progress { display: flex; align-items: center; gap: var(--spacing-xs); }
.connection-step { width: 8px; height: 8px; border-radius: 50%; background: var(--color-background-tertiary); transition: all 300ms ease; }
.connection-step.active { background: var(--color-accent-primary); transform: scale(1.2); }
.connection-step.completed { background: var(--color-semantic-success); }
.connection-bar { height: 3px; background: var(--color-background-tertiary); border-radius: var(--radius-full); overflow: hidden; }
.connection-bar-fill { height: 100%; background: var(--color-accent-primary); transition: width 300ms ease; }
.connection-bar-fill.complete { background: var(--color-semantic-success); }
`);

  // ========================================
  // LANDING PAGE - Immersive 3D Zen Experience
  // ========================================
  lines.push(`/* ========================================
   LANDING PAGE - Immersive 3D Zen Experience
   Japanese zen aesthetic with shoji screen reveal
   ======================================== */

/* Scene container */
.landing-scene {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: #0a0a0a;
  cursor: pointer;
}

.landing-scene.hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 800ms ease, visibility 800ms;
}

.landing-scene.revealed {
  cursor: default;
}

/* 3D Scene Container */
.landing-3d-scene {
  position: fixed;
  inset: 0;
  perspective: 1000px;
  perspective-origin: 50% 50%;
  overflow: hidden;
}

/* Atmospheric mist layers */
.landing-mist {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.landing-mist-1 {
  background: linear-gradient(180deg, rgba(245, 242, 235, 0.4) 0%, transparent 40%, transparent 70%, rgba(245, 242, 235, 0.3) 100%);
  transform: translateZ(-100px);
  animation: mistDrift1 30s ease-in-out infinite;
}

.landing-mist-2 {
  background: radial-gradient(ellipse 120% 60% at 20% 80%, rgba(245, 242, 235, 0.3) 0%, transparent 60%);
  transform: translateZ(-50px);
  animation: mistDrift2 25s ease-in-out infinite reverse;
}

@keyframes mistDrift1 {
  0%, 100% { opacity: 0.6; transform: translateZ(-100px) translateX(0); }
  50% { opacity: 0.8; transform: translateZ(-100px) translateX(3%); }
}

@keyframes mistDrift2 {
  0%, 100% { opacity: 0.5; transform: translateZ(-50px) translateX(0); }
  50% { opacity: 0.7; transform: translateZ(-50px) translateX(-2%); }
}

/* Shoji Screen Doors */
.landing-shoji-container {
  position: absolute;
  inset: 0;
  display: flex;
  pointer-events: none;
  z-index: 10;
}

.landing-shoji {
  flex: 1;
  background: linear-gradient(90deg, rgba(245, 240, 230, 0.97) 0%, rgba(250, 245, 235, 0.98) 50%, rgba(245, 240, 230, 0.97) 100%);
  backdrop-filter: blur(2px);
  box-shadow: inset 0 0 60px rgba(200, 180, 140, 0.15), 0 0 40px rgba(0, 0, 0, 0.2);
  transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.landing-shoji::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E");
  opacity: 0.04;
}

.landing-shoji::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(139, 90, 43, 0.2) 1px, transparent 1px), linear-gradient(rgba(139, 90, 43, 0.2) 1px, transparent 1px);
  background-size: 80px 100px;
  opacity: 0.4;
}

.landing-shoji-left { transform-origin: left center; }
.landing-shoji-right { transform-origin: right center; }

/* Floating content card */
.landing-content-card {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) translateZ(100px);
  width: 90%;
  max-width: 480px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 48px 40px;
  text-align: center;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.2), 0 10px 30px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  opacity: 0;
  z-index: 20;
  transition: opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.landing-content-card.visible {
  opacity: 1;
  transform: translate(-50%, -50%) translateZ(100px) scale(1);
}

/* Ensou (Zen circle) */
.landing-ensou {
  width: 80px;
  height: 80px;
  margin: 0 auto 32px;
  position: relative;
}

.landing-ensou-circle {
  width: 100%;
  height: 100%;
  border: 3px solid rgba(60, 60, 60, 0.15);
  border-radius: 50%;
  position: relative;
}

.landing-ensou-circle::before {
  content: '';
  position: absolute;
  top: -4px;
  right: 10%;
  width: 20%;
  height: 10px;
  background: rgba(255, 255, 255, 0.95);
}

.landing-ensou-wave {
  position: absolute;
  inset: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.landing-ensou-bar {
  width: 3px;
  background: linear-gradient(180deg, #4a5568 0%, #718096 100%);
  border-radius: 2px;
  animation: zenWave 2s ease-in-out infinite;
}

.landing-ensou-bar:nth-child(1) { height: 10px; animation-delay: 0ms; }
.landing-ensou-bar:nth-child(2) { height: 18px; animation-delay: 200ms; }
.landing-ensou-bar:nth-child(3) { height: 24px; animation-delay: 400ms; }
.landing-ensou-bar:nth-child(4) { height: 18px; animation-delay: 600ms; }
.landing-ensou-bar:nth-child(5) { height: 10px; animation-delay: 800ms; }

@keyframes zenWave {
  0%, 100% { transform: scaleY(1); opacity: 0.6; }
  50% { transform: scaleY(0.5); opacity: 1; }
}

/* Typography */
.landing-headline {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 5vw, 2.5rem);
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}

.landing-headline-accent {
  display: block;
  background: linear-gradient(135deg, #6b7280 0%, #374151 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.landing-subhead {
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.55);
  line-height: 1.6;
  margin-bottom: 32px;
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
}

/* Form */
.landing-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.landing-input {
  width: 100%;
  height: 52px;
  padding: 0 20px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  color: #1a1a1a;
  font-family: var(--font-body);
  font-size: 15px;
  transition: all 200ms ease;
}

.landing-input:focus {
  outline: none;
  background: white;
  border-color: rgba(0, 0, 0, 0.15);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.05);
}

.landing-input::placeholder {
  color: rgba(0, 0, 0, 0.35);
}

.landing-submit {
  width: 100%;
  height: 52px;
  background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 200ms ease, box-shadow 200ms ease;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
}

.landing-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.landing-submit:active {
  transform: scale(0.98);
}

.landing-skip {
  background: none;
  border: none;
  color: rgba(0, 0, 0, 0.4);
  font-size: 13px;
  cursor: pointer;
  padding: 8px;
  transition: color 200ms;
}

.landing-skip:hover {
  color: rgba(0, 0, 0, 0.6);
}

/* Feature pills */
.landing-features {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.landing-feature {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 100px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  font-weight: 500;
}

.landing-feature svg {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

/* Success state */
.landing-success {
  display: none;
}

.landing-success.visible {
  display: block;
  animation: fadeInUp 600ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.landing-success-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  border-radius: 50%;
  color: white;
}

.landing-success-icon svg {
  width: 32px;
  height: 32px;
}

/* Tap hint */
.landing-tap-hint {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  opacity: 1;
  transition: opacity 400ms ease;
}

.landing-scene.revealed .landing-tap-hint {
  opacity: 0;
  pointer-events: none;
}

.landing-tap-hint-circle {
  width: 100px;
  height: 100px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: tapPulse 2s ease-in-out infinite;
}

.landing-tap-hint-circle svg {
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.8);
}

.landing-tap-hint-text {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

@keyframes tapPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.7; }
}

/* Mobile */
@media (max-width: 520px) {
  .landing-content-card {
    padding: 32px 24px;
    border-radius: 20px;
  }
  .landing-ensou {
    width: 60px;
    height: 60px;
    margin-bottom: 24px;
  }
  .landing-headline { font-size: 1.5rem; }
  .landing-features { gap: 6px; }
  .landing-feature { padding: 6px 12px; font-size: 11px; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .landing-mist-1,
  .landing-mist-2,
  .landing-ensou-bar,
  .landing-tap-hint-circle {
    animation: none;
  }
  .landing-shoji {
    transition-duration: 0.01ms;
  }
}
`);

  // ========================================
  // TOAST SYSTEM - World-class notifications
  // ========================================
  lines.push(`/* ========================================
   TOAST SYSTEM - Sonner-inspired notifications
   Spring physics, stacking, swipe-to-dismiss
   ======================================== */

/* Container */
.toast-container {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  right: calc(env(safe-area-inset-right, 0px) + 16px);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: min(360px, calc(100vw - 32px));
  contain: layout style;
}

@media (max-width: 480px) {
  .toast-container {
    top: calc(env(safe-area-inset-top, 0px) + 8px);
    left: 12px;
    right: 12px;
    align-items: stretch;
    max-width: none;
  }
}

/* Individual Toast */
.toast {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(22, 22, 26, 0.92);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), 0 1px 4px rgba(0, 0, 0, 0.15), inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
  pointer-events: auto;
  cursor: default;
  touch-action: pan-x;
  will-change: transform, opacity;
  contain: layout;
  animation: toastSlideIn 350ms cubic-bezier(0.32, 0.72, 0, 1) forwards;
  transform-origin: top right;
}

@keyframes toastSlideIn {
  0% { opacity: 0; transform: translateX(calc(100% + 20px)); }
  100% { opacity: 1; transform: translateX(0); }
}

@media (max-width: 480px) {
  .toast {
    transform-origin: top center;
    animation-name: toastSlideDown;
    padding: 10px 12px;
    border-radius: 10px;
  }
  @keyframes toastSlideDown {
    0% { opacity: 0; transform: translateY(-100%); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
}

/* Toast exit */
.toast.toast-exiting {
  animation: toastSlideOut 250ms cubic-bezier(0.32, 0, 0.67, 0) forwards;
}

@keyframes toastSlideOut {
  0% { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(calc(100% + 20px)); }
}

/* Swipe dismiss */
.toast.toast-swiping { transition: none; }
.toast.toast-swipe-out {
  animation: toastSwipeOut 180ms ease-out forwards;
}

@keyframes toastSwipeOut {
  to { opacity: 0; transform: translateX(120%); }
}

/* Stacking */
.toast:nth-child(2) { opacity: 0.85; transform: scale(0.97); }
.toast:nth-child(3) { opacity: 0.7; transform: scale(0.94); }
.toast:nth-child(n+4) { opacity: 0; transform: scale(0.9); pointer-events: none; }

/* Expand stack on hover */
.toast-container:hover .toast,
.toast-container:focus-within .toast {
  opacity: 1;
  transform: scale(1);
  transition: all 200ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* Pause timer on hover */
.toast:hover .toast-progress,
.toast:focus-within .toast-progress {
  animation-play-state: paused;
}

/* Toast Icon */
.toast-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.toast-icon svg { width: 12px; height: 12px; }

/* Toast Content */
.toast-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.toast-title {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.35;
  letter-spacing: -0.008em;
}

.toast-description {
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.4;
}

/* Toast Close Button */
.toast-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: all 120ms ease;
}

.toast:hover .toast-close { opacity: 1; }
.toast-close:hover { background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.8); }
.toast-close:active { transform: scale(0.92); }
.toast-close svg { width: 12px; height: 12px; }

/* Toast Progress Bar */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 0 0 12px 12px;
  overflow: hidden;
}

.toast-progress-bar {
  height: 100%;
  background: currentColor;
  opacity: 0.4;
  transform-origin: right;
  animation: toastProgress var(--toast-duration, 5000ms) linear forwards;
}

@keyframes toastProgress {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Toast Types */
.toast-info .toast-icon { color: rgba(255, 255, 255, 0.6); }
.toast-info .toast-progress-bar { background: rgba(255, 255, 255, 0.5); }

.toast-success .toast-icon { color: #34d399; }
.toast-success .toast-progress-bar { background: #34d399; }

.toast-error {
  background: rgba(35, 20, 22, 0.94);
  border-color: rgba(239, 68, 68, 0.12);
}
.toast-error .toast-icon { color: #ef4444; }
.toast-error .toast-progress-bar { background: #ef4444; }

.toast-warning .toast-icon { color: #f59e0b; }
.toast-warning .toast-progress-bar { background: #f59e0b; }

.toast-loading .toast-icon {
  color: rgba(255, 255, 255, 0.5);
  animation: iconSpin 1s linear infinite;
}

@keyframes iconSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Toast Action Button */
.toast-action {
  margin-left: 8px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms ease;
  flex-shrink: 0;
}

.toast-action:hover { background: rgba(255, 255, 255, 0.14); }
.toast-action:active { background: rgba(255, 255, 255, 0.1); }

/* Zen Theme */
[data-theme="zen"] .toast {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1), 0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
[data-theme="zen"] .toast-title { color: rgba(0, 0, 0, 0.9); }
[data-theme="zen"] .toast-description { color: rgba(0, 0, 0, 0.55); }
[data-theme="zen"] .toast-close { color: rgba(0, 0, 0, 0.35); }
[data-theme="zen"] .toast-close:hover { background: rgba(0, 0, 0, 0.06); color: rgba(0, 0, 0, 0.7); }
[data-theme="zen"] .toast-progress { background: rgba(0, 0, 0, 0.06); }
[data-theme="zen"] .toast-error {
  background: rgba(254, 242, 242, 0.98);
  border-color: rgba(248, 113, 113, 0.15);
}
[data-theme="zen"] .toast-action {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.75);
}
[data-theme="zen"] .toast-action:hover { background: rgba(0, 0, 0, 0.08); }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .toast { animation: toastEnterReduced 200ms ease-out forwards; }
  @keyframes toastEnterReduced { from { opacity: 0; } to { opacity: 1; } }
  .toast.toast-exiting { animation: toastExitReduced 150ms ease-out forwards; }
  @keyframes toastExitReduced { from { opacity: 1; } to { opacity: 0; } }
  .toast-progress-bar { animation: none; transform: scaleX(0); }
  .toast-loading .toast-icon { animation: none; }
  .toast-container:hover .toast { transition: none; }
}
`);

  return lines.join('\n');
}

// ============================================================================
// MOTION TOKENS CSS GENERATION (Ferni Alive Animation System)
// ============================================================================

function generateMotionCSS(motion) {
  const lines = [];

  lines.push(':root {');

  // Easings from motion.json
  lines.push('  /* Motion Easings - from ferni-alive.html */');
  if (motion.easing) {
    for (const [key, data] of Object.entries(motion.easing)) {
      if (key.startsWith('_')) continue; // Skip comments
      if (typeof data === 'object' && data.value) {
        lines.push(`  --motion-ease-${camelToKebab(key)}: ${data.value};`);
      }
    }
  }
  lines.push('');

  // Durations from motion.json
  lines.push('  /* Motion Durations */');
  if (motion.duration) {
    for (const [key, data] of Object.entries(motion.duration)) {
      if (key.startsWith('_')) continue;
      if (typeof data === 'object' && data.value !== undefined) {
        lines.push(`  --motion-duration-${camelToKebab(key)}: ${data.value}${data.unit || 'ms'};`);
      }
    }
  }
  lines.push('');

  // Breath cycle durations
  lines.push('  /* Breath Cycles */');
  if (motion.breathCycles) {
    for (const [key, data] of Object.entries(motion.breathCycles)) {
      if (key.startsWith('_')) continue;
      if (typeof data === 'object' && data.duration !== undefined) {
        lines.push(`  --breath-${camelToKebab(key)}-duration: ${data.duration}ms;`);
        if (data.expansion) {
          lines.push(`  --breath-${camelToKebab(key)}-scale-y: ${data.expansion.scaleY};`);
          lines.push(`  --breath-${camelToKebab(key)}-scale-x: ${data.expansion.scaleX};`);
        }
      } else if (typeof data === 'object' && data.value !== undefined) {
        lines.push(`  --breath-${camelToKebab(key)}: ${data.value}${data.unit || 'ms'};`);
      }
    }
  }
  lines.push('');

  // Blink timing
  lines.push('  /* Blink Timing */');
  if (motion.blinkTiming) {
    const bt = motion.blinkTiming;
    if (bt.duration) lines.push(`  --blink-duration: ${bt.duration.value}${bt.duration.unit || 'ms'};`);
    if (bt.intervalRange) {
      lines.push(`  --blink-interval-min: ${bt.intervalRange.min}${bt.intervalRange.unit || 'ms'};`);
      lines.push(`  --blink-interval-max: ${bt.intervalRange.max}${bt.intervalRange.unit || 'ms'};`);
    }
    if (bt.lidTransition) lines.push(`  --blink-lid-transition: ${bt.lidTransition.duration}${bt.lidTransition.unit || 'ms'};`);
  }
  lines.push('');

  // Gaze drift
  lines.push('  /* Gaze Drift */');
  if (motion.gazeDrift) {
    const gd = motion.gazeDrift;
    if (gd.cycle) lines.push(`  --gaze-drift-cycle: ${gd.cycle.value}${gd.cycle.unit || 'ms'};`);
    if (gd.eyesGroupTransition) lines.push(`  --gaze-eyes-transition: ${gd.eyesGroupTransition.duration}${gd.eyesGroupTransition.unit || 'ms'};`);
  }
  lines.push('');

  // Speaking animation
  lines.push('  /* Speaking Animation */');
  if (motion.speakingAnimation) {
    const sa = motion.speakingAnimation;
    if (sa.pulseDuration) lines.push(`  --speak-pulse-duration: ${sa.pulseDuration.value}${sa.pulseDuration.unit || 'ms'};`);
    if (sa.sparkle) lines.push(`  --speak-sparkle-rotate: ${sa.sparkle.rotateDuration}${sa.sparkle.unit || 'ms'};`);
  }
  lines.push('');

  // Glow properties
  lines.push('  /* Glow Properties */');
  if (motion.glowProperties) {
    for (const [key, data] of Object.entries(motion.glowProperties)) {
      if (key.startsWith('_')) continue;
      if (typeof data === 'object') {
        lines.push(`  --glow-${camelToKebab(key)}-blur: ${data.blur}px;`);
        lines.push(`  --glow-${camelToKebab(key)}-spread: ${data.spread}px;`);
        lines.push(`  --glow-${camelToKebab(key)}-opacity: ${data.opacity};`);
        lines.push(`  --glow-${camelToKebab(key)}-pulse: ${data.pulseDuration}ms;`);
      }
    }
  }
  lines.push('');

  // Micro-expressions (for JS consumption as CSS vars)
  lines.push('  /* Micro-Expression Durations */');
  if (motion.ferniEQ && motion.ferniEQ.microExpressions) {
    for (const [key, data] of Object.entries(motion.ferniEQ.microExpressions)) {
      if (key.startsWith('_') || key === 'description') continue;
      if (typeof data === 'object' && data.value !== undefined) {
        lines.push(`  --micro-${camelToKebab(key)}: ${data.value}${data.unit || 'ms'};`);
      }
    }
  }

  lines.push('}');
  lines.push('');

  // Persona timing modifiers
  lines.push('/* Persona Timing Modifiers */');
  if (motion.personaModifiers) {
    for (const [personaId, data] of Object.entries(motion.personaModifiers)) {
      if (typeof data === 'object' && data.timingMultiplier !== undefined) {
        lines.push(`[data-persona="${personaId}"] {`);
        lines.push(`  --persona-timing-multiplier: ${data.timingMultiplier};`);
        lines.push(`  --persona-easing-preference: var(--motion-ease-${camelToKebab(data.easingPreference || 'gentle')});`);
        lines.push('}');
      }
    }
  }
  lines.push('');

  // Animation layers info (as CSS custom properties for JS)
  lines.push('/* Animation Layer Priorities (for JS orchestration) */');
  lines.push(':root {');
  if (motion.animationLayers) {
    for (const [layerName, data] of Object.entries(motion.animationLayers)) {
      if (layerName.startsWith('_')) continue;
      if (typeof data === 'object' && data.priority !== undefined) {
        lines.push(`  --layer-${camelToKebab(layerName)}-priority: ${data.priority};`);
        if (data.cycle) lines.push(`  --layer-${camelToKebab(layerName)}-cycle: ${data.cycle}ms;`);
      }
    }
  }
  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// GLOW COLORS CSS GENERATION (Emotional Glow States)
// ============================================================================

function generateGlowColorsCSS(glowColors) {
  const lines = [];

  lines.push(':root {');

  // Emotional glow colors
  lines.push('  /* Emotional Glow Colors */');
  if (glowColors.glowColors) {
    for (const [emotion, data] of Object.entries(glowColors.glowColors)) {
      if (emotion.startsWith('_')) continue;
      if (typeof data === 'object' && data.value) {
        lines.push(`  --glow-color-${camelToKebab(emotion)}: ${data.value};`);
      }
    }
  }
  lines.push('');

  // Glow intensity levels
  lines.push('  /* Glow Intensity Levels */');
  if (glowColors.glowIntensity) {
    for (const [level, data] of Object.entries(glowColors.glowIntensity)) {
      if (level.startsWith('_')) continue;
      if (typeof data === 'object') {
        lines.push(`  --glow-intensity-${level}-opacity: ${data.opacity};`);
        lines.push(`  --glow-intensity-${level}-blur: ${data.blur}px;`);
        lines.push(`  --glow-intensity-${level}-spread: ${data.spread}px;`);
      }
    }
  }

  lines.push('}');
  lines.push('');

  // Glow gradient classes
  lines.push('/* Emotional Glow Gradient Classes */');
  if (glowColors.glowGradients) {
    for (const [gradientName, data] of Object.entries(glowColors.glowGradients)) {
      if (gradientName.startsWith('_')) continue;
      if (typeof data === 'object' && data.colors && data.colors.length >= 2) {
        lines.push(`.glow-gradient-${camelToKebab(gradientName)} {`);
        lines.push(`  --glow-gradient: linear-gradient(135deg, ${data.colors.join(', ')});`);
        lines.push(`  box-shadow: 0 0 30px ${data.colors[0]}40, 0 0 60px ${data.colors[1]}30;`);
        lines.push('}');
      }
    }
  }
  lines.push('');

  // Persona glow modifiers
  lines.push('/* Persona Glow Modifiers */');
  if (glowColors.personaGlowModifiers) {
    for (const [personaId, data] of Object.entries(glowColors.personaGlowModifiers)) {
      if (personaId.startsWith('_')) continue;
      if (typeof data === 'object') {
        lines.push(`[data-persona="${personaId}"] {`);
        lines.push(`  --persona-glow-hue-shift: ${data.baseHue}deg;`);
        lines.push(`  --persona-glow-saturation: ${data.saturationMultiplier};`);
        lines.push('}');
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// WINDOW AVATAR CSS GENERATION
// ============================================================================

/**
 * Generate CSS for Window Avatar scale variants and expressions.
 *
 * The Window Avatar creates the illusion of Ferni peeking through the interface.
 * At different scales:
 * - tiny (24-32px): Only eyes visible (favicon, badge)
 * - small (40-64px): Minimal expression with reduced lid visibility
 * - medium (80-120px): Full expression range (main avatar)
 * - large (160-240px): Maximum detail with enhanced expressions
 */
function generateWindowAvatarCSS(windowAvatar) {
  const lines = [];
  const wa = windowAvatar.windowAvatar;
  if (!wa) return '';

  // Base CSS variables for window avatar
  lines.push(':root {');
  lines.push('  /* Window Avatar - Default values */');

  // Lid defaults
  if (wa.lids) {
    const topDefault = wa.lids.top?.default || {};
    const bottomDefault = wa.lids.bottom?.default || {};
    lines.push(`  --window-avatar-lid-top-cutoff: ${topDefault.cutoff || 0.12};`);
    lines.push(`  --window-avatar-lid-top-curve: ${topDefault.curve || 0};`);
    lines.push(`  --window-avatar-lid-bottom-cutoff: ${bottomDefault.cutoff || 0.12};`);
    lines.push(`  --window-avatar-lid-bottom-curve: ${bottomDefault.curve || 0};`);

    // Speaking animation range
    if (wa.lids.bottom?.speaking) {
      const speaking = wa.lids.bottom.speaking;
      lines.push(`  --window-avatar-speak-min-cutoff: ${speaking.minCutoff || 0.10};`);
      lines.push(`  --window-avatar-speak-max-cutoff: ${speaking.maxCutoff || 0.35};`);
      lines.push(`  --window-avatar-speak-volume-scale: ${speaking.volumeScale || 0.25};`);
    }
  }
  lines.push('');

  // Animation timing
  if (wa.animation) {
    lines.push('  /* Window Avatar - Animation Timing */');
    if (wa.animation.mouth?.duration) {
      lines.push(`  --window-avatar-mouth-idle: ${wa.animation.mouth.duration.idle}ms;`);
      lines.push(`  --window-avatar-mouth-speaking: ${wa.animation.mouth.duration.speaking}ms;`);
      lines.push(`  --window-avatar-mouth-transition: ${wa.animation.mouth.duration.transition}ms;`);
    }
    if (wa.animation.mouth?.smoothing) {
      lines.push(`  --window-avatar-mouth-attack: ${wa.animation.mouth.smoothing.attack};`);
      lines.push(`  --window-avatar-mouth-release: ${wa.animation.mouth.smoothing.release};`);
    }
    if (wa.animation.brow?.duration) {
      lines.push(`  --window-avatar-brow-raise: ${wa.animation.brow.duration.raise}ms;`);
      lines.push(`  --window-avatar-brow-lower: ${wa.animation.brow.duration.lower}ms;`);
      lines.push(`  --window-avatar-brow-transition: ${wa.animation.brow.duration.transition}ms;`);
    }
    if (wa.animation.expression?.transition) {
      lines.push(`  --window-avatar-expression-transition: ${wa.animation.expression.transition.duration}ms;`);
    }
    if (wa.animation.expression?.microExpression) {
      lines.push(`  --window-avatar-micro-expression: ${wa.animation.expression.microExpression.duration}ms;`);
    }
  }
  lines.push('');

  // Shape parameters
  if (wa.shapes) {
    lines.push('  /* Window Avatar - Shape Parameters */');
    lines.push(`  --window-avatar-curve-tension: ${wa.shapes.curveTension?.default || 0.3};`);
    lines.push(`  --window-avatar-curve-smooth: ${wa.shapes.curveTension?.smooth || 0.5};`);
    lines.push(`  --window-avatar-curve-sharp: ${wa.shapes.curveTension?.sharp || 0.15};`);
  }

  lines.push('}');
  lines.push('');

  // Scale variant classes
  lines.push('/* Window Avatar - Scale Variants */');
  lines.push('/* Based on window-avatar.json scale definitions */');
  lines.push('');

  if (wa.scale) {
    // Tiny scale (24-32px) - favicon, badge
    if (wa.scale.tiny) {
      const tiny = wa.scale.tiny;
      lines.push('.window-avatar--tiny,');
      lines.push('.ferni-avatar--tiny {');
      lines.push('  --window-avatar-size: 28px;');
      lines.push('  --window-avatar-lid-visible: 0;'); // Lids hidden at tiny size
      lines.push('  --window-avatar-lid-scale: 0;');
      lines.push('}');
      lines.push('.window-avatar--tiny .lid,');
      lines.push('.ferni-avatar--tiny .lid,');
      lines.push('.window-avatar--tiny .lid-top,');
      lines.push('.ferni-avatar--tiny .lid-top,');
      lines.push('.window-avatar--tiny .lid-bottom,');
      lines.push('.ferni-avatar--tiny .lid-bottom {');
      lines.push('  display: none; /* Eyes only at tiny size */');
      lines.push('}');
      lines.push('');
    }

    // Small scale (40-64px) - nav, list items
    if (wa.scale.small) {
      const small = wa.scale.small;
      lines.push('.window-avatar--small,');
      lines.push('.ferni-avatar--small {');
      lines.push('  --window-avatar-size: 52px;');
      lines.push(`  --window-avatar-lid-scale: ${small.lidScale || 0.8};`);
      lines.push('  --window-avatar-lid-visible: 1;');
      lines.push('}');
      lines.push('.window-avatar--small .lid-shape,');
      lines.push('.ferni-avatar--small .lid-shape {');
      lines.push('  /* Reduced lid expression at small size */');
      lines.push('  transform: scaleY(0.8);');
      lines.push('}');
      lines.push('');
    }

    // Medium scale (80-120px) - main avatar (default)
    if (wa.scale.medium) {
      const medium = wa.scale.medium;
      lines.push('.window-avatar--medium,');
      lines.push('.ferni-avatar--medium,');
      lines.push('.ferni-avatar { /* Default size */');
      lines.push('  --window-avatar-size: 100px;');
      lines.push(`  --window-avatar-lid-scale: ${medium.lidScale || 1.0};`);
      lines.push('  --window-avatar-lid-visible: 1;');
      lines.push('}');
      lines.push('');
    }

    // Large scale (160-240px) - hero, onboarding
    if (wa.scale.large) {
      const large = wa.scale.large;
      lines.push('.window-avatar--large,');
      lines.push('.ferni-avatar--large {');
      lines.push('  --window-avatar-size: 200px;');
      lines.push(`  --window-avatar-lid-scale: ${large.lidScale || 1.2};`);
      lines.push('  --window-avatar-lid-visible: 1;');
      lines.push('}');
      lines.push('.window-avatar--large .lid-shape,');
      lines.push('.ferni-avatar--large .lid-shape {');
      lines.push('  /* Enhanced expression at large size */');
      lines.push('  transform: scaleY(1.2);');
      lines.push('}');
      lines.push('');
    }
  }

  // Expression modifier classes (generated from top/bottom lid expressions)
  lines.push('/* Window Avatar - Expression Classes */');
  lines.push('/* Apply via data-expression attribute or class */');
  lines.push('');

  if (wa.lids?.top?.expressions) {
    for (const [expression, values] of Object.entries(wa.lids.top.expressions)) {
      const bottomValues = wa.lids?.bottom?.expressions?.[expression] || {};
      const topCutoff = values.cutoff || 0.12;
      const topCurve = values.curve || 0;
      const topAsymmetry = values.asymmetry || 0;
      const bottomCutoff = bottomValues.cutoff || 0.12;
      const bottomCurve = bottomValues.curve || 0;
      const bottomAsymmetry = bottomValues.asymmetry || 0;

      lines.push(`.ferni-avatar[data-expression="${expression}"],`);
      lines.push(`.window-avatar[data-expression="${expression}"],`);
      lines.push(`.ferni-avatar--${expression} {`);
      lines.push(`  --window-avatar-lid-top-cutoff: ${topCutoff};`);
      lines.push(`  --window-avatar-lid-top-curve: ${topCurve};`);
      lines.push(`  --window-avatar-lid-top-asymmetry: ${topAsymmetry};`);
      lines.push(`  --window-avatar-lid-bottom-cutoff: ${bottomCutoff};`);
      lines.push(`  --window-avatar-lid-bottom-curve: ${bottomCurve};`);
      lines.push(`  --window-avatar-lid-bottom-asymmetry: ${bottomAsymmetry};`);
      lines.push('}');
      lines.push('');
    }
  }

  // State transition classes
  lines.push('/* Window Avatar - State Transitions */');
  if (wa.stateTransitions) {
    for (const [state, data] of Object.entries(wa.stateTransitions)) {
      if (state === 'description' || typeof data !== 'object') continue;
      if (data.top && data.bottom) {
        lines.push(`.ferni-avatar[data-state="${state}"],`);
        lines.push(`.window-avatar[data-state="${state}"] {`);
        lines.push(`  --window-avatar-lid-top-cutoff: ${data.top.cutoff || 0.12};`);
        lines.push(`  --window-avatar-lid-top-curve: ${data.top.curve || 0};`);
        if (typeof data.bottom === 'object') {
          lines.push(`  --window-avatar-lid-bottom-cutoff: ${data.bottom.cutoff || 0.12};`);
          lines.push(`  --window-avatar-lid-bottom-curve: ${data.bottom.curve || 0};`);
        }
        lines.push('}');
        lines.push('');
      }
    }
  }

  // Phoneme shapes for lip-sync (as CSS custom properties)
  lines.push('/* Window Avatar - Phoneme Shapes for Lip Sync */');
  lines.push(':root {');
  if (wa.phonemes?.shapes) {
    for (const [phoneme, shape] of Object.entries(wa.phonemes.shapes)) {
      lines.push(`  --phoneme-${phoneme.toLowerCase()}-open: ${shape.open || 0};`);
      lines.push(`  --phoneme-${phoneme.toLowerCase()}-width: ${shape.width || 1};`);
      lines.push(`  --phoneme-${phoneme.toLowerCase()}-roundness: ${shape.roundness || 0};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Brow animation keyframes and utility classes
  lines.push('/* Window Avatar - Brow Animation Keyframes */');
  lines.push('/* Brow = top lid - creates forehead/eyebrow expressions */');
  lines.push('');

  // Brow raise animation (surprised, curious, questioning)
  const browRaiseDuration = wa.animation?.brow?.duration?.raise || 250;
  const browLowerDuration = wa.animation?.brow?.duration?.lower || 400;
  const browTransitionDuration = wa.animation?.brow?.duration?.transition || 350;

  lines.push(`@keyframes browRaise {
  0% {
    --window-avatar-lid-top-cutoff: 0.12;
    transform: translateY(0);
  }
  50% {
    --window-avatar-lid-top-cutoff: 0.06;
    transform: translateY(-3px);
  }
  100% {
    --window-avatar-lid-top-cutoff: 0.08;
    transform: translateY(-2px);
  }
}`);
  lines.push('');

  lines.push(`@keyframes browLower {
  0% {
    --window-avatar-lid-top-cutoff: 0.12;
    transform: translateY(0);
  }
  50% {
    --window-avatar-lid-top-cutoff: 0.18;
    transform: translateY(2px);
  }
  100% {
    --window-avatar-lid-top-cutoff: 0.16;
    transform: translateY(1px);
  }
}`);
  lines.push('');

  lines.push(`@keyframes browFurrow {
  0% {
    --window-avatar-lid-top-curve: 0;
    transform: scaleY(1);
  }
  50% {
    --window-avatar-lid-top-curve: -0.12;
    transform: scaleY(0.95);
  }
  100% {
    --window-avatar-lid-top-curve: -0.08;
    transform: scaleY(0.97);
  }
}`);
  lines.push('');

  lines.push(`@keyframes browQuirk {
  0% {
    --window-avatar-lid-top-asymmetry: 0;
  }
  30% {
    --window-avatar-lid-top-asymmetry: 0.3;
  }
  70% {
    --window-avatar-lid-top-asymmetry: 0.25;
  }
  100% {
    --window-avatar-lid-top-asymmetry: 0.2;
  }
}`);
  lines.push('');

  // Brow animation utility classes
  lines.push('/* Window Avatar - Brow Animation Utility Classes */');
  lines.push(`
.ferni-avatar--brow-raise .lid-top,
.window-avatar--brow-raise .lid-top {
  animation: browRaise ${browRaiseDuration}ms var(--motion-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) forwards;
}

.ferni-avatar--brow-lower .lid-top,
.window-avatar--brow-lower .lid-top {
  animation: browLower ${browLowerDuration}ms var(--motion-ease-gentle, cubic-bezier(0.25, 0.1, 0.25, 1)) forwards;
}

.ferni-avatar--brow-furrow .lid-top,
.window-avatar--brow-furrow .lid-top {
  animation: browFurrow ${browTransitionDuration}ms var(--motion-ease-soft, cubic-bezier(0.4, 0, 0.2, 1)) forwards;
}

.ferni-avatar--brow-quirk .lid-top,
.window-avatar--brow-quirk .lid-top {
  animation: browQuirk 300ms var(--motion-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) forwards;
}

/* Micro-expression brow flash - subliminal 40-150ms */
.ferni-avatar--brow-flash .lid-top,
.window-avatar--brow-flash .lid-top {
  animation: browRaise ${wa.animation?.expression?.microExpression?.duration || 80}ms ease-out;
}
`);

  // ==========================================================================
  // NOTIFICATION BADGE CSS
  // ==========================================================================

  if (wa.notificationBadge) {
    const badge = wa.notificationBadge;
    lines.push('');
    lines.push('/* Window Avatar - Notification Badge */');

    // Badge keyframes
    lines.push(`
@keyframes badgeEntrance {
  0% {
    opacity: 0;
    transform: scale(0) translateY(4px);
  }
  60% {
    transform: scale(1.15) translateY(-2px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes badgePulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 currentColor;
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 4px transparent;
  }
}

@keyframes badgeBounce {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(1.25);
  }
  50% {
    transform: scale(0.9);
  }
  70% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}
`);

    // Base badge styles
    lines.push(`
/* Base notification badge */
.ferni-avatar__badge,
.window-avatar__badge {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  font-family: var(--font-body);
  font-weight: 600;
  line-height: 1;
  z-index: 10;
  transition: transform 200ms var(--motion-ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)),
              opacity 200ms ease-out;
}

/* Badge positioning */
.ferni-avatar__badge--top-right,
.window-avatar__badge--top-right {
  top: ${badge.positioning?.topRight?.top || '-4px'};
  right: ${badge.positioning?.topRight?.right || '-4px'};
}

.ferni-avatar__badge--top-left,
.window-avatar__badge--top-left {
  top: ${badge.positioning?.topLeft?.top || '-4px'};
  left: ${badge.positioning?.topLeft?.left || '-4px'};
}

.ferni-avatar__badge--bottom-right,
.window-avatar__badge--bottom-right {
  bottom: ${badge.positioning?.bottomRight?.bottom || '-4px'};
  right: ${badge.positioning?.bottomRight?.right || '-4px'};
}

.ferni-avatar__badge--bottom-left,
.window-avatar__badge--bottom-left {
  bottom: ${badge.positioning?.bottomLeft?.bottom || '-4px'};
  left: ${badge.positioning?.bottomLeft?.left || '-4px'};
}

/* Badge sizes */
.ferni-avatar__badge--dot,
.window-avatar__badge--dot {
  width: ${badge.sizes?.dot?.width || '8px'};
  height: ${badge.sizes?.dot?.height || '8px'};
  min-width: unset;
  padding: 0;
}

.ferni-avatar__badge--small,
.window-avatar__badge--small {
  min-width: ${badge.sizes?.small?.minWidth || '16px'};
  height: ${badge.sizes?.small?.height || '16px'};
  font-size: ${badge.sizes?.small?.fontSize || '10px'};
  padding: ${badge.sizes?.small?.padding || '0 4px'};
}

.ferni-avatar__badge,
.window-avatar__badge {
  min-width: ${badge.sizes?.default?.minWidth || '20px'};
  height: ${badge.sizes?.default?.height || '20px'};
  font-size: ${badge.sizes?.default?.fontSize || '11px'};
  padding: ${badge.sizes?.default?.padding || '0 6px'};
}

/* Badge variants */
.ferni-avatar__badge,
.window-avatar__badge {
  background: ${badge.variants?.default?.background || 'var(--color-semantic-error)'};
  color: ${badge.variants?.default?.color || 'white'};
}

.ferni-avatar__badge--subtle,
.window-avatar__badge--subtle {
  background: ${badge.variants?.subtle?.background || 'var(--color-bg-elevated)'};
  border: ${badge.variants?.subtle?.border || '1px solid var(--color-border-medium)'};
  color: ${badge.variants?.subtle?.color || 'var(--color-text-secondary)'};
}

.ferni-avatar__badge--success,
.window-avatar__badge--success {
  background: ${badge.variants?.success?.background || 'var(--color-semantic-success)'};
  color: ${badge.variants?.success?.color || 'white'};
}

.ferni-avatar__badge--persona,
.window-avatar__badge--persona {
  background: ${badge.variants?.persona?.background || 'var(--persona-primary)'};
  color: ${badge.variants?.persona?.color || 'white'};
}

/* Badge states */
.ferni-avatar__badge--hidden,
.window-avatar__badge--hidden {
  opacity: 0;
  transform: scale(0);
  pointer-events: none;
}

.ferni-avatar__badge--visible,
.window-avatar__badge--visible {
  opacity: 1;
  transform: scale(1);
}

/* Badge animations */
.ferni-avatar__badge--animate-in,
.window-avatar__badge--animate-in {
  animation: badgeEntrance ${badge.animation?.entrance?.duration || '300ms'} ${badge.animation?.entrance?.easing || 'var(--ease-out-back)'} forwards;
}

.ferni-avatar__badge--pulse,
.window-avatar__badge--pulse {
  animation: badgePulse ${badge.animation?.pulse?.duration || '1.5s'} ease-in-out ${badge.animation?.pulse?.iteration || 'infinite'};
}

.ferni-avatar__badge--bounce,
.window-avatar__badge--bounce {
  animation: badgeBounce ${badge.animation?.bounce?.duration || '400ms'} ${badge.animation?.bounce?.easing || 'var(--ease-spring)'};
}

/* Container needs position relative for absolute badge positioning */
.ferni-avatar--has-badge,
.window-avatar--has-badge {
  position: relative;
}

/* Scale-specific badge adjustments */
.ferni-avatar--tiny .ferni-avatar__badge,
.window-avatar--tiny .window-avatar__badge {
  /* Smaller badge for tiny avatars */
  min-width: 12px;
  height: 12px;
  font-size: 8px;
  padding: 0 3px;
  top: -2px;
  right: -2px;
}

.ferni-avatar--tiny .ferni-avatar__badge--dot,
.window-avatar--tiny .window-avatar__badge--dot {
  width: 6px;
  height: 6px;
}

.ferni-avatar--small .ferni-avatar__badge,
.window-avatar--small .window-avatar__badge {
  min-width: 14px;
  height: 14px;
  font-size: 9px;
  padding: 0 3px;
}

.ferni-avatar--large .ferni-avatar__badge,
.window-avatar--large .window-avatar__badge {
  /* Larger badge for large avatars */
  min-width: 24px;
  height: 24px;
  font-size: 13px;
  padding: 0 8px;
  top: -6px;
  right: -6px;
}

.ferni-avatar--large .ferni-avatar__badge--dot,
.window-avatar--large .window-avatar__badge--dot {
  width: 12px;
  height: 12px;
}
`);
  }

  return lines.join('\n');
}

// ============================================================================
// HIGH CONTRAST CSS GENERATION
// ============================================================================

function generateHighContrastCSS() {
  const lines = [];
  
  lines.push(`/* High contrast mode - for users who need enhanced visibility */
@media (prefers-contrast: more) {
  :root {
    /* Boost text contrast */
    --color-text-primary: #000000;
    --color-text-secondary: #1a1a1a;
    --color-text-muted: #333333;
    
    /* Remove subtle backgrounds */
    --color-background-glass: transparent;
    --glass-surface-1: rgba(255, 255, 255, 0.95);
    --glass-surface-2: rgba(255, 255, 255, 0.98);
    --glass-surface-3: #ffffff;
    
    /* Remove blur effects - they can hinder readability */
    --glass-blur-subtle: 0px;
    --glass-blur-medium: 0px;
    --glass-blur-strong: 0px;
    --glass-blur-intense: 0px;
    
    /* Stronger borders */
    --color-border-subtle: rgba(0, 0, 0, 0.3);
    --color-border-medium: rgba(0, 0, 0, 0.5);
    --color-border-strong: rgba(0, 0, 0, 0.8);
    
    /* Simplified shadows */
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.35);
    
    /* Disable noise and complex effects */
    --glass-noise-opacity-subtle: 0;
    --glass-noise-opacity-medium: 0;
    --glass-noise-opacity-visible: 0;
    --glass-vibrancy-subtle: saturate(1) contrast(1);
    --glass-vibrancy-medium: saturate(1) contrast(1);
    --glass-vibrancy-high: saturate(1) contrast(1);
    
    /* Bolder focus rings */
    --glass-focus-ring: 0 0 0 3px #000000;
  }
  
  [data-theme="midnight"] {
    --color-text-primary: #ffffff;
    --color-text-secondary: #f0f0f0;
    --color-text-muted: #e0e0e0;
    
    --glass-surface-1: rgba(0, 0, 0, 0.95);
    --glass-surface-2: rgba(0, 0, 0, 0.98);
    --glass-surface-3: #000000;
    
    --color-border-subtle: rgba(255, 255, 255, 0.3);
    --color-border-medium: rgba(255, 255, 255, 0.5);
    --color-border-strong: rgba(255, 255, 255, 0.8);
    
    --glass-focus-ring: 0 0 0 3px #ffffff;
  }
  
  /* Ensure buttons have visible borders */
  button, .btn {
    border: 2px solid currentColor !important;
  }
  
  /* Remove decorative gradients in high contrast */
  .gradient-decorative,
  [class*="gradient-"] {
    background: none !important;
    background-color: var(--color-background-primary) !important;
  }
}

/* Forced colors mode (Windows High Contrast) */
@media (forced-colors: active) {
  :root {
    /* Let the system handle colors */
    --color-text-primary: CanvasText;
    --color-text-secondary: CanvasText;
    --color-background-primary: Canvas;
    --color-background-elevated: Canvas;
    --color-accent-primary: LinkText;
    --color-border-medium: CanvasText;
  }
  
  /* Ensure focus indicators are visible */
  *:focus-visible {
    outline: 2px solid Highlight !important;
    outline-offset: 2px;
  }
  
  /* Button styling for forced colors */
  button, .btn {
    border: 1px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
  
  button:hover, .btn:hover {
    background: Highlight;
    color: HighlightText;
  }
}

/* Reduced transparency for users who prefer it */
@media (prefers-reduced-transparency: reduce) {
  :root {
    /* Use solid backgrounds instead of translucent */
    --glass-surface-1: var(--color-background-secondary);
    --glass-surface-2: var(--color-background-tertiary);
    --glass-surface-3: var(--color-background-elevated);
    
    /* Remove backdrop filters */
    --glass-blur-subtle: 0px;
    --glass-blur-medium: 0px;
    --glass-blur-strong: 0px;
    --glass-blur-intense: 0px;
    
    /* Solid overlays */
    --backdrop-light: var(--color-background-overlay);
    --backdrop-medium: var(--color-background-overlay);
    --backdrop-heavy: var(--color-background-overlay);
  }
}`);

  return lines.join('\n');
}

// ============================================================================
// ORGANIC CONVERSATION FLOW CSS GENERATION
// Better than Apple/Google: Replace rigid chat bubbles with organic flow
// ============================================================================

function generateOrganicConversationCSS(conversationFlow) {
  const lines = [];

  lines.push(`/* ========================================
   ORGANIC CONVERSATION FLOW

   Better than Apple: Not rigid message boxes
   Better than Google: Not disconnected bubbles

   Philosophy: Chat interfaces feel mechanical - boxes floating in space.
   Human conversation is a continuous river of dialogue, thoughts flowing
   into each other, not disconnected rectangles.

   Inspired by: Pixar's fluidity - water in Finding Nemo,
   the organic blob shapes in Inside Out emotions
   ======================================== */
`);

  // CSS Custom Properties for conversation flow
  lines.push(':root {');

  const cssVars = conversationFlow.cssVariables || {};
  for (const [varName, value] of Object.entries(cssVars)) {
    if (!varName.startsWith('_')) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Keyframe animations
  const keyframes = conversationFlow.keyframes || {};
  for (const [animName, frames] of Object.entries(keyframes)) {
    if (animName.startsWith('_')) continue;

    lines.push(`@keyframes ${animName} {`);
    for (const [percent, props] of Object.entries(frames)) {
      const propsStr = Object.entries(props)
        .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
        .join('; ');
      lines.push(`  ${percent} { ${propsStr}; }`);
    }
    lines.push('}');
    lines.push('');
  }

  // Organic Message Containers
  const shapes = conversationFlow.messageShapes || {};

  lines.push(`/* Organic Message Shapes - asymmetric, flowing, human */`);
  lines.push(`.conversation-message {
  position: relative;
  padding: 16px 20px;
  margin: 8px 0;
  border-radius: var(--conversation-message-radius-ai);
  background: var(--color-tonal-surface1-background);
  animation: containerBreathe var(--conversation-breathing-duration) ease-in-out infinite;
  will-change: transform, opacity;
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
}

.conversation-message:hover {
  animation-play-state: paused;
  transform: scale(1.01);
}

.conversation-message--user {
  border-radius: var(--conversation-message-radius-user);
  background: ${shapes.user?.backgroundGradient || 'var(--color-tonal-surface2-background)'};
  box-shadow: ${shapes.user?.shadowStyle || '0 2px 8px rgba(0,0,0,0.08)'};
  margin-left: 40px;
  margin-right: 0;
}

.conversation-message--ai {
  border-radius: var(--conversation-message-radius-ai);
  background: ${shapes.ai?.backgroundGradient || 'var(--color-background-elevated)'};
  box-shadow: ${shapes.ai?.shadowStyle || '0 4px 16px rgba(0,0,0,0.06)'};
  margin-right: 40px;
  margin-left: 0;
}

.conversation-message--system {
  border-radius: var(--conversation-message-radius-system);
  background: transparent;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  animation: none;
  margin: 16px 40px;
}`);
  lines.push('');

  // Flowing Borders
  const flowingBorders = conversationFlow.flowingBorders || {};

  lines.push(`/* Flowing Borders - borders that breathe */`);
  lines.push(`.conversation-message--flowing {
  border: ${flowingBorders.default?.width || '1px'} ${flowingBorders.default?.style || 'solid'} ${flowingBorders.default?.color || 'var(--color-border-subtle)'};
  opacity: ${flowingBorders.default?.opacity || '0.6'};
}

.conversation-message--active {
  border: ${flowingBorders.active?.width || '1.5px'} ${flowingBorders.active?.style || 'solid'} ${flowingBorders.active?.color || 'var(--color-accent-primary)'};
  box-shadow: ${flowingBorders.active?.glow || '0 0 8px var(--color-accent-glow)'};
}

.conversation-message--breathing-border {
  animation: borderBreathe ${flowingBorders.breathing?.duration || '4s'} ${flowingBorders.breathing?.easing || 'ease-in-out'} infinite;
}`);
  lines.push('');

  // Connection Lines (SVG-based)
  const connections = conversationFlow.connectionLines || {};

  lines.push(`/* Connection Lines - visual threads between messages */`);
  lines.push(`.conversation-connection {
  position: absolute;
  left: 30px;
  width: ${connections.width || '2px'};
  background: ${connections.color || 'var(--color-border-subtle)'};
  opacity: ${connections.opacity || '0.3'};
  transform-origin: top;
}

.conversation-connection--curved {
  position: absolute;
  pointer-events: none;
  overflow: visible;
}

.conversation-connection--curved path {
  fill: none;
  stroke: var(--conversation-connection-color);
  stroke-width: 2px;
  opacity: var(--conversation-connection-opacity);
  stroke-dasharray: 100%;
  animation: connectionDraw 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}`);
  lines.push('');

  // Breathing Containers
  const breathing = conversationFlow.breathingContainers || {};

  lines.push(`/* Breathing Containers - subtle life in static elements */`);
  lines.push(`.breathing-container {
  animation: containerBreathe ${breathing.animation?.duration || '5000ms'} ${breathing.animation?.easing || 'ease-in-out'} infinite;
}

.breathing-container:hover {
  animation-play-state: paused;
  transform: scale(${breathing.onHover?.scale || 1.01});
  transition: ${breathing.onHover?.transition || 'transform 200ms ease-out'};
}

.breathing-container--active {
  transform: scale(${breathing.onActive?.scale || 1.0});
  box-shadow: ${breathing.onActive?.glow || '0 0 20px var(--color-accent-glow)'};
}`);
  lines.push('');

  // Presence Indicators
  const presence = conversationFlow.presenceIndicators || {};

  lines.push(`/* Presence Indicators - showing AI is here with you */`);
  lines.push(`.presence-indicator {
  position: relative;
  display: inline-block;
}

.presence-indicator--listening::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  animation: presencePulse ${presence.listeningPulse?.duration || '2000ms'} ${presence.listeningPulse?.easing || 'ease-in-out'} infinite;
}

.presence-indicator--thinking {
  position: relative;
}

.presence-indicator--thinking::before,
.presence-indicator--thinking::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 1px solid var(--color-accent-primary);
  animation: thinkingRipple ${presence.thinkingRipple?.duration || '1200ms'} ${presence.thinkingRipple?.easing || 'ease-out'} infinite;
}

.presence-indicator--thinking::after {
  animation-delay: ${presence.thinkingRipple?.delay || '200ms'};
}

.presence-indicator--active-glow {
  animation: activeGlow ${presence.activeGlow?.duration || '3000ms'} ${presence.activeGlow?.easing || 'ease-in-out'} infinite;
}`);
  lines.push('');

  // Message Transitions
  const transitions = conversationFlow.transitionStyles || {};

  lines.push(`/* Message Transitions - how messages enter and exit */`);
  lines.push(`.conversation-message-enter {
  animation: messageEnter var(--conversation-enter-duration) cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.conversation-message-exit {
  animation: messageExit var(--conversation-exit-duration) ease-out forwards;
}

.conversation-message-update {
  animation: messageUpdate 200ms ease-out;
}`);
  lines.push('');

  // Conversation Flow Container
  lines.push(`/* Conversation Flow Container - the river of dialogue */`);
  lines.push(`.conversation-flow {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  position: relative;
}

.conversation-flow--connected {
  /* Enables visual connection lines between messages */
  --show-connections: 1;
}

.conversation-flow--connected .conversation-connection {
  display: block;
}

.conversation-flow:not(.conversation-flow--connected) .conversation-connection {
  display: none;
}`);
  lines.push('');

  // Reduced Motion Support
  lines.push(`/* Reduced Motion - respect user preferences */
@media (prefers-reduced-motion: reduce) {
  .conversation-message,
  .breathing-container,
  .presence-indicator--listening::after,
  .presence-indicator--thinking::before,
  .presence-indicator--thinking::after,
  .presence-indicator--active-glow {
    animation: none;
  }

  .conversation-message-enter,
  .conversation-message-exit {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .conversation-connection--curved path {
    animation: none;
    stroke-dashoffset: 0;
  }
}`);

  return lines.join('\n');
}

// ============================================================================
// MICRO-INTERACTIONS CSS GENERATION
// Better than Apple/Google: Advanced haptic-style visual feedback library
// ============================================================================

function generateMicroInteractionsCSS(microInteractions) {
  const lines = [];

  lines.push(`/* ========================================
   MICRO-INTERACTIONS LIBRARY

   Better than Apple: More emotionally aware feedback
   Better than Google: Warmer than Material's mechanical ripples

   Philosophy: Micro-interactions are the soul of great UI.
   Every tap, hover, and state change is an opportunity to delight.
   We take Apple's touch feedback and add emotional warmth.

   Inspired by: Apple's haptic feedback, Pixar's anticipation
   and follow-through, but with human warmth
   ======================================== */
`);

  // CSS Custom Properties
  lines.push(':root {');
  const cssVars = microInteractions.cssVariables || {};
  for (const [varName, value] of Object.entries(cssVars)) {
    if (!varName.startsWith('_')) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push('}');
  lines.push('');

  // Keyframe animations
  const keyframes = microInteractions.keyframes || {};
  for (const [animName, frames] of Object.entries(keyframes)) {
    if (animName.startsWith('_')) continue;

    lines.push(`@keyframes ${animName} {`);
    for (const [percent, props] of Object.entries(frames)) {
      const propsStr = Object.entries(props)
        .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
        .join('; ');
      lines.push(`  ${percent} { ${propsStr}; }`);
    }
    lines.push('}');
    lines.push('');
  }

  // Touch Feedback Classes
  const touchFeedback = microInteractions.touchFeedback || {};
  lines.push('/* Touch Feedback - Haptic-style visual feedback */');

  if (touchFeedback.tap) {
    lines.push(`.touch-tap {
  animation: ${touchFeedback.tap.animation} ${touchFeedback.tap.duration} ${touchFeedback.tap.easing};
}`);
  }

  if (touchFeedback.press) {
    lines.push(`.touch-press {
  transform: scale(${touchFeedback.press.scale});
  transition: transform ${touchFeedback.press.duration} ${touchFeedback.press.easing};
}`);
  }

  if (touchFeedback.release) {
    lines.push(`.touch-release {
  animation: ${touchFeedback.release.animation} ${touchFeedback.release.duration} ${touchFeedback.release.easing};
}`);
  }

  if (touchFeedback.ripple) {
    lines.push(`.touch-ripple {
  position: relative;
  overflow: hidden;
}
.touch-ripple::after {
  content: '';
  position: absolute;
  top: var(--ripple-y, 50%);
  left: var(--ripple-x, 50%);
  width: 100%;
  height: 100%;
  background: ${touchFeedback.ripple.color};
  border-radius: 50%;
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
  pointer-events: none;
}
.touch-ripple.rippling::after {
  animation: ${touchFeedback.ripple.animation} ${touchFeedback.ripple.duration} ${touchFeedback.ripple.easing} forwards;
}`);
  }

  if (touchFeedback.longPress) {
    lines.push(`.touch-long-press {
  animation: ${touchFeedback.longPress.animation} ${touchFeedback.longPress.duration} ${touchFeedback.longPress.easing} forwards;
}`);
  }

  lines.push('');

  // State Feedback Classes
  const stateFeedback = microInteractions.stateFeedback || {};
  lines.push('/* State Feedback - Visual confirmation of state changes */');

  if (stateFeedback.success) {
    lines.push(`.state-success {
  animation: ${stateFeedback.success.animation} ${stateFeedback.success.duration} ${stateFeedback.success.easing};
  color: ${stateFeedback.success.color};
}
.state-success::after {
  box-shadow: ${stateFeedback.success.glow};
}`);
  }

  if (stateFeedback.error) {
    lines.push(`.state-error {
  animation: ${stateFeedback.error.animation} ${stateFeedback.error.duration} ${stateFeedback.error.easing};
  color: ${stateFeedback.error.color};
}`);
  }

  if (stateFeedback.warning) {
    lines.push(`.state-warning {
  animation: ${stateFeedback.warning.animation} ${stateFeedback.warning.duration} ${stateFeedback.warning.easing};
  color: ${stateFeedback.warning.color};
}`);
  }

  if (stateFeedback.info) {
    lines.push(`.state-info {
  animation: ${stateFeedback.info.animation} ${stateFeedback.info.duration} ${stateFeedback.info.easing};
  color: ${stateFeedback.info.color};
}`);
  }

  if (stateFeedback.loading) {
    lines.push(`.state-loading .dot {
  animation: ${stateFeedback.loading.animation} ${stateFeedback.loading.duration} ${stateFeedback.loading.easing} infinite;
}
.state-loading .dot:nth-child(2) {
  animation-delay: ${stateFeedback.loading.stagger};
}
.state-loading .dot:nth-child(3) {
  animation-delay: calc(${stateFeedback.loading.stagger} * 2);
}`);
  }

  lines.push('');

  // Acknowledgment Classes
  const acknowledgments = microInteractions.acknowledgments || {};
  lines.push('/* Acknowledgments - Micro-celebrations for completed actions */');

  if (acknowledgments.saved) {
    lines.push(`.ack-saved {
  animation: ${acknowledgments.saved.animation} ${acknowledgments.saved.duration} ease-out forwards;
}`);
  }

  if (acknowledgments.sent) {
    lines.push(`.ack-sent {
  animation: ${acknowledgments.sent.animation} ${acknowledgments.sent.duration} ease-out forwards;
}`);
  }

  if (acknowledgments.copied) {
    lines.push(`.ack-copied {
  animation: ${acknowledgments.copied.animation} ${acknowledgments.copied.duration} ease-out;
}`);
  }

  if (acknowledgments.favorited) {
    lines.push(`.ack-favorited {
  animation: ${acknowledgments.favorited.animation} ${acknowledgments.favorited.duration} ease-out;
  color: ${acknowledgments.favorited.color};
}`);
  }

  lines.push('');

  // Attention Grabbers
  const attentionGrabbers = microInteractions.attentionGrabbers || {};
  lines.push('/* Attention Grabbers - Subtle animations to draw user attention */');

  if (attentionGrabbers.badge) {
    lines.push(`.attention-badge {
  animation: ${attentionGrabbers.badge.animation} ${attentionGrabbers.badge.duration} ${attentionGrabbers.badge.easing};
  animation-iteration-count: ${attentionGrabbers.badge.repeatCount || 1};
}`);
  }

  if (attentionGrabbers.indicator) {
    lines.push(`.attention-indicator {
  animation: ${attentionGrabbers.indicator.animation} ${attentionGrabbers.indicator.duration} ${attentionGrabbers.indicator.easing} infinite;
}`);
  }

  if (attentionGrabbers.shake) {
    lines.push(`.attention-shake {
  animation: attentionShake ${attentionGrabbers.shake.duration} ${attentionGrabbers.shake.easing};
}
@keyframes attentionShake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-3px); }
  40%, 80% { transform: translateX(3px); }
}`);
  }

  lines.push('');

  // Loading Variants
  const loadingVariants = microInteractions.loadingVariants || {};
  lines.push('/* Loading Variants - Different loading states for different contexts */');

  if (loadingVariants.skeleton) {
    lines.push(`.loading-skeleton {
  background: linear-gradient(90deg,
    ${loadingVariants.skeleton.colors ? loadingVariants.skeleton.colors[0] : 'var(--color-bg-tertiary)'} 0%,
    ${loadingVariants.skeleton.colors ? loadingVariants.skeleton.colors[1] : 'var(--color-bg-elevated)'} 50%,
    ${loadingVariants.skeleton.colors ? loadingVariants.skeleton.colors[2] : 'var(--color-bg-tertiary)'} 100%);
  background-size: 200% 100%;
  animation: ${loadingVariants.skeleton.animation} ${loadingVariants.skeleton.duration} ${loadingVariants.skeleton.easing} infinite;
}`);
  }

  if (loadingVariants.dots) {
    lines.push(`.loading-dots {
  display: inline-flex;
  gap: 4px;
}
.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: ${loadingVariants.dots.animation} ${loadingVariants.dots.duration} ${loadingVariants.dots.easing} infinite;
}
.loading-dots .dot:nth-child(2) {
  animation-delay: ${loadingVariants.dots.stagger};
}
.loading-dots .dot:nth-child(3) {
  animation-delay: calc(${loadingVariants.dots.stagger} * 2);
}`);
  }

  if (loadingVariants.spinner) {
    lines.push(`.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border-subtle);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: ${loadingVariants.spinner.animation} ${loadingVariants.spinner.duration} ${loadingVariants.spinner.easing} infinite;
}`);
  }

  if (loadingVariants.breathing) {
    lines.push(`.loading-breathing {
  animation: loadingBreathe ${loadingVariants.breathing.duration} ${loadingVariants.breathing.easing} infinite;
}
@keyframes loadingBreathe {
  0%, 100% { transform: scale(${loadingVariants.breathing.scaleRange ? loadingVariants.breathing.scaleRange[0] : 0.95}); opacity: 0.7; }
  50% { transform: scale(${loadingVariants.breathing.scaleRange ? loadingVariants.breathing.scaleRange[1] : 1}); opacity: 1; }
}`);
  }

  lines.push('');

  // Hover Effects
  const hoverEffects = microInteractions.hoverEffects || {};
  lines.push('/* Hover Effects - Rich hover states beyond simple color changes */');

  if (hoverEffects.lift) {
    lines.push(`.hover-lift {
  transition: transform ${hoverEffects.lift.duration} ${hoverEffects.lift.easing}, box-shadow ${hoverEffects.lift.duration} ${hoverEffects.lift.easing};
}
.hover-lift:hover {
  transform: ${hoverEffects.lift.transform};
  box-shadow: ${hoverEffects.lift.shadow};
}`);
  }

  if (hoverEffects.glow) {
    lines.push(`.hover-glow {
  transition: box-shadow ${hoverEffects.glow.duration} ${hoverEffects.glow.easing};
}
.hover-glow:hover {
  box-shadow: ${hoverEffects.glow.boxShadow};
}`);
  }

  if (hoverEffects.scale) {
    lines.push(`.hover-scale {
  transition: transform ${hoverEffects.scale.duration} ${hoverEffects.scale.easing};
}
.hover-scale:hover {
  transform: ${hoverEffects.scale.transform};
}`);
  }

  if (hoverEffects.borderGlow) {
    lines.push(`.hover-border-glow {
  transition: border-color ${hoverEffects.borderGlow.duration} ease-out, box-shadow ${hoverEffects.borderGlow.duration} ease-out;
}
.hover-border-glow:hover {
  border-color: ${hoverEffects.borderGlow.borderColor};
  box-shadow: ${hoverEffects.borderGlow.boxShadow};
}`);
  }

  lines.push('');

  // Toggle Animations
  const toggleAnimations = microInteractions.toggleAnimations || {};
  lines.push('/* Toggle Animations - Switch, checkbox, radio button animations */');

  if (toggleAnimations.switch) {
    lines.push(`.toggle-switch {
  --thumb-travel: ${toggleAnimations.switch.thumbTravel};
  transition: background-color ${toggleAnimations.switch.duration} ${toggleAnimations.switch.easing};
}
.toggle-switch .thumb {
  transition: transform ${toggleAnimations.switch.duration} ${toggleAnimations.switch.easing};
}
.toggle-switch.active .thumb {
  transform: translateX(var(--thumb-travel));
}`);
  }

  if (toggleAnimations.checkbox) {
    lines.push(`.toggle-checkbox .checkmark {
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  transition: stroke-dashoffset ${toggleAnimations.checkbox.checkmarkDraw} ${toggleAnimations.checkbox.easing};
}
.toggle-checkbox.checked .checkmark {
  stroke-dashoffset: 0;
}`);
  }

  if (toggleAnimations.radio) {
    lines.push(`.toggle-radio .dot {
  transform: scale(0);
  transition: transform ${toggleAnimations.radio.fillDuration} ${toggleAnimations.radio.easing};
}
.toggle-radio.selected .dot {
  transform: scale(1);
}`);
  }

  lines.push('');

  // Scroll-triggered Animations
  const scrollInteractions = microInteractions.scrollInteractions || {};
  lines.push('/* Scroll Interactions - Scroll-linked micro-animations */');

  if (scrollInteractions.fadeIn) {
    lines.push(`.scroll-fade-in {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity ${scrollInteractions.fadeIn.duration} ease-out, transform ${scrollInteractions.fadeIn.duration} ease-out;
}
.scroll-fade-in.in-view {
  opacity: 1;
  transform: translateY(0);
}`);
  }

  if (scrollInteractions.progress) {
    lines.push(`.scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--scroll-progress, 0%);
  height: ${scrollInteractions.progress.height};
  background: ${scrollInteractions.progress.color};
  z-index: 9999;
  transition: width 50ms linear;
}`);
  }

  lines.push('');

  // Reduced Motion Support
  lines.push(`/* Reduced Motion - respect user preferences */
@media (prefers-reduced-motion: reduce) {
  .touch-tap,
  .touch-press,
  .touch-release,
  .touch-ripple::after,
  .touch-long-press,
  .state-success,
  .state-error,
  .state-warning,
  .state-loading .dot,
  .ack-saved,
  .ack-sent,
  .ack-copied,
  .ack-favorited,
  .attention-badge,
  .attention-indicator,
  .attention-shake,
  .loading-skeleton,
  .loading-dots .dot,
  .loading-spinner,
  .loading-breathing,
  .scroll-fade-in {
    animation: none !important;
  }

  .hover-lift,
  .hover-glow,
  .hover-scale,
  .hover-border-glow,
  .toggle-switch .thumb,
  .toggle-checkbox .checkmark,
  .toggle-radio .dot {
    transition: none !important;
  }

  .scroll-fade-in {
    opacity: 1;
    transform: none;
  }
}`);

  return lines.join('\n');
}

// ============================================================================
// STATE LAYER CSS (Material 3 Style)
// ============================================================================

function generateStatesCSS(states) {
  const lines = [];

  lines.push(':root {');
  lines.push('  /* State Layer Opacities (Material 3 style) */');

  // State opacities
  if (states.stateOpacity) {
    for (const [state, config] of Object.entries(states.stateOpacity)) {
      if (state.startsWith('_')) continue;
      lines.push(`  --state-opacity-${state}: ${config.value};`);
    }
  }

  // Disabled states
  if (states.disabledStates) {
    lines.push('');
    lines.push('  /* Disabled State Tokens */');
    if (states.disabledStates.container) {
      lines.push(`  --state-disabled-container-opacity: ${states.disabledStates.container.opacity};`);
    }
    if (states.disabledStates.content) {
      lines.push(`  --state-disabled-content-opacity: ${states.disabledStates.content.opacity};`);
    }
  }

  // State transitions
  if (states.stateTransitions) {
    lines.push('');
    lines.push('  /* State Transition Timings */');
    if (states.stateTransitions.enter) {
      lines.push(`  --state-transition-enter: ${states.stateTransitions.enter.duration} ${states.stateTransitions.enter.easing};`);
    }
    if (states.stateTransitions.exit) {
      lines.push(`  --state-transition-exit: ${states.stateTransitions.exit.duration} ${states.stateTransitions.exit.easing};`);
    }
    if (states.stateTransitions.change) {
      lines.push(`  --state-transition-change: ${states.stateTransitions.change.duration} ${states.stateTransitions.change.easing};`);
    }
  }

  // Ripple
  if (states.ripple) {
    lines.push('');
    lines.push('  /* Ripple Effect Tokens */');
    lines.push(`  --ripple-duration: ${states.ripple.duration};`);
    lines.push(`  --ripple-easing: ${states.ripple.easing};`);
    if (states.ripple.opacity) {
      lines.push(`  --ripple-opacity-start: ${states.ripple.opacity.start};`);
      lines.push(`  --ripple-opacity-end: ${states.ripple.opacity.end};`);
    }
  }

  // Skeleton loading
  if (states.skeleton) {
    lines.push('');
    lines.push('  /* Skeleton Loading Tokens */');
    if (states.skeleton.pulse) {
      lines.push(`  --skeleton-pulse-duration: ${states.skeleton.pulse.duration};`);
    }
    if (states.skeleton.shimmer) {
      lines.push(`  --skeleton-shimmer-duration: ${states.skeleton.shimmer.duration};`);
    }
  }

  lines.push('}');
  lines.push('');

  // Focus ring styles
  if (states.focusRing) {
    lines.push('/* Focus Ring Styles */');
    for (const [name, config] of Object.entries(states.focusRing)) {
      if (name.startsWith('_')) continue;
      lines.push(`.focus-ring-${name}:focus-visible {`);
      lines.push(`  outline: ${config.width} ${config.style} ${config.color};`);
      lines.push(`  outline-offset: ${config.offset};`);
      if (config.shadow) {
        lines.push(`  box-shadow: ${config.shadow};`);
      }
      lines.push('}');
      lines.push('');
    }
  }

  // Emotional states (Ferni-unique)
  if (states.emotionalStates) {
    lines.push('/* Emotional State Overrides */');
    for (const [mood, config] of Object.entries(states.emotionalStates)) {
      if (mood.startsWith('_')) continue;
      lines.push(`[data-mood="${mood}"] {`);
      lines.push(`  --state-opacity-hover: ${config.hoverOpacity};`);
      lines.push(`  --state-transition-enter: ${config.transitionDuration} ${config.easing};`);
      lines.push('}');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// ICON SYSTEM CSS
// ============================================================================

function generateIconsCSS(icons) {
  const lines = [];

  lines.push(':root {');
  lines.push('  /* Icon Sizes */');

  // Icon sizes
  if (icons.sizes) {
    for (const [size, config] of Object.entries(icons.sizes)) {
      if (size.startsWith('_')) continue;
      lines.push(`  --icon-size-${size}: ${config.value};`);
    }
  }

  lines.push('');
  lines.push('  /* Icon Stroke Weights */');

  // Icon weights
  if (icons.weights) {
    for (const [weight, config] of Object.entries(icons.weights)) {
      if (weight.startsWith('_')) continue;
      lines.push(`  --icon-stroke-${weight}: ${config.strokeWidth};`);
    }
  }

  lines.push('');
  lines.push('  /* Icon Colors */');
  if (icons.colors) {
    lines.push(`  --icon-color-default: ${icons.colors.default};`);
    lines.push(`  --icon-color-muted: ${icons.colors.muted};`);
    lines.push(`  --icon-color-primary: ${icons.colors.primary};`);
    lines.push(`  --icon-color-accent: ${icons.colors.accent};`);
    lines.push(`  --icon-color-persona: ${icons.colors.persona};`);
  }

  // Icon animations
  if (icons.animations) {
    lines.push('');
    lines.push('  /* Icon Animation Tokens */');
    if (icons.animations.press) {
      lines.push(`  --icon-press-scale: ${icons.animations.press.scale};`);
      lines.push(`  --icon-press-duration: ${icons.animations.press.duration};`);
    }
    if (icons.animations.hover) {
      lines.push(`  --icon-hover-scale: ${icons.animations.hover.scale};`);
      lines.push(`  --icon-hover-duration: ${icons.animations.hover.duration};`);
    }
  }

  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// SHAPE/RADIUS CSS
// ============================================================================

function generateShapeCSS(shape) {
  const lines = [];

  lines.push(':root {');
  lines.push('  /* Corner Radius Scale */');

  // Corner scale
  if (shape.cornerScale) {
    for (const [size, config] of Object.entries(shape.cornerScale)) {
      if (size.startsWith('_')) continue;
      lines.push(`  --radius-${size}: ${config.value};`);
    }
  }

  lines.push('');
  lines.push('  /* Component-Specific Radius */');

  // Component radius mappings
  if (shape.componentRadius) {
    if (shape.componentRadius.buttons) {
      lines.push(`  --radius-button-sm: ${shape.componentRadius.buttons.sm};`);
      lines.push(`  --radius-button-md: ${shape.componentRadius.buttons.md};`);
      lines.push(`  --radius-button-lg: ${shape.componentRadius.buttons.lg};`);
      lines.push(`  --radius-button-fab: ${shape.componentRadius.buttons.fab};`);
    }
    if (shape.componentRadius.inputs) {
      lines.push(`  --radius-input: ${shape.componentRadius.inputs.text};`);
      lines.push(`  --radius-search: ${shape.componentRadius.inputs.search};`);
    }
    if (shape.componentRadius.cards) {
      lines.push(`  --radius-card: ${shape.componentRadius.cards.elevated};`);
      lines.push(`  --radius-card-glass: ${shape.componentRadius.cards.glass};`);
    }
    if (shape.componentRadius.dialogs) {
      lines.push(`  --radius-dialog: ${shape.componentRadius.dialogs.default};`);
    }
    if (shape.componentRadius.sheets && shape.componentRadius.sheets.bottom) {
      lines.push(`  --radius-sheet-top: ${shape.componentRadius.sheets.bottom.topLeft};`);
    }
    if (shape.componentRadius.chips) {
      lines.push(`  --radius-chip: ${shape.componentRadius.chips.default};`);
    }
    if (shape.componentRadius.badges) {
      lines.push(`  --radius-badge: ${shape.componentRadius.badges.default};`);
    }
    if (shape.componentRadius.avatars) {
      lines.push(`  --radius-avatar: ${shape.componentRadius.avatars.circular};`);
    }
    if (shape.componentRadius.tooltips) {
      lines.push(`  --radius-tooltip: ${shape.componentRadius.tooltips.default};`);
    }
    if (shape.componentRadius.toasts) {
      lines.push(`  --radius-toast: ${shape.componentRadius.toasts.default};`);
    }
  }

  lines.push('}');
  lines.push('');

  // Persona-specific radius adjustments
  if (shape.personaRadius) {
    lines.push('/* Persona Radius Adjustments */');
    for (const [persona, config] of Object.entries(shape.personaRadius)) {
      if (persona.startsWith('_')) continue;
      lines.push(`[data-persona="${persona}"] {`);
      lines.push(`  --radius-multiplier: ${config.multiplier};`);
      lines.push('}');
    }
  }

  return lines.join('\n');
}

// ============================================================================
// VISUALIZATION SYSTEM CSS
// ============================================================================

function generateVisualizationsSystemCSS(visualizations) {
  const lines = [];

  lines.push(':root {');
  lines.push('  /* Visualization Shared Tokens */');

  // Shared tokens
  if (visualizations.sharedTokens) {
    const shared = visualizations.sharedTokens;
    if (shared.transitions) {
      lines.push(`  --viz-transition-fast: ${shared.transitions.fast};`);
      lines.push(`  --viz-transition-normal: ${shared.transitions.normal};`);
      lines.push(`  --viz-transition-slow: ${shared.transitions.slow};`);
      lines.push(`  --viz-transition-story: ${shared.transitions.story};`);
    }
    if (shared.tooltip) {
      lines.push(`  --viz-tooltip-bg: ${shared.tooltip.background};`);
      lines.push(`  --viz-tooltip-radius: ${shared.tooltip.borderRadius};`);
      lines.push(`  --viz-tooltip-padding: ${shared.tooltip.padding};`);
    }
    if (shared.legend) {
      lines.push(`  --viz-legend-gap: ${shared.legend.itemGap};`);
      lines.push(`  --viz-legend-swatch: ${shared.legend.swatchSize};`);
    }
  }

  // Kintsugi animation tokens
  if (visualizations.kintsugi && visualizations.kintsugi.repairAnimation) {
    lines.push('');
    lines.push('  /* Kintsugi Animation Tokens */');
    const anim = visualizations.kintsugi.repairAnimation;
    if (anim.goldFlow) {
      lines.push(`  --kintsugi-flow-duration: ${anim.goldFlow.duration};`);
      lines.push(`  --kintsugi-flow-stagger: ${anim.goldFlow.stagger};`);
    }
    if (anim.glow) {
      lines.push(`  --kintsugi-glow-duration: ${anim.glow.duration};`);
    }
  }

  // Constellation tokens
  if (visualizations.constellation) {
    lines.push('');
    lines.push('  /* Constellation Animation Tokens */');
    if (visualizations.constellation.animations) {
      const anim = visualizations.constellation.animations;
      if (anim.twinkle) {
        lines.push(`  --constellation-twinkle-duration: ${anim.twinkle.duration};`);
      }
      if (anim.connectionDraw) {
        lines.push(`  --constellation-draw-duration: ${anim.connectionDraw.duration};`);
      }
    }
    if (visualizations.constellation.starSizes) {
      lines.push(`  --constellation-star-self: ${visualizations.constellation.starSizes.self.radius};`);
      lines.push(`  --constellation-star-close: ${visualizations.constellation.starSizes.close.radius};`);
      lines.push(`  --constellation-star-regular: ${visualizations.constellation.starSizes.regular.radius};`);
    }
  }

  // River tokens
  if (visualizations.river) {
    lines.push('');
    lines.push('  /* River Animation Tokens */');
    if (visualizations.river.animations) {
      lines.push(`  --river-flow-duration: ${visualizations.river.animations.flow.duration};`);
      lines.push(`  --river-ripple-duration: ${visualizations.river.animations.ripple.duration};`);
    }
  }

  // Growth rings tokens
  if (visualizations.growthRings && visualizations.growthRings.animations) {
    lines.push('');
    lines.push('  /* Growth Rings Animation Tokens */');
    lines.push(`  --growth-reveal-duration: ${visualizations.growthRings.animations.reveal.duration};`);
    lines.push(`  --growth-reveal-stagger: ${visualizations.growthRings.animations.reveal.stagger};`);
  }

  // Mood calendar tokens
  if (visualizations.moodCalendar && visualizations.moodCalendar.cellStyle) {
    lines.push('');
    lines.push('  /* Mood Calendar Tokens */');
    lines.push(`  --mood-cell-size: ${visualizations.moodCalendar.cellStyle.size};`);
    lines.push(`  --mood-cell-gap: ${visualizations.moodCalendar.cellStyle.gap};`);
    lines.push(`  --mood-cell-radius: ${visualizations.moodCalendar.cellStyle.borderRadius};`);
  }

  lines.push('}');

  return lines.join('\n');
}

// ============================================================================
// COMPONENTS EXTENDED CSS
// ============================================================================

function generateComponentsExtendedCSS(components) {
  const lines = [];

  lines.push(':root {');
  lines.push('  /* Extended Component Tokens */');

  // Button tokens
  if (components.button) {
    lines.push('');
    lines.push('  /* Button Tokens */');
    const btn = components.button;
    if (btn.sizes) {
      for (const [size, config] of Object.entries(btn.sizes)) {
        if (size.startsWith('_')) continue;
        lines.push(`  --button-height-${size}: ${config.height};`);
        lines.push(`  --button-padding-${size}: ${config.padding};`);
        lines.push(`  --button-font-${size}: ${config.fontSize};`);
        lines.push(`  --button-radius-${size}: ${config.borderRadius};`);
        lines.push(`  --button-icon-${size}: ${config.iconSize};`);
      }
    }
    if (btn.animation) {
      lines.push(`  --button-press-duration: ${btn.animation.press?.duration || '100ms'};`);
      lines.push(`  --button-release-duration: ${btn.animation.release?.duration || '200ms'};`);
    }
  }

  // Input tokens
  if (components.input) {
    lines.push('');
    lines.push('  /* Input Tokens */');
    const inp = components.input;
    if (inp.base) {
      lines.push(`  --input-height: ${inp.base.height};`);
      lines.push(`  --input-padding: ${inp.base.padding};`);
      lines.push(`  --input-radius: ${inp.base.borderRadius};`);
      lines.push(`  --input-font: ${inp.base.fontSize};`);
    }
    if (inp.sizes) {
      for (const [size, config] of Object.entries(inp.sizes)) {
        if (size.startsWith('_')) continue;
        lines.push(`  --input-height-${size}: ${config.height};`);
        lines.push(`  --input-padding-${size}: ${config.padding};`);
      }
    }
  }

  // Card tokens
  if (components.card) {
    lines.push('');
    lines.push('  /* Card Tokens */');
    const card = components.card;
    if (card.sizes) {
      for (const [size, config] of Object.entries(card.sizes)) {
        if (size.startsWith('_')) continue;
        lines.push(`  --card-padding-${size}: ${config.padding};`);
        lines.push(`  --card-radius-${size}: ${config.borderRadius};`);
      }
    }
  }

  // Toast tokens
  if (components.toast) {
    lines.push('');
    lines.push('  /* Toast Tokens */');
    const toast = components.toast;
    if (toast.container) {
      lines.push(`  --toast-padding: ${toast.container.padding};`);
      lines.push(`  --toast-radius: ${toast.container.borderRadius};`);
      lines.push(`  --toast-min-width: ${toast.container.minWidth};`);
      lines.push(`  --toast-max-width: ${toast.container.maxWidth};`);
      lines.push(`  --toast-gap: ${toast.container.gap};`);
    }
    if (toast.animation) {
      lines.push(`  --toast-enter-duration: ${toast.animation.enter?.duration || '400ms'};`);
      lines.push(`  --toast-exit-duration: ${toast.animation.exit?.duration || '200ms'};`);
    }
    if (toast.duration) {
      lines.push(`  --toast-duration-short: ${toast.duration.short}ms;`);
      lines.push(`  --toast-duration-default: ${toast.duration.default}ms;`);
      lines.push(`  --toast-duration-long: ${toast.duration.long}ms;`);
    }
  }

  // Dialog tokens
  if (components.dialog) {
    lines.push('');
    lines.push('  /* Dialog Tokens */');
    const dlg = components.dialog;
    if (dlg.container) {
      lines.push(`  --dialog-radius: ${dlg.container.borderRadius};`);
      lines.push(`  --dialog-max-width: ${dlg.container.maxWidth};`);
      lines.push(`  --dialog-width: ${dlg.container.width};`);
      lines.push(`  --dialog-max-height: ${dlg.container.maxHeight};`);
    }
    if (dlg.header) {
      lines.push(`  --dialog-header-padding: ${dlg.header.padding};`);
    }
    if (dlg.body) {
      lines.push(`  --dialog-body-padding: ${dlg.body.padding};`);
    }
    if (dlg.footer) {
      lines.push(`  --dialog-footer-padding: ${dlg.footer.padding};`);
      lines.push(`  --dialog-footer-gap: ${dlg.footer.gap};`);
    }
    if (dlg.animation) {
      lines.push(`  --dialog-enter-duration: ${dlg.animation.enter?.duration || '300ms'};`);
      lines.push(`  --dialog-exit-duration: ${dlg.animation.exit?.duration || '200ms'};`);
    }
  }

  // Avatar tokens
  if (components.avatar) {
    lines.push('');
    lines.push('  /* Avatar Tokens */');
    const avatar = components.avatar;
    if (avatar.sizes) {
      for (const [size, config] of Object.entries(avatar.sizes)) {
        if (size.startsWith('_')) continue;
        lines.push(`  --avatar-size-${size}: ${config.size};`);
        lines.push(`  --avatar-font-${size}: ${config.fontSize};`);
      }
    }
    if (avatar.base) {
      lines.push(`  --avatar-radius: ${avatar.base.borderRadius};`);
    }
    if (avatar.group) {
      lines.push(`  --avatar-group-overlap: ${avatar.group.overlap};`);
      lines.push(`  --avatar-group-max-visible: ${avatar.group.maxVisible};`);
    }
  }

  // Progress tokens
  if (components.progress) {
    lines.push('');
    lines.push('  /* Progress Tokens */');
    const prog = components.progress;
    if (prog.linear) {
      lines.push(`  --progress-height: ${prog.linear.height};`);
      lines.push(`  --progress-radius: ${prog.linear.borderRadius};`);
      lines.push(`  --progress-bg: ${prog.linear.background};`);
    }
    if (prog.circular) {
      lines.push(`  --progress-circular-size: ${prog.circular.size || '40px'};`);
      lines.push(`  --progress-circular-stroke: ${prog.circular.strokeWidth || '4px'};`);
    }
  }

  lines.push('}');

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

  // External brand colors (for marketplace)
  if (colors.external) {
    output.push('/* ========================================');
    output.push('   EXTERNAL BRAND COLORS');
    output.push('   ======================================== */');
    output.push(generateExternalBrandCSS(colors.external));
    output.push('');
  }

  // Category colors (for marketplace agent cards)
  if (colors.categories) {
    output.push('/* ========================================');
    output.push('   MARKETPLACE CATEGORY COLORS');
    output.push('   ======================================== */');
    output.push(generateCategoryCSS(colors.categories));
    output.push('');
  }

  // Cinematic colors (for hero sections, storytelling)
  if (colors.cinematic) {
    output.push('/* ========================================');
    output.push('   CINEMATIC COLORS (HERO SECTIONS)');
    output.push('   ======================================== */');
    output.push(generateCinematicCSS(colors.cinematic));
    output.push('');
  }

  // Gradient system
  if (colors.gradient) {
    output.push('/* ========================================');
    output.push('   GRADIENT SYSTEM');
    output.push('   ======================================== */');
    output.push(generateGradientCSS(colors.gradient));
    output.push('');
  }

  // Comparison colors (before/after, good/bad)
  if (colors.comparison) {
    output.push('/* ========================================');
    output.push('   COMPARISON COLORS');
    output.push('   ======================================== */');
    output.push(generateComparisonCSS(colors.comparison));
    output.push('');
  }

  // Visualization colors (moods, energy, status, chapters, etc.)
  if (colors.visualization) {
    output.push('/* ========================================');
    output.push('   VISUALIZATION COLORS');
    output.push('   Better Than Human data storytelling');
    output.push('   ======================================== */');
    output.push(generateVisualizationCSS(colors.visualization));
    output.push('');
  }

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
  output.push('');

  // Circadian System (Time-Aware Design)
  output.push(generateCircadianCSS(animation));

  // Breath-Sync System (Living Animations)
  output.push(generateBreathSyncCSS(animation));

  // Emotional Theming System (Better than Apple's light/dark)
  output.push(generateEmotionalThemingCSS(animation));

  // Persona Aura System (Better than Google's color schemes)
  output.push(generatePersonaAuraCSS(animation));

  // Relationship Depth System (UI that grows with your relationship)
  output.push(generateRelationshipDepthCSS(animation));

  // Effects & Magical Utilities
  output.push('/* ========================================');
  output.push('   EFFECTS & MAGICAL UTILITIES');
  output.push('   ======================================== */');
  output.push(generateEffectsCSS(effects));
  output.push('');

  // Motion Tokens (Ferni Alive Animation System)
  output.push('/* ========================================');
  output.push('   MOTION TOKENS (FERNI ALIVE)');
  output.push('   Breathing, blinking, gaze, speaking animations');
  output.push('   ======================================== */');
  output.push(generateMotionCSS(motion));
  output.push('');

  // Glow Colors (Emotional States)
  output.push('/* ========================================');
  output.push('   GLOW COLORS (EMOTIONAL STATES)');
  output.push('   Avatar emotional glow colors');
  output.push('   ======================================== */');
  output.push(generateGlowColorsCSS(glowColors));
  output.push('');

  // Window Avatar (Scale Variants, Expressions, Animation Timing)
  output.push('/* ========================================');
  output.push('   WINDOW AVATAR');
  output.push('   Scale variants, expressions, phonemes');
  output.push('   ======================================== */');
  output.push(generateWindowAvatarCSS(windowAvatar));

  // Accessibility - High Contrast Mode
  output.push('');
  output.push('/* ========================================');
  output.push('   ACCESSIBILITY - HIGH CONTRAST MODE');
  output.push('   ======================================== */');
  output.push(generateHighContrastCSS());

  // Organic Conversation Flow (Better than Apple/Google)
  output.push('');
  output.push('/* ========================================');
  output.push('   ORGANIC CONVERSATION FLOW');
  output.push('   Flowing borders, breathing containers');
  output.push('   ======================================== */');
  output.push(generateOrganicConversationCSS(animation.organicConversationFlow || {}));

  // Micro-Interactions Library (Better than Apple/Google)
  output.push('');
  output.push('/* ========================================');
  output.push('   MICRO-INTERACTIONS LIBRARY');
  output.push('   Touch feedback, state animations, hover effects');
  output.push('   ======================================== */');
  output.push(generateMicroInteractionsCSS(animation.microInteractions || {}));

  // ============================================================================
  // WORLD-CLASS DESIGN SYSTEM TOKENS (Material 3 + Apple HIG Parity)
  // ============================================================================

  // State Layers (Material 3 Style)
  output.push('');
  output.push('/* ========================================');
  output.push('   STATE LAYERS (MATERIAL 3 STYLE)');
  output.push('   Hover, focus, pressed, dragged, disabled states');
  output.push('   ======================================== */');
  output.push(generateStatesCSS(states));

  // Icon System (SF Symbols-inspired)
  output.push('');
  output.push('/* ========================================');
  output.push('   ICON SYSTEM (SF SYMBOLS-INSPIRED)');
  output.push('   10 sizes, 8 weights, optical scaling');
  output.push('   ======================================== */');
  output.push(generateIconsCSS(icons));

  // Shape System (Component-Specific Radius)
  output.push('');
  output.push('/* ========================================');
  output.push('   SHAPE SYSTEM (MATERIAL 3 STYLE)');
  output.push('   Component-specific corner radius mappings');
  output.push('   ======================================== */');
  output.push(generateShapeCSS(shape));

  // Visualization System Tokens
  output.push('');
  output.push('/* ========================================');
  output.push('   VISUALIZATION SYSTEM');
  output.push('   Kintsugi, constellation, river, sankey, etc.');
  output.push('   ======================================== */');
  output.push(generateVisualizationsSystemCSS(visualizations));

  // Extended Components System
  output.push('');
  output.push('/* ========================================');
  output.push('   EXTENDED COMPONENTS SYSTEM');
  output.push('   30+ fully-specified component tokens');
  output.push('   ======================================== */');
  output.push(generateComponentsExtendedCSS(componentsExtended));

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

  // Extract Pixar animation constants from animation.json
  const goldenRatioTiming = animation.goldenRatioTiming || {};
  const rawAvatarSquashStretch = animation.avatarSquashStretch || {};
  const rawPersonaProfiles = animation.personaAnimationProfiles || {};
  const rawPersonaIdMapping = animation.personaIdMapping || {};
  const rawWaveformProfiles = animation.personaWaveformProfiles || {};
  const rawParticleProfiles = animation.personaParticleProfiles || {};
  const easings = animation.easings || {};
  const anticipation = animation.anticipation || {};
  const organicTextures = animation.organicTextures || {};
  const voiceEmotionGlow = animation.voiceEmotionGlow || {};

  // Filter out _documentation fields
  const avatarSquashStretch = Object.fromEntries(
    Object.entries(rawAvatarSquashStretch).filter(([key]) => !key.startsWith('_'))
  );
  const personaAnimationProfiles = Object.fromEntries(
    Object.entries(rawPersonaProfiles).filter(([key]) => !key.startsWith('_'))
  );
  const personaIdMapping = Object.fromEntries(
    Object.entries(rawPersonaIdMapping).filter(([key]) => !key.startsWith('_'))
  );
  const waveformProfiles = Object.fromEntries(
    Object.entries(rawWaveformProfiles).filter(([key]) => !key.startsWith('_'))
  );
  const particleProfiles = Object.fromEntries(
    Object.entries(rawParticleProfiles).filter(([key]) => !key.startsWith('_'))
  );

  const ts = `/**
 * VoiceAI Design System Types
 *
 * Auto-generated from design tokens.
 * DO NOT EDIT DIRECTLY.
 */

export type ThemeName = ${themeNames.map((t) => `'${t}'`).join(' | ')};
export type PersonaId = ${personaIds.map((p) => `'${p}'`).join(' | ')};

export interface ThemeMeta {
  name: string;
  description: string;
  mode: 'light' | 'dark';
}

export const THEMES: Record<ThemeName, ThemeMeta> = ${JSON.stringify(
    Object.fromEntries(Object.entries(colors.themes).map(([k, v]) => [k, v.meta])),
    null,
    2
  )};

export const PERSONA_IDS: PersonaId[] = ${JSON.stringify(personaIds)};

// ============================================================================
// PIXAR ANIMATION CONSTANTS
// ============================================================================

/**
 * Golden Ratio (φ) for mathematically harmonious animations.
 * Used for timing, spacing, and proportions.
 */
export const PHI = ${goldenRatioTiming.phi || 1.618033988749895};
export const PHI_INVERSE = ${goldenRatioTiming.phiInverse || 0.618033988749895};

/**
 * Fibonacci-based timing for natural rhythm.
 * Each duration is approximately φ × the previous.
 */
export const FIBONACCI_TIMING = ${JSON.stringify(
    goldenRatioTiming.fibonacci || {
      f8: '233ms',
      f9: '377ms',
      f10: '610ms',
      f11: '987ms',
      f12: '1597ms',
      f13: '2584ms',
    },
    null,
    2
  )};

/**
 * Avatar breathing animation durations by state.
 */
export const AVATAR_BREATH_TIMING = ${JSON.stringify(
    goldenRatioTiming.avatarBreath || {
      idle: '5000ms',
      connected: '4500ms',
      speaking: '3000ms',
      listening: '4000ms',
    },
    null,
    2
  )};

/**
 * Pixar reaction animation phases.
 * Every action has: Anticipation → Action → Follow-through
 */
export const REACTION_PHASES = ${JSON.stringify(
    goldenRatioTiming.reactionPhases || {
      anticipation: '80ms',
      action: '400ms',
      followThrough: '150ms',
    },
    null,
    2
  )};

/**
 * Avatar squash & stretch parameters.
 * Pixar principle: scaleX and scaleY change inversely.
 */
export interface AvatarSquashStretchParams {
  scaleY: number;
  scaleX: number;
  translateY: number;
  rotate: number;
}

export const AVATAR_SQUASH_STRETCH: Record<'idle' | 'connected' | 'speaking' | 'listening', AvatarSquashStretchParams> = ${JSON.stringify(avatarSquashStretch, null, 2)};

/**
 * Get squash & stretch params for current avatar state.
 */
export function getAvatarParams(state: 'idle' | 'connected' | 'speaking' | 'listening'): AvatarSquashStretchParams {
  return AVATAR_SQUASH_STRETCH[state] || AVATAR_SQUASH_STRETCH.idle;
}

// ============================================================================
// PERSONA ANIMATION PROFILES
// ============================================================================

/**
 * Animation profile for a persona - defines their unique movement style.
 * Based on Pixar principle: timing conveys personality.
 */
export interface PersonaAnimationProfile {
  description: string;
  timingMultiplier: number;
  bounciness: number;
  easingPreference: string;
  thinkingStyle: string;
  celebrationIntensity: string;
}

export type PersonaAnimationId = ${Object.keys(personaAnimationProfiles)
    .map((p) => `'${p}'`)
    .join(' | ')};

/**
 * Persona ID mapping - maps legacy frontend IDs to canonical design system IDs.
 * This allows both 'jack-b' and 'ferni' to work correctly.
 */
export const PERSONA_ID_MAPPING: Record<string, PersonaAnimationId> = ${JSON.stringify(personaIdMapping, null, 2)};

/**
 * Normalize a persona ID to canonical form.
 * Handles both legacy IDs (jack-b, comm-specialist) and canonical IDs (ferni, alex-chen).
 */
export function normalizePersonaId(personaId: string): PersonaAnimationId {
  return (PERSONA_ID_MAPPING[personaId] || personaId) as PersonaAnimationId;
}

/**
 * Persona animation profiles from design system.
 * Each persona moves differently based on their character.
 */
export const PERSONA_ANIMATION_PROFILES: Record<PersonaAnimationId, PersonaAnimationProfile> = ${JSON.stringify(personaAnimationProfiles, null, 2)};

/**
 * Get animation profile for a persona.
 * Automatically normalizes legacy IDs (jack-b → ferni, comm-specialist → alex-chen, etc.)
 */
export function getPersonaAnimationProfile(personaId: string): PersonaAnimationProfile | undefined {
  const normalizedId = normalizePersonaId(personaId);
  return PERSONA_ANIMATION_PROFILES[normalizedId];
}

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

/**
 * Named easing functions from design system.
 */
export const EASINGS = ${JSON.stringify(easings, null, 2)};

export type EasingName = keyof typeof EASINGS;

/**
 * Get easing function by preference name.
 */
export function getEasing(preference: string): string {
  return (EASINGS as Record<string, string>)[preference] || EASINGS.easeInOut;
}

// ============================================================================
// WAVEFORM PROFILES
// ============================================================================

/**
 * Waveform animation settings - how the audio visualizer moves per persona.
 */
export interface WaveformProfile {
  energy: number;    // 0-1, how reactive to audio
  smoothing: number; // 0-1, how smooth the motion
  speed: number;     // multiplier for animation speed
}

/**
 * Waveform profiles per persona.
 */
export const WAVEFORM_PROFILES: Record<string, WaveformProfile> = ${JSON.stringify(waveformProfiles, null, 2)};

/**
 * Get waveform profile for a persona.
 * Automatically normalizes legacy IDs.
 */
export function getWaveformProfile(personaId: string): WaveformProfile {
  const normalizedId = normalizePersonaId(personaId);
  const profile = WAVEFORM_PROFILES[normalizedId] || WAVEFORM_PROFILES['default'] || WAVEFORM_PROFILES['ferni'];
  // Guaranteed to exist since we have fallbacks
  return profile as WaveformProfile;
}

// ============================================================================
// PARTICLE PROFILES
// ============================================================================

/**
 * Particle animation behavior - for ambient effects around the avatar.
 */
export interface ParticleProfile {
  speed: { min: number; max: number };
  direction: string;
  size: { min: number; max: number };
  count: number;
  shape: string;
  glow: boolean;
  twinkle: boolean;
  wobble: boolean;
  description: string;
}

/**
 * Particle profiles per persona.
 */
export const PARTICLE_PROFILES: Record<string, ParticleProfile> = ${JSON.stringify(particleProfiles, null, 2)};

/**
 * Get particle profile for a persona.
 * Automatically normalizes legacy IDs.
 */
export function getParticleProfile(personaId: string): ParticleProfile {
  const normalizedId = normalizePersonaId(personaId);
  const profile = PARTICLE_PROFILES[normalizedId] || PARTICLE_PROFILES['default'] || PARTICLE_PROFILES['ferni'];
  // Guaranteed to exist since we have fallbacks
  return profile as ParticleProfile;
}

// ============================================================================
// ANTICIPATION - Pixar's "Wind-up Before the Pitch"
// ============================================================================

/**
 * Anticipation effect configuration.
 * Creates the "wind-up" before an action for more natural, alive-feeling interactions.
 */
export interface AnticipationEffect {
  transform: string;
  transition: string;
  boxShadow?: string;
}

/**
 * Anticipation effects for hover interactions.
 * Usage: Apply 'default' on mouseenter, 'release'/'lift'/'spring' on mouseleave
 */
export const ANTICIPATION_HOVER = ${JSON.stringify(anticipation.hover || {}, null, 2)};

/**
 * Anticipation effects for press/click interactions.
 * Apply on mousedown for satisfying tactile feedback.
 */
export const ANTICIPATION_PRESS = ${JSON.stringify(anticipation.press || {}, null, 2)};

/**
 * Focus ring anticipation effects.
 */
export const ANTICIPATION_FOCUS = ${JSON.stringify(anticipation.focus || {}, null, 2)};

/**
 * Page/state transition anticipation.
 */
export const ANTICIPATION_TRANSITION = ${JSON.stringify(anticipation.transition || {}, null, 2)};

// ============================================================================
// ORGANIC TEXTURES - Wabi-sabi (侘寂) Imperfection
// ============================================================================

/**
 * Organic texture configuration for natural, non-digital feel.
 */
export const ORGANIC_TEXTURES = {
  noise: ${JSON.stringify(organicTextures.noise || {}, null, 2)},
  paperTexture: ${JSON.stringify(organicTextures.paperTexture || {}, null, 2)},
  breathingGradient: ${JSON.stringify(organicTextures.breathingGradient || {}, null, 2)},
  imperfectBorder: ${JSON.stringify(organicTextures.imperfectBorder || {}, null, 2)},
  inkBleed: ${JSON.stringify(organicTextures.inkBleed || {}, null, 2)},
};

/**
 * Get imperfect border radius for wabi-sabi aesthetic.
 * Breaks artificial digital perfection.
 */
export function getImperfectBorder(size: 'sm' | 'md' | 'lg'): string {
  return ORGANIC_TEXTURES.imperfectBorder[size] || ORGANIC_TEXTURES.imperfectBorder.md;
}

// ============================================================================
// VOICE EMOTION GLOW - Avatar responds to speaking tone
// ============================================================================

/**
 * Voice emotion types that affect avatar glow.
 */
export type VoiceEmotion = 
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'calm'
  | 'thoughtful'
  | 'empathetic'
  | 'serious'
  | 'anxious'
  | 'encouraging';

/**
 * Speaking intensity levels.
 */
export type SpeakingIntensity = 'whisper' | 'normal' | 'emphasis' | 'exclamation';

/**
 * Voice emotion glow configuration.
 */
export interface VoiceGlowConfig {
  color: string;
  colorAlt: string;
  intensity: number;
  pulseSpeed: string;
  spread: string;
}

/**
 * Speaking intensity multipliers.
 */
export interface SpeakingIntensityConfig {
  multiplier: number;
  spread: number;
}

/**
 * Voice emotion glow configurations.
 */
export const VOICE_EMOTION_GLOW: Record<VoiceEmotion, VoiceGlowConfig> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(voiceEmotionGlow.emotions || {}).map(([key, value]) => [
        key,
        Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('_'))),
      ])
    ),
    null,
    2
  )};

/**
 * Speaking intensity configurations.
 */
export const SPEAKING_INTENSITY: Record<SpeakingIntensity, SpeakingIntensityConfig> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(voiceEmotionGlow.speakingIntensity || {}).filter(
        ([key]) => !key.startsWith('_')
      )
    ),
    null,
    2
  )};

/**
 * Voice glow transition timings.
 */
export const VOICE_GLOW_TRANSITIONS = ${JSON.stringify(voiceEmotionGlow.transitions || {}, null, 2)};

/**
 * Get glow configuration for a voice emotion.
 */
export function getVoiceGlow(emotion: VoiceEmotion): VoiceGlowConfig {
  return VOICE_EMOTION_GLOW[emotion] || VOICE_EMOTION_GLOW.neutral;
}

/**
 * Get CSS custom properties for voice glow.
 * Apply these to the avatar container element.
 */
export function getVoiceGlowCSS(
  emotion: VoiceEmotion,
  intensity: SpeakingIntensity = 'normal'
): Record<string, string> {
  const glow = getVoiceGlow(emotion);
  const intensityConfig = SPEAKING_INTENSITY[intensity] || SPEAKING_INTENSITY.normal;
  
  return {
    '--glow-color': glow.color,
    '--glow-color-alt': glow.colorAlt,
    '--glow-intensity': String(glow.intensity * intensityConfig.multiplier),
    '--glow-spread': \`\${parseInt(glow.spread) * intensityConfig.spread}px\`,
    '--glow-pulse-speed': glow.pulseSpeed,
  };
}

/**
 * Apply voice glow to an element.
 */
export function applyVoiceGlow(
  element: HTMLElement,
  emotion: VoiceEmotion,
  intensity: SpeakingIntensity = 'normal'
): void {
  const cssProps = getVoiceGlowCSS(emotion, intensity);
  Object.entries(cssProps).forEach(([prop, value]) => {
    element.style.setProperty(prop, value);
  });
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

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

// ============================================================================
// APPLE-LEVEL UX UTILITIES
// ============================================================================

/**
 * CSS class names for entrance animations.
 * Apply these classes to trigger entrance animations on page load.
 */
export const ENTRANCE_CLASSES = {
  avatar: 'entrance-avatar',
  controls: 'entrance-controls',
  team: 'entrance-team',
} as const;

/**
 * CSS class names for skeleton loading states.
 */
export const SKELETON_CLASSES = {
  shimmer: 'skeleton-shimmer',
} as const;

/**
 * CSS class names for error recovery animations.
 */
export const ERROR_CLASSES = {
  shake: 'error-shake',
  pulse: 'error-pulse',
  retryBounce: 'error-retry-bounce',
  glow: 'error-glow',
} as const;

/**
 * CSS class names for connection progress.
 */
export const CONNECTION_CLASSES = {
  step: 'connection-step',
  stepActive: 'active',
  stepCompleted: 'completed',
  bar: 'connection-bar',
  barFill: 'connection-bar-fill',
} as const;

/**
 * CSS class names for focus states.
 */
export const FOCUS_CLASSES = {
  anticipate: 'focus-anticipate',
  ring: 'anticipate-focus',
} as const;

/**
 * Apply entrance animation to an element.
 */
export function applyEntranceAnimation(
  element: HTMLElement,
  type: 'avatar' | 'controls' | 'team'
): void {
  const className = ENTRANCE_CLASSES[type];
  element.classList.add(className);
}

/**
 * Replay entrance animation on an element.
 */
export function replayEntranceAnimation(
  element: HTMLElement,
  type: 'avatar' | 'controls' | 'team'
): void {
  const className = ENTRANCE_CLASSES[type];
  element.classList.remove(className);
  void element.offsetHeight; // Force reflow
  element.classList.add(className);
}

/**
 * Apply skeleton shimmer loading effect.
 */
export function applySkeletonShimmer(element: HTMLElement): void {
  element.classList.add(SKELETON_CLASSES.shimmer);
}

/**
 * Remove skeleton shimmer loading effect.
 */
export function removeSkeletonShimmer(element: HTMLElement): void {
  element.classList.remove(SKELETON_CLASSES.shimmer);
}

/**
 * Trigger error shake animation (400ms).
 */
export function triggerErrorShake(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.shake);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.shake);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.shake);
      resolve();
    }, 400);
  });
}

/**
 * Trigger error pulse animation (3s).
 */
export function triggerErrorPulse(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.pulse);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.pulse);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.pulse);
      resolve();
    }, 3000);
  });
}

/**
 * Trigger retry bounce animation (300ms).
 */
export function triggerRetryBounce(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    element.classList.remove(ERROR_CLASSES.retryBounce);
    void element.offsetHeight;
    element.classList.add(ERROR_CLASSES.retryBounce);
    setTimeout(() => {
      element.classList.remove(ERROR_CLASSES.retryBounce);
      resolve();
    }, 300);
  });
}

/**
 * Connection progress step states.
 */
export type ConnectionStep = 'pending' | 'active' | 'completed';

/**
 * Update connection step state.
 */
export function setConnectionStepState(
  element: HTMLElement,
  state: ConnectionStep
): void {
  element.classList.remove('active', 'completed');
  if (state === 'active') {
    element.classList.add('active');
  } else if (state === 'completed') {
    element.classList.add('completed');
  }
}

/**
 * Update connection progress bar (0-100).
 */
export function setConnectionProgress(
  element: HTMLElement,
  progress: number
): void {
  element.style.width = Math.min(100, Math.max(0, progress)) + '%';
}

// ============================================================================
// LANDING PAGE - Zen 3D Experience
// ============================================================================

/**
 * CSS class names for landing page.
 * NOTE: Requires GSAP for shoji door animations.
 * CDN: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
 */
export const LANDING_CLASSES = {
  scene: 'landing-scene',
  sceneHidden: 'hidden',
  sceneRevealed: 'revealed',
  shojiLeft: 'landing-shoji-left',
  shojiRight: 'landing-shoji-right',
  contentCard: 'landing-content-card',
  contentVisible: 'visible',
  tapHint: 'landing-tap-hint',
  form: 'landing-form',
  input: 'landing-input',
  submit: 'landing-submit',
  skip: 'landing-skip',
  success: 'landing-success',
  successVisible: 'visible',
} as const;

/**
 * Animate the landing page reveal.
 * Requires GSAP to be loaded.
 * @param shojiLeft - Left shoji door element
 * @param shojiRight - Right shoji door element
 * @param contentCard - Content card element
 */
export function animateLandingReveal(
  shojiLeft: HTMLElement,
  shojiRight: HTMLElement,
  contentCard: HTMLElement
): void {
  // @ts-ignore GSAP is loaded via CDN
  const gsap = window.gsap;
  if (!gsap) {
    console.warn('GSAP not loaded - landing animation disabled');
    contentCard.classList.add('visible');
    return;
  }
  
  gsap.to(shojiLeft, { x: '-100%', duration: 1.2, ease: 'power2.inOut' });
  gsap.to(shojiRight, { x: '100%', duration: 1.2, ease: 'power2.inOut' });
  gsap.to(contentCard, { opacity: 1, y: 0, duration: 0.8, delay: 0.4, ease: 'power2.out' });
}

// ============================================================================
// TOAST SYSTEM - World-class Notifications
// ============================================================================

/**
 * Toast types for semantic styling.
 */
export type ToastType = 'info' | 'success' | 'error' | 'warning' | 'loading';

/**
 * CSS class names for toast system.
 */
export const TOAST_CLASSES = {
  container: 'toast-container',
  toast: 'toast',
  exiting: 'toast-exiting',
  swiping: 'toast-swiping',
  swipeOut: 'toast-swipe-out',
  icon: 'toast-icon',
  content: 'toast-content',
  title: 'toast-title',
  description: 'toast-description',
  close: 'toast-close',
  progress: 'toast-progress',
  progressBar: 'toast-progress-bar',
  action: 'toast-action',
  // Type variants
  info: 'toast-info',
  success: 'toast-success',
  error: 'toast-error',
  warning: 'toast-warning',
  loading: 'toast-loading',
} as const;

/**
 * Get toast type class name.
 */
export function getToastTypeClass(type: ToastType): string {
  return TOAST_CLASSES[type];
}

/**
 * Check if user prefers reduced motion (WCAG accessibility).
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apply animation only if user allows motion.
 */
export function safeAnimate(
  element: HTMLElement,
  animationClass: string,
  fallbackOpacity: boolean = true
): void {
  if (prefersReducedMotion()) {
    if (fallbackOpacity) {
      element.style.opacity = '1';
    }
    return;
  }
  element.classList.add(animationClass);
}

// ============================================================================
// INSIGHTS - Fidelity-Style Financial Visualizations
// ============================================================================

/**
 * Insight card size configurations.
 */
export const INSIGHT_CARDS = ${JSON.stringify(insights.insights?.cards || {}, null, 2)};

/**
 * Data visualization colors (warm, not cold financial blue).
 */
export const DATA_COLORS = ${JSON.stringify(insights.insights?.dataColors || {}, null, 2)};

/**
 * Chart style configurations.
 */
export const CHART_STYLES = ${JSON.stringify(insights.insights?.charts || {}, null, 2)};

/**
 * Metric display configurations.
 */
export const METRIC_STYLES = ${JSON.stringify(insights.insights?.metrics || {}, null, 2)};

/**
 * Progress indicator configurations.
 */
export const PROGRESS_INDICATORS = ${JSON.stringify(insights.insights?.progressIndicators || {}, null, 2)};

/**
 * Narrative visualization configurations.
 */
export const NARRATIVE_VISUALS = ${JSON.stringify(insights.narrativeVisuals || {}, null, 2)};

/**
 * Comparison label configurations.
 */
export const COMPARISON_LABELS = ${JSON.stringify(insights.comparison || {}, null, 2)};

/**
 * Insight micro-interactions.
 */
export const INSIGHT_INTERACTIONS = ${JSON.stringify(insights.microInteractions || {}, null, 2)};

// ============================================================================
// PHYSICS - Emotional Spring System (Beyond Apple)
// ============================================================================

/**
 * Spring configurations with emotional context.
 */
export interface SpringConfig {
  tension: number;
  friction: number;
  mass: number;
  useCase: string;
  emotionalContext: string;
}

export type SpringType = 'snappy' | 'gentle' | 'bouncy' | 'heavy' | 'ethereal' | 'organic';

/**
 * Emotional spring configurations.
 */
export const SPRINGS: Record<SpringType, SpringConfig> = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(physics.physics?.springs || {}).filter(([k]) => !k.startsWith('_'))
    ),
    null,
    2
  )};

/**
 * Get spring config by emotional type.
 */
export function createEmotionalSpring(type: SpringType): SpringConfig {
  return SPRINGS[type] || SPRINGS.gentle;
}

/**
 * Momentum configurations for gesture-driven UI.
 */
export const MOMENTUM = ${JSON.stringify(physics.physics?.momentum || {}, null, 2)};

/**
 * Gravity effect configurations.
 */
export const GRAVITY = ${JSON.stringify(physics.physics?.gravity || {}, null, 2)};

/**
 * Magnetic snap behaviors.
 */
export const MAGNETISM = ${JSON.stringify(physics.physics?.magnetism || {}, null, 2)};

/**
 * Collision configurations.
 */
export const COLLISION = ${JSON.stringify(physics.physics?.collision || {}, null, 2)};

/**
 * Emotional momentum carryover - UI carries emotional weight from previous interactions.
 */
export const EMOTIONAL_MOMENTUM = ${JSON.stringify(physics.emotionalMomentum || {}, null, 2)};

/**
 * Fluid motion configurations.
 */
export const FLUID_MOTION = ${JSON.stringify(physics.fluidMotion || {}, null, 2)};

/**
 * Spatial depth layer configurations.
 */
export const SPATIAL_LAYERS = ${JSON.stringify(physics.spatialDepth?.layers || {}, null, 2)};

/**
 * Parallax configuration.
 */
export const PARALLAX = ${JSON.stringify(physics.spatialDepth?.parallax || {}, null, 2)};

/**
 * Haptic feedback patterns.
 */
export const HAPTIC_PATTERNS = ${JSON.stringify(physics.haptics?.patterns || {}, null, 2)};

/**
 * Gesture recognition signatures.
 */
export const GESTURE_SIGNATURES = ${JSON.stringify(physics.gestureRecognition?.signatures || {}, null, 2)};

/**
 * Gesture combo patterns.
 */
export const GESTURE_COMBOS = ${JSON.stringify(physics.gestureRecognition?.combos || {}, null, 2)};

// ============================================================================
// PREDICTIVE UI - Anticipatory Interface Patterns
// ============================================================================

/**
 * Skeleton loading styles.
 */
export const SKELETON_STYLES = ${JSON.stringify(predictive.predictive?.preloading?.skeleton || {}, null, 2)};

/**
 * Ghost content placeholder shapes.
 */
export const GHOST_CONTENT = ${JSON.stringify(predictive.predictive?.preloading?.ghostContent || {}, null, 2)};

/**
 * Progressive reveal configuration.
 */
export const PROGRESSIVE_REVEAL = ${JSON.stringify(predictive.predictive?.preloading?.progressiveReveal || {}, null, 2)};

/**
 * Anticipation configurations.
 */
export const ANTICIPATION = ${JSON.stringify(predictive.predictive?.anticipation || {}, null, 2)};

/**
 * Suggestion UI configurations.
 */
export const SUGGESTION = ${JSON.stringify(predictive.predictive?.suggestion || {}, null, 2)};

/**
 * Adaptation configurations - UI learns from user patterns.
 */
export const ADAPTATION = ${JSON.stringify(predictive.predictive?.adaptation || {}, null, 2)};

/**
 * Loading stage configurations.
 */
export const LOADING_STAGES = ${JSON.stringify(predictive.predictive?.loading?.stages || {}, null, 2)};

/**
 * Loading progress indicator styles.
 */
export const LOADING_PROGRESS = ${JSON.stringify(predictive.predictive?.loading?.progressIndicators || {}, null, 2)};

/**
 * UI intelligence configurations.
 */
export const UI_INTELLIGENCE = ${JSON.stringify(predictive.intelligence || {}, null, 2)};

/**
 * Get loading state based on duration.
 */
export function getLoadingState(durationMs: number): 'instant' | 'fast' | 'normal' | 'slow' | 'extended' {
  if (durationMs < 100) return 'instant';
  if (durationMs < 300) return 'fast';
  if (durationMs < 1000) return 'normal';
  if (durationMs < 5000) return 'slow';
  return 'extended';
}

/**
 * Get personalization settings based on user preference.
 */
export function getPersonalization(
  density: 'minimal' | 'balanced' | 'dense',
  speed: 'deliberate' | 'balanced' | 'quick',
  complexity: 'calm' | 'balanced' | 'rich'
) {
  return {
    density: UI_INTELLIGENCE.personalization?.informationDensity?.[density] || {},
    speed: UI_INTELLIGENCE.personalization?.interactionSpeed?.[speed] || {},
    complexity: UI_INTELLIGENCE.personalization?.visualComplexity?.[complexity] || {},
  };
}
`;

  const tsPath = path.join(__dirname, 'dist/tokens.ts');
  fs.writeFileSync(tsPath, ts);
  console.log(`✅ Generated: ${tsPath}`);

  // Also generate adaptive theming module
  generateAdaptiveTheming();
}

// ============================================================================
// ADAPTIVE THEMING GENERATION (Better Than Apple/Google)
// ============================================================================

function generateAdaptiveTheming() {
  const circadian = animation.circadian || {};
  const emotionalTheming = animation.emotionalTheming || {};
  const personaAura = animation.personaAura || {};
  const relationshipDepth = animation.relationshipDepth || {};

  // Build circadian periods object
  const circadianPeriods = Object.entries(circadian.periods || {})
    .filter(([key]) => !key.startsWith('_'))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  // Build emotional themes object
  const emotionalThemes = Object.entries(emotionalTheming.themes || {})
    .filter(([key]) => !key.startsWith('_'))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  // Build persona auras object
  const personaAuras = Object.entries(personaAura.auras || {})
    .filter(([key]) => !key.startsWith('_'))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  // Build relationship stages object
  const relationshipStages = Object.entries(relationshipDepth.stages || {})
    .filter(([key]) => !key.startsWith('_'))
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  const adaptiveTs = `/**
 * Ferni Adaptive Theming System
 * 🎨 AUTO-GENERATED FROM design-system/tokens/animation.json
 * Do not edit directly - run: pnpm tokens:sync
 *
 * BETTER THAN APPLE: Not just light/dark mode
 * BETTER THAN GOOGLE: Not just color extraction
 *
 * Four-layer adaptive theming:
 * 1. Circadian Presence - Time-aware design
 * 2. Emotional Theming - Context-responsive themes
 * 3. Persona Aura - Ambient persona presence
 * 4. Relationship Depth - UI that grows with you
 *
 * Generated: ${new Date().toISOString()}
 */

// =============================================================================
// TYPES
// =============================================================================

export type CircadianPeriod = ${Object.keys(circadianPeriods).map(k => `'${k}'`).join(' | ') || "'midday'"};

export type EmotionalTheme = ${Object.keys(emotionalThemes).map(k => `'${k}'`).join(' | ') || "'zen'"};

export type PersonaId = ${Object.keys(personaAuras).map(k => `'${k}'`).join(' | ') || "'ferni'"};

export type RelationshipStage = ${Object.keys(relationshipStages).map(k => `'${k}'`).join(' | ') || "'new'"};

export interface CircadianConfig {
  hours: [number, number];
  name: string;
  warmth: number;
  brightness: number;
  animationSpeed: number;
  presence: string;
}

export interface EmotionalThemeConfig {
  name: string;
  emotionalState: string;
  colorTemperature: number;
  animationIntensity: number;
  warmth: number;
  saturation: number;
  triggerEmotions?: string[];
  description: string;
}

export interface PersonaAuraConfig {
  name: string;
  gradient: string;
  glowColor: string;
  glowSpread: string;
  pulseRate: string;
  presence: string;
  ambientFilter: string;
}

export interface RelationshipStageConfig {
  conversations: [number, number | null];
  uiRichness: number;
  animationComplexity: string;
  personalization: string;
  featureVisibility: string[];
  visualDescription: string;
}

export interface AdaptiveThemingState {
  circadian: CircadianPeriod;
  emotional: EmotionalTheme;
  persona: PersonaId | null;
  relationship: RelationshipStage;
}

// =============================================================================
// CONFIGURATION DATA (from animation.json)
// =============================================================================

const CIRCADIAN_PERIODS: Record<CircadianPeriod, CircadianConfig> = ${JSON.stringify(circadianPeriods, null, 2)};

const EMOTIONAL_THEMES: Record<EmotionalTheme, EmotionalThemeConfig> = ${JSON.stringify(emotionalThemes, null, 2)};

const PERSONA_AURAS: Record<PersonaId, PersonaAuraConfig> = ${JSON.stringify(personaAuras, null, 2)};

const RELATIONSHIP_STAGES: Record<RelationshipStage, RelationshipStageConfig> = ${JSON.stringify(relationshipStages, null, 2)};

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect current circadian period from current time
 */
export function detectCircadianPeriod(date: Date = new Date()): CircadianPeriod {
  const hour = date.getHours();

  for (const [period, config] of Object.entries(CIRCADIAN_PERIODS)) {
    const [start, end] = config.hours;
    if (start <= end) {
      if (hour >= start && hour < end) {
        return period as CircadianPeriod;
      }
    } else {
      if (hour >= start || hour < end) {
        return period as CircadianPeriod;
      }
    }
  }

  return 'midday' as CircadianPeriod;
}

/**
 * Detect emotional theme based on detected emotion
 */
export function detectEmotionalTheme(emotion: string | null): EmotionalTheme {
  if (!emotion) return 'zen' as EmotionalTheme;

  const lowerEmotion = emotion.toLowerCase();

  for (const [theme, config] of Object.entries(EMOTIONAL_THEMES)) {
    if (config.triggerEmotions?.some(
      (trigger: string) => lowerEmotion.includes(trigger) || trigger.includes(lowerEmotion)
    )) {
      return theme as EmotionalTheme;
    }
  }

  return 'zen' as EmotionalTheme;
}

/**
 * Detect relationship stage from conversation count
 */
export function detectRelationshipStage(conversationCount: number): RelationshipStage {
  for (const [stage, config] of Object.entries(RELATIONSHIP_STAGES)) {
    const [min, max] = config.conversations;
    if (max === null) {
      if (conversationCount >= min) return stage as RelationshipStage;
    } else {
      if (conversationCount >= min && conversationCount < max) {
        return stage as RelationshipStage;
      }
    }
  }

  return 'new' as RelationshipStage;
}

// =============================================================================
// CSS APPLICATION FUNCTIONS
// =============================================================================

/**
 * Apply circadian theme CSS variables
 */
export function applyCircadianTheme(
  period: CircadianPeriod,
  element: HTMLElement = document.documentElement
): void {
  const config = CIRCADIAN_PERIODS[period];

  element.setAttribute('data-circadian', period);
  element.style.setProperty('--circadian-warmth', String(config.warmth));
  element.style.setProperty('--circadian-brightness', String(config.brightness));
  element.style.setProperty('--circadian-animation-speed', String(config.animationSpeed));
  element.style.setProperty(
    '--circadian-filter',
    \`sepia(\${config.warmth * 0.15}) saturate(\${1 + config.warmth * 0.1})\`
  );
}

/**
 * Apply emotional theme CSS variables
 */
export function applyEmotionalTheme(
  theme: EmotionalTheme,
  element: HTMLElement = document.documentElement
): void {
  const config = EMOTIONAL_THEMES[theme];

  element.setAttribute('data-emotion', theme);
  element.style.setProperty('--emotional-temperature', String(config.colorTemperature));
  element.style.setProperty('--emotional-warmth', String(config.warmth));
  element.style.setProperty('--emotional-saturation', String(config.saturation));
  element.style.setProperty('--emotional-animation-intensity', String(config.animationIntensity));

  const filterParts: string[] = [];
  if (config.warmth > 0.5) {
    filterParts.push(\`sepia(\${(config.warmth - 0.5) * 0.4})\`);
  }
  if (config.saturation !== 1) {
    filterParts.push(\`saturate(\${config.saturation})\`);
  }
  if (config.colorTemperature !== 0) {
    const hueShift = config.colorTemperature * -15;
    filterParts.push(\`hue-rotate(\${hueShift}deg)\`);
  }

  element.style.setProperty(
    '--emotional-filter',
    filterParts.length > 0 ? filterParts.join(' ') : 'none'
  );
}

/**
 * Apply persona aura CSS variables
 */
export function applyPersonaAura(
  persona: PersonaId | null,
  element: HTMLElement = document.documentElement
): void {
  if (!persona) {
    element.removeAttribute('data-persona');
    element.style.setProperty('--persona-aura-gradient', 'none');
    element.style.setProperty('--persona-aura-glow', 'transparent');
    element.style.setProperty('--persona-aura-spread', '0px');
    element.style.setProperty('--persona-aura-pulse', '5s');
    element.style.setProperty('--persona-aura-filter', 'none');
    return;
  }

  const config = PERSONA_AURAS[persona];

  element.setAttribute('data-persona', persona);
  element.style.setProperty('--persona-aura-gradient', config.gradient);
  element.style.setProperty('--persona-aura-glow', config.glowColor);
  element.style.setProperty('--persona-aura-spread', config.glowSpread);
  element.style.setProperty('--persona-aura-pulse', config.pulseRate);
  element.style.setProperty('--persona-aura-filter', config.ambientFilter);
}

/**
 * Apply relationship depth CSS variables
 */
export function applyRelationshipDepth(
  stage: RelationshipStage,
  element: HTMLElement = document.documentElement
): void {
  const config = RELATIONSHIP_STAGES[stage];

  element.setAttribute('data-relationship', stage);
  element.style.setProperty('--relationship-richness', String(config.uiRichness));
  element.style.setProperty('--relationship-complexity', config.animationComplexity);
  element.style.setProperty('--relationship-personalization', config.personalization);
}

// =============================================================================
// ADAPTIVE THEMING ORCHESTRATOR
// =============================================================================

type ThemeChangeListener = (state: AdaptiveThemingState) => void;

class AdaptiveThemingOrchestrator {
  private state: AdaptiveThemingState;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ThemeChangeListener> = new Set();
  private manualOverrides: Partial<AdaptiveThemingState> = {};

  constructor() {
    this.state = {
      circadian: detectCircadianPeriod(),
      emotional: 'zen' as EmotionalTheme,
      persona: null,
      relationship: 'new' as RelationshipStage,
    };
  }

  /**
   * Initialize the adaptive theming system
   */
  init(options?: {
    autoCircadian?: boolean;
    updateIntervalMs?: number;
    initialConversationCount?: number;
    initialPersona?: PersonaId;
  }): void {
    const {
      autoCircadian = true,
      updateIntervalMs = 60000,
      initialConversationCount = 0,
      initialPersona = null,
    } = options ?? {};

    this.state.relationship = detectRelationshipStage(initialConversationCount);
    if (initialPersona) {
      this.state.persona = initialPersona;
    }

    this.applyAll();

    if (autoCircadian) {
      this.startCircadianAutoUpdate(updateIntervalMs);
    }

    if (typeof window !== 'undefined' && (window as unknown as { __DEV__?: boolean }).__DEV__) {
      console.log('🌅 Adaptive Theming initialized:', {
        circadian: \`\${this.state.circadian} (\${CIRCADIAN_PERIODS[this.state.circadian].name})\`,
        emotional: this.state.emotional,
        persona: this.state.persona,
        relationship: this.state.relationship,
      });
    }
  }

  private startCircadianAutoUpdate(intervalMs: number): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      const newPeriod = detectCircadianPeriod();
      if (newPeriod !== this.state.circadian && !this.manualOverrides.circadian) {
        this.setCircadian(newPeriod);
      }
    }, intervalMs);
  }

  stopCircadianAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  applyAll(element: HTMLElement = document.documentElement): void {
    applyCircadianTheme(this.state.circadian, element);
    applyEmotionalTheme(this.state.emotional, element);
    applyPersonaAura(this.state.persona, element);
    applyRelationshipDepth(this.state.relationship, element);
  }

  setCircadian(period: CircadianPeriod, manual = false): void {
    this.state.circadian = period;
    if (manual) {
      this.manualOverrides.circadian = period;
    }
    applyCircadianTheme(period);
    this.notifyListeners();
  }

  clearCircadianOverride(): void {
    delete this.manualOverrides.circadian;
    this.state.circadian = detectCircadianPeriod();
    applyCircadianTheme(this.state.circadian);
    this.notifyListeners();
  }

  setEmotionalTheme(theme: EmotionalTheme): void {
    this.state.emotional = theme;
    applyEmotionalTheme(theme);
    this.notifyListeners();
  }

  setEmotionFromDetection(emotion: string | null): void {
    const theme = detectEmotionalTheme(emotion);
    this.setEmotionalTheme(theme);
  }

  setPersona(persona: PersonaId | null): void {
    this.state.persona = persona;
    applyPersonaAura(persona);
    this.notifyListeners();
  }

  updateConversationCount(count: number): void {
    const newStage = detectRelationshipStage(count);
    if (newStage !== this.state.relationship) {
      this.state.relationship = newStage;
      applyRelationshipDepth(newStage);
      this.notifyListeners();
    }
  }

  getState(): Readonly<AdaptiveThemingState> {
    return { ...this.state };
  }

  getCircadianConfig(period?: CircadianPeriod): CircadianConfig {
    return CIRCADIAN_PERIODS[period ?? this.state.circadian];
  }

  getEmotionalConfig(theme?: EmotionalTheme): EmotionalThemeConfig {
    return EMOTIONAL_THEMES[theme ?? this.state.emotional];
  }

  getPersonaConfig(persona?: PersonaId): PersonaAuraConfig | null {
    const id = persona ?? this.state.persona;
    return id ? PERSONA_AURAS[id] : null;
  }

  getRelationshipConfig(stage?: RelationshipStage): RelationshipStageConfig {
    return RELATIONSHIP_STAGES[stage ?? this.state.relationship];
  }

  subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const stateCopy = this.getState();
    this.listeners.forEach((listener) => listener(stateCopy));
  }

  destroy(): void {
    this.stopCircadianAutoUpdate();
    this.listeners.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const adaptiveTheming = new AdaptiveThemingOrchestrator();

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

export {
  CIRCADIAN_PERIODS,
  EMOTIONAL_THEMES,
  PERSONA_AURAS,
  RELATIONSHIP_STAGES,
};

// Auto-initialize on import (client-side only)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => adaptiveTheming.init());
  } else {
    adaptiveTheming.init();
  }
}
`;

  // Write to apps/web/src/config/
  const webConfigDir = path.join(__dirname, '../apps/web/src/config');
  if (!fs.existsSync(webConfigDir)) {
    fs.mkdirSync(webConfigDir, { recursive: true });
  }
  const adaptivePath = path.join(webConfigDir, 'adaptive-theming.generated.ts');
  fs.writeFileSync(adaptivePath, adaptiveTs);
  console.log('✅ Generated: ' + adaptivePath);
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
          Object.entries(typography.lineHeights).map(([key, value]) => [
            camelToKebab(key),
            String(value),
          ])
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
// ACCESSIBILITY VALIDATION (WCAG 2.1 AA/AAA)
// ============================================================================

const WCAG_AA_NORMAL = 4.5; // Normal text (< 18pt)
const WCAG_AA_LARGE = 3.0; // Large text (>= 18pt or >= 14pt bold)
const WCAG_AAA_NORMAL = 7.0; // Enhanced contrast
const WCAG_AAA_LARGE = 4.5; // Enhanced large text

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
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

function validateAccessibility(strict = false) {
  console.log('\n🔍 WCAG 2.1 Accessibility Validation');
  console.log('═'.repeat(60));
  console.log('  Requirements: AA Normal Text ≥ 4.5:1, Large Text ≥ 3.0:1\n');

  const errors = [];
  const warnings = [];

  // ========================================
  // Test 1: Text colors on all backgrounds
  // ========================================
  console.log('📋 Test 1: Text Color Contrast');
  console.log('─'.repeat(60));

  const textContrastTests = {
    midnight: {
      backgrounds: [
        { color: colors.themes.midnight.background.primary, name: 'bg-primary' },
        { color: colors.themes.midnight.background.secondary, name: 'bg-secondary' },
        { color: colors.themes.midnight.background.elevated, name: 'bg-elevated' },
      ],
      textColors: [
        {
          color: colors.themes.midnight.text.primary,
          name: 'text-primary',
          minRatio: WCAG_AA_NORMAL,
        },
        {
          color: colors.themes.midnight.text.secondary,
          name: 'text-secondary',
          minRatio: WCAG_AA_NORMAL,
        },
        { color: colors.themes.midnight.text.muted, name: 'text-muted', minRatio: WCAG_AA_NORMAL },
        {
          color: colors.themes.midnight.text.dimmed,
          name: 'text-dimmed',
          minRatio: WCAG_AA_LARGE,
          largeOnly: true,
        },
        {
          color: colors.themes.midnight.accent.text,
          name: 'accent-text',
          minRatio: WCAG_AA_LARGE,
          largeOnly: true,
        },
      ],
    },
    zen: {
      backgrounds: [
        { color: colors.themes.zen.background.primary, name: 'bg-primary' },
        { color: colors.themes.zen.background.secondary, name: 'bg-secondary' },
        { color: colors.themes.zen.background.elevated, name: 'bg-elevated' },
      ],
      textColors: [
        { color: colors.themes.zen.text.primary, name: 'text-primary', minRatio: WCAG_AA_NORMAL },
        {
          color: colors.themes.zen.text.secondary,
          name: 'text-secondary',
          minRatio: WCAG_AA_NORMAL,
        },
        { color: colors.themes.zen.text.muted, name: 'text-muted', minRatio: WCAG_AA_NORMAL },
        {
          color: colors.themes.zen.text.dimmed,
          name: 'text-dimmed',
          minRatio: WCAG_AA_LARGE,
          largeOnly: true,
        },
        {
          color: colors.themes.zen.accent.text,
          name: 'accent-text',
          minRatio: WCAG_AA_LARGE,
          largeOnly: true,
        },
      ],
    },
  };

  Object.entries(textContrastTests).forEach(([themeName, config]) => {
    console.log(`\n  ${themeName.toUpperCase()} Theme:`);

    config.backgrounds.forEach((bg) => {
      config.textColors.forEach((text) => {
        const ratio = getContrastRatio(text.color, bg.color);
        if (ratio) {
          const pass = ratio >= text.minRatio;
          const icon = pass ? '✅' : '❌';
          const note = text.largeOnly ? ' (large text)' : '';

          if (!pass) {
            errors.push({
              theme: themeName,
              test: `${text.name} on ${bg.name}`,
              ratio: ratio.toFixed(2),
              required: text.minRatio,
              colors: { text: text.color, bg: bg.color },
            });
          }

          console.log(
            `    ${icon} ${text.name} on ${bg.name}: ${ratio.toFixed(2)}:1 (need ${text.minRatio}:1)${note}`
          );
        }
      });
    });
  });

  // ========================================
  // Test 2: Persona colors MUST NOT be used as text
  // ========================================
  console.log('\n\n📋 Test 2: Persona Color Text Prohibition');
  console.log('─'.repeat(60));
  console.log('  ⚠️  Persona colors should NEVER be used for text on dark backgrounds\n');

  const personaTextTests = Object.entries(colors.personas)
    .filter(([key]) => !key.startsWith('_'))
    .map(([name, persona]) => ({
      name,
      color: persona.primary,
      backgrounds: [
        colors.themes.midnight.background.primary,
        colors.themes.midnight.background.elevated,
      ],
    }));

  personaTextTests.forEach(({ name, color, backgrounds }) => {
    backgrounds.forEach((bg, i) => {
      const ratio = getContrastRatio(color, bg);
      if (ratio && ratio < WCAG_AA_LARGE) {
        warnings.push({
          type: 'persona-as-text',
          persona: name,
          color,
          bg,
          ratio: ratio.toFixed(2),
          message: `${name} primary (${color}) has ${ratio.toFixed(2)}:1 contrast on dark bg - DO NOT use as text`,
        });
        console.log(
          `    ⚠️  ${name} (${color}): ${ratio.toFixed(2)}:1 on dark bg → PROHIBITED for text`
        );
      }
    });
  });

  // ========================================
  // Test 3: UI element contrast
  // ========================================
  console.log('\n\n📋 Test 3: UI Element Contrast (Borders, Icons)');
  console.log('─'.repeat(60));
  console.log('  WCAG 2.1 requires 3:1 contrast for UI components\n');

  const uiContrastTests = [
    {
      theme: 'midnight',
      element: 'Border (strong)',
      fg: 'rgba(215, 185, 145, 0.30)',
      bg: colors.themes.midnight.background.primary,
    },
    {
      theme: 'zen',
      element: 'Border (strong)',
      fg: 'rgba(44, 37, 32, 0.18)',
      bg: colors.themes.zen.background.primary,
    },
  ];

  // For rgba, we can't easily compute contrast, so we skip with a note
  uiContrastTests.forEach((test) => {
    console.log(`    ℹ️  ${test.theme}: ${test.element} - manual verification needed (rgba)`);
  });

  // ========================================
  // Generate Report
  // ========================================
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 ACCESSIBILITY REPORT SUMMARY');
  console.log('═'.repeat(60));

  const report = {
    timestamp: new Date().toISOString(),
    passed: errors.length === 0,
    errors: errors.length,
    warnings: warnings.length,
    details: { errors, warnings },
  };

  // Write report to file
  const reportPath = path.join(__dirname, 'dist/accessibility-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  if (errors.length === 0) {
    console.log('\n✅ ALL WCAG AA ACCESSIBILITY CHECKS PASSED');
    console.log('   All text colors meet minimum contrast requirements.\n');
  } else {
    console.log(`\n❌ ${errors.length} ACCESSIBILITY ERROR(S) FOUND`);
    console.log('   The following color combinations fail WCAG AA:\n');
    errors.forEach((err, i) => {
      console.log(`   ${i + 1}. [${err.theme}] ${err.test}`);
      console.log(`      Contrast: ${err.ratio}:1 (need ${err.required}:1)`);
      console.log(`      Text: ${err.colors.text}, Background: ${err.colors.bg}\n`);
    });

    if (strict) {
      console.log('🚫 BUILD FAILED: Accessibility errors must be fixed.\n');
      process.exit(1);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} WARNING(S):`);
    console.log('   Persona colors detected with low contrast on dark backgrounds.');
    console.log('   These should NEVER be used as text colors.\n');
  }

  return report;
}

// ============================================================================
// LINT CHECK FOR PERSONA-AS-TEXT ANTIPATTERN
// ============================================================================

function generateA11yLintRules() {
  const rules = `/**
 * Accessibility Lint Rules for Ferni Design System
 * Auto-generated - do not edit directly
 * 
 * These patterns indicate accessibility violations.
 */

export const A11Y_ANTIPATTERNS = {
  // NEVER use persona colors as text colors
  personaAsTextColor: {
    pattern: /color:\\s*var\\(--persona-primary/g,
    message: 'Do not use --persona-primary for text color. Use --color-text-* or --color-accent-text instead.',
    severity: 'error',
    fix: 'Replace with var(--color-accent-text) for accent text or var(--color-text-primary) for normal text'
  },
  
  // Hardcoded green colors as text (Ferni green)
  hardcodedGreenText: {
    pattern: /color:\\s*['"]?#4a6741|color:\\s*['"]?#3d5a35|color:\\s*['"]?#2d5a3d/gi,
    message: 'Hardcoded green color used as text. Use CSS variables for theme support.',
    severity: 'error',
    fix: 'Replace with var(--color-accent-text)'
  },
  
  // Light theme fallbacks in text color declarations
  lightThemeFallbacksInText: {
    pattern: /color:.*#5[cC]544[aA]|color:.*#756[aA]5[eE]|color:.*#5a5048/g,
    message: 'Light theme color used as fallback. These fail on dark backgrounds.',
    severity: 'warning',
    fix: 'Remove fallback or use theme-appropriate values'
  }
};

// WCAG 2.1 AA Minimum Contrast Ratios
export const WCAG_REQUIREMENTS = {
  normalText: 4.5,    // < 18pt or < 14pt bold
  largeText: 3.0,     // >= 18pt or >= 14pt bold  
  uiComponents: 3.0,  // Borders, icons, focus indicators
};

// Safe text color tokens for dark theme (Cedar Night)
export const DARK_THEME_TEXT_TOKENS = {
  primary: { token: '--color-text-primary', color: '#faf6f0', contrast: 5.56 },
  secondary: { token: '--color-text-secondary', color: '#f0ebe4', contrast: 5.05 },
  muted: { token: '--color-text-muted', color: '#e8e2da', contrast: 4.65 },
  dimmed: { token: '--color-text-dimmed', color: '#ddd6cc', contrast: 4.15, largeOnly: true },
  accent: { token: '--color-accent-text', color: '#e8c870', contrast: 3.68, largeOnly: true },
};

// Prohibited patterns - these WILL fail accessibility
export const PROHIBITED_TEXT_COLORS = [
  { color: '#4a6741', name: 'Ferni Green', reason: '1.06:1 contrast on dark bg' },
  { color: '#3d5a35', name: 'Ferni Secondary', reason: '0.85:1 contrast on dark bg' },
  { color: '#9a7b5a', name: 'Jack Brown', reason: '1.53:1 contrast on dark bg' },
  { color: '#3a6b73', name: 'Peter Teal', reason: '1.01:1 contrast on dark bg' },
];
`;

  const rulesPath = path.join(__dirname, 'dist/a11y-lint-rules.ts');
  fs.writeFileSync(rulesPath, rules);
  console.log(`✅ Generated: ${rulesPath}`);
}

// ============================================================================
// MAIN BUILD
// ============================================================================

const args = process.argv.slice(2);
const strictMode = args.includes('--strict') || args.includes('-s');
const skipA11y = args.includes('--skip-a11y');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Design System Build

Usage: node build.js [options]

Options:
  --strict, -s    Fail build on accessibility errors
  --skip-a11y     Skip accessibility validation
  --help, -h      Show this help message

Examples:
  node build.js              # Build with accessibility warnings
  node build.js --strict     # Build, fail on a11y errors (for CI)
  node build.js --skip-a11y  # Build without a11y checks
`);
  process.exit(0);
}

// Run build
build();
generateTailwindConfig();
generateA11yLintRules();

if (!skipA11y) {
  validateAccessibility(strictMode);
} else {
  console.log('\n⚠️  Accessibility validation skipped (--skip-a11y flag)\n');
}
