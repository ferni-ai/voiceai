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

import { z } from 'zod';

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
 * Convert a Zod schema to OpenAPI schema
 */
export function zodToOpenAPI(schema: z.ZodTypeAny, name?: string): OpenAPISchema {
  return convertZodType(schema, name);
}

function convertZodType(schema: z.ZodTypeAny, name?: string): OpenAPISchema {
  const def = schema._def;
  const typeName = def.typeName;

  // Handle description
  const description = def.description;
  const base: OpenAPISchema = description ? { description } : {};

  switch (typeName) {
    case 'ZodString':
      return convertString(schema as z.ZodString, base);

    case 'ZodNumber':
      return convertNumber(schema as z.ZodNumber, base);

    case 'ZodBoolean':
      return { ...base, type: 'boolean' };

    case 'ZodDate':
      return { ...base, type: 'string', format: 'date-time' };

    case 'ZodLiteral':
      return convertLiteral(def.value, base);

    case 'ZodEnum':
      return { ...base, type: 'string', enum: def.values };

    case 'ZodNativeEnum':
      return { ...base, type: 'string', enum: Object.values(def.values) };

    case 'ZodArray':
      return {
        ...base,
        type: 'array',
        items: convertZodType(def.type),
      };

    case 'ZodObject':
      return convertObject(schema as z.ZodObject<z.ZodRawShape>, base);

    case 'ZodRecord':
      return {
        ...base,
        type: 'object',
        additionalProperties: convertZodType(def.valueType),
      };

    case 'ZodUnion':
      return {
        ...base,
        oneOf: def.options.map((opt: z.ZodTypeAny) => convertZodType(opt)),
      };

    case 'ZodDiscriminatedUnion':
      return {
        ...base,
        oneOf: [...def.options.values()].map((opt: z.ZodTypeAny) => convertZodType(opt)),
      };

    case 'ZodIntersection':
      return {
        ...base,
        allOf: [convertZodType(def.left), convertZodType(def.right)],
      };

    case 'ZodTuple':
      return {
        ...base,
        type: 'array',
        items: { oneOf: def.items.map((item: z.ZodTypeAny) => convertZodType(item)) },
        minItems: def.items.length,
        maxItems: def.items.length,
      } as OpenAPISchema;

    case 'ZodNullable':
      return { ...convertZodType(def.innerType), nullable: true };

    case 'ZodOptional':
      return convertZodType(def.innerType);

    case 'ZodDefault':
      return { ...convertZodType(def.innerType), default: def.defaultValue() };

    case 'ZodEffects':
      // For refined types, just use the inner type
      return convertZodType(def.schema);

    case 'ZodLazy':
      // For lazy types, evaluate and convert
      return convertZodType(def.getter());

    case 'ZodPromise':
      return convertZodType(def.type);

    case 'ZodNaN':
      return { ...base, type: 'number' };

    case 'ZodNull':
      return { ...base, type: 'null' as unknown as string };

    case 'ZodUndefined':
    case 'ZodVoid':
      return { ...base };

    case 'ZodAny':
    case 'ZodUnknown':
      return { ...base };

    case 'ZodNever':
      return { ...base, not: {} } as OpenAPISchema;

    default:
      // Fallback for unknown types
      console.warn(`Unknown Zod type: ${typeName}`);
      return base;
  }
}

function convertString(schema: z.ZodString, base: OpenAPISchema): OpenAPISchema {
  const result: OpenAPISchema = { ...base, type: 'string' };
  const checks = schema._def.checks || [];

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result.minLength = check.value;
        break;
      case 'max':
        result.maxLength = check.value;
        break;
      case 'length':
        result.minLength = check.value;
        result.maxLength = check.value;
        break;
      case 'email':
        result.format = 'email';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      case 'regex':
        result.pattern = check.regex.source;
        break;
      case 'datetime':
        result.format = 'date-time';
        break;
      case 'date':
        result.format = 'date';
        break;
      case 'time':
        result.format = 'time';
        break;
      case 'ip':
        result.format = check.version === 'v4' ? 'ipv4' : 'ipv6';
        break;
    }
  }

  return result;
}

function convertNumber(schema: z.ZodNumber, base: OpenAPISchema): OpenAPISchema {
  const result: OpenAPISchema = { ...base, type: 'number' };
  const checks = schema._def.checks || [];

  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result.minimum = check.value;
        break;
      case 'max':
        result.maximum = check.value;
        break;
      case 'int':
        result.type = 'integer';
        break;
      case 'multipleOf':
        (result as Record<string, unknown>).multipleOf = check.value;
        break;
    }
  }

  return result;
}

function convertLiteral(value: unknown, base: OpenAPISchema): OpenAPISchema {
  if (typeof value === 'string') {
    return { ...base, type: 'string', enum: [value] };
  }
  if (typeof value === 'number') {
    return { ...base, type: 'number', enum: [value] };
  }
  if (typeof value === 'boolean') {
    return { ...base, type: 'boolean', enum: [value] };
  }
  return { ...base, enum: [value] };
}

function convertObject(
  schema: z.ZodObject<z.ZodRawShape>,
  base: OpenAPISchema
): OpenAPISchema {
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
    ...base,
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = schema._def.typeName;
  if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
    return true;
  }
  if (typeName === 'ZodDefault') {
    return true;
  }
  return false;
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
