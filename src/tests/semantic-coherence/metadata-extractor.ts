/**
 * Codebase Metadata Extractor
 *
 * Extracts semantic metadata from the codebase for LLM evaluation.
 * This powers our semantic coherence tests by providing structured
 * information about domains, naming, and organization.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DomainMetadata, ExportMetadata } from './types.js';

const SRC_ROOT = path.join(process.cwd(), 'src');

/**
 * Extract metadata from all services
 */
export async function extractServiceMetadata(): Promise<DomainMetadata[]> {
  const servicesDir = path.join(SRC_ROOT, 'services');
  const metadata: DomainMetadata[] = [];

  // Get all items in services directory
  const items = await fs.promises.readdir(servicesDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      // Subdirectory service domain
      const indexPath = path.join(servicesDir, item.name, 'index.ts');
      const hasIndex = fs.existsSync(indexPath);

      metadata.push({
        name: item.name,
        path: path.join('services', item.name),
        type: 'service',
        exports: hasIndex ? await extractExports(indexPath) : [],
        dependencies: await extractDependencies(path.join(servicesDir, item.name)),
        category: inferCategory(item.name),
      });
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) {
      // Top-level service file
      const filePath = path.join(servicesDir, item.name);
      metadata.push({
        name: item.name.replace('.ts', ''),
        path: path.join('services', item.name),
        type: 'service',
        exports: await extractExports(filePath),
        dependencies: await extractDependenciesFromFile(filePath),
        category: inferCategory(item.name),
      });
    }
  }

  return metadata;
}

/**
 * Extract metadata from context builders
 */
export async function extractContextBuilderMetadata(): Promise<DomainMetadata[]> {
  const buildersDir = path.join(SRC_ROOT, 'intelligence', 'context-builders');
  const metadata: DomainMetadata[] = [];

  if (!fs.existsSync(buildersDir)) {
    return metadata;
  }

  const files = await fs.promises.readdir(buildersDir);

  for (const file of files) {
    if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      const filePath = path.join(buildersDir, file);
      const content = await fs.promises.readFile(filePath, 'utf-8');

      // Extract builder category from content
      const categoryMatch = content.match(/category:\s*BuilderCategory\.(\w+)/);
      const priorityMatch = content.match(/priority:\s*(\d+)/);

      metadata.push({
        name: file.replace('.ts', ''),
        path: path.join('intelligence', 'context-builders', file),
        type: 'context-builder',
        exports: await extractExports(filePath),
        dependencies: await extractDependenciesFromFile(filePath),
        category: categoryMatch ? categoryMatch[1].toLowerCase() : undefined,
        description: extractJsDocDescription(content),
      });
    }
  }

  return metadata;
}

/**
 * Extract metadata from persona bundles
 */
export async function extractPersonaMetadata(): Promise<DomainMetadata[]> {
  const bundlesDir = path.join(SRC_ROOT, 'personas', 'bundles');
  const metadata: DomainMetadata[] = [];

  if (!fs.existsSync(bundlesDir)) {
    return metadata;
  }

  const items = await fs.promises.readdir(bundlesDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory() && item.name !== 'shared') {
      const manifestPath = path.join(bundlesDir, item.name, 'persona.manifest.json');

      let manifest: Record<string, unknown> = {};
      if (fs.existsSync(manifestPath)) {
        const content = await fs.promises.readFile(manifestPath, 'utf-8');
        manifest = JSON.parse(content);
      }

      // Check for identity files
      const identityDir = path.join(bundlesDir, item.name, 'identity');
      const hasSystemPrompt = fs.existsSync(path.join(identityDir, 'system-prompt.md'));
      const hasBiography = fs.existsSync(path.join(identityDir, 'biography.md'));

      metadata.push({
        name: item.name,
        path: path.join('personas', 'bundles', item.name),
        type: 'persona',
        exports: [],
        dependencies: [],
        category: (manifest.domain as string) || 'general',
        description: (manifest.description as string) || undefined,
      });
    }
  }

  return metadata;
}

/**
 * Extract metadata from tools
 */
