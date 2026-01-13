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
    servers?: Array<{
        url: string;
        description?: string;
    }>;
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
        content: Record<string, {
            schema: OpenAPISchema;
        }>;
    };
    responses: Record<string, {
        description: string;
        content?: Record<string, {
            schema: OpenAPISchema;
        }>;
    }>;
    security?: Array<Record<string, string[]>>;
}
export interface OpenAPIParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema: OpenAPISchema;
}
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
export declare function zodToOpenAPI(schema: z.ZodTypeAny, _name?: string): OpenAPISchema;
/**
 * Builder for creating OpenAPI documents
 */
export declare class OpenAPIDocumentBuilder {
    private doc;
    constructor(info: {
        title: string;
        version: string;
        description?: string;
    });
    /**
     * Add a server
     */
    addServer(url: string, description?: string): this;
    /**
     * Add a schema from Zod
     */
    addSchema(name: string, schema: z.ZodTypeAny): this;
    /**
     * Add a raw schema
     */
    addRawSchema(name: string, schema: OpenAPISchema): this;
    /**
     * Add a path operation
     */
    addPath(path: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', operation: OpenAPIOperation): this;
    /**
     * Add security scheme
     */
    addSecurityScheme(name: string, scheme: unknown): this;
    /**
     * Build the document
     */
    build(): OpenAPIDocument;
    /**
     * Build as JSON string
     */
    toJSON(pretty?: boolean): string;
    /**
     * Build as YAML string (simplified)
     */
    toYAML(): string;
}
/**
 * Create a schema reference
 */
export declare function schemaRef(name: string): OpenAPISchema;
/**
 * Create a JSON content type wrapper
 */
export declare function jsonContent(schema: OpenAPISchema): Record<string, {
    schema: OpenAPISchema;
}>;
/**
 * Create standard API response schemas
 */
export declare function createStandardResponses(dataSchemaRef: string): Record<string, unknown>;
//# sourceMappingURL=schema-generator.d.ts.map