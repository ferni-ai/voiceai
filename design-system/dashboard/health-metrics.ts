/**
 * Ferni Design System Health Metrics
 *
 * Tracks and reports on design system adoption, compliance, and quality.
 * Run with: npx ts-node design-system/dashboard/health-metrics.ts
 */

import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface HealthMetrics {
  timestamp: string;
  overall: OverallScore;
  tokenCoverage: TokenCoverageMetrics;
  brandCompliance: BrandComplianceMetrics;
  accessibility: AccessibilityMetrics;
  componentUsage: ComponentUsageMetrics;
  documentation: DocumentationMetrics;
}

interface OverallScore {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  trend: 'improving' | 'stable' | 'declining';
}

interface TokenCoverageMetrics {
  score: number;
  totalFiles: number;
  filesUsingTokens: number;
  hardcodedColors: HardcodedValue[];
  hardcodedDurations: HardcodedValue[];
  hardcodedSpacing: HardcodedValue[];
  coverage: number; // percentage
}

interface HardcodedValue {
  file: string;
  line: number;
  value: string;
  suggestion: string;
}

interface BrandComplianceMetrics {
  score: number;
  violations: BrandViolation[];
  forbiddenWordsFound: string[];
  forbiddenColorsFound: string[];
  emojiInUI: number;
}

interface BrandViolation {
  file: string;
  line: number;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

interface AccessibilityMetrics {
  score: number;
  contrastIssues: ContrastIssue[];
  missingAriaLabels: number;
  reducedMotionSupport: boolean;
  touchTargetIssues: number;
}

interface ContrastIssue {
  file: string;
  element: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
}

interface ComponentUsageMetrics {
  totalComponents: number;
  usedComponents: number;
  adoptionRate: number;
  mostUsed: ComponentUsage[];
  unused: string[];
}

interface ComponentUsage {
  name: string;
  count: number;
  files: string[];
}

interface DocumentationMetrics {
  score: number;
  totalDocs: number;
  upToDate: number;
  stale: string[];
  missing: string[];
  lastUpdated: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  paths: {
    src: ['src/**/*.ts', 'src/**/*.tsx'],
    frontend: ['apps/web/src/**/*.ts'],
    styles: ['**/*.css', '!node_modules/**'],
    docs: ['design-system/brand/**/*.md', 'docs/**/*.md'],
  },
  thresholds: {
    tokenCoverage: 90,
    brandCompliance: 95,
    accessibility: 100,
    componentAdoption: 80,
    documentation: 85,
  },
  patterns: {
    hardcodedColors: /#[0-9A-Fa-f]{6}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g,
    hardcodedDurations: /duration:\s*(\d+)(?!\s*\*\s*\w+)/g,
    hardcodedSpacing: /(?:padding|margin|gap):\s*(\d+)px/g,
    cssVariables: /var\(--[\w-]+\)/g,
    forbiddenWords: /\b(chatbot|bot|AI assistant|virtual assistant|utilize|leverage)\b/gi,
    forbiddenColors: /#(800080|9b59b6|8b5cf6|a855f7|00ff00|ff00ff)/gi,
    emojiPattern:
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu,
    componentImports: /import\s+{[^}]*}\s+from\s+['"].*\/components\/(\w+)['"]/g,
    ariaLabel: /aria-label/g,
    reducedMotion: /prefers-reduced-motion/g,
  },
};

// ============================================================================
// Analysis Functions
// ============================================================================

async function analyzeTokenCoverage(): Promise<TokenCoverageMetrics> {
  const files = await glob([...CONFIG.paths.src, ...CONFIG.paths.frontend]);
  const hardcodedColors: HardcodedValue[] = [];
  const hardcodedDurations: HardcodedValue[] = [];
  const hardcodedSpacing: HardcodedValue[] = [];

  let filesUsingTokens = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    let usesTokens = false;

    // Check for CSS variable usage
    if (CONFIG.patterns.cssVariables.test(content)) {
      usesTokens = true;
    }

    // Check for DURATION/EASING imports
    if (/import.*DURATION|import.*EASING/g.test(content)) {
      usesTokens = true;
    }

    // Find hardcoded values
    lines.forEach((line, index) => {
      // Colors
      const colorMatches = line.match(CONFIG.patterns.hardcodedColors);
      if (colorMatches) {
        colorMatches.forEach((match) => {
          // Skip if inside a CSS variable or comment
          if (
            !line.includes('var(') &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*')
          ) {
            hardcodedColors.push({
              file,
              line: index + 1,
              value: match,
              suggestion: 'Use var(--color-*) or design system token',
            });
          }
        });
      }

      // Durations
      const durationMatch = line.match(/duration:\s*(\d+)/);
      if (durationMatch && !line.includes('DURATION.')) {
        hardcodedDurations.push({
          file,
          line: index + 1,
          value: durationMatch[1],
          suggestion: 'Use DURATION.* constant from animation-constants',
        });
      }
    });

    if (usesTokens) {
      filesUsingTokens++;
    }
  }

