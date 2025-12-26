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

  // Effects & Magical Utilities
  output.push('/* ========================================');
  output.push('   EFFECTS & MAGICAL UTILITIES');
  output.push('   ======================================== */');
  output.push(generateEffectsCSS(effects));

  // Accessibility - High Contrast Mode
  output.push('');
  output.push('/* ========================================');
  output.push('   ACCESSIBILITY - HIGH CONTRAST MODE');
  output.push('   ======================================== */');
  output.push(generateHighContrastCSS());

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
