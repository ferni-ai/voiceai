/**
 * OpenAPI Module
 *
 * Tools for generating OpenAPI documentation from Zod schemas.
 *
 * @module types/openapi
 */

export {
  // Builder
  OpenAPIDocumentBuilder,
  // Helpers
  createStandardResponses,
  jsonContent,
  schemaRef,
  // Core conversion
  zodToOpenAPI,
  // Types
  type OpenAPIDocument,
  type OpenAPIOperation,
  type OpenAPIParameter,
  type OpenAPIPathItem,
  type OpenAPISchema,
} from './schema-generator.js';