export async function extractToolMetadata(): Promise<DomainMetadata[]> {
  const toolsDir = path.join(SRC_ROOT, 'tools');
  const metadata: DomainMetadata[] = [];

  if (!fs.existsSync(toolsDir)) {
    return metadata;
  }

  const items = await fs.promises.readdir(toolsDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      // Tool subdirectory
      const indexPath = path.join(toolsDir, item.name, 'index.ts');
      const hasIndex = fs.existsSync(indexPath);

      metadata.push({
        name: item.name,
        path: path.join('tools', item.name),
        type: 'tool',
        exports: hasIndex ? await extractExports(indexPath) : [],
        dependencies: await extractDependencies(path.join(toolsDir, item.name)),
        category: inferToolCategory(item.name),
      });
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) {
      const filePath = path.join(toolsDir, item.name);
      metadata.push({
        name: item.name.replace('.ts', ''),
        path: path.join('tools', item.name),
        type: 'tool',
        exports: await extractExports(filePath),
        dependencies: await extractDependenciesFromFile(filePath),
        category: inferToolCategory(item.name),
      });
    }
  }

  return metadata;
}

/**
 * Extract metadata from memory layer
 */
export async function extractMemoryMetadata(): Promise<DomainMetadata[]> {
  const memoryDir = path.join(SRC_ROOT, 'memory');
  const metadata: DomainMetadata[] = [];

  if (!fs.existsSync(memoryDir)) {
    return metadata;
  }

  const items = await fs.promises.readdir(memoryDir, { withFileTypes: true });

  for (const item of items) {
    if (item.isDirectory()) {
      metadata.push({
        name: item.name,
        path: path.join('memory', item.name),
        type: 'memory',
        exports: [],
        dependencies: await extractDependencies(path.join(memoryDir, item.name)),
        category: inferMemoryCategory(item.name),
      });
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) {
      const filePath = path.join(memoryDir, item.name);
      metadata.push({
        name: item.name.replace('.ts', ''),
        path: path.join('memory', item.name),
        type: 'memory',
        exports: await extractExports(filePath),
        dependencies: await extractDependenciesFromFile(filePath),
        category: inferMemoryCategory(item.name),
      });
    }
  }

  return metadata;
}

/**
 * Extract all exports from a TypeScript file
 */
async function extractExports(filePath: string): Promise<ExportMetadata[]> {
  const exports: ExportMetadata[] = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    // Match export function
    const funcMatches = content.matchAll(/export\s+(async\s+)?function\s+(\w+)/g);
    for (const match of funcMatches) {
      exports.push({
        name: match[2],
        type: 'function',
        isDefault: false,
      });
    }

    // Match export const
    const constMatches = content.matchAll(/export\s+const\s+(\w+)/g);
    for (const match of constMatches) {
      exports.push({
        name: match[1],
        type: 'const',
        isDefault: false,
      });
    }

    // Match export class
    const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of classMatches) {
      exports.push({
        name: match[1],
        type: 'class',
        isDefault: false,
      });
    }

    // Match export interface
    const interfaceMatches = content.matchAll(/export\s+interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      exports.push({
        name: match[1],
        type: 'interface',
        isDefault: false,
      });
    }

    // Match export type
    const typeMatches = content.matchAll(/export\s+type\s+(\w+)/g);
    for (const match of typeMatches) {
      exports.push({
        name: match[1],
        type: 'type',
        isDefault: false,
      });
    }

    // Match export default
    const defaultMatch = content.match(/export\s+default\s+(\w+)/);
    if (defaultMatch) {
      exports.push({
        name: defaultMatch[1],
        type: 'const',
        isDefault: true,
      });
    }
  } catch {
    // File read error, return empty
  }

  return exports;
}

/**
 * Extract dependencies from a directory (looks at index.ts imports)
 */
async function extractDependencies(dirPath: string): Promise<string[]> {
  const indexPath = path.join(dirPath, 'index.ts');
  if (fs.existsSync(indexPath)) {
    return extractDependenciesFromFile(indexPath);
  }
  return [];
}

/**
 * Extract import dependencies from a file
 */
async function extractDependenciesFromFile(filePath: string): Promise<string[]> {
  const dependencies: string[] = [];

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');

    // Match import statements
    const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);

    for (const match of importMatches) {
      const importPath = match[1];
      // Only include local imports
      if (importPath.startsWith('.') || importPath.startsWith('..')) {
        dependencies.push(importPath);
      }
    }
  } catch {
    // File read error, return empty
  }

  return dependencies;
}

