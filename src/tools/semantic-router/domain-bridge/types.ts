/**
 * Domain Bridge Types
 *
 * Shared type definitions for the semantic-to-domain tool mapping system.
 *
 * @module tools/semantic-router/domain-bridge/types
 */

/**
 * Maps semantic tool IDs to domain tool IDs and any argument transformations needed.
 */
export interface ToolMapping {
  /** Domain tool ID to delegate to */
  domainToolId: string;
  /** Optional argument transformation */
  transformArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}
