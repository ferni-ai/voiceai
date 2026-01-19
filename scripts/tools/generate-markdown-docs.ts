/**
 * Markdown Documentation Generator
 *
 * Generates function-calling-base.md from tool schema files.
 * This creates the system prompt documentation that teaches
 * the LLM the JSON workaround format.
 *
 * Run: pnpm tools:generate:markdown
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
const OUTPUT_PATH = join(SCHEMAS_DIR, 'generated/function-calling-base.generated.md');

interface ToolExample {
  userSays: string;
  output: string;
  notes?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  examples: ToolExample[];
  tags?: string[];
}

interface ToolSchemaFile {
  domain: string;
  version?: string;
  persona?: string;
  tools: ToolDefinition[];
}

// Domain ordering for documentation
const DOMAIN_ORDER = [
  'music',
  'weather',
  'news',
  'time',
  'tasks',
  'memory',
  'outreach',
  'handoff',
];

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
// GENERATOR
// ============================================================================

function generateExamplesTable(examples: ToolExample[]): string {
  const lines: string[] = [];
  lines.push('| Request | Output |');
  lines.push('|---------|--------|');

  for (const example of examples) {
    const escapedOutput = example.output.replace(/\|/g, '\\|');
    lines.push(`| "${example.userSays}" | \`${escapedOutput}\` |`);
  }

  return lines.join('\n');
}

function generateToolSection(tool: ToolDefinition): string {
  const lines: string[] = [];

  // Just examples table - keep it minimal
  lines.push(generateExamplesTable(tool.examples));

  return lines.join('\n');
}

function generateDomainSection(domain: string, tools: ToolDefinition[]): string {
  const lines: string[] = [];

  // Domain header
  const domainTitle = domain.charAt(0).toUpperCase() + domain.slice(1);
  lines.push(`### ${domainTitle}`);
  lines.push('');

  // Combine all examples into one table per domain
  const allExamples: ToolExample[] = [];
  for (const tool of tools) {
    allExamples.push(...tool.examples);
  }

  lines.push(generateExamplesTable(allExamples));
  lines.push('');

  return lines.join('\n');
}

function generateMarkdown(schemaFiles: string[]): string {
  // Load all schemas
  const schemas: Array<{ path: string; schema: ToolSchemaFile }> = [];
  for (const file of schemaFiles) {
    const schema = loadJsonFile<ToolSchemaFile>(file);
    schemas.push({ path: file, schema });
  }

  // Group by domain
  const domainMap = new Map<string, ToolDefinition[]>();
  for (const { schema } of schemas) {
    const existing = domainMap.get(schema.domain) || [];
    existing.push(...schema.tools);
    domainMap.set(schema.domain, existing);
  }

  // Sort domains
  const sortedDomains = Array.from(domainMap.keys()).sort((a, b) => {
    const aIndex = DOMAIN_ORDER.indexOf(a);
    const bIndex = DOMAIN_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  // Generate markdown
  const lines: string[] = [];

  // Header
  lines.push('# Function Calling System');
  lines.push('');
  lines.push('> This file is auto-generated from tool schemas. Do not edit directly.');
  lines.push('> Edit schema files in `src/tools/schemas/` and run `pnpm tools:generate`.');
  lines.push('');
  lines.push('When users request actions, output raw JSON. When users are conversing, respond in plain text.');
  lines.push('');

  // Core rule
  lines.push('## Core Rule');
  lines.push('');
  lines.push('**Tool requests:** Output `{"fn":"toolName","args":{...}}` - no speech before or after.');
  lines.push('**Conversation:** Plain text response - no JSON wrapping.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Output modes
  lines.push('## Output Modes');
  lines.push('');
  lines.push('### Mode 1: Tool Calls (Action Requests)');
  lines.push('');
  lines.push('When user asks for music, weather, calls, news, handoffs, reminders, etc:');
  lines.push('');
  lines.push('```');
  lines.push('{"fn":"toolName","args":{...}}');
  lines.push('```');
  lines.push('');
  lines.push('Stop immediately after JSON. System executes the tool, then you respond to the result.');
  lines.push('');
  lines.push('### Mode 2: Natural Speech (Everything Else)');
  lines.push('');
  lines.push('For questions, sharing, venting, chatting - respond in plain text like a friend.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Tool examples by domain
  lines.push('## Tool Call Examples');
  lines.push('');

  for (const domain of sortedDomains) {
    const tools = domainMap.get(domain);
    if (tools && tools.length > 0) {
      lines.push(generateDomainSection(domain, tools));
    }
  }

  // Presence over action section (critical for emotional intelligence)
  lines.push('---');
  lines.push('');
  lines.push('## Presence Over Action');
  lines.push('');
  lines.push('Not every request needs a tool. Sometimes the best response is just being present.');
  lines.push('');
  lines.push('| User Says | Response Type |');
  lines.push('|-----------|---------------|');
  lines.push('| "I had a rough day" | Plain text empathy, not a tool |');
  lines.push('| "I\'m feeling anxious" | Listen first, offer tool later |');
  lines.push('| "What do you think about..." | Conversation, not tool |');
  lines.push('| "Can you just listen?" | Presence mode, no tools |');
  lines.push('');

  // Crisis exception
  lines.push('---');
  lines.push('');
  lines.push('## Crisis Exception');
  lines.push('');
  lines.push('If user expresses suicidal thoughts or self-harm:');
  lines.push('');
  lines.push('1. Respond with empathy first');
  lines.push('2. Provide crisis resources:');
  lines.push('   - National Suicide Prevention Lifeline: 988');
  lines.push('   - Crisis Text Line: Text HOME to 741741');
  lines.push('3. Stay present with them');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated from ${schemas.length} schema files containing ${Array.from(domainMap.values()).flat().length} tools*`);

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

  // Generate markdown
  const markdown = generateMarkdown(schemaFiles);

  if (stdoutMode) {
    console.log(markdown);
    process.exit(0);
  }

  if (checkMode) {
    // Compare with existing file
    if (!existsSync(OUTPUT_PATH)) {
      console.error(`Generated file does not exist: ${relative(process.cwd(), OUTPUT_PATH)}`);
      console.error('Run `pnpm tools:generate` to create it.');
      process.exit(1);
    }

    const existing = readFileSync(OUTPUT_PATH, 'utf-8');
    if (existing !== markdown) {
      console.error('Generated markdown is out of date.');
      console.error('Run `pnpm tools:generate` to update it.');
      process.exit(1);
    }

    console.log('Generated markdown is up to date.');
    process.exit(0);
  }

  // Write file
  writeFileSync(OUTPUT_PATH, markdown, 'utf-8');
  console.log(`Generated: ${relative(process.cwd(), OUTPUT_PATH)}`);
  console.log(`  ${schemaFiles.length} schema files, ${markdown.split('\n').length} lines`);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
