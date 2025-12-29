#!/usr/bin/env node
/**
 * Generate Expression Constants for Web and iOS
 *
 * Auto-generates:
 *   - apps/web/src/config/expressions.generated.ts (TypeScript types + data)
 *   - apps/web/src/config/expressions.generated.css (CSS animations + rules)
 *   - apps/ios-native/Ferni/Resources/expressions.json (iOS configuration)
 *
 * from design-system/tokens/expressions.json
 *
 * Usage:
 *   node design-system/generate-expressions.js
 *   pnpm build:expressions
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
  source: path.join(__dirname, 'tokens/expressions.json'),
  outputs: {
    typescript: path.join(PROJECT_ROOT, 'apps/web/src/config/expressions.generated.ts'),
    css: path.join(PROJECT_ROOT, 'apps/web/src/config/expressions.generated.css'),
    ios: path.join(PROJECT_ROOT, 'apps/ios-native/Ferni/Resources/expressions.json'),
  },
};

// ============================================================================
// TYPESCRIPT GENERATOR
// ============================================================================

function generateTypeScriptUnion(expressions) {
  const ids = Object.keys(expressions);
  return ids.map(id => `  | '${id}'`).join('\n');
}

function generateFamilyType(families) {
  return Object.keys(families).map(id => `  | '${id}'`).join('\n');
}

function generateExpressionData(expressions) {
  const lines = [];

  for (const [id, expr] of Object.entries(expressions)) {
    lines.push(`  '${id}': {`);
    lines.push(`    family: '${expr.family}',`);

    // Body transform
    if (expr.body?.transform) {
      lines.push(`    body: { transform: '${expr.body.transform}' },`);
    } else {
      lines.push(`    body: { transform: null },`);
    }

    // Eye white
    lines.push(`    eyeWhite: { scaleY: ${expr.eyeWhite?.scaleY ?? 1}, scaleX: ${expr.eyeWhite?.scaleX ?? 1} },`);

    // Eye overrides (for asymmetric expressions)
    if (expr.eyeLeftOverride) {
      lines.push(`    eyeLeftOverride: { scaleY: ${expr.eyeLeftOverride.scaleY}, scaleX: ${expr.eyeLeftOverride.scaleX} },`);
    } else {
      lines.push(`    eyeLeftOverride: null,`);
    }

    if (expr.eyeRightOverride) {
      lines.push(`    eyeRightOverride: { scaleY: ${expr.eyeRightOverride.scaleY}, scaleX: ${expr.eyeRightOverride.scaleX} },`);
    } else {
      lines.push(`    eyeRightOverride: null,`);
    }

    // Eyes group (gaze)
    lines.push(`    eyesGroup: { translateX: ${expr.eyesGroup?.translateX ?? 0}, translateY: ${expr.eyesGroup?.translateY ?? 0} },`);

    // Lid curves
    lines.push(`    lidTop: { curve: ${expr.lidTop?.curve ?? 0} },`);
    lines.push(`    lidBottom: { curve: ${expr.lidBottom?.curve ?? 0} },`);

    // Smile crease
    if (expr.smileCrease) {
      const opacity = expr.smileCrease.opacity ?? 0;
      const strokeWidth = expr.smileCrease.strokeWidth ?? 1;
      lines.push(`    smileCrease: { opacity: ${opacity}, strokeWidth: ${strokeWidth} },`);
    } else {
      lines.push(`    smileCrease: { opacity: 0, strokeWidth: 1 },`);
    }

    // Presence ring
    if (expr.presenceRing) {
      const opacity = expr.presenceRing.opacity ?? 0.3;
      const strokeWidth = expr.presenceRing.strokeWidth ?? 1.5;
      const scale = expr.presenceRing.scale ?? 1;
      lines.push(`    presenceRing: { opacity: ${opacity}, strokeWidth: ${strokeWidth}, scale: ${scale} },`);
    } else {
      lines.push(`    presenceRing: { opacity: 0.3, strokeWidth: 1.5, scale: 1 },`);
    }

    // Animation
    if (expr.animation) {
      lines.push(`    animation: '${expr.animation}',`);
    } else {
      lines.push(`    animation: null,`);
    }

    // Sparkle
    lines.push(`    sparkle: ${expr.sparkle ?? false},`);

    // iOS properties
    if (expr.ios) {
      lines.push(`    ios: {`);
      lines.push(`      topCutoff: ${expr.ios.topCutoff ?? 0},`);
      lines.push(`      topCurve: ${expr.ios.topCurve ?? 0},`);
      lines.push(`      bottomCutoff: ${expr.ios.bottomCutoff ?? 0},`);
      lines.push(`      bottomCurve: ${expr.ios.bottomCurve ?? 0},`);
      lines.push(`      asymmetry: ${expr.ios.asymmetry ?? 0},`);
      lines.push(`    },`);
    } else {
      lines.push(`    ios: { topCutoff: 0, topCurve: 0, bottomCutoff: 0, bottomCurve: 0, asymmetry: 0 },`);
    }

    lines.push(`  },`);
  }

  return lines.join('\n');
}

function generateMicroExpressionData(microExpressions) {
  if (!microExpressions || Object.keys(microExpressions).length === 0) {
    return '  // No micro-expressions defined';
  }

  // Map micro-expression IDs to appropriate base expressions
  const microToExpression = {
    recognition: 'attentive',
    concern: 'concerned',
    delight: 'delighted',
    warmth: 'warm',
    interest: 'interested',
    surprise: 'surprised',
  };

  const lines = [];
  for (const [id, config] of Object.entries(microExpressions)) {
    const expression = config.expression || microToExpression[id] || 'neutral';
    const returnTo = config.returnTo || 'listening';

    lines.push(`  '${id}': {`);
    lines.push(`    expression: '${expression}',`);
    lines.push(`    duration: ${config.duration || 100},`);
    lines.push(`    returnTo: '${returnTo}',`);

    // Include optional style modifiers
    if (config.eyeWhite) {
      lines.push(`    eyeWhite: { scaleY: ${config.eyeWhite.scaleY ?? 1}, scaleX: ${config.eyeWhite.scaleX ?? 1} },`);
    }
    if (config.lidTop) {
      lines.push(`    lidTop: { curve: ${config.lidTop.curve ?? 0} },`);
    }
    if (config.smileCrease) {
      lines.push(`    smileCrease: { opacity: ${config.smileCrease.opacity ?? 0} },`);
    }

    lines.push(`  },`);
  }
  return lines.join('\n');
}

function generateFamilyData(families, expressions) {
  // Build expressions array for each family from the expression data
  const familyExpressions = {};
  for (const [id, expr] of Object.entries(expressions)) {
    const family = expr.family;
    if (!familyExpressions[family]) {
      familyExpressions[family] = [];
    }
    familyExpressions[family].push(id);
  }

  const lines = [];
  for (const [id, family] of Object.entries(families)) {
    const name = family.displayName || family.name || id;
    const description = family.description || '';
    const exprs = familyExpressions[id] || [];

    lines.push(`  '${id}': {`);
    lines.push(`    name: '${name}',`);
    lines.push(`    description: '${description.replace(/'/g, "\\'")}',`);
    lines.push(`    expressions: [${exprs.map(e => `'${e}'`).join(', ')}],`);
    lines.push(`  },`);
  }
  return lines.join('\n');
}

function generateTypeScript(data) {
  const expressionIds = Object.keys(data.expressions);
  const familyIds = Object.keys(data.families || {});

  return `/**
 * Expression System - Auto-Generated
 *
 * 🎭 AUTO-GENERATED FROM design-system/tokens/expressions.json
 * Do not edit directly - run: pnpm build:expressions
 * Generated: ${new Date().toISOString()}
 *
 * 92 Luxo-style expressions organized into ${familyIds.length} families.
 * CSS transforms only - no pupils, opaque eyes with shape transforms.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * All available expression IDs (${expressionIds.length} total)
 */
