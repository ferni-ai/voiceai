/**
 * OpenAPI Schema Generator
 *
 * Generates OpenAPI 3.0 schema from Zod schemas.
 * This enables automatic API documentation from your type definitions.
 *
 * Note: This is a simplified generator that works with Zod v4.
 * For full Zod-to-OpenAPI conversion, consider using @asteasolutions/zod-to-openapi
 *
 * Usage:
 * ```typescript
 * import { zodToOpenAPI } from './schema-generator.js';
 * import { UserIdentitySchema } from '../schemas.js';
 *
 * const openApiSchema = zodToOpenAPI(UserIdentitySchema, 'UserIdentity');
 * ```
 *
 * @module types/openapi/schema-generator
 */

import type { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  nullable?: boolean;
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  example?: unknown;
  additionalProperties?: OpenAPISchema | boolean;
  $ref?: string;
}

export interface OpenAPIDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, OpenAPIPathItem>;
  components: {
    schemas: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
  servers?: Array<{ url: string; description?: string }>;
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}

export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: {
    description?: string;
    required?: boolean;
    content: Record<string, { schema: OpenAPISchema }>;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema: OpenAPISchema }>;
    }
  >;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenAPISchema;
}

// ============================================================================
// ZOD TO OPENAPI CONVERSION
// ============================================================================

/**
 * Convert a Zod schema to OpenAPI schema.
 *
 * Note: This is a simplified converter that handles common cases.
 * For complex schemas or full Zod v4 support, consider using
 * a dedicated library like @asteasolutions/zod-to-openapi.
 *
 * @param schema - The Zod schema to convert
 * @param _name - Optional name for the schema
 * @returns OpenAPI schema object
 */
export function zodToOpenAPI(schema: z.ZodTypeAny, _name?: string): OpenAPISchema {
  return convertZodType(schema);
}

/**
 * Check if a value looks like a Zod schema
 */
function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_def' in value &&
    typeof (value as Record<string, unknown>)._def === 'object'
  );
}

/**
 * Get the Zod type name using a safe approach for Zod v4
 */
function getZodTypeName(schema: z.ZodTypeAny): string {
  // Safety check
  if (!isZodSchema(schema)) {
    return 'Unknown';
  }

  // Zod v4 uses constructor name
  const name = schema.constructor.name;
  // Also try to detect via duck typing for common types
  const def = schema._def as unknown as Record<string, unknown>;
  if ('typeName' in def && typeof def.typeName === 'string') {
    return def.typeName;
  }
  return name;
}

/**
 * Safely extract the _def property from a Zod schema
 */
function getZodDef(schema: z.ZodTypeAny): Record<string, unknown> {
  return schema._def as unknown as Record<string, unknown>;
}

function convertZodType(schema: z.ZodTypeAny): OpenAPISchema {
  const typeName = getZodTypeName(schema);

  // Handle by constructor name (Zod v4 approach)
  if (typeName.includes('String') || typeName === 'ZodString') {
    return { type: 'string' };
  }

  if (typeName.includes('Number') || typeName === 'ZodNumber') {
    return { type: 'number' };
  }

  if (typeName.includes('Boolean') || typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }

  if (typeName.includes('Date') || typeName === 'ZodDate') {
    return { type: 'string', format: 'date-time' };
  }

  if (typeName.includes('Literal') || typeName === 'ZodLiteral') {
    const def = getZodDef(schema);
    if ('value' in def) {
      return convertLiteral(def.value);
    }
    return {};
  }

  if (typeName.includes('Enum') || typeName === 'ZodEnum') {
    const def = getZodDef(schema);
    if ('values' in def && Array.isArray(def.values)) {
      return { type: 'string', enum: def.values };
    }
    return { type: 'string' };
  }

  if (typeName.includes('Array') || typeName === 'ZodArray') {
    const def = getZodDef(schema);
    // Zod v4 might use 'element' instead of 'type' for array items
    const elementType = def.type || def.element;
    if (elementType && isZodSchema(elementType)) {
      return {
        type: 'array',
        items: convertZodType(elementType as z.ZodTypeAny),
      };
    }
    return { type: 'array' };
  }

  if (typeName.includes('Object') || typeName === 'ZodObject') {
    return convertObject(schema as z.ZodObject<z.ZodRawShape>);
  }

  if (typeName.includes('Record') || typeName === 'ZodRecord') {
    const def = getZodDef(schema);
    if ('valueType' in def && def.valueType) {
      return {
        type: 'object',
        additionalProperties: convertZodType(def.valueType as z.ZodTypeAny),
      };
    }
    return { type: 'object', additionalProperties: true };
  }

  if (typeName.includes('Union') || typeName === 'ZodUnion') {
    const def = getZodDef(schema);
    if ('options' in def && Array.isArray(def.options)) {
      return {
        oneOf: def.options.map((opt: z.ZodTypeAny) => convertZodType(opt)),
      };
    }
    return {};
  }

  if (typeName.includes('Nullable') || typeName === 'ZodNullable') {
    const def = getZodDef(schema);
    if ('innerType' in def && def.innerType) {
      return { ...convertZodType(def.innerType as z.ZodTypeAny), nullable: true };
    }
    return { nullable: true };
  }

  if (typeName.includes('Optional') || typeName === 'ZodOptional') {
    const def = getZodDef(schema);
    if ('innerType' in def && def.innerType) {
      return convertZodType(def.innerType as z.ZodTypeAny);
    }
    return {};
  }

  if (typeName.includes('Default') || typeName === 'ZodDefault') {
    const def = getZodDef(schema);
    if ('innerType' in def && def.innerType) {
      const innerSchema = convertZodType(def.innerType as z.ZodTypeAny);
      if ('defaultValue' in def && typeof def.defaultValue === 'function') {
        return { ...innerSchema, default: (def.defaultValue as () => unknown)() };
      }
      return innerSchema;
    }
    return {};
  }

  if (typeName.includes('Any') || typeName === 'ZodAny') {
    return {};
  }

  if (typeName.includes('Unknown') || typeName === 'ZodUnknown') {
    return {};
  }

  // Fallback for unknown types
  return {};
}

