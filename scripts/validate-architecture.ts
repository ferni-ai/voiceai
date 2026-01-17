#!/usr/bin/env npx tsx
/**
 * Architecture Validation Script
 *
 * Validates clean architecture layer dependencies and file size limits.
 * Run with: pnpm quality:arch
 *
 * Architecture Layers (lower numbers are lower levels):
 * - Level 100: agents/, api/ (Application)
 * - Level 70: personas/, intelligence/, tools/, conversation/, speech/ (Domain - peers)
 * - Level 60: services/ (Service)
 * - Level 30: memory/ (Infrastructure)
 * - Level 10: config/, utils/, types/ (Foundation)
 *
 * Rules:
 * - Lower layers CANNOT import from higher layers
 * - Domain-level peers CAN import from each other
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SRC_DIR = path.join(process.cwd(), 'src');

const LAYER_LEVELS: Record<string, number> = {
  agents: 100,
  api: 100,
  servers: 100,
  personas: 70,
  intelligence: 70,
  tools: 70,
  conversation: 70,
  speech: 70,
  services: 60,
  memory: 30,
  config: 10,
  utils: 10,
  types: 10,
};

// Domain peers that can import each other
const DOMAIN_PEERS = new Set(['personas', 'intelligence', 'tools', 'conversation', 'speech']);

// Maximum file lines
const MAX_FILE_LINES = 500;

// Files exempted from line limits (legacy, in-progress refactoring)
const LINE_LIMIT_EXEMPTIONS = new Set([
  // These are being actively refactored
  'src/agents/shared/tool-call-sanitizer.ts',
  'src/agents/shared/json-function-executor.ts',
  'src/agents/voice-agent-entry.ts',
  'src/agents/processors/turn-processor.ts',
  'src/agents/processors/injection-builders.ts',
  // Large generated files
  'src/agents/shared/sanitizer/config/tool-patterns.json',
]);

// ============================================================================
// TYPES
// ============================================================================

interface Violation {
  file: string;
  type: 'layer' | 'size';
  message: string;
  fromLayer?: string;
  toLayer?: string;
  lineCount?: number;
}

interface ValidationResult {
  violations: Violation[];
  fileCount: number;
  passedCount: number;
}

// ============================================================================
// LAYER DETECTION
// ============================================================================

function getLayerFromPath(filePath: string): string | null {
  // Normalize path
  const relativePath = path.relative(SRC_DIR, filePath);
  const parts = relativePath.split(path.sep);
  
  if (parts.length === 0) return null;
  
  const topDir = parts[0];
  return LAYER_LEVELS[topDir] !== undefined ? topDir : null;
}

function getLayerLevel(layer: string): number {
  return LAYER_LEVELS[layer] ?? 0;
}

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

function extractImports(content: string): string[] {
  const imports: string[] = [];
  
  // Match import statements
  const importRegex = /import\s+(?:type\s+)?.*?from\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  // Match dynamic imports
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

function resolveImportToLayer(importPath: string, sourceFile: string): string | null {
  // Skip node_modules
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }
  
  // Resolve relative path
  const sourceDir = path.dirname(sourceFile);
  let resolvedPath: string;
  
  if (importPath.startsWith('.')) {
    resolvedPath = path.resolve(sourceDir, importPath);
  } else {
    resolvedPath = importPath;
  }
  
  // Remove .js extension for src mapping
  resolvedPath = resolvedPath.replace(/\.js$/, '.ts');
  
  // Get layer from resolved path
  return getLayerFromPath(resolvedPath);
}

// ============================================================================
// FILE VALIDATION
// ============================================================================

function validateFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const relativePath = path.relative(process.cwd(), filePath);
  
  // Skip non-TypeScript files
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return violations;
  }
  
  // Skip test files
  if (filePath.includes('__tests__') || filePath.includes('.test.')) {
    return violations;
  }
  
  // Skip _legacy directory
  if (filePath.includes('_legacy')) {
    return violations;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Check file size
  if (!LINE_LIMIT_EXEMPTIONS.has(relativePath) && lines.length > MAX_FILE_LINES) {
    violations.push({
      file: relativePath,
      type: 'size',
      message: `File exceeds ${MAX_FILE_LINES} lines (has ${lines.length} lines)`,
      lineCount: lines.length,
    });
  }
  
  // Get source layer
  const sourceLayer = getLayerFromPath(filePath);
  if (!sourceLayer) return violations;
  
  const sourceLevel = getLayerLevel(sourceLayer);
  
  // Check imports
  const imports = extractImports(content);
  
  for (const importPath of imports) {
    const targetLayer = resolveImportToLayer(importPath, filePath);
    if (!targetLayer) continue;
    
    const targetLevel = getLayerLevel(targetLayer);
    
    // Check if import violates layer rules
    // Lower level modules cannot import from higher levels
    if (targetLevel > sourceLevel) {
      // Exception: domain peers can import from each other
      if (DOMAIN_PEERS.has(sourceLayer) && DOMAIN_PEERS.has(targetLayer)) {
        continue;
      }
      
      violations.push({
        file: relativePath,
        type: 'layer',
        message: `Layer violation: ${sourceLayer} (L${sourceLevel}) imports from ${targetLayer} (L${targetLevel})`,
        fromLayer: sourceLayer,
        toLayer: targetLayer,
      });
    }
  }
  
  return violations;
}

// ============================================================================
// DIRECTORY TRAVERSAL
// ============================================================================

function walkDirectory(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip node_modules and hidden directories
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      
      if (entry.isDirectory()) {
        files.push(...walkDirectory(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission issues, etc.)
  }
  
  return files;
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

function validateArchitecture(): ValidationResult {
  const files = walkDirectory(SRC_DIR);
  const allViolations: Violation[] = [];
  let passedCount = 0;
  
  for (const file of files) {
    const violations = validateFile(file);
    if (violations.length === 0) {
      passedCount++;
    } else {
      allViolations.push(...violations);
    }
  }
  
  return {
    violations: allViolations,
    fileCount: files.length,
    passedCount,
  };
}

// ============================================================================
// CLI OUTPUT
// ============================================================================

function printResults(result: ValidationResult): void {
  console.log('\n🏛️  Architecture Validation Results\n');
  console.log(`📁 Files checked: ${result.fileCount}`);
  console.log(`✅ Passed: ${result.passedCount}`);
  console.log(`❌ Violations: ${result.violations.length}\n`);
  
  if (result.violations.length > 0) {
    console.log('─'.repeat(60));
    
    // Group by type
    const layerViolations = result.violations.filter(v => v.type === 'layer');
    const sizeViolations = result.violations.filter(v => v.type === 'size');
    
    if (layerViolations.length > 0) {
      console.log('\n🔴 LAYER VIOLATIONS:\n');
      for (const v of layerViolations) {
        console.log(`  ${v.file}`);
        console.log(`    → ${v.message}\n`);
      }
    }
    
    if (sizeViolations.length > 0) {
      console.log('\n📏 FILE SIZE VIOLATIONS:\n');
      for (const v of sizeViolations) {
        console.log(`  ${v.file}`);
        console.log(`    → ${v.lineCount} lines (max: ${MAX_FILE_LINES})\n`);
      }
    }
    
    console.log('─'.repeat(60));
    console.log(`\n❌ Architecture validation FAILED with ${result.violations.length} violation(s)\n`);
    console.log('Fix these issues before committing.\n');
    console.log('Layer Rules:');
    console.log('  - L100 (agents, api) can import from all lower layers');
    console.log('  - L70 (personas, intelligence, tools, conversation, speech) are peers');
    console.log('  - L60 (services) cannot import from L70+');
    console.log('  - L30 (memory) cannot import from L60+');
    console.log('  - L10 (config, utils, types) cannot import from L30+\n');
  } else {
    console.log('✅ All architecture checks passed!\n');
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

const result = validateArchitecture();
printResults(result);

// Exit with error code if violations found
process.exit(result.violations.length > 0 ? 1 : 0);