export type ExpressionId =
${generateTypeScriptUnion(data.expressions)};

/**
 * Expression family categories
 */
export type ExpressionFamily =
${generateFamilyType(data.families || {})};

/**
 * Eye scale configuration for Luxo-style transforms
 */
export interface EyeScale {
  scaleY: number;
  scaleX: number;
}

/**
 * Gaze direction via translate transform
 */
export interface GazeDirection {
  translateX: number;
  translateY: number;
}

/**
 * Lid curve configuration (controls SVG path curve)
 */
export interface LidCurve {
  curve: number;
}

/**
 * Smile crease visibility
 */
export interface SmileCrease {
  opacity: number;
  strokeWidth: number;
}

/**
 * Presence ring configuration
 */
export interface PresenceRing {
  opacity: number;
  strokeWidth: number;
  scale: number;
}

/**
 * iOS-specific window avatar parameters
 */
export interface IOSExpressionConfig {
  topCutoff: number;
  topCurve: number;
  bottomCutoff: number;
  bottomCurve: number;
  asymmetry: number;
}

/**
 * Complete expression configuration
 */
export interface ExpressionConfig {
  family: ExpressionFamily;
  body: { transform: string | null };
  eyeWhite: EyeScale;
  eyeLeftOverride: EyeScale | null;
  eyeRightOverride: EyeScale | null;
  eyesGroup: GazeDirection;
  lidTop: LidCurve;
  lidBottom: LidCurve;
  smileCrease: SmileCrease;
  presenceRing: PresenceRing;
  animation: string | null;
  sparkle: boolean;
  ios: IOSExpressionConfig;
}