function convertLiteral(value: unknown): OpenAPISchema {
  if (typeof value === 'string') {
    return { type: 'string', enum: [value] };
  }
  if (typeof value === 'number') {
    return { type: 'number', enum: [value] };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', enum: [value] };
  }
  return { enum: [value] };
}

function convertObject(schema: z.ZodObject<z.ZodRawShape>): OpenAPISchema {
  const shape = schema.shape;
  const properties: Record<string, OpenAPISchema> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = convertZodType(value as z.ZodTypeAny);

    // Check if field is required (not optional or nullable)
    if (!isOptional(value as z.ZodTypeAny)) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = getZodTypeName(schema);
  return (
    typeName.includes('Optional') ||
    typeName.includes('Nullable') ||
    typeName.includes('Default') ||
    typeName === 'ZodOptional' ||
    typeName === 'ZodNullable' ||
    typeName === 'ZodDefault'
  );
}

// ============================================================================
// OPENAPI DOCUMENT BUILDER
// ============================================================================

/**
 * Builder for creating OpenAPI documents
 */
export class OpenAPIDocumentBuilder {
  private doc: OpenAPIDocument;

  constructor(info: { title: string; version: string; description?: string }) {
    this.doc = {
      openapi: '3.0.3',
      info,
      paths: {},
      components: {
        schemas: {},
      },
    };
  }

  /**
   * Add a server
   */
  addServer(url: string, description?: string): this {
    if (!this.doc.servers) {
      this.doc.servers = [];
    }
    this.doc.servers.push({ url, description });
    return this;
  }

  /**
   * Add a schema from Zod
   */
  addSchema(name: string, schema: z.ZodTypeAny): this {
    this.doc.components.schemas[name] = zodToOpenAPI(schema, name);
    return this;
  }

  /**
   * Add a raw schema
   */
  addRawSchema(name: string, schema: OpenAPISchema): this {
    this.doc.components.schemas[name] = schema;
    return this;
  }

  /**
   * Add a path operation
   */
  addPath(
    path: string,
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    operation: OpenAPIOperation
  ): this {
    if (!this.doc.paths[path]) {
      this.doc.paths[path] = {};
    }
    this.doc.paths[path][method] = operation;
    return this;
  }

  /**
   * Add security scheme
   */
  addSecurityScheme(name: string, scheme: unknown): this {
    if (!this.doc.components.securitySchemes) {
      this.doc.components.securitySchemes = {};
    }
    this.doc.components.securitySchemes[name] = scheme;
    return this;
  }

  /**
   * Build the document
   */
  build(): OpenAPIDocument {
    return this.doc;
  }

  /**
   * Build as JSON string
   */
  toJSON(pretty = true): string {
    return pretty ? JSON.stringify(this.doc, null, 2) : JSON.stringify(this.doc);
  }

  /**
   * Build as YAML string (simplified)
   */
  toYAML(): string {
    return jsonToSimpleYAML(this.doc);
  }
}

/**
 * Simple JSON to YAML converter (for basic cases)
 */
function jsonToSimpleYAML(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':')) {
      return `|\n${obj
        .split('\n')
        .map((line) => spaces + '  ' + line)
        .join('\n')}`;
    }
    return /[:#{}[\],&*?|<>=!%@`]/.test(obj) ? `"${obj}"` : obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => `${spaces}- ${jsonToSimpleYAML(item, indent + 1).trim()}`).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    return entries
      .map(([key, value]) => {
        const valueStr = jsonToSimpleYAML(value, indent + 1);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return `${spaces}${key}:\n${valueStr}`;
        }
        return `${spaces}${key}: ${valueStr}`;
      })
      .join('\n');
  }
  return String(obj);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a schema reference
 */
export function schemaRef(name: string): OpenAPISchema {
  return { $ref: `#/components/schemas/${name}` };
}

/**
 * Create a JSON content type wrapper
 */
export function jsonContent(schema: OpenAPISchema): Record<string, { schema: OpenAPISchema }> {
  return {
    'application/json': { schema },
  };
}

/**
 * Create standard API response schemas
 */
export function createStandardResponses(dataSchemaRef: string): Record<string, unknown> {
  return {
    '200': {
      description: 'Successful response',
      content: jsonContent({
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [true] },
          data: schemaRef(dataSchemaRef),
        },
        required: ['success', 'data'],
      }),
    },
    '400': {
      description: 'Bad request',
      content: jsonContent(schemaRef('ApiError')),
    },
    '401': {
      description: 'Unauthorized',
      content: jsonContent(schemaRef('ApiError')),
    },
    '404': {
      description: 'Not found',
      content: jsonContent(schemaRef('ApiError')),
    },
    '500': {
      description: 'Internal server error',
      content: jsonContent(schemaRef('ApiError')),
    },
  };
}
