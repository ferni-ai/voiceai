#!/usr/bin/env node
/**
 * Design Token Watch Mode
 * 
 * Automatically regenerates design tokens when source files change.
 * 
 * Usage:
 *   node watch-tokens.js
 *   npm run tokens:watch
 * 
 * Watches:
 *   - design-system/tokens/*.json
 *   - design-system/assets/sounds/*
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const WATCH_PATHS = [
  'design-system/tokens',
  'design-system/assets/sounds',
];

const DEBOUNCE_MS = 500;

// =============================================================================
// STATE
// =============================================================================

let debounceTimer = null;
let isRebuilding = false;

// =============================================================================
// COLORS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  const time = new Date().toLocaleTimeString();
  console.log(`${colors.dim}[${time}]${colors.reset} ${color}${message}${colors.reset}`);
}

// =============================================================================
// BUILD
// =============================================================================

async function rebuild(changedFile) {
  if (isRebuilding) return;
  isRebuilding = true;
  
  log(`Change detected: ${path.relative(ROOT, changedFile)}`, colors.yellow);
  log('Regenerating tokens...', colors.cyan);
  
  const startTime = Date.now();
  
  try {
    // Run the build
    execSync('npm run build:design-system', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    const elapsed = Date.now() - startTime;
    log(`✅ Tokens regenerated in ${elapsed}ms`, colors.green);
    
    // Show what was generated
    const generatedFiles = [
      'design-system/dist/tokens.css',
      'design-system/dist/tokens.ts',
      'apps/web/src/config/animation-constants.generated.ts',
      'apps/web/src/config/persona-colors.generated.ts',
    ];
    
    for (const file of generatedFiles) {
      const fullPath = path.join(ROOT, file);
      if (fs.existsSync(fullPath)) {
        const stat = fs.statSync(fullPath);
        log(`   → ${path.basename(file)} (${(stat.size / 1024).toFixed(1)}KB)`, colors.dim);
      }
    }
    
  } catch (error) {
    log(`❌ Build failed: ${error.message}`, '\x1b[31m');
  }
  
  isRebuilding = false;
}

function scheduleRebuild(changedFile) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(() => {
    rebuild(changedFile);
  }, DEBOUNCE_MS);
}

// =============================================================================
// WATCHER
// =============================================================================

function startWatching() {
  console.log('');
  console.log(`${colors.bright}🎨 Design Token Watch Mode${colors.reset}`);
  console.log('');
  log('Watching for changes...', colors.cyan);
  
  for (const watchPath of WATCH_PATHS) {
    const fullPath = path.join(ROOT, watchPath);
    
    if (!fs.existsSync(fullPath)) {
      log(`⚠️  Path not found: ${watchPath}`, colors.yellow);
      continue;
    }
    
    log(`   → ${watchPath}`, colors.dim);
    
    fs.watch(fullPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      
      // Only watch JSON and specific file types
      if (!filename.endsWith('.json') && !filename.endsWith('.mp3') && !filename.endsWith('.wav')) {
        return;
      }
      
      const changedFile = path.join(fullPath, filename);
      scheduleRebuild(changedFile);
    });
  }
  
  console.log('');
  log('Press Ctrl+C to stop', colors.dim);
  console.log('');
}

// =============================================================================
// MAIN
// =============================================================================

// Initial build
log('Running initial build...', colors.cyan);
try {
  execSync('npm run build:design-system', { cwd: ROOT, stdio: 'inherit' });
  log('✅ Initial build complete', colors.green);
} catch (error) {
  log('❌ Initial build failed', '\x1b[31m');
  process.exit(1);
}

// Start watching
startWatching();

// Handle exit
process.on('SIGINT', () => {
  console.log('');
  log('Watch mode stopped', colors.dim);
  process.exit(0);
});