/**
 * Micro-expression configuration for subliminal emotional flashes.
 * These quick expressions (40-150ms) provide subliminal emotional feedback.
 */
export interface MicroExpressionConfig {
  expression: ExpressionId;
  duration: number;
  returnTo: ExpressionId;
  /** Optional eye white scaling for the micro-expression */
  eyeWhite?: { scaleY: number; scaleX: number };
  /** Optional lid curve for the micro-expression */
  lidTop?: { curve: number };
  /** Optional smile crease opacity for the micro-expression */
  smileCrease?: { opacity: number };
}

/**
 * Expression family metadata
 */
export interface ExpressionFamilyMeta {
  name: string;
  description: string;
  expressions: ExpressionId[];
}

// ============================================================================
// EXPRESSION DATA
// ============================================================================

/**
 * All ${expressionIds.length} expression configurations.
 * Use getExpression() for type-safe access.
 */
export const EXPRESSIONS: Record<ExpressionId, ExpressionConfig> = {
${generateExpressionData(data.expressions)}
};

// ============================================================================
// MICRO-EXPRESSIONS
// ============================================================================

/**
 * Micro-expressions for subliminal emotional feedback (40-150ms).
 * These are played quickly and return to a base expression.
 */
export const MICRO_EXPRESSIONS: Record<string, MicroExpressionConfig> = {
${generateMicroExpressionData(data.microExpressions)}
};

// ============================================================================
// FAMILY METADATA
// ============================================================================

/**
 * Expression families with their member expressions.
 */