  const coverage = files.length > 0 ? (filesUsingTokens / files.length) * 100 : 0;
  const totalViolations =
    hardcodedColors.length + hardcodedDurations.length + hardcodedSpacing.length;
  const score = Math.max(0, 100 - totalViolations * 2);

  return {
    score,
    totalFiles: files.length,
    filesUsingTokens,
    hardcodedColors: hardcodedColors.slice(0, 20), // Limit to first 20
    hardcodedDurations: hardcodedDurations.slice(0, 20),
    hardcodedSpacing: hardcodedSpacing.slice(0, 20),
    coverage,
  };
}

async function analyzeBrandCompliance(): Promise<BrandComplianceMetrics> {
  const files = await glob([...CONFIG.paths.src, ...CONFIG.paths.frontend]);
  const violations: BrandViolation[] = [];
  const forbiddenWordsFound = new Set<string>();
  const forbiddenColorsFound = new Set<string>();
  let emojiInUI = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check forbidden words
      const wordMatches = line.match(CONFIG.patterns.forbiddenWords);
      if (wordMatches) {
        wordMatches.forEach((word) => {
          forbiddenWordsFound.add(word.toLowerCase());
          violations.push({
            file,
            line: index + 1,
            rule: 'forbidden-word',
            message: `Forbidden word found: "${word}"`,
            severity: 'error',
          });
        });
      }

      // Check forbidden colors
      const colorMatches = line.match(CONFIG.patterns.forbiddenColors);
      if (colorMatches) {
        colorMatches.forEach((color) => {
          forbiddenColorsFound.add(color);
          violations.push({
            file,
            line: index + 1,
            rule: 'forbidden-color',
            message: `Forbidden color found: "${color}" (purple/neon)`,
            severity: 'error',
          });
        });
      }

      // Check emoji in UI files (not markdown)
      if (!file.endsWith('.md')) {
        const emojiMatches = line.match(CONFIG.patterns.emojiPattern);
        if (emojiMatches) {
          emojiInUI += emojiMatches.length;
        }
      }
    });
  }

  const score = Math.max(0, 100 - violations.length * 5);

  return {
    score,
    violations: violations.slice(0, 50),
    forbiddenWordsFound: Array.from(forbiddenWordsFound),
    forbiddenColorsFound: Array.from(forbiddenColorsFound),
    emojiInUI,
  };
}

async function analyzeAccessibility(): Promise<AccessibilityMetrics> {
  const files = await glob([...CONFIG.paths.src, ...CONFIG.paths.frontend]);
  const contrastIssues: ContrastIssue[] = [];
  let missingAriaLabels = 0;
  let hasReducedMotionSupport = false;
  let touchTargetIssues = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check for reduced motion support
    if (CONFIG.patterns.reducedMotion.test(content)) {
      hasReducedMotionSupport = true;
    }

    // Check for buttons without aria-label
    const buttonMatches = content.match(/<button[^>]*>/g) || [];
    buttonMatches.forEach((button) => {
      if (!button.includes('aria-label') && !button.includes('aria-labelledby')) {
        missingAriaLabels++;
      }
    });

    // Check for small touch targets (simplified check)
    const sizeMatches = content.match(/(?:width|height):\s*(\d+)px/g) || [];
    sizeMatches.forEach((match) => {
      const size = parseInt(match.match(/\d+/)?.[0] || '0', 10);
      if (size > 0 && size < 44) {
        touchTargetIssues++;
      }
    });
  }

  const score = Math.max(
    0,
    100 - missingAriaLabels * 2 - touchTargetIssues * 1 - (hasReducedMotionSupport ? 0 : 10)
  );

  return {
    score,
    contrastIssues,
    missingAriaLabels,
    reducedMotionSupport: hasReducedMotionSupport,
    touchTargetIssues,
  };
}

