#!/usr/bin/env npx tsx
/**
 * Performance Monitoring & Budget Tracking
 * 
 * Tracks bundle size, runs Lighthouse, and monitors performance metrics.
 * 
 * @module @ferni/cli/perf
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// =============================================================================
// COLORS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// =============================================================================
// BUNDLE SIZE BUDGET
// =============================================================================

interface BundleBudget {
  maxTotalKB: number;
  maxChunkKB: number;
  maxInitialKB: number;
}

const BUNDLE_BUDGET: BundleBudget = {
  maxTotalKB: 2500,    // Total bundle size
  maxChunkKB: 500,     // Max single chunk
  maxInitialKB: 800,   // Initial load JS
};

interface BundleStats {
  totalKB: number;
  initialKB: number;
  chunks: { name: string; sizeKB: number }[];
  gzipTotalKB: number;
}

async function analyzeBundleSize(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📦 Bundle Size Analysis${colors.reset}\n`);

  const distDir = join(PROJECT_ROOT, 'frontend-typescript/dist/assets');
  
  if (!existsSync(distDir)) {
    log.warn('No dist folder found. Building frontend...');
    execSync('npm run build:frontend', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  const files = readdirSync(distDir).filter(f => f.endsWith('.js') || f.endsWith('.css'));
  
  const chunks: { name: string; sizeKB: number; gzipKB: number }[] = [];
  let totalSize = 0;
  let initialSize = 0;

  for (const file of files) {
    const filePath = join(distDir, file);
    const stat = statSync(filePath);
    const sizeKB = Math.round(stat.size / 1024 * 10) / 10;
    
    // Estimate gzip (typically 30-40% of original)
    const gzipKB = Math.round(sizeKB * 0.35 * 10) / 10;
    
    chunks.push({ name: file, sizeKB, gzipKB });
    totalSize += sizeKB;
    
    // Initial chunks (index, vendor)
    if (file.includes('index') || file.includes('vendor')) {
      initialSize += sizeKB;
    }
  }

  // Sort by size
  chunks.sort((a, b) => b.sizeKB - a.sizeKB);

  console.log(`${colors.bold}Bundle Summary:${colors.reset}\n`);
  console.log(`  Total:   ${formatSize(totalSize, BUNDLE_BUDGET.maxTotalKB)}`);
  console.log(`  Initial: ${formatSize(initialSize, BUNDLE_BUDGET.maxInitialKB)}`);
  console.log(`  Gzip:    ${colors.dim}~${Math.round(totalSize * 0.35)}KB${colors.reset}\n`);

  console.log(`${colors.bold}Largest chunks:${colors.reset}\n`);
  chunks.slice(0, 10).forEach(chunk => {
    const status = chunk.sizeKB > BUNDLE_BUDGET.maxChunkKB 
      ? colors.red + '⚠' + colors.reset
      : colors.green + '✓' + colors.reset;
    console.log(`  ${status} ${chunk.name.padEnd(40)} ${chunk.sizeKB.toString().padStart(6)}KB`);
  });

  // Budget check
  console.log(`\n${colors.bold}Budget Status:${colors.reset}\n`);
  
  const budgetResults = [
    { name: 'Total', actual: totalSize, budget: BUNDLE_BUDGET.maxTotalKB },
    { name: 'Initial', actual: initialSize, budget: BUNDLE_BUDGET.maxInitialKB },
    { name: 'Max Chunk', actual: chunks[0]?.sizeKB || 0, budget: BUNDLE_BUDGET.maxChunkKB },
  ];

  let allPassed = true;
  for (const result of budgetResults) {
    const passed = result.actual <= result.budget;
    if (!passed) allPassed = false;
    
    const percent = Math.round((result.actual / result.budget) * 100);
    const bar = createProgressBar(percent);
    const status = passed ? colors.green + '✓' : colors.red + '✗';
    
    console.log(`  ${status}${colors.reset} ${result.name.padEnd(12)} ${bar} ${result.actual}/${result.budget}KB`);
  }

  console.log();
  if (allPassed) {
    log.success('All bundle budgets passed!');
  } else {
    log.error('Bundle budget exceeded! Consider code splitting.');
  }
}

function formatSize(sizeKB: number, budgetKB: number): string {
  const color = sizeKB > budgetKB ? colors.red : colors.green;
  return `${color}${sizeKB}KB${colors.reset} / ${budgetKB}KB`;
}

function createProgressBar(percent: number): string {
  const width = 20;
  const filled = Math.round((Math.min(percent, 100) / 100) * width);
  const empty = width - filled;
  const color = percent > 100 ? colors.red : percent > 80 ? colors.yellow : colors.green;
  return `${color}${'█'.repeat(filled)}${colors.dim}${'░'.repeat(empty)}${colors.reset} ${percent}%`;
}

// =============================================================================
// LIGHTHOUSE
// =============================================================================

async function runLighthouse(url?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 Lighthouse Audit${colors.reset}\n`);

  const targetUrl = url || 'https://app.ferni.ai';

  log.info(`Running Lighthouse on ${targetUrl}...`);

  try {
    // Check if lighthouse is installed
    execSync('which lighthouse', { stdio: 'pipe' });
  } catch {
    log.error('Lighthouse not installed. Install with:');
    console.log(`  ${colors.cyan}npm install -g lighthouse${colors.reset}`);
    return;
  }

  try {
    const result = spawnSync('lighthouse', [
      targetUrl,
      '--output=json',
      '--output-path=./lighthouse-report.json',
      '--chrome-flags="--headless"',
      '--only-categories=performance,accessibility,best-practices',
    ], { 
      cwd: PROJECT_ROOT, 
      stdio: 'pipe',
      shell: true,
    });

    if (existsSync(join(PROJECT_ROOT, 'lighthouse-report.json'))) {
      const report = JSON.parse(readFileSync(join(PROJECT_ROOT, 'lighthouse-report.json'), 'utf8'));
      
      console.log(`\n${colors.bold}Scores:${colors.reset}\n`);
      
      const categories = ['performance', 'accessibility', 'best-practices'];
      for (const cat of categories) {
        const score = Math.round((report.categories[cat]?.score || 0) * 100);
        const color = score >= 90 ? colors.green : score >= 50 ? colors.yellow : colors.red;
        console.log(`  ${cat.padEnd(20)} ${color}${score}${colors.reset}`);
      }

      // Key metrics
      if (report.audits) {
        console.log(`\n${colors.bold}Key Metrics:${colors.reset}\n`);
        const metrics = [
          ['First Contentful Paint', 'first-contentful-paint'],
          ['Largest Contentful Paint', 'largest-contentful-paint'],
          ['Time to Interactive', 'interactive'],
          ['Cumulative Layout Shift', 'cumulative-layout-shift'],
        ];
        
        for (const [name, key] of metrics) {
          const audit = report.audits[key];
          if (audit) {
            console.log(`  ${name.padEnd(25)} ${audit.displayValue || 'N/A'}`);
          }
        }
      }

      log.success(`Full report: ${join(PROJECT_ROOT, 'lighthouse-report.json')}`);
    }
  } catch (error) {
    log.error(`Lighthouse failed: ${error}`);
  }
}

// =============================================================================
// PERFORMANCE TRACKING
// =============================================================================

interface PerfRecord {
  date: string;
  totalKB: number;
  initialKB: number;
  lighthouse?: {
    performance: number;
    accessibility: number;
  };
}

async function trackPerformance(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📊 Performance History${colors.reset}\n`);

  const historyPath = join(PROJECT_ROOT, '.perf-history.json');
  
  let history: PerfRecord[] = [];
  if (existsSync(historyPath)) {
    history = JSON.parse(readFileSync(historyPath, 'utf8'));
  }

  if (history.length === 0) {
    log.info('No performance history. Record with: ferni perf record');
    return;
  }

  console.log(`${colors.bold}Bundle Size Trend (last 10):${colors.reset}\n`);
  
  const recent = history.slice(-10);
  const maxSize = Math.max(...recent.map(r => r.totalKB));
  
  for (const record of recent) {
    const barWidth = Math.round((record.totalKB / maxSize) * 30);
    const bar = '█'.repeat(barWidth);
    const trend = recent.indexOf(record) > 0 
      ? record.totalKB > recent[recent.indexOf(record) - 1].totalKB ? '↑' : '↓'
      : ' ';
    
    console.log(`  ${record.date}  ${colors.cyan}${bar}${colors.reset} ${record.totalKB}KB ${trend}`);
  }

  console.log();
}

async function recordPerformance(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}📝 Recording Performance${colors.reset}\n`);

  // Build if needed
  const distDir = join(PROJECT_ROOT, 'frontend-typescript/dist/assets');
  if (!existsSync(distDir)) {
    log.info('Building frontend...');
    execSync('npm run build:frontend', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  // Calculate bundle size
  const files = readdirSync(distDir).filter(f => f.endsWith('.js'));
  let totalSize = 0;
  let initialSize = 0;

  for (const file of files) {
    const stat = statSync(join(distDir, file));
    const sizeKB = Math.round(stat.size / 1024);
    totalSize += sizeKB;
    if (file.includes('index') || file.includes('vendor')) {
      initialSize += sizeKB;
    }
  }

  // Record
  const historyPath = join(PROJECT_ROOT, '.perf-history.json');
  let history: PerfRecord[] = [];
  if (existsSync(historyPath)) {
    history = JSON.parse(readFileSync(historyPath, 'utf8'));
  }

  const record: PerfRecord = {
    date: new Date().toISOString().split('T')[0],
    totalKB: totalSize,
    initialKB: initialSize,
  };

  history.push(record);
  
  // Keep last 100 records
  if (history.length > 100) {
    history = history.slice(-100);
  }

  writeFileSync(historyPath, JSON.stringify(history, null, 2));
  log.success(`Recorded: ${totalSize}KB total, ${initialSize}KB initial`);
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handlePerf(args: string[]): Promise<void> {
  const subcommand = args[0] || 'budget';

  switch (subcommand) {
    case 'budget':
    case 'bundle':
    case 'size':
      await analyzeBundleSize();
      break;
    
    case 'lighthouse':
    case 'lh':
      await runLighthouse(args[1]);
      break;
    
    case 'track':
    case 'history':
      await trackPerformance();
      break;
    
    case 'record':
      await recordPerformance();
      break;
    
    default:
      console.log(`${colors.bold}Performance Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}budget${colors.reset}      Check bundle size budget`);
      console.log(`  ${colors.cyan}lighthouse${colors.reset}  Run Lighthouse audit`);
      console.log(`  ${colors.cyan}track${colors.reset}       View performance history`);
      console.log(`  ${colors.cyan}record${colors.reset}      Record current metrics`);
  }
}