/**
 * Extract JSDoc description from file content
 */
function extractJsDocDescription(content: string): string | undefined {
  const match = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
  return match ? match[1].trim() : undefined;
}

/**
 * Infer category from service name
 */
function inferCategory(name: string): string {
  const categoryMap: Record<string, string[]> = {
    superhuman: [
      'commitment',
      'predictive',
      'capacity',
      'dream',
      'emotional-first',
      'relationship-network',
      'life-narrative',
      'values',
      'seasonal',
      'relationship-milestones',
    ],
    communication: ['email', 'gmail', 'linkedin', 'sms', 'twilio', 'messaging'],
    calendar: ['calendar', 'scheduling', 'meeting', 'event'],
    finance: ['stripe', 'payment', 'subscription', 'billing', 'finance', 'iap'],
    identity: ['trust', 'identity', 'auth', 'voice-identity'],
    engagement: ['engagement', 'outreach', 'push', 'notification'],
    observability: ['observability', 'performance', 'diagnostic', 'analytics', 'metrics'],
    media: ['music', 'podcast', 'book', 'entertainment', 'game'],
    health: ['health', 'wearable', 'biometric', 'sleep', 'exercise'],
    data: ['data-layer', 'persistence', 'store', 'cache'],
  };

  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((kw) => name.toLowerCase().includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Infer tool category
 */
function inferToolCategory(name: string): string {
  if (name.includes('habit')) return 'coaching';
  if (name.includes('calendar') || name.includes('event')) return 'scheduling';
  if (name.includes('contact') || name.includes('relationship')) return 'relationships';
  if (name.includes('finance') || name.includes('budget')) return 'finance';
  if (name.includes('memory') || name.includes('recall')) return 'memory';
  if (name.includes('handoff') || name.includes('transfer')) return 'team';
  return 'general';
}

/**
 * Infer memory category
 */
function inferMemoryCategory(name: string): string {
  if (name.includes('vector') || name.includes('embedding')) return 'semantic';
  if (name.includes('firestore') || name.includes('postgres')) return 'storage';
  if (name.includes('cache') || name.includes('redis')) return 'caching';
  if (name.includes('retrieval') || name.includes('search')) return 'retrieval';
  return 'general';
}

/**
 * Get complete codebase metadata
 */
export async function extractAllMetadata(): Promise<{
  services: DomainMetadata[];
  contextBuilders: DomainMetadata[];
  personas: DomainMetadata[];
  tools: DomainMetadata[];
  memory: DomainMetadata[];
}> {
  const [services, contextBuilders, personas, tools, memory] = await Promise.all([
    extractServiceMetadata(),
    extractContextBuilderMetadata(),
    extractPersonaMetadata(),
    extractToolMetadata(),
    extractMemoryMetadata(),
  ]);

  return { services, contextBuilders, personas, tools, memory };
}

/**
 * Generate a summary report of the codebase structure
 */
export async function generateStructureSummary(): Promise<string> {
  const metadata = await extractAllMetadata();

  const lines: string[] = [
    '# Codebase Structure Summary\n',
    '## Services',
    `Total: ${metadata.services.length}`,
    `Categories: ${[...new Set(metadata.services.map((s) => s.category))].join(', ')}\n`,
    '## Context Builders',
    `Total: ${metadata.contextBuilders.length}`,
    `Categories: ${[...new Set(metadata.contextBuilders.map((b) => b.category).filter(Boolean))].join(', ')}\n`,
    '## Personas',
    `Total: ${metadata.personas.length}`,
    `Names: ${metadata.personas.map((p) => p.name).join(', ')}\n`,
    '## Tools',
    `Total: ${metadata.tools.length}`,
    `Categories: ${[...new Set(metadata.tools.map((t) => t.category))].join(', ')}\n`,
    '## Memory',
    `Total: ${metadata.memory.length}`,
    `Categories: ${[...new Set(metadata.memory.map((m) => m.category))].join(', ')}\n`,
  ];

  return lines.join('\n');
}