export const EXPRESSION_FAMILIES: Record<ExpressionFamily, ExpressionFamilyMeta> = {
${generateFamilyData(data.families || {}, data.expressions)}
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get expression configuration by ID.
 * Returns neutral if expression not found.
 */
export function getExpression(id: ExpressionId | string): ExpressionConfig {
  return EXPRESSIONS[id as ExpressionId] ?? EXPRESSIONS.neutral;
}

/**
 * Get all expression IDs in a family.
 */
export function getExpressionsByFamily(family: ExpressionFamily): ExpressionId[] {
  return EXPRESSION_FAMILIES[family]?.expressions ?? [];
}

/**
 * Get family for an expression.
 */
export function getExpressionFamily(id: ExpressionId): ExpressionFamily {
  return EXPRESSIONS[id]?.family ?? 'core';
}

/**
 * Get micro-expression configuration.
 */
export function getMicroExpression(id: string): MicroExpressionConfig | null {
  return MICRO_EXPRESSIONS[id] ?? null;
}

/**
 * Get iOS configuration for an expression.
 */
export function getIOSConfig(id: ExpressionId | string): IOSExpressionConfig {
  const expr = EXPRESSIONS[id as ExpressionId];
  return expr?.ios ?? EXPRESSIONS.neutral.ios;
}

/**
 * Check if expression has asymmetric eyes.
 */
export function hasAsymmetricEyes(id: ExpressionId): boolean {
  const expr = EXPRESSIONS[id];
  return expr?.eyeLeftOverride !== null || expr?.eyeRightOverride !== null;
}

/**
 * Get all expression IDs as array.
 */
export function getAllExpressionIds(): ExpressionId[] {
  return Object.keys(EXPRESSIONS) as ExpressionId[];
}

/**
 * Get all family IDs as array.
 */
export function getAllFamilyIds(): ExpressionFamily[] {
  return Object.keys(EXPRESSION_FAMILIES) as ExpressionFamily[];
}
`;
}

// ============================================================================
// CSS GENERATOR
// ============================================================================

function generateCSSVariables(expressions) {
  const lines = [];

  for (const [id, expr] of Object.entries(expressions)) {
    // Eye scales
    lines.push(`  --expr-${id}-eye-scale-y: ${expr.eyeWhite?.scaleY ?? 1};`);
    lines.push(`  --expr-${id}-eye-scale-x: ${expr.eyeWhite?.scaleX ?? 1};`);

    // Lid curves
    lines.push(`  --expr-${id}-lid-top-curve: ${expr.lidTop?.curve ?? 0};`);
    lines.push(`  --expr-${id}-lid-bottom-curve: ${expr.lidBottom?.curve ?? 0};`);

    // Presence ring
    lines.push(`  --expr-${id}-presence-opacity: ${expr.presenceRing?.opacity ?? 0.3};`);
    lines.push(`  --expr-${id}-presence-stroke: ${expr.presenceRing?.strokeWidth ?? 1.5};`);

    lines.push('');
  }

  return lines.join('\n');
}

function generateCSSRules(expressions) {
  const lines = [];

  for (const [id, expr] of Object.entries(expressions)) {
    lines.push(`/* Expression: ${id} (${expr.family}) */`);
    lines.push(`.ferni-avatar[data-expression="${id}"] {`);

    if (expr.body?.transform) {
      lines.push(`  transform: ${expr.body.transform};`);
    }

    if (expr.animation) {
      lines.push(`  animation: ${expr.animation} 0.5s var(--ease-spring, cubic-bezier(0.5, 1.5, 0.5, 1));`);
    }

    lines.push(`}`);
    lines.push('');

    // Eye white transforms
    const eyeScaleY = expr.eyeWhite?.scaleY ?? 1;
    const eyeScaleX = expr.eyeWhite?.scaleX ?? 1;

    if (eyeScaleY !== 1 || eyeScaleX !== 1) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .eye-white {`);
      lines.push(`  transform: scaleY(${eyeScaleY}) scaleX(${eyeScaleX});`);
      lines.push(`}`);
      lines.push('');
    }

    // Eye overrides for asymmetric expressions
    if (expr.eyeLeftOverride) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .eye-left .eye-white {`);
      lines.push(`  transform: scaleY(${expr.eyeLeftOverride.scaleY}) scaleX(${expr.eyeLeftOverride.scaleX});`);
      lines.push(`}`);
      lines.push('');
    }

    if (expr.eyeRightOverride) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .eye-right .eye-white {`);
      lines.push(`  transform: scaleY(${expr.eyeRightOverride.scaleY}) scaleX(${expr.eyeRightOverride.scaleX});`);
      lines.push(`}`);
      lines.push('');
    }

    // Gaze direction
    const translateX = expr.eyesGroup?.translateX ?? 0;
    const translateY = expr.eyesGroup?.translateY ?? 0;
    if (translateX !== 0 || translateY !== 0) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .eyes-group {`);
      lines.push(`  transform: translate(${translateX}px, ${translateY}px);`);
      lines.push(`}`);
      lines.push('');
    }

    // Lid paths (SVG quadratic bezier curves)
    const topCurve = expr.lidTop?.curve ?? 0;
    if (topCurve !== 0) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .lid-top {`);
      lines.push(`  d: path("M 0,0 Q 50,${topCurve} 100,0 L 100,0 L 0,0 Z");`);
      lines.push(`}`);
      lines.push('');
    }

    const bottomCurve = expr.lidBottom?.curve ?? 0;
    if (bottomCurve !== 0) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .lid-bottom {`);
      lines.push(`  d: path("M 0,100 Q 50,${100 + bottomCurve} 100,100 L 100,100 L 0,100 Z");`);
      lines.push(`}`);
      lines.push('');
    }

    // Smile crease
    if (expr.smileCrease?.opacity > 0) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .smile-crease {`);
      lines.push(`  opacity: ${expr.smileCrease.opacity};`);
      if (expr.smileCrease.strokeWidth !== 1) {
        lines.push(`  stroke-width: ${expr.smileCrease.strokeWidth};`);
      }
      lines.push(`}`);
      lines.push('');
    }

    // Presence ring
    if (expr.presenceRing) {
      const opacity = expr.presenceRing.opacity ?? 0.3;
      const strokeWidth = expr.presenceRing.strokeWidth ?? 1.5;
      const scale = expr.presenceRing.scale ?? 1;

      if (opacity !== 0.3 || strokeWidth !== 1.5 || scale !== 1) {
        lines.push(`.ferni-avatar[data-expression="${id}"] .presence-ring {`);
        lines.push(`  opacity: ${opacity};`);
        lines.push(`  stroke-width: ${strokeWidth};`);
        if (scale !== 1) {
          lines.push(`  transform: scale(${scale});`);
        }
        lines.push(`}`);
        lines.push('');
      }
    }

    // Sparkle effect
    if (expr.sparkle) {
      lines.push(`.ferni-avatar[data-expression="${id}"] .sparkle-effects {`);
      lines.push(`  opacity: 1;`);
      lines.push(`  animation: sparkleFloat 2s ease-in-out infinite;`);
      lines.push(`}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateKeyframes() {
  return `
/* ============================================================================
   EXPRESSION ANIMATIONS
   ============================================================================ */

@keyframes joyfulBounce {
  0%, 100% { transform: translateY(-4px) scale(1.03); }
  50% { transform: translateY(-8px) scale(1.05); }
}

@keyframes delightedBounce {
  0% { transform: translateY(-6px) scale(1.05) rotate(-2deg); }
  25% { transform: translateY(-10px) scale(1.08) rotate(0deg); }
  50% { transform: translateY(-6px) scale(1.05) rotate(2deg); }
  75% { transform: translateY(-10px) scale(1.08) rotate(0deg); }
  100% { transform: translateY(-6px) scale(1.05) rotate(-2deg); }
}

@keyframes excitedPulse {
  0%, 100% { transform: translateY(-8px) scale(1.08); }
  50% { transform: translateY(-12px) scale(1.12); }
}

@keyframes speakPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@keyframes thinkingPulse {
  0%, 100% { transform: rotate(2deg); }
  50% { transform: rotate(-2deg); }
}

@keyframes nervousShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1px); }
  75% { transform: translateX(1px); }
}

