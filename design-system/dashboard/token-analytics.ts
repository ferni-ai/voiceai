/**
 * Ferni Design System Token Analytics
 *
 * Tracks usage patterns of design tokens across the codebase.
 * Identifies unused tokens, popular tokens, and potential consolidation opportunities.
 *
 * Run with: npx ts-node design-system/dashboard/token-analytics.ts
 */

import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface TokenAnalytics {
  timestamp: string;
  summary: TokenSummary;
  colors: TokenCategoryAnalytics;
  spacing: TokenCategoryAnalytics;
  typography: TokenCategoryAnalytics;
  animation: TokenCategoryAnalytics;
  effects: TokenCategoryAnalytics;
  recommendations: Recommendation[];
}

interface TokenSummary {
  totalTokens: number;
  usedTokens: number;
  unusedTokens: number;
  usageRate: number;
  topTokens: TokenUsage[];
  bottomTokens: TokenUsage[];
}

interface TokenCategoryAnalytics {
  category: string;
  totalTokens: number;
  usedTokens: number;
  usageRate: number;
  tokens: TokenUsage[];
  unusedTokens: string[];
}

interface TokenUsage {
  name: string;
  cssVariable: string;
  usageCount: number;
  files: string[];
  contexts: string[]; // e.g., ['button', 'card', 'modal']
}

interface Recommendation {
  type: 'unused' | 'consolidate' | 'missing' | 'deprecated';
  priority: 'high' | 'medium' | 'low';
  message: string;
  tokens: string[];
  action: string;
}

// ============================================================================
// Token Definitions (loaded from JSON files)
// ============================================================================

interface TokenDefinitions {
  colors: string[];
  spacing: string[];
  typography: string[];
  animation: string[];
  effects: string[];
}

function loadTokenDefinitions(): TokenDefinitions {
  const tokensPath = path.join(__dirname, '../tokens');

  // Load color tokens
  const colorsJson = JSON.parse(fs.readFileSync(path.join(tokensPath, 'colors.json'), 'utf-8'));
  const colors = extractTokenNames(colorsJson, 'color');

  // Load spacing tokens
  const spacingJson = JSON.parse(fs.readFileSync(path.join(tokensPath, 'spacing.json'), 'utf-8'));
  const spacing = extractTokenNames(spacingJson, 'space');

  // Load typography tokens
  const typographyJson = JSON.parse(
    fs.readFileSync(path.join(tokensPath, 'typography.json'), 'utf-8')
  );
  const typography = extractTokenNames(typographyJson, 'font');

  // Load animation tokens
  const animationJson = JSON.parse(
    fs.readFileSync(path.join(tokensPath, 'animation.json'), 'utf-8')
  );
  const animation = extractTokenNames(animationJson, 'duration').concat(
    extractTokenNames(animationJson, 'ease')
  );

  // Load effects tokens
  const effectsJson = JSON.parse(fs.readFileSync(path.join(tokensPath, 'effects.json'), 'utf-8'));
  const effects = extractTokenNames(effectsJson, 'shadow');

  return { colors, spacing, typography, animation, effects };
}

function extractTokenNames(obj: any, prefix: string, currentPath = ''): string[] {
  const tokens: string[] = [];

  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.startsWith('_')) continue;

    const newPath = currentPath ? `${currentPath}-${key}` : key;

    if (typeof obj[key] === 'object' && obj[key] !== null && !obj[key].value) {
      tokens.push(...extractTokenNames(obj[key], prefix, newPath));
    } else if (obj[key]?.value !== undefined || typeof obj[key] === 'string') {
      tokens.push(`--${prefix}-${newPath}`);
    }
  }

  return tokens;
}

// ============================================================================
// Analysis Functions
// ============================================================================

