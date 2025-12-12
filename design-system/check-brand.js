#!/usr/bin/env node
/**
 * Brand Alignment Checker
 *
 * Validates that design tokens match brand guidelines defined in:
 * brand/FERNI-BRAND-GUIDELINES.md
 *
 * This prevents token drift from official brand spec.
 *
 * Usage:
 *   node design-system/check-brand.js
 *   npm run brand:check
 *
 * Exit codes:
 *   0 - All brand values aligned
 *   1 - Misalignment detected
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// BRAND GUIDELINES - Source of Truth
// From: brand/FERNI-BRAND-GUIDELINES.md
// ============================================================================

const BRAND_COLORS = {
  // Core brand colors (NEVER change without design review)
  accent: {
    name: 'Forest Green (CTA)',
    expected: '#3D5A45',
    tokenPath: 'themes.zen.accent.primary',
    critical: true,
  },
  paperCream: {
    name: 'Paper Cream (Background)',
    expected: '#F5F1E8',
    tokenPath: null, // Not directly in tokens - styles.css uses this
    critical: false,
  },
  naturalInk: {
    name: 'Natural Ink (Text)',
    expected: '#2C2520',
    tokenPath: 'themes.zen.text.primary',
    critical: true,
  },

  // Persona colors
  ferni: {
    name: 'Ferni Sage',
    expected: '#4a6741',
    tokenPath: 'personas.ferni.primary',
    critical: true,
  },
  jack: {
    name: 'Jack Cedar',
    expected: '#9a7b5a',
    tokenPath: 'personas.jack.primary',
    critical: true,
  },
  peter: {
    name: 'Peter Teal',
    expected: '#3a6b73',
    tokenPath: 'personas.peter.primary',
    critical: true,
  },
  alex: {
    name: 'Alex Indigo',
    expected: '#5a6b8a',
    tokenPath: 'personas.alex.primary',
    critical: true,
  },
  maya: {
    name: 'Maya Terracotta',
    expected: '#a67a6a',
    tokenPath: 'personas.maya.primary',
    critical: true,
  },
  jordan: {
    name: 'Jordan Sunset',
    expected: '#c4856a',
    tokenPath: 'personas.jordan.primary',
    critical: true,
  },
};

// ============================================================================
// TAILWIND CONFIG CHECKS
// Ensure tailwind.config.js uses CSS variables, not hardcoded values
// ============================================================================

const TAILWIND_CSS_VAR_REQUIRED = [
  'ferni',
  'jack',
  'peter',
  'alex',
  'maya',
  'jordan',
  'nayan',
  'accent',
];

// ============================================================================
// HELPERS
// ============================================================================

function getNestedValue(obj, path) {
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

function normalizeHex(hex) {
  return hex?.toLowerCase().replace(/\s/g, '');
}

function loadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

function loadTailwindConfig(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return content;
  } catch {
    return null;
  }
}

// ============================================================================
// CHECKS
// ============================================================================

function checkBrandColors(colorsJson) {
  const issues = [];
  const warnings = [];

  for (const [key, spec] of Object.entries(BRAND_COLORS)) {
    if (!spec.tokenPath) continue;

    const actual = getNestedValue(colorsJson, spec.tokenPath);
    const expected = normalizeHex(spec.expected);
    const actualNorm = normalizeHex(actual);

    if (!actual) {
      issues.push({
        type: spec.critical ? 'error' : 'warning',
        name: spec.name,
        message: `Missing in tokens: ${spec.tokenPath}`,
        expected: spec.expected,
      });
    } else if (actualNorm !== expected) {
      const item = {
        type: spec.critical ? 'error' : 'warning',
        name: spec.name,
        message: `Color mismatch`,
        expected: spec.expected,
        actual: actual,
        tokenPath: spec.tokenPath,
      };
      if (spec.critical) {
        issues.push(item);
      } else {
        warnings.push(item);
      }
    }
  }

  return { issues, warnings };
}

function checkTailwindUsesVars(tailwindContent) {
  const issues = [];

  for (const colorKey of TAILWIND_CSS_VAR_REQUIRED) {
    // Look for hardcoded hex instead of var(--color-*)
    const hardcodedPattern = new RegExp(
      `${colorKey}:\\s*\\{[^}]*DEFAULT:\\s*['"]#[0-9a-fA-F]{6}['"]`,
      'i'
    );

    const cssVarPattern = new RegExp(
      `${colorKey}:\\s*\\{[^}]*DEFAULT:\\s*['"]var\\(--color-`,
      'i'
    );

    if (hardcodedPattern.test(tailwindContent) && !cssVarPattern.test(tailwindContent)) {
      issues.push({
        type: 'error',
        name: `Tailwind ${colorKey}`,
        message: `Uses hardcoded hex instead of CSS variable`,
        suggestion: `Change to: DEFAULT: 'var(--color-${colorKey})'`,
      });
    }
  }

  return issues;
}

function checkHardcodedColorsInCSS() {
  const issues = [];
  const cssFiles = [
    'promo/ferni-website/css/styles.css',
  ];

  // Brand colors that should NEVER be hardcoded
  const forbiddenHardcodes = [
    { hex: '#3D5A45', name: 'accent', suggestion: 'var(--color-accent)' },
    { hex: '#4a6741', name: 'ferni', suggestion: 'var(--color-ferni)' },
  ];

  for (const file of cssFiles) {
    const filepath = path.join(PROJECT_ROOT, file);
    try {
      const content = fs.readFileSync(filepath, 'utf-8');

      // Skip :root variable definitions
      const nonRootContent = content.replace(/:root\s*\{[^}]*\}/gs, '');

      for (const { hex, name, suggestion } of forbiddenHardcodes) {
        const pattern = new RegExp(hex, 'gi');
        const matches = nonRootContent.match(pattern);
        if (matches && matches.length > 0) {
          issues.push({
            type: 'warning',
            name: `Hardcoded ${name} in ${file}`,
            message: `Found ${matches.length} hardcoded ${hex} values`,
            suggestion: `Use ${suggestion} instead`,
          });
        }
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  return issues;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🎨 Checking brand alignment...\n');

  let hasErrors = false;
  let hasWarnings = false;

  // Load colors.json
  const colorsPath = path.join(PROJECT_ROOT, 'design-system/tokens/colors.json');
  const colorsJson = loadJSON(colorsPath);

  if (!colorsJson) {
    console.log('❌ Could not load design-system/tokens/colors.json');
    process.exit(1);
  }

  // Check 1: Brand colors match
  console.log('📋 Check 1: Brand Color Alignment');
  console.log('─'.repeat(50));
  const { issues: colorIssues, warnings: colorWarnings } = checkBrandColors(colorsJson);

  if (colorIssues.length === 0) {
    console.log('✅ All critical brand colors match guidelines\n');
  } else {
    hasErrors = true;
    console.log('❌ Brand color mismatches:\n');
    for (const issue of colorIssues) {
      console.log(`   ${issue.name}`);
      console.log(`     Expected: ${issue.expected}`);
      console.log(`     Actual:   ${issue.actual || 'missing'}`);
      console.log(`     Path:     ${issue.tokenPath}\n`);
    }
  }

  if (colorWarnings.length > 0) {
    hasWarnings = true;
    console.log('⚠️  Non-critical color warnings:\n');
    for (const warn of colorWarnings) {
      console.log(`   ${warn.name}: ${warn.message}`);
    }
    console.log('');
  }

  // Check 2: Tailwind uses CSS variables
  console.log('📋 Check 2: Tailwind CSS Variable Usage');
  console.log('─'.repeat(50));
  const tailwindPath = path.join(PROJECT_ROOT, 'promo/ferni-website/tailwind.config.js');
  const tailwindContent = loadTailwindConfig(tailwindPath);

  if (tailwindContent) {
    const tailwindIssues = checkTailwindUsesVars(tailwindContent);
    if (tailwindIssues.length === 0) {
      console.log('✅ Tailwind config uses CSS variables\n');
    } else {
      hasErrors = true;
      console.log('❌ Tailwind config has hardcoded colors:\n');
      for (const issue of tailwindIssues) {
        console.log(`   ${issue.name}`);
        console.log(`     ${issue.message}`);
        console.log(`     ${issue.suggestion}\n`);
      }
    }
  } else {
    console.log('⚠️  Could not load tailwind.config.js\n');
    hasWarnings = true;
  }

  // Check 3: No hardcoded colors in CSS (outside :root)
  console.log('📋 Check 3: CSS Hardcoded Colors');
  console.log('─'.repeat(50));
  const cssIssues = checkHardcodedColorsInCSS();

  if (cssIssues.length === 0) {
    console.log('✅ No forbidden hardcoded colors found\n');
  } else {
    hasWarnings = true;
    console.log('⚠️  Hardcoded colors found:\n');
    for (const issue of cssIssues) {
      console.log(`   ${issue.name}`);
      console.log(`     ${issue.message}`);
      console.log(`     ${issue.suggestion}\n`);
    }
  }

  // Summary
  console.log('═'.repeat(50));
  if (hasErrors) {
    console.log('❌ BRAND ALIGNMENT CHECK FAILED');
    console.log('\nFix the issues above, then run:');
    console.log('  npm run tokens:sync');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  Brand check passed with warnings');
    console.log('Consider addressing the warnings above.');
    process.exit(0);
  } else {
    console.log('✅ ALL BRAND CHECKS PASSED');
    process.exit(0);
  }
}

main();
