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
export function zodToOpenAPI(schema, _name) {
    return convertZodType(schema);
}
/**
 * Check if a value looks like a Zod schema
 */
function isZodSchema(value) {
    return (value !== null &&
        typeof value === 'object' &&
        '_def' in value &&
        typeof value._def === 'object');
}
/**
 * Get the Zod type name using a safe approach for Zod v4
 */
function getZodTypeName(schema) {
    // Safety check
    if (!isZodSchema(schema)) {
        return 'Unknown';
    }
    // Zod v4 uses constructor name
    const name = schema.constructor.name;
    // Also try to detect via duck typing for common types
    const def = schema._def;
    if ('typeName' in def && typeof def.typeName === 'string') {
        return def.typeName;
    }
    return name;
}
/**
 * Safely extract the _def property from a Zod schema
 */
function getZodDef(schema) {
    return schema._def;
}
function convertZodType(schema) {
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
                items: convertZodType(elementType),
            };
        }
        return { type: 'array' };
    }
    if (typeName.includes('Object') || typeName === 'ZodObject') {
        return convertObject(schema);
    }
    if (typeName.includes('Record') || typeName === 'ZodRecord') {
        const def = getZodDef(schema);
        if ('valueType' in def && def.valueType) {
            return {
                type: 'object',
                additionalProperties: convertZodType(def.valueType),
            };
        }
        return { type: 'object', additionalProperties: true };
    }
    if (typeName.includes('Union') || typeName === 'ZodUnion') {
        const def = getZodDef(schema);
        if ('options' in def && Array.isArray(def.options)) {
            return {
                oneOf: def.options.map((opt) => convertZodType(opt)),
            };
        }
        return {};
    }
    if (typeName.includes('Nullable') || typeName === 'ZodNullable') {
        const def = getZodDef(schema);
        if ('innerType' in def && def.innerType) {
            return { ...convertZodType(def.innerType), nullable: true };
        }
        return { nullable: true };
    }
    if (typeName.includes('Optional') || typeName === 'ZodOptional') {
        const def = getZodDef(schema);
        if ('innerType' in def && def.innerType) {
            return convertZodType(def.innerType);
        }
        return {};
    }
    if (typeName.includes('Default') || typeName === 'ZodDefault') {
        const def = getZodDef(schema);
        if ('innerType' in def && def.innerType) {
            const innerSchema = convertZodType(def.innerType);
            if ('defaultValue' in def && typeof def.defaultValue === 'function') {
                return { ...innerSchema, default: def.defaultValue() };
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
function convertLiteral(value) {
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
function convertObject(schema) {
    const shape = schema.shape;
    const properties = {};
    const required = [];
    for (const [key, value] of Object.entries(shape)) {
        properties[key] = convertZodType(value);
        // Check if field is required (not optional or nullable)
        if (!isOptional(value)) {
            required.push(key);
        }
    }
    return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}
function isOptional(schema) {
    const typeName = getZodTypeName(schema);
    return (typeName.includes('Optional') ||
        typeName.includes('Nullable') ||
        typeName.includes('Default') ||
        typeName === 'ZodOptional' ||
        typeName === 'ZodNullable' ||
        typeName === 'ZodDefault');
}
// ============================================================================
// OPENAPI DOCUMENT BUILDER
// ============================================================================
/**
 * Builder for creating OpenAPI documents
 */
export class OpenAPIDocumentBuilder {
    doc;
    constructor(info) {
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
    addServer(url, description) {
        if (!this.doc.servers) {
            this.doc.servers = [];
        }
        this.doc.servers.push({ url, description });
        return this;
    }
    /**
     * Add a schema from Zod
     */
    addSchema(name, schema) {
        this.doc.components.schemas[name] = zodToOpenAPI(schema, name);
        return this;
    }
    /**
     * Add a raw schema
     */
    addRawSchema(name, schema) {
        this.doc.components.schemas[name] = schema;
        return this;
    }
    /**
     * Add a path operation
     */
    addPath(path, method, operation) {
        if (!this.doc.paths[path]) {
            this.doc.paths[path] = {};
        }
        this.doc.paths[path][method] = operation;
        return this;
    }
    /**
     * Add security scheme
     */
    addSecurityScheme(name, scheme) {
        if (!this.doc.components.securitySchemes) {
            this.doc.components.securitySchemes = {};
        }
        this.doc.components.securitySchemes[name] = scheme;
        return this;
    }
    /**
     * Build the document
     */
    build() {
        return this.doc;
    }
    /**
     * Build as JSON string
     */
    toJSON(pretty = true) {
        return pretty ? JSON.stringify(this.doc, null, 2) : JSON.stringify(this.doc);
    }
    /**
     * Build as YAML string (simplified)
     */
    toYAML() {
        return jsonToSimpleYAML(this.doc);
    }
}
/**
 * Simple JSON to YAML converter (for basic cases)
 */
function jsonToSimpleYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    if (obj === null)
        return 'null';
    if (obj === undefined)
        return '';
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
        if (obj.length === 0)
            return '[]';
        return obj.map((item) => `${spaces}- ${jsonToSimpleYAML(item, indent + 1).trim()}`).join('\n');
    }
    if (typeof obj === 'object') {
        const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
        if (entries.length === 0)
            return '{}';
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
export function schemaRef(name) {
    return { $ref: `#/components/schemas/${name}` };
}
/**
 * Create a JSON content type wrapper
 */
export function jsonContent(schema) {
    return {
        'application/json': { schema },
    };
}
/**
 * Create standard API response schemas
 */
export function createStandardResponses(dataSchemaRef) {
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
//# sourceMappingURL=schema-generator.js.map