@keyframes sadDroop {
  0%, 100% { transform: translateY(2px) rotate(-2deg); }
  50% { transform: translateY(3px) rotate(-2deg); }
}

@keyframes sleepyBob {
  0%, 100% { transform: translateY(6px) rotate(3deg); }
  50% { transform: translateY(8px) rotate(4deg); }
}

@keyframes yawnStretch {
  0% { transform: translateY(6px) scale(1); }
  50% { transform: translateY(8px) scale(1.02, 0.98); }
  100% { transform: translateY(6px) scale(1); }
}

@keyframes crazyWiggle {
  0%, 100% { transform: scale(1.1) rotate(-5deg); }
  25% { transform: scale(1.1) rotate(5deg); }
  50% { transform: scale(1.1) rotate(-3deg); }
  75% { transform: scale(1.1) rotate(3deg); }
}

@keyframes mischievousWiggle {
  0%, 100% { transform: translateY(-2px) rotate(2deg); }
  50% { transform: translateY(-2px) rotate(-2deg); }
}

@keyframes sillyBounce {
  0%, 100% { transform: translateY(-3px) rotate(-3deg); }
  33% { transform: translateY(-6px) rotate(3deg); }
  66% { transform: translateY(-3px) rotate(-3deg); }
}

@keyframes sparkleFloat {
  0%, 100% {
    opacity: 0.8;
    transform: translateY(0) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px) scale(1.1);
  }
}

@keyframes winkBlink {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.1); }
}

