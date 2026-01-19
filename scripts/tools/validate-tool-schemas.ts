/**
 * Tool Schema Validator
 *
 * Validates all tool schema files against the JSON Schema definition.
 * Run: pnpm tools:validate
 *
 * Exit codes:
 *   0 - All schemas valid
 *   1 - Validation errors found
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Ajv from 'ajv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCHEMAS_DIR = join(__dirname, '../../src/tools/schemas');
const TOOL_SCHEMA_PATH = join(SCHEMAS_DIR, 'tool.schema.json');

interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: string[];
  toolCount?: number;
}

interface ToolSchemaFile {
  $schema?: string;
  domain: string;
  version?: string;
  persona?: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
    examples: Array<{ userSays: string; output: string }>;
  }>;
}

// ============================================================================
// VALIDATOR
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
      // Skip generated directory
      if (entry === 'generated') continue;
      findSchemaFiles(fullPath, files);
    } else if (entry.endsWith('.schema.json') && entry !== 'tool.schema.json') {
      files.push(fullPath);
    }
  }

  return files;
}

function validateSchema(ajv: Ajv, schemaPath: string): ValidationResult {
  const relativePath = relative(SCHEMAS_DIR, schemaPath);

  try {
    const schema = loadJsonFile<ToolSchemaFile>(schemaPath);

    // Validate against JSON Schema
    const validate = ajv.getSchema<ToolSchemaFile>('tool-schema');
    if (!validate) {
      return {
        file: relativePath,
        valid: false,
        errors: ['Failed to get validator'],
      };
    }

    const valid = validate(schema);

    if (!valid && validate.errors) {
      return {
        file: relativePath,
        valid: false,
        errors: validate.errors.map(
          (e) => `${e.instancePath || '/'}: ${e.message}` + (e.params ? ` (${JSON.stringify(e.params)})` : '')
        ),
      };
    }

    // Additional semantic validations
    const semanticErrors: string[] = [];

    // Check for duplicate tool names
    const toolNames = schema.tools.map((t) => t.name);
    const duplicates = toolNames.filter((name, index) => toolNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      semanticErrors.push(`Duplicate tool names: ${duplicates.join(', ')}`);
    }

    // Validate example outputs are valid JSON
    for (const tool of schema.tools) {
      for (let i = 0; i < tool.examples.length; i++) {
        const example = tool.examples[i];
        try {
          const parsed = JSON.parse(example.output);
          // Check the JSON has the expected structure
          if (!parsed.fn || typeof parsed.fn !== 'string') {
            semanticErrors.push(
              `${tool.name} example ${i + 1}: output JSON missing 'fn' field`
            );
          }
          if (!parsed.args || typeof parsed.args !== 'object') {
            semanticErrors.push(
              `${tool.name} example ${i + 1}: output JSON missing 'args' object`
            );
          }
          // Check fn matches tool name
          if (parsed.fn !== tool.name) {
            semanticErrors.push(
              `${tool.name} example ${i + 1}: fn "${parsed.fn}" doesn't match tool name`
            );
          }
        } catch {
          semanticErrors.push(
            `${tool.name} example ${i + 1}: output is not valid JSON: ${example.output}`
          );
        }
      }
    }

    if (semanticErrors.length > 0) {
      return {
        file: relativePath,
        valid: false,
        errors: semanticErrors,
        toolCount: schema.tools.length,
      };
    }

    return {
      file: relativePath,
      valid: true,
      toolCount: schema.tools.length,
    };
  } catch (error) {
    return {
      file: relativePath,
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('Tool Schema Validator');
  console.log('='.repeat(60));
  console.log();

  // Load the meta-schema
  let toolSchema: object;
  try {
    toolSchema = loadJsonFile<object>(TOOL_SCHEMA_PATH);
    console.log(`Loaded schema: ${relative(process.cwd(), TOOL_SCHEMA_PATH)}`);
  } catch (error) {
    console.error(`Failed to load tool.schema.json: ${error}`);
    process.exit(1);
  }

  // Initialize AJV
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  // Add the tool schema
  ajv.addSchema(toolSchema, 'tool-schema');

  // Find all schema files
  const schemaFiles = findSchemaFiles(SCHEMAS_DIR);

  if (schemaFiles.length === 0) {
    console.log('No schema files found.');
    process.exit(0);
  }

  console.log(`Found ${schemaFiles.length} schema files`);
  console.log();

  // Validate each file
  const results: ValidationResult[] = [];
  let totalTools = 0;
  let validFiles = 0;

  for (const file of schemaFiles) {
    const result = validateSchema(ajv, file);
    results.push(result);

    if (result.valid) {
      validFiles++;
      totalTools += result.toolCount || 0;
      console.log(`  [PASS] ${result.file} (${result.toolCount} tools)`);
    } else {
      console.log(`  [FAIL] ${result.file}`);
      for (const error of result.errors || []) {
        console.log(`         - ${error}`);
      }
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log(`Summary: ${validFiles}/${schemaFiles.length} files valid, ${totalTools} total tools`);

  if (validFiles !== schemaFiles.length) {
    console.log();
    console.log('Validation FAILED');
    process.exit(1);
  }

  console.log();
  console.log('Validation PASSED');
  process.exit(0);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
