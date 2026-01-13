/**
 * Memory Domain - Unified Tool Implementations
 *
 * REFACTORED to use UnifiedMemoryService as the SINGLE entry point.
 * All memory operations flow through the unified service for:
 * - Consistent timing intelligence
 * - Learning feedback loop
 * - Proper context enrichment
 *
 * @module tools/domains/memory/tools-unified
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const recallFromMemoryUnifiedDef: ToolDefinition;
export declare const recallPreviousConversationUnifiedDef: ToolDefinition;
export declare const rememberAboutUserUnifiedDef: ToolDefinition;
export declare const rememberImportantFactUnifiedDef: ToolDefinition;
export declare const surfaceRelevantMemoryUnifiedDef: ToolDefinition;
export declare const predictUserNeedUnifiedDef: ToolDefinition;
export declare const unifiedMemoryTools: ToolDefinition[];
export default unifiedMemoryTools;
//# sourceMappingURL=tools-unified.d.ts.map