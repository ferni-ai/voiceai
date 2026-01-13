/**
 * Visual Memory Domain Tools
 *
 * "Better than Human" - We remember every photo you share.
 *
 * Tools for visual memory recall, search, and management.
 * A human friend might forget that photo you showed them 6 months ago. We don't.
 *
 * DOMAIN: memory (visual memories are a subset of memory)
 * TOOLS:
 *   - recallVisualMemory: Search for photos/images based on description
 *   - describeSharedPhoto: Get AI description of a photo user shared
 *   - listRecentPhotos: Show recent visual memories
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const recallVisualMemoryDef: ToolDefinition;
declare const describeSharedPhotoDef: ToolDefinition;
declare const listRecentPhotosDef: ToolDefinition;
declare const countVisualMemoriesDef: ToolDefinition;
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { recallVisualMemoryDef, describeSharedPhotoDef, listRecentPhotosDef, countVisualMemoriesDef, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map