async function analyzeComponentUsage(): Promise<ComponentUsageMetrics> {
  const files = await glob([...CONFIG.paths.src, ...CONFIG.paths.frontend]);
  const componentUsage: Map<string, { count: number; files: string[] }> = new Map();

  // Known design system components
  const knownComponents = [
    'Avatar',
    'Button',
    'Card',
    'Dialog',
    'Input',
    'Modal',
    'Toast',
    'Waveform',
    'PersonaCard',
    'ProgressRing',
    'StatCard',
    'StreakIndicator',
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    knownComponents.forEach((component) => {
      const regex = new RegExp(`<${component}[\\s/>]|from.*${component}`, 'g');
      const matches = content.match(regex);
      if (matches) {
        const existing = componentUsage.get(component) || { count: 0, files: [] };
        existing.count += matches.length;
        if (!existing.files.includes(file)) {
          existing.files.push(file);
        }
        componentUsage.set(component, existing);
      }
    });
  }

  const usedComponents = componentUsage.size;
  const unused = knownComponents.filter((c) => !componentUsage.has(c));

  const mostUsed: ComponentUsage[] = Array.from(componentUsage.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const adoptionRate = (usedComponents / knownComponents.length) * 100;

  return {
    totalComponents: knownComponents.length,
    usedComponents,
    adoptionRate,
    mostUsed,
    unused,
  };
}

async function analyzeDocumentation(): Promise<DocumentationMetrics> {
  const docFiles = await glob(CONFIG.paths.docs);
  const stale: string[] = [];
  const missing: string[] = [];
  let latestUpdate = new Date(0);

  const expectedDocs = [
    'FERNI-BRAND-GUIDELINES.md',
    'FERNI-SCREEN-GUIDELINES.md',
    'BRAND-VOICE-GUIDE.md',
    'COMPONENT-DECISION-TREES.md',
    'BETTER-THAN-HUMAN.md',
  ];

  for (const file of docFiles) {
    const stats = fs.statSync(file);
    const daysSinceUpdate = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 30) {
      stale.push(file);
    }

    if (stats.mtime > latestUpdate) {
      latestUpdate = stats.mtime;
    }
  }

  expectedDocs.forEach((doc) => {
    const found = docFiles.some((f) => f.includes(doc));
    if (!found) {
      missing.push(doc);
    }
  });

  const upToDate = docFiles.length - stale.length;
  const score = docFiles.length > 0 ? (upToDate / docFiles.length) * 100 - missing.length * 10 : 0;

  return {
    score: Math.max(0, score),
    totalDocs: docFiles.length,
    upToDate,
    stale,
    missing,
    lastUpdated: latestUpdate.toISOString(),
  };
}

function calculateOverallScore(
  metrics: Omit<HealthMetrics, 'timestamp' | 'overall'>
): OverallScore {
  const weights = {
    tokenCoverage: 0.25,
    brandCompliance: 0.25,
    accessibility: 0.25,
    componentUsage: 0.15,
    documentation: 0.1,
  };

  const weightedScore =
    metrics.tokenCoverage.score * weights.tokenCoverage +
    metrics.brandCompliance.score * weights.brandCompliance +
    metrics.accessibility.score * weights.accessibility +
    metrics.componentUsage.adoptionRate * weights.componentUsage +
    metrics.documentation.score * weights.documentation;

  const score = Math.round(weightedScore);

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  else grade = 'F';

  return {
    score,
    grade,
    trend: 'stable', // Would compare to previous run in real implementation
  };
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(metrics: HealthMetrics): string {
  const { overall, tokenCoverage, brandCompliance, accessibility, componentUsage, documentation } =
    metrics;

  let report = `
╔══════════════════════════════════════════════════════════════════╗
║           🌿 FERNI DESIGN SYSTEM HEALTH REPORT 🌿                ║
╠══════════════════════════════════════════════════════════════════╣
║  Generated: ${metrics.timestamp.padEnd(45)}║
╚══════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────┐
│  OVERALL SCORE: ${overall.score}/100 (${overall.grade})  ${getScoreEmoji(overall.score)}                              │
│  Trend: ${overall.trend}                                               │
└──────────────────────────────────────────────────────────────────┘

📊 TOKEN COVERAGE
├─ Score: ${tokenCoverage.score}/100
├─ Files using tokens: ${tokenCoverage.filesUsingTokens}/${tokenCoverage.totalFiles} (${tokenCoverage.coverage.toFixed(1)}%)
├─ Hardcoded colors: ${tokenCoverage.hardcodedColors.length}
├─ Hardcoded durations: ${tokenCoverage.hardcodedDurations.length}
└─ Threshold: ${CONFIG.thresholds.tokenCoverage}%

🎨 BRAND COMPLIANCE
├─ Score: ${brandCompliance.score}/100
├─ Violations: ${brandCompliance.violations.length}
├─ Forbidden words: ${brandCompliance.forbiddenWordsFound.length > 0 ? brandCompliance.forbiddenWordsFound.join(', ') : 'None'}
├─ Forbidden colors: ${brandCompliance.forbiddenColorsFound.length > 0 ? brandCompliance.forbiddenColorsFound.join(', ') : 'None'}
└─ Emoji in UI: ${brandCompliance.emojiInUI}

♿ ACCESSIBILITY
├─ Score: ${accessibility.score}/100
├─ Missing aria-labels: ${accessibility.missingAriaLabels}
├─ Touch target issues: ${accessibility.touchTargetIssues}
└─ Reduced motion support: ${accessibility.reducedMotionSupport ? '✅' : '❌'}

🧩 COMPONENT ADOPTION
├─ Score: ${componentUsage.adoptionRate.toFixed(1)}%
├─ Components used: ${componentUsage.usedComponents}/${componentUsage.totalComponents}
├─ Most used: ${componentUsage.mostUsed
    .slice(0, 3)
    .map((c) => c.name)
    .join(', ')}
└─ Unused: ${componentUsage.unused.length > 0 ? componentUsage.unused.join(', ') : 'None'}

📚 DOCUMENTATION
├─ Score: ${documentation.score}/100
├─ Total docs: ${documentation.totalDocs}
├─ Up to date: ${documentation.upToDate}
├─ Stale (>30 days): ${documentation.stale.length}
└─ Missing: ${documentation.missing.length > 0 ? documentation.missing.join(', ') : 'None'}

`;

  // Add top issues
  if (tokenCoverage.hardcodedColors.length > 0) {
    report += `
⚠️  TOP TOKEN ISSUES
`;
    tokenCoverage.hardcodedColors.slice(0, 5).forEach((issue) => {
      report += `   • ${issue.file}:${issue.line} - ${issue.value}\n`;
    });
  }

  if (brandCompliance.violations.length > 0) {
    report += `
⚠️  TOP BRAND VIOLATIONS
`;
    brandCompliance.violations.slice(0, 5).forEach((v) => {
      report += `   • ${v.file}:${v.line} - ${v.message}\n`;
    });
  }

  report += `
────────────────────────────────────────────────────────────────────
Run 'npm run ds:health --fix' for suggested fixes
Run 'npm run ds:health --json' for machine-readable output
────────────────────────────────────────────────────────────────────
`;

  return report;
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return '🌟';
  if (score >= 80) return '✨';
  if (score >= 70) return '👍';
  if (score >= 60) return '⚡';
  return '🔧';
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🌿 Analyzing Ferni Design System health...\n');

  const [tokenCoverage, brandCompliance, accessibility, componentUsage, documentation] =
    await Promise.all([
      analyzeTokenCoverage(),
      analyzeBrandCompliance(),
      analyzeAccessibility(),
      analyzeComponentUsage(),
      analyzeDocumentation(),
    ]);

  const metrics: HealthMetrics = {
    timestamp: new Date().toISOString(),
    overall: calculateOverallScore({
      tokenCoverage,
      brandCompliance,
      accessibility,
      componentUsage,
      documentation,
    }),
    tokenCoverage,
    brandCompliance,
    accessibility,
    componentUsage,
    documentation,
  };

  // Check for command line args
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log(generateReport(metrics));
  }

  // Write to file for tracking
  const reportPath = path.join(__dirname, '../.health-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));

  // Exit with error if below thresholds
  if (metrics.overall.score < 70) {
    process.exit(1);
  }
}

// Export for testing
export {
  analyzeAccessibility,
  analyzeBrandCompliance,
  analyzeComponentUsage,
  analyzeDocumentation,
  analyzeTokenCoverage,
  calculateOverallScore,
  HealthMetrics,
};

// Run if called directly
main().catch(console.error);
