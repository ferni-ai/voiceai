#!/usr/bin/env node
/**
 * Bundle Size Check
 *
 * Validates that the production bundle stays within size limits.
 * Run after build: node scripts/bundle-size-check.js
 *
 * Exit codes:
 *   0 - All bundles within limits
 *   1 - One or more bundles exceed limits
 */

import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

// Size limits in KB (adjust as needed)
const LIMITS = {
  // Total bundle size limit
  totalLimit: 500,        // 500 KB total

  // Individual chunk limits
  mainChunkLimit: 200,    // 200 KB for main bundle
  vendorChunkLimit: 300,  // 300 KB for vendor chunks

  // Warning thresholds (percentage of limit)
  warningThreshold: 0.8,  // Warn at 80% of limit
};

const DIST_DIR = join(__dirname, '..', 'dist', 'assets');

// ============================================================================
// HELPERS
// ============================================================================

function formatSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function getFileSizes(dir) {
  const sizes = {
    js: [],
    css: [],
    total: 0,
  };

  try {
    const files = readdirSync(dir);

    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);

      if (stat.isFile()) {
        const sizeKB = stat.size / 1024;
        sizes.total += sizeKB;

        if (file.endsWith('.js')) {
          sizes.js.push({ name: file, size: sizeKB });
        } else if (file.endsWith('.css')) {
          sizes.css.push({ name: file, size: sizeKB });
        }
      }
    }

    // Sort by size descending
    sizes.js.sort((a, b) => b.size - a.size);
    sizes.css.sort((a, b) => b.size - a.size);
  } catch (err) {
    console.error(`Error reading dist directory: ${err.message}`);
    console.error('Make sure to run "npm run build" first.');
    process.exit(1);
  }

  return sizes;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  BUNDLE SIZE CHECK');
  console.log('='.repeat(60));

  const sizes = getFileSizes(DIST_DIR);
  let hasErrors = false;
  let hasWarnings = false;

  // Total size check
  console.log('\n📦 Total Bundle Size');
  console.log('-'.repeat(60));

  const totalStatus = sizes.total > LIMITS.totalLimit ? '✗' :
    sizes.total > LIMITS.totalLimit * LIMITS.warningThreshold ? '⚠' : '✓';

  console.log(`  ${totalStatus} Total: ${formatSize(sizes.total * 1024)} (limit: ${LIMITS.totalLimit} KB)`);

  if (sizes.total > LIMITS.totalLimit) {
    hasErrors = true;
  } else if (sizes.total > LIMITS.totalLimit * LIMITS.warningThreshold) {
    hasWarnings = true;
  }

  // JavaScript chunks
  console.log('\n📄 JavaScript Chunks');
  console.log('-'.repeat(60));

  for (const chunk of sizes.js) {
    const isVendor = chunk.name.includes('vendor') || chunk.name.includes('node_modules');
    const limit = isVendor ? LIMITS.vendorChunkLimit : LIMITS.mainChunkLimit;
    const status = chunk.size > limit ? '✗' :
      chunk.size > limit * LIMITS.warningThreshold ? '⚠' : '✓';

    console.log(`  ${status} ${chunk.name}: ${formatSize(chunk.size * 1024)}`);

    if (chunk.size > limit) {
      hasErrors = true;
    } else if (chunk.size > limit * LIMITS.warningThreshold) {
      hasWarnings = true;
    }
  }

  // CSS
  if (sizes.css.length > 0) {
    console.log('\n🎨 CSS');
    console.log('-'.repeat(60));

    for (const css of sizes.css) {
      console.log(`  ✓ ${css.name}: ${formatSize(css.size * 1024)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));

  if (hasErrors) {
    console.log('  STATUS: FAILED - Bundle size limits exceeded');
    console.log('='.repeat(60));
    console.log('\n⚠️  Reduce bundle size before deploying.\n');
    console.log('Tips:');
    console.log('  - Check for duplicate dependencies');
    console.log('  - Use dynamic imports for large features');
    console.log('  - Review third-party library sizes');
    console.log('');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('  STATUS: PASSED with warnings');
    console.log('='.repeat(60));
    console.log('\n⚠️  Bundle size approaching limits.\n');
    process.exit(0);
  } else {
    console.log('  STATUS: PASSED');
    console.log('='.repeat(60));
    console.log('');
    process.exit(0);
  }
}

main();
