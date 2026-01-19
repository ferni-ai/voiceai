/**
 * Tool Registry Interface
 *
 * Abstract interface for tool discovery and registration.
 * Enables loose coupling between context builders and tool implementations.
 *
 * @module tools/interfaces/tool-registry.interface
 */

import type { IToolDefinition, IToolMetadata } from './tool-definition.interface.js';

/**
 * Interface for tool registry operations.
 * Implementations include: DomainRegistry, SemanticRouter, DynamicToolLoader
 */
export interface IToolRegistry {
  /**
   * Get all registered tool IDs.
   */
  getToolIds(): string[];

  /**
   * Get a tool definition by ID.
   */
  getToolDefinition(toolId: string): IToolDefinition | undefined;

  /**
   * Get tools by domain.
   */
  getToolsByDomain(domain: string): IToolDefinition[];

  /**
   * Get tools by tag.
   */
  getToolsByTag(tag: string): IToolDefinition[];

  /**
   * Search tools by query (semantic or keyword).
   */
  searchTools(query: string, options?: ToolSearchOptions): IToolDefinition[];

  /**
   * Get tool metadata without loading the full definition.
   */
  getToolMetadata(toolId: string): IToolMetadata | undefined;

  /**
   * Check if a tool exists.
   */
  hasToolId(toolId: string): boolean;

  /**
   * Get all domains.
   */
  getDomains(): string[];

  /**
   * Get all tags.
   */
  getTags(): string[];
}

/**
 * Options for tool search.
 */
export interface ToolSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum relevance score (0-1) */
  minScore?: number;
  /** Filter by domain */
  domain?: string;
  /** Filter by tags */
  tags?: string[];
  /** Include disabled tools */
  includeDisabled?: boolean;
}

/**
 * Read-only tool registry for context builders.
 * Subset of IToolRegistry that doesn't allow modifications.
 */
export type IReadOnlyToolRegistry = Pick<
  IToolRegistry,
  | 'getToolIds'
  | 'getToolDefinition'
  | 'getToolsByDomain'
  | 'getToolsByTag'
  | 'searchTools'
  | 'getToolMetadata'
  | 'hasToolId'
  | 'getDomains'
  | 'getTags'
>;