async function analyzeTokenUsage(
  tokens: string[],
  category: string
): Promise<TokenCategoryAnalytics> {
  const files = await glob([
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.css',
    'apps/web/src/**/*.ts',
    'apps/web/src/**/*.css',
  ]);

  const tokenUsageMap: Map<string, { count: number; files: Set<string>; contexts: Set<string> }> =
    new Map();

  // Initialize all tokens with zero usage
  tokens.forEach((token) => {
    tokenUsageMap.set(token, { count: 0, files: new Set(), contexts: new Set() });
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const fileName = path.basename(file, path.extname(file));

    // Determine context from file name
    const context = determineContext(fileName);

    tokens.forEach((token) => {
      // Match var(--token-name) or direct --token-name usage
      const regex = new RegExp(`var\\(${token}\\)|${token}(?=[\\s;,)])`, 'g');
      const matches = content.match(regex);

      if (matches) {
        const usage = tokenUsageMap.get(token)!;
        usage.count += matches.length;
        usage.files.add(file);
        usage.contexts.add(context);
      }
    });
  }

  // Convert to array and sort by usage
  const tokenUsages: TokenUsage[] = Array.from(tokenUsageMap.entries())
    .map(([name, data]) => ({
      name,
      cssVariable: name,
      usageCount: data.count,
      files: Array.from(data.files),
      contexts: Array.from(data.contexts),
    }))
    .sort((a, b) => b.usageCount - a.usageCount);

  const usedTokens = tokenUsages.filter((t) => t.usageCount > 0);
  const unusedTokens = tokenUsages.filter((t) => t.usageCount === 0).map((t) => t.name);

  return {
    category,
    totalTokens: tokens.length,
    usedTokens: usedTokens.length,
    usageRate: tokens.length > 0 ? (usedTokens.length / tokens.length) * 100 : 0,
    tokens: tokenUsages,
    unusedTokens,
  };
}

function determineContext(fileName: string): string {
  const contexts: Record<string, string[]> = {
    button: ['button', 'btn', 'cta'],
    card: ['card', 'panel', 'box'],
    modal: ['modal', 'dialog', 'sheet'],
    input: ['input', 'form', 'field', 'textarea'],
    avatar: ['avatar', 'persona', 'orb'],
    navigation: ['nav', 'menu', 'sidebar', 'header'],
    animation: ['animation', 'motion', 'transition'],
    typography: ['text', 'font', 'typography', 'heading'],
    layout: ['layout', 'grid', 'flex', 'container'],
  };

  const lowerFileName = fileName.toLowerCase();

  for (const [context, keywords] of Object.entries(contexts)) {
    if (keywords.some((kw) => lowerFileName.includes(kw))) {
      return context;
    }
  }

  return 'general';
}

function generateRecommendations(
  analytics: Omit<TokenAnalytics, 'recommendations'>
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Check for unused tokens
  const allUnused = [
    ...analytics.colors.unusedTokens,
    ...analytics.spacing.unusedTokens,
    ...analytics.typography.unusedTokens,
    ...analytics.animation.unusedTokens,
    ...analytics.effects.unusedTokens,
  ];

  if (allUnused.length > 10) {
    recommendations.push({
      type: 'unused',
      priority: 'medium',
      message: `${allUnused.length} tokens are defined but never used in the codebase`,
      tokens: allUnused.slice(0, 20),
      action: 'Consider removing unused tokens to simplify the design system',
    });
  }

  // Check for low usage rate categories
  const categories = [
    analytics.colors,
    analytics.spacing,
    analytics.typography,
    analytics.animation,
    analytics.effects,
  ];

  categories.forEach((cat) => {
    if (cat.usageRate < 50 && cat.totalTokens > 5) {
      recommendations.push({
        type: 'unused',
        priority: 'low',
        message: `${cat.category} tokens have low adoption (${cat.usageRate.toFixed(1)}%)`,
        tokens: cat.unusedTokens.slice(0, 10),
        action: `Review ${cat.category} tokens for relevance or promote adoption`,
      });
    }
  });

  // Check for potential consolidation (tokens used only once)
  categories.forEach((cat) => {
    const singleUseTokens = cat.tokens.filter((t) => t.usageCount === 1);
    if (singleUseTokens.length > 5) {
      recommendations.push({
        type: 'consolidate',
        priority: 'low',
        message: `${singleUseTokens.length} ${cat.category} tokens are used only once`,
        tokens: singleUseTokens.slice(0, 10).map((t) => t.name),
        action: 'Consider if these tokens should be consolidated or promoted for wider use',
      });
    }
  });

  // Check for missing common tokens (heuristic)
  const topColorTokens = analytics.colors.tokens.filter((t) => t.usageCount > 10);
  if (topColorTokens.length < 5) {
    recommendations.push({
      type: 'missing',
      priority: 'medium',
      message: 'Few color tokens have high adoption - may indicate direct color usage',
      tokens: [],
      action: 'Audit codebase for hardcoded colors that should be tokens',
    });
  }

  return recommendations;
}

// ============================================================================
// Report Generation
// ============================================================================

function generateReport(analytics: TokenAnalytics): string {
  let report = `
╔══════════════════════════════════════════════════════════════════╗
║           🎨 FERNI TOKEN USAGE ANALYTICS 🎨                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Generated: ${analytics.timestamp.padEnd(45)}║
╚══════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────┐
│  SUMMARY                                                          │
├──────────────────────────────────────────────────────────────────┤
│  Total Tokens:    ${analytics.summary.totalTokens.toString().padEnd(46)}│
│  Used Tokens:     ${analytics.summary.usedTokens.toString().padEnd(46)}│
│  Unused Tokens:   ${analytics.summary.unusedTokens.toString().padEnd(46)}│
│  Usage Rate:      ${analytics.summary.usageRate.toFixed(1).padEnd(45)}%│
└──────────────────────────────────────────────────────────────────┘

📊 CATEGORY BREAKDOWN
`;

  const categories = [
    { name: 'Colors', data: analytics.colors },
    { name: 'Spacing', data: analytics.spacing },
    { name: 'Typography', data: analytics.typography },
    { name: 'Animation', data: analytics.animation },
    { name: 'Effects', data: analytics.effects },
  ];

  categories.forEach(({ name, data }) => {
    const bar = generateProgressBar(data.usageRate, 20);
    report += `
${name.padEnd(12)} ${bar} ${data.usageRate.toFixed(0).padStart(3)}%  (${data.usedTokens}/${data.totalTokens})`;
  });

  report += `

🏆 TOP 10 MOST USED TOKENS
`;

  analytics.summary.topTokens.slice(0, 10).forEach((token, i) => {
    report += `   ${(i + 1).toString().padStart(2)}. ${token.name.padEnd(35)} ${token.usageCount.toString().padStart(4)} uses
`;
  });

  report += `
🔻 UNUSED TOKENS (Sample)
`;

  const sampleUnused = [
    ...analytics.colors.unusedTokens.slice(0, 3),
    ...analytics.spacing.unusedTokens.slice(0, 3),
    ...analytics.animation.unusedTokens.slice(0, 3),
  ];

  sampleUnused.slice(0, 10).forEach((token) => {
    report += `   • ${token}
`;
  });

  if (analytics.recommendations.length > 0) {
    report += `
💡 RECOMMENDATIONS
`;

    analytics.recommendations.forEach((rec) => {
      const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      report += `
${icon} [${rec.type.toUpperCase()}] ${rec.message}
   Action: ${rec.action}
`;
    });
  }

  report += `
────────────────────────────────────────────────────────────────────
Run 'npm run ds:tokens --json' for machine-readable output
Run 'npm run ds:tokens --unused' to list all unused tokens
────────────────────────────────────────────────────────────────────
`;

  return report;
}

function generateProgressBar(percentage: number, width: number): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🎨 Analyzing Ferni Design System token usage...\n');

  // Load token definitions
  let tokenDefs: TokenDefinitions;
  try {
    tokenDefs = loadTokenDefinitions();
  } catch (error) {
    console.error('Error loading token definitions:', error);
    // Use fallback definitions
    tokenDefs = {
      colors: [
        '--color-background-primary',
        '--color-background-secondary',
        '--color-background-elevated',
        '--color-text-primary',
        '--color-text-secondary',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-semantic-success',
        '--color-semantic-error',
        '--persona-primary',
        '--persona-secondary',
        '--persona-glow',
      ],
      spacing: [
        '--space-1',
        '--space-2',
        '--space-3',
        '--space-4',
        '--space-6',
        '--space-8',
        '--space-12',
        '--space-16',
        '--space-24',
      ],
      typography: [
        '--font-display',
        '--font-body',
        '--font-mono',
        '--text-xs',
        '--text-sm',
        '--text-base',
        '--text-lg',
        '--text-xl',
        '--text-2xl',
      ],
      animation: [
        '--duration-fast',
        '--duration-normal',
        '--duration-slow',
        '--duration-dramatic',
        '--ease-standard',
        '--ease-spring',
        '--ease-gentle',
      ],
      effects: ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-glow'],
    };
  }

  // Analyze each category
  const [colors, spacing, typography, animation, effects] = await Promise.all([
    analyzeTokenUsage(tokenDefs.colors, 'colors'),
    analyzeTokenUsage(tokenDefs.spacing, 'spacing'),
    analyzeTokenUsage(tokenDefs.typography, 'typography'),
    analyzeTokenUsage(tokenDefs.animation, 'animation'),
    analyzeTokenUsage(tokenDefs.effects, 'effects'),
  ]);

  // Calculate summary
  const allTokens = [
    ...colors.tokens,
    ...spacing.tokens,
    ...typography.tokens,
    ...animation.tokens,
    ...effects.tokens,
  ];

  const sortedByUsage = [...allTokens].sort((a, b) => b.usageCount - a.usageCount);
  const usedTokens = allTokens.filter((t) => t.usageCount > 0);

  const summary: TokenSummary = {
    totalTokens: allTokens.length,
    usedTokens: usedTokens.length,
    unusedTokens: allTokens.length - usedTokens.length,
    usageRate: allTokens.length > 0 ? (usedTokens.length / allTokens.length) * 100 : 0,
    topTokens: sortedByUsage.slice(0, 20),
    bottomTokens: sortedByUsage.slice(-10).reverse(),
  };

  const analyticsWithoutRecs = {
    timestamp: new Date().toISOString(),
    summary,
    colors,
    spacing,
    typography,
    animation,
    effects,
  };

  const recommendations = generateRecommendations(analyticsWithoutRecs);

  const analytics: TokenAnalytics = {
    ...analyticsWithoutRecs,
    recommendations,
  };

  // Output based on args
  const args = process.argv.slice(2);

  if (args.includes('--json')) {
    console.log(JSON.stringify(analytics, null, 2));
  } else if (args.includes('--unused')) {
    console.log('Unused Tokens:\n');
    [colors, spacing, typography, animation, effects].forEach((cat) => {
      if (cat.unusedTokens.length > 0) {
        console.log(`\n${cat.category.toUpperCase()}:`);
        cat.unusedTokens.forEach((t) => console.log(`  • ${t}`));
      }
    });
  } else {
    console.log(generateReport(analytics));
  }

  // Save to file
  const reportPath = path.join(__dirname, '../.token-analytics.json');
  fs.writeFileSync(reportPath, JSON.stringify(analytics, null, 2));
}

export { analyzeTokenUsage, generateRecommendations, TokenAnalytics };

main().catch(console.error);
