#!/usr/bin/env npx tsx
/**
 * Documentation Consolidation Script
 *
 * Analyzes the docs/ directory to find duplicates and establish canonical locations.
 * Creates a consolidation plan without making changes (dry-run by default).
 *
 * Usage:
 *   npx tsx scripts/consolidate-docs.ts              # Analyze only
 *   npx tsx scripts/consolidate-docs.ts --apply      # Apply changes
 *   npx tsx scripts/consolidate-docs.ts --report     # Generate markdown report
 */

import { readdir, readFile, stat, mkdir, writeFile, unlink, symlink } from 'fs/promises';
import { join, dirname, basename, relative } from 'path';
import { createHash } from 'crypto';
import { existsSync } from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DOCS_ROOT = join(process.cwd(), 'docs');

/**
 * Canonical directory structure - where each type of doc should live
 */
const CANONICAL_LOCATIONS: Record<string, string> = {
  // Architecture docs
  'architecture': 'docs/architecture/',
  'adr': 'docs/adr/',
  
  // Feature docs
  'features': 'docs/features/',
  
  // How-to guides
  'guides': 'docs/guides/',
  
  // Deployment & ops
  'deployment': 'docs/deployment/',
  
  // Security
  'security': 'docs/security/',
  
  // Migrations
  'migrations': 'docs/migrations/',
};

