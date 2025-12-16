#!/usr/bin/env npx tsx
/**
 * Architecture Layer Validator
 *
 * Enforces clean architecture layer boundaries:
 * - Validates import direction (upper layers can import lower, not vice versa)
 * - Detects circular dependencies
 * - Ensures domain isolation
 *
 * Architecture Layers (top to bottom):
 *   agents/        → Application layer (voice agents)
 *   api/           → API routes
 *   personas/      → Persona definitions
 *   intelligence/  → Context builders
 *   conversation/  → Conversation state
 *   tools/         → LLM tools (domain logic)
 *   services/      → Business logic
 *   speech/        → Speech processing
 *   memory/        → Data storage
 *   utils/         → Shared utilities
 *   types/         → Type definitions
 *   config/        → Configuration
 *
 * Rules:
 * - Lower layers CANNOT import from higher layers
 * - utils/, types/, config/ are foundation layers (can be imported by anyone)
 * - Circular dependencies between modules are not allowed
 *
 * Run: npx tsx scripts/architecture-validator.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

// Layer hierarchy (higher number = higher layer)
// Lower layers CANNOT import from higher layers
//
// This is adapted for a voice AI agent architecture where:
// - agents/ is the main entry point (highest)
// - personas/ defines agent behaviors and can be used throughout
// - tools/, intelligence/, conversation/ are peer domain layers
// - services/ orchestrates everything
// - memory/, utils/, types/, config/ are infrastructure
const LAYER_HIERARCHY: Record<string, number> = {
  // Application layer (highest)
  'agents': 100,
  'api': 100,         // API is also application-level
  'cli': 100,         // CLI tools need full access

  // Domain layer (peers - can import each other)
  'personas': 70,     // Personas define agent behavior
  'intelligence': 70, // Context builders
  'conversation': 70, // Conversation management
  'tools': 70,        // LLM tools
  'speech': 70,       // Speech processing
  'ssml': 70,         // SSML generation

  // Service layer (orchestration)
  'services': 60,

  // Infrastructure layer (lowest)
  'memory': 30,
  'config': 20,       // Config can reference types
  'utils': 10,
  'types': 10,

  // Test layer (excluded from validation)
  'tests': 0,
};

// Special allowed cross-layer imports
const ALLOWED_EXCEPTIONS: Array<{ from: string; to: string; reason: string }> = [
  // Services orchestrate domain layers
  { from: 'services', to: 'intelligence', reason: 'DI container wiring' },
  { from: 'services', to: 'tools', reason: 'Tool orchestration' },
  { from: 'services', to: 'conversation', reason: 'Conversation management' },
  { from: 'services', to: 'personas', reason: 'Persona configuration' },
  { from: 'services', to: 'speech', reason: 'Speech integration' },

  // Memory can access types from domain layers for storage schemas
  { from: 'memory', to: 'tools', reason: 'Storage schema types' },
  { from: 'memory', to: 'intelligence', reason: 'Storage schema types' },

  // Config often references higher layers for runtime configuration
  { from: 'config', to: 'personas', reason: 'Voice ID configuration' },
  { from: 'config', to: 'services', reason: 'Feature flag configuration' },

  // Utils may have domain-specific helpers
  { from: 'utils', to: 'services', reason: 'Domain metrics helpers' },

  // SSML is a sub-module that imports from root ssml-tagger
  { from: 'ssml', to: 'agents', reason: 'SSML tagger at root level' },
];

// Files/patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  'dist/',
  'coverage/',
  '.test.ts',
  '.spec.ts',
  '__tests__',
  '__mocks__',
  '/tests/',       // Test directory
  'src/tests/',    // E2E tests
];

// ============================================================================
// TYPES
// ============================================================================

interface ImportViolation {
  file: string;
  line: number;
  fromLayer: string;
  toLayer: string;
  importPath: string;
  reason: string;
}

interface CircularDep {
  cycle: string[];
}

interface ArchitectureReport {
  violations: ImportViolation[];
  circularDeps: CircularDep[];
  layerStats: Record<string, number>;
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getLayer(filePath: string): string | null {
  const rel = relative(SRC_DIR, filePath);
  const parts = rel.split('/');

  if (parts.length === 0) return null;

  // Top-level file (like agent.ts)
  if (parts.length === 1) {
    return 'agents'; // Root files are in application layer
  }

  const topDir = parts[0];
  return LAYER_HIERARCHY[topDir] !== undefined ? topDir : null;
}

function getLayerLevel(layer: string): number {
  return LAYER_HIERARCHY[layer] ?? 50; // Default to middle if unknown
}

function isExceptionAllowed(fromLayer: string, toLayer: string): boolean {
  return ALLOWED_EXCEPTIONS.some(
    exc => exc.from === fromLayer && exc.to === toLayer
  );
}

function getAllTypeScriptFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      if (shouldIgnore(fullPath)) continue;

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllTypeScriptFiles(fullPath, files);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return files;
}

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

function extractImports(content: string): Array<{ line: number; path: string }> {
  const imports: Array<{ line: number; path: string }> = [];
  const lines = content.split('\n');

  // Track if we're inside a function body (where dynamic imports are intentional)
  let braceDepth = 0;
  let inTopLevel = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track brace depth to detect if we're in a function body
    // This is a simple heuristic - not perfect but catches most cases
    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;

    // Top-level is roughly when we're at brace depth 0-1 (class bodies count as 1)
    inTopLevel = braceDepth <= 1;

    // Match: import ... from '...'
    // Match: import '...'
    // Match: export ... from '...'
    const importMatch = line.match(/(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/);
    const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);

    // Only detect dynamic imports at top level (module-level eager evaluation)
    // Dynamic imports inside function bodies are intentionally lazy
    const dynamicMatch = inTopLevel ? line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/) : null;

    const path = importMatch?.[1] || sideEffectMatch?.[1] || dynamicMatch?.[1];

    if (path && path.startsWith('.')) {
      imports.push({ line: i + 1, path });
    }
  }

  return imports;
}

function resolveImportLayer(importPath: string, fromFile: string): string | null {
  const fromDir = dirname(fromFile);

  // Resolve relative path
  let resolvedPath: string;
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolvedPath = join(fromDir, importPath);
  } else {
    resolvedPath = importPath;
  }

  // Normalize and get layer
  const normalizedPath = resolvedPath.replace(/\.(js|ts)$/, '');
  return getLayer(normalizedPath + '.ts');
}

function analyzeFile(filePath: string): ImportViolation[] {
  const violations: ImportViolation[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const imports = extractImports(content);
  const fromLayer = getLayer(filePath);

  if (!fromLayer) return violations;

  const fromLevel = getLayerLevel(fromLayer);

  for (const imp of imports) {
    const toLayer = resolveImportLayer(imp.path, filePath);

    if (!toLayer) continue;

    const toLevel = getLayerLevel(toLayer);

    // Check if lower layer is importing from higher layer
    if (fromLevel < toLevel && !isExceptionAllowed(fromLayer, toLayer)) {
      violations.push({
        file: relative(ROOT_DIR, filePath),
        line: imp.line,
        fromLayer,
        toLayer,
        importPath: imp.path,
        reason: `Layer "${fromLayer}" (level ${fromLevel}) cannot import from "${toLayer}" (level ${toLevel})`,
      });
    }
  }

  return violations;
}

// ============================================================================
// CIRCULAR DEPENDENCY DETECTION
// ============================================================================

function buildDependencyGraph(files: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    const relFile = relative(SRC_DIR, file).replace(/\.ts$/, '');
    const deps = new Set<string>();

    for (const imp of imports) {
      const fromDir = dirname(file);
      const resolvedPath = join(fromDir, imp.path);
      const normalizedPath = relative(SRC_DIR, resolvedPath).replace(/\.(js|ts)$/, '');

      // Only track internal dependencies
      if (!normalizedPath.startsWith('..')) {
        deps.add(normalizedPath);
      }
    }

    graph.set(relFile, deps);
  }

  return graph;
}

function detectCircularDeps(graph: Map<string, Set<string>>): CircularDep[] {
  const cycles: CircularDep[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart).concat(node);
        // Only report cycles between different top-level directories
        const uniqueLayers = new Set(cycle.map(p => p.split('/')[0]));
        if (uniqueLayers.size > 1) {
          cycles.push({ cycle });
        }
      }
      return;
    }

    if (visited.has(node)) return;

    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const deps = graph.get(node) || new Set();
    for (const dep of deps) {
      dfs(dep);
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  // Deduplicate cycles (same cycle can be found from different starting points)
  const uniqueCycles = new Map<string, CircularDep>();
  for (const cycle of cycles) {
    const key = [...cycle.cycle].sort().join(' -> ');
    uniqueCycles.set(key, cycle);
  }

  return [...uniqueCycles.values()].slice(0, 10); // Limit to first 10
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(): ArchitectureReport {
  const files = getAllTypeScriptFiles(SRC_DIR);
  const violations: ImportViolation[] = [];
  const layerStats: Record<string, number> = {};

  // Analyze each file for violations
  for (const file of files) {
    const fileViolations = analyzeFile(file);
    violations.push(...fileViolations);

    // Count files per layer
    const layer = getLayer(file);
    if (layer) {
      layerStats[layer] = (layerStats[layer] || 0) + 1;
    }
  }

  // Build dependency graph and detect cycles
  const graph = buildDependencyGraph(files);
  const circularDeps = detectCircularDeps(graph);

  return { violations, circularDeps, layerStats };
}

function printReport(report: ArchitectureReport): boolean {
  console.log('');
  console.log('='.repeat(70));
  console.log('  ARCHITECTURE VALIDATION REPORT');
  console.log('='.repeat(70));

  let hasErrors = false;

  // Layer Statistics
  console.log('\n📊 Layer Statistics');
  console.log('-'.repeat(70));
  const sortedLayers = Object.entries(report.layerStats)
    .sort((a, b) => (LAYER_HIERARCHY[b[0]] || 0) - (LAYER_HIERARCHY[a[0]] || 0));

  for (const [layer, count] of sortedLayers) {
    const level = LAYER_HIERARCHY[layer] || '?';
    console.log(`  ${layer.padEnd(15)} (level ${String(level).padStart(3)}): ${count} files`);
  }

  // Layer Violations
  console.log('\n🚨 Layer Violations');
  console.log('-'.repeat(70));

  if (report.violations.length === 0) {
    console.log('  ✓ No layer violations found');
  } else {
    hasErrors = true;
    console.log(`  ✗ Found ${report.violations.length} violations:\n`);

    // Group by violation type
    const byType = new Map<string, ImportViolation[]>();
    for (const v of report.violations) {
      const key = `${v.fromLayer} -> ${v.toLayer}`;
      const list = byType.get(key) || [];
      list.push(v);
      byType.set(key, list);
    }

    for (const [type, violations] of byType) {
      console.log(`  ${type}:`);
      for (const v of violations.slice(0, 3)) {
        console.log(`    - ${v.file}:${v.line}`);
        console.log(`      imports: ${v.importPath}`);
      }
      if (violations.length > 3) {
        console.log(`    ... and ${violations.length - 3} more`);
      }
      console.log('');
    }
  }

  // Circular Dependencies
  console.log('\n🔄 Circular Dependencies');
  console.log('-'.repeat(70));

  if (report.circularDeps.length === 0) {
    console.log('  ✓ No circular dependencies detected');
  } else {
    console.log(`  ⚠ Found ${report.circularDeps.length} circular dependency chains:`);
    for (const cycle of report.circularDeps.slice(0, 5)) {
      console.log(`    ${cycle.cycle.join(' -> ')}`);
    }
    // Circular deps are warnings, not errors (for now)
  }

  // Summary
  console.log('\n' + '='.repeat(70));

  if (hasErrors) {
    console.log('  STATUS: FAILED - Layer violations found');
    console.log('='.repeat(70));
    console.log('\n⚠️  Fix architecture violations before committing.\n');
    return false;
  } else {
    console.log('  STATUS: PASSED');
    console.log('='.repeat(70));
    console.log('');
    return true;
  }
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const report = generateReport();
  const passed = printReport(report);

  process.exit(passed ? 0 : 1);
}

main();
