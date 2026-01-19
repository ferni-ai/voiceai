/**
 * Gemini Function Declarations Generator
 *
 * Generates Gemini-native functionDeclarations from tool schema files.
 * This creates the TypeScript file that can be used with the Gemini API
 * when native function calling is enabled.
 *
 * Run: pnpm tools:generate:declarations
 *
 * Options:
 *   --check    Check if generated file is up to date (exits 1 if not)
 *   --stdout   Print to stdout instead of writing file
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCHEMAS_DIR = join(__dirname, '../../src/tools/schemas');
const OUTPUT_PATH = join(SCHEMAS_DIR, 'generated/gemini-declarations.generated.ts');

interface ParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, ParameterProperty>;
    required?: string[];
  };
  examples: Array<{ userSays: string; output: string }>;
  tags?: string[];
}

interface ToolSchemaFile {
  domain: string;
  version?: string;
  persona?: string;
  tools: ToolDefinition[];
}

// Gemini FunctionDeclaration type (matches Google's API)
interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, GeminiParameter>;
    required?: string[];
  };
}

interface GeminiParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

// ============================================================================
// LOADER
// ============================================================================

function loadJsonFile<T>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

function findSchemaFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (entry === 'generated') continue;
      findSchemaFiles(fullPath, files);
    } else if (entry.endsWith('.schema.json') && entry !== 'tool.schema.json') {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================================
// CONVERTER
// ============================================================================

function convertToGeminiDeclaration(tool: ToolDefinition): GeminiFunctionDeclaration {
  const properties: Record<string, GeminiParameter> = {};

  for (const [name, prop] of Object.entries(tool.parameters.properties)) {
    const geminiProp: GeminiParameter = {
      type: prop.type,
      description: prop.description,
    };

    if (prop.enum) {
      geminiProp.enum = prop.enum;
    }

    if (prop.items) {
      geminiProp.items = prop.items;
    }

    properties[name] = geminiProp;
  }

  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties,
      required: tool.parameters.required,
    },
  };
}

// ============================================================================
// GENERATOR
// ============================================================================

function generateTypeScript(schemaFiles: string[]): string {
  // Load all schemas
  const schemas: Array<{ path: string; schema: ToolSchemaFile }> = [];
  for (const file of schemaFiles) {
    const schema = loadJsonFile<ToolSchemaFile>(file);
    schemas.push({ path: file, schema });
  }

  // Convert to Gemini declarations
  const declarations: GeminiFunctionDeclaration[] = [];
  const toolsByDomain: Record<string, string[]> = {};

  for (const { schema } of schemas) {
    const domain = schema.domain;
    toolsByDomain[domain] = toolsByDomain[domain] || [];

    for (const tool of schema.tools) {
      declarations.push(convertToGeminiDeclaration(tool));
      toolsByDomain[domain].push(tool.name);
    }
  }

  // Generate TypeScript
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Gemini Function Declarations');
  lines.push(' *');
  lines.push(' * This file is auto-generated from tool schemas. Do not edit directly.');
  lines.push(' * Edit schema files in `src/tools/schemas/` and run `pnpm tools:generate`.');
  lines.push(' *');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` * Schemas: ${schemas.length} files, ${declarations.length} tools`);
  lines.push(' */');
  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// TYPES');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('export interface GeminiFunctionDeclaration {');
  lines.push('  name: string;');
  lines.push('  description: string;');
  lines.push('  parameters: {');
  lines.push("    type: 'object';");
  lines.push('    properties: Record<string, GeminiParameter>;');
  lines.push('    required?: string[];');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push('export interface GeminiParameter {');
  lines.push('  type: string;');
  lines.push('  description: string;');
  lines.push('  enum?: string[];');
  lines.push('  items?: { type: string };');
  lines.push('}');
  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// DECLARATIONS');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('/**');
  lines.push(' * All function declarations for Gemini native function calling.');
  lines.push(' * Use with: tools: [{ functionDeclarations }]');
  lines.push(' */');
  lines.push('export const functionDeclarations: GeminiFunctionDeclaration[] = ');
  lines.push(JSON.stringify(declarations, null, 2) + ';');
  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// DOMAIN GROUPINGS');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('/**');
  lines.push(' * Tools grouped by domain for selective loading.');
  lines.push(' */');
  lines.push('export const toolsByDomain: Record<string, string[]> = ');
  lines.push(JSON.stringify(toolsByDomain, null, 2) + ';');
  lines.push('');
  lines.push('// ============================================================================');
  lines.push('// HELPERS');
  lines.push('// ============================================================================');
  lines.push('');
  lines.push('/**');
  lines.push(' * Get declarations for specific domains.');
  lines.push(' */');
  lines.push('export function getDeclarationsForDomains(domains: string[]): GeminiFunctionDeclaration[] {');
  lines.push('  const toolNames = new Set<string>();');
  lines.push('  for (const domain of domains) {');
  lines.push('    const tools = toolsByDomain[domain] || [];');
  lines.push('    for (const tool of tools) {');
  lines.push('      toolNames.add(tool);');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return functionDeclarations.filter(d => toolNames.has(d.name));');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * Get a single declaration by name.');
  lines.push(' */');
  lines.push('export function getDeclaration(name: string): GeminiFunctionDeclaration | undefined {');
  lines.push('  return functionDeclarations.find(d => d.name === name);');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * All available domains.');
  lines.push(' */');
  lines.push('export const availableDomains = Object.keys(toolsByDomain);');
  lines.push('');
  lines.push('/**');
  lines.push(' * All tool names.');
  lines.push(' */');
  lines.push(`export const allToolNames = ${JSON.stringify(declarations.map(d => d.name))};`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check');
  const stdoutMode = args.includes('--stdout');

  // Find schema files
  const schemaFiles = findSchemaFiles(SCHEMAS_DIR);

  if (schemaFiles.length === 0) {
    console.error('No schema files found');
    process.exit(1);
  }

  // Generate TypeScript
  const typescript = generateTypeScript(schemaFiles);

  if (stdoutMode) {
    console.log(typescript);
    process.exit(0);
  }

  if (checkMode) {
    // Compare with existing file (excluding the Generated timestamp line)
    if (!existsSync(OUTPUT_PATH)) {
      console.error(`Generated file does not exist: ${relative(process.cwd(), OUTPUT_PATH)}`);
      console.error('Run `pnpm tools:generate` to create it.');
      process.exit(1);
    }

    const existing = readFileSync(OUTPUT_PATH, 'utf-8');
    
    // Strip timestamp lines for comparison
    const stripTimestamp = (s: string) => s.replace(/ \* Generated:.*\n/g, '');
    
    if (stripTimestamp(existing) !== stripTimestamp(typescript)) {
      console.error('Generated declarations are out of date.');
      console.error('Run `pnpm tools:generate` to update.');
      process.exit(1);
    }

    console.log('Generated declarations are up to date.');
    process.exit(0);
  }

  // Write file
  writeFileSync(OUTPUT_PATH, typescript, 'utf-8');
  console.log(`Generated: ${relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  ${schemaFiles.length} schema files, ${typescript.split('\n').length} lines`);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