@keyframes eyerollArc {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-3px); }
  50% { transform: translateY(-5px) translateX(2px); }
  75% { transform: translateY(-3px); }
}

@keyframes determinedSquint {
  0%, 100% { transform: scaleY(0.65) scaleX(1.1); }
  50% { transform: scaleY(0.62) scaleX(1.12); }
}

@keyframes fierceIntensify {
  0%, 100% { transform: scaleY(0.55) scaleX(1.12); }
  50% { transform: scaleY(0.5) scaleX(1.15); }
}
`;
}

function generateCSS(data) {
  const expressionCount = Object.keys(data.expressions).length;

  return `/**
 * Expression Styles - Auto-Generated
 *
 * 🎭 AUTO-GENERATED FROM design-system/tokens/expressions.json
 * Do not edit directly - run: pnpm build:expressions
 * Generated: ${new Date().toISOString()}
 *
 * ${expressionCount} Luxo-style expression rules.
 * CSS transforms only - no pupils, opaque eyes with shape transforms.
 */

/* ============================================================================
   CSS CUSTOM PROPERTIES
   ============================================================================ */

:root {
${generateCSSVariables(data.expressions)}
}

/* ============================================================================
   EXPRESSION RULES
   ============================================================================ */

${generateCSSRules(data.expressions)}

${generateKeyframes()}
`;
}

// ============================================================================
// iOS JSON GENERATOR
// ============================================================================

function generateIOSJSON(data) {
  const iosData = {
    version: data.version,
    generated: new Date().toISOString(),
    expressions: {},
    families: data.families || {},
    microExpressions: data.microExpressions || {},
  };

  for (const [id, expr] of Object.entries(data.expressions)) {
    iosData.expressions[id] = {
      family: expr.family,
      topCutoff: expr.ios?.topCutoff ?? 0,
      topCurve: expr.ios?.topCurve ?? 0,
      bottomCutoff: expr.ios?.bottomCutoff ?? 0,
      bottomCurve: expr.ios?.bottomCurve ?? 0,
      asymmetry: expr.ios?.asymmetry ?? 0,
      animation: expr.animation ?? null,
      sparkle: expr.sparkle ?? false,
    };
  }

  return JSON.stringify(iosData, null, 2);
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

function ensureDirectoryExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`  📁 Created directory: ${dir}`);
  }
}

function build() {
  console.log('🎭 Generating expression constants from design tokens...\n');

  // Check source exists
  if (!fs.existsSync(CONFIG.source)) {
    console.error(`  ❌ Source file not found: ${CONFIG.source}`);
    console.error('     Run this from the project root or check the path.');
    process.exit(1);
  }

  // Load source
  const data = JSON.parse(fs.readFileSync(CONFIG.source, 'utf-8'));
  const expressionCount = Object.keys(data.expressions || {}).length;
  const familyCount = Object.keys(data.families || {}).length;

  console.log(`  📖 Loaded ${expressionCount} expressions in ${familyCount} families`);
  console.log('');

  // Generate TypeScript
  ensureDirectoryExists(CONFIG.outputs.typescript);
  const tsOutput = generateTypeScript(data);
  fs.writeFileSync(CONFIG.outputs.typescript, tsOutput);
  console.log(`  ✅ TypeScript: ${CONFIG.outputs.typescript}`);

  // Generate CSS
  ensureDirectoryExists(CONFIG.outputs.css);
  const cssOutput = generateCSS(data);
  fs.writeFileSync(CONFIG.outputs.css, cssOutput);
  console.log(`  ✅ CSS:        ${CONFIG.outputs.css}`);

  // Generate iOS JSON
  ensureDirectoryExists(CONFIG.outputs.ios);
  const iosOutput = generateIOSJSON(data);
  fs.writeFileSync(CONFIG.outputs.ios, iosOutput);
  console.log(`  ✅ iOS JSON:   ${CONFIG.outputs.ios}`);

  console.log('\n✅ Expression generation complete!\n');
  console.log('   Next steps:');
  console.log('   1. Import expressions.generated.ts in your UI code');
  console.log('   2. Import expressions.generated.css in your stylesheet');
  console.log('   3. Load expressions.json in iOS ExpressionLoader');
  console.log('');
}

build();