/**
 * Keywords to categorize docs
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'architecture': ['ARCHITECTURE', 'DESIGN', 'SYSTEM', 'PATTERN'],
  'deployment': ['DEPLOY', 'PRODUCTION', 'SETUP', 'INSTALL', 'QUICK-DEPLOY', 'GITHUB-SECRETS', 'SENTRY', 'DASHBOARDS'],
  'guides': ['GUIDE', 'TUTORIAL', 'HOW-TO', 'TEMPLATE', 'BEHAVIOR', 'CREATING', 'COMPLETE-GUIDE'],
  'features': ['FEATURE', 'INTEGRATION', 'SPOTIFY', 'HANDOFF', 'AB-TESTING', 'HUMANIZATION', 'MONETIZATION', 'TOOL_', 'CROSS-DOMAIN', 'DEEP-ENGAGEMENT', 'VOICE-PRESENCE'],
  'migrations': ['MIGRATION', 'MIGRATE', 'CONSOLIDATION', 'REORG', 'SPLIT', 'REBUILD', 'TODOS', 'REMAINING'],
  'security': ['SECURITY', 'CHECKLIST'],
};

// ============================================================================
// TYPES
// ============================================================================

interface DocFile {
  path: string;
  relativePath: string;
  filename: string;
  hash: string;
  size: number;
  category: string;
  canonicalPath: string;
  isDuplicate: boolean;
  duplicateOf?: string;
}

interface ConsolidationPlan {
  total: number;
  duplicates: number;
  toMove: DocFile[];
  toDelete: DocFile[];
  canonical: DocFile[];
}

// ============================================================================
// UTILITIES
// ============================================================================

async function getFileHash(filepath: string): Promise<string> {
  const content = await readFile(filepath, 'utf-8');
  return createHash('md5').update(content).digest('hex');
}

async function getAllMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath);
        }
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

function categorizeDoc(filename: string): string {
  const upper = filename.toUpperCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => upper.includes(kw))) {
      return category;
    }
  }
  
  return 'guides'; // Default category
}

function getCanonicalPath(filename: string, category: string): string {
  const dir = CANONICAL_LOCATIONS[category] || 'docs/guides/';
  return join(dir, filename);
}

// ============================================================================
// ANALYSIS
// ============================================================================

async function analyzeDocumentation(): Promise<ConsolidationPlan> {
  console.log('📚 Analyzing documentation...\n');

  const files = await getAllMarkdownFiles(DOCS_ROOT);
  const docFiles: DocFile[] = [];
  const hashMap = new Map<string, DocFile>();
  const filenameMap = new Map<string, DocFile[]>();

  // Process each file
  for (const filepath of files) {
    const fileStat = await stat(filepath);
    const hash = await getFileHash(filepath);
    const filename = basename(filepath);
    const relativePath = relative(process.cwd(), filepath);
    const category = categorizeDoc(filename);
    const canonicalPath = getCanonicalPath(filename, category);

    const docFile: DocFile = {
      path: filepath,
      relativePath,
      filename,
      hash,
      size: fileStat.size,
      category,
      canonicalPath,
      isDuplicate: false,
    };

    // Check for exact duplicates (same content)
    const existing = hashMap.get(hash);
    if (existing) {
      docFile.isDuplicate = true;
      docFile.duplicateOf = existing.relativePath;
    } else {
      hashMap.set(hash, docFile);
    }

    // Track files with same name
    const sameNameFiles = filenameMap.get(filename) || [];
    sameNameFiles.push(docFile);
    filenameMap.set(filename, sameNameFiles);

    docFiles.push(docFile);
  }

  // Identify which files to keep, move, or delete
  const toMove: DocFile[] = [];
  const toDelete: DocFile[] = [];
  const canonical: DocFile[] = [];

  for (const [filename, sameNameDocs] of filenameMap) {
    if (sameNameDocs.length === 1) {
      const doc = sameNameDocs[0];
      if (doc.relativePath !== doc.canonicalPath) {
        toMove.push(doc);
      } else {
        canonical.push(doc);
      }
    } else {
      // Multiple files with same name - pick canonical one
      // Prefer: shortest path, then in canonical location
      const sorted = sameNameDocs.sort((a, b) => {
        // Prefer already in canonical location
        if (a.relativePath === a.canonicalPath) return -1;
        if (b.relativePath === b.canonicalPath) return 1;
        // Prefer shorter paths (closer to docs root)
        return a.relativePath.split('/').length - b.relativePath.split('/').length;
      });

      const canonicalDoc = sorted[0];
      canonical.push(canonicalDoc);

      // Mark others as duplicates to delete
      for (let i = 1; i < sorted.length; i++) {
        sorted[i].isDuplicate = true;
        sorted[i].duplicateOf = canonicalDoc.relativePath;
        toDelete.push(sorted[i]);
      }

      // Check if canonical needs to move
      if (canonicalDoc.relativePath !== canonicalDoc.canonicalPath) {
        toMove.push(canonicalDoc);
      }
    }
  }

  return {
    total: docFiles.length,
    duplicates: toDelete.length,
    toMove,
    toDelete,
    canonical,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printPlan(plan: ConsolidationPlan) {
  console.log('📊 Documentation Analysis Results');
  console.log('==================================\n');

  console.log(`Total markdown files: ${plan.total}`);
  console.log(`Duplicate files:      ${plan.duplicates}`);
  console.log(`Files to move:        ${plan.toMove.length}`);
  console.log(`Files to delete:      ${plan.toDelete.length}`);
  console.log(`Canonical files:      ${plan.canonical.length}`);
  console.log('');

  if (plan.toDelete.length > 0) {
    console.log('🗑️  Files to DELETE (duplicates):');
    for (const doc of plan.toDelete) {
      console.log(`   ${doc.relativePath}`);
      console.log(`      → duplicate of: ${doc.duplicateOf}`);
    }
    console.log('');
  }

  if (plan.toMove.length > 0) {
    console.log('📦 Files to MOVE (to canonical location):');
    for (const doc of plan.toMove) {
      console.log(`   ${doc.relativePath}`);
      console.log(`      → ${doc.canonicalPath}`);
    }
    console.log('');
  }

  // Group canonical by category
  const byCategory = new Map<string, DocFile[]>();
  for (const doc of plan.canonical) {
    const docs = byCategory.get(doc.category) || [];
    docs.push(doc);
    byCategory.set(doc.category, docs);
  }

  console.log('📁 Canonical Structure:');
  for (const [category, docs] of byCategory) {
    console.log(`\n   ${category}/ (${docs.length} files)`);
    for (const doc of docs.slice(0, 5)) {
      console.log(`      ${doc.filename}`);
    }
    if (docs.length > 5) {
      console.log(`      ... and ${docs.length - 5} more`);
    }
  }
  console.log('');
}

async function generateReport(plan: ConsolidationPlan): Promise<string> {
  const lines: string[] = [
    '# Documentation Consolidation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total files | ${plan.total} |`,
    `| Duplicates | ${plan.duplicates} |`,
    `| To move | ${plan.toMove.length} |`,
    `| To delete | ${plan.toDelete.length} |`,
    '',
  ];

  if (plan.toDelete.length > 0) {
    lines.push('## Duplicate Files to Delete');
    lines.push('');
    lines.push('| File | Duplicate of |');
    lines.push('|------|--------------|');
    for (const doc of plan.toDelete) {
      lines.push(`| \`${doc.relativePath}\` | \`${doc.duplicateOf}\` |`);
    }
    lines.push('');
  }

  if (plan.toMove.length > 0) {
    lines.push('## Files to Move');
    lines.push('');
    lines.push('| Current | Canonical Location |');
    lines.push('|---------|-------------------|');
    for (const doc of plan.toMove) {
      lines.push(`| \`${doc.relativePath}\` | \`${doc.canonicalPath}\` |`);
    }
    lines.push('');
  }

  lines.push('## Canonical Structure');
  lines.push('');
  lines.push('```');
  lines.push('docs/');
  
  const byCategory = new Map<string, DocFile[]>();
  for (const doc of plan.canonical) {
    const docs = byCategory.get(doc.category) || [];
    docs.push(doc);
    byCategory.set(doc.category, docs);
  }

  for (const [category, docs] of [...byCategory].sort()) {
    lines.push(`├── ${category}/`);
    for (const doc of docs.sort((a, b) => a.filename.localeCompare(b.filename))) {
      lines.push(`│   ├── ${doc.filename}`);
    }
  }
  lines.push('```');

  return lines.join('\n');
}

// ============================================================================
// APPLY CHANGES
// ============================================================================

async function applyChanges(plan: ConsolidationPlan) {
  console.log('🔧 Applying consolidation changes...\n');

  // Delete duplicates
  for (const doc of plan.toDelete) {
    console.log(`   Deleting: ${doc.relativePath}`);
    await unlink(doc.path);
  }

  // Move files to canonical locations
  for (const doc of plan.toMove) {
    const targetPath = join(process.cwd(), doc.canonicalPath);
    const targetDir = dirname(targetPath);

    // Ensure target directory exists
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    // Read content
    const content = await readFile(doc.path, 'utf-8');
    
    // Write to new location
    await writeFile(targetPath, content);
    console.log(`   Moved: ${doc.relativePath} → ${doc.canonicalPath}`);

    // Delete original
    await unlink(doc.path);
  }

  console.log('\n✅ Consolidation complete!');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const shouldReport = args.includes('--report');

  try {
    const plan = await analyzeDocumentation();
    printPlan(plan);

    if (shouldReport) {
      const report = await generateReport(plan);
      const reportPath = join(process.cwd(), 'docs/CONSOLIDATION-REPORT.md');
      await writeFile(reportPath, report);
      console.log(`📄 Report saved to: ${reportPath}\n`);
    }

    if (shouldApply) {
      console.log('⚠️  This will modify files. Press Ctrl+C to cancel...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await applyChanges(plan);
    } else {
      console.log('💡 Run with --apply to make changes');
      console.log('   Run with --report to generate markdown report\n');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

