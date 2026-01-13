/**
 * Productivity Domain Tools
 *
 * Tools for daily productivity: tasks, notes, routines, shopping lists, etc.
 * This domain wraps existing legacy tools in registry-compatible definitions.
 *
 * DOMAIN: productivity
 * TOOLS:
 *   Tasks: addTask, completeTask, getTasks, rescheduleTask, getTaskSummary
 *   Notes: saveNote, getRecentNotes, searchNotes, startJournal
 *   Routines: createRoutine, startRoutine, routineStepDone, listRoutines
 *   Shopping: addToShoppingList, getShoppingList, checkOffItem
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function getTaskToolDefinitions(): ToolDefinition[];
declare function getNotesToolDefinitions(): ToolDefinition[];
declare function getRoutineToolDefinitions(): ToolDefinition[];
declare function getShoppingToolDefinitions(): ToolDefinition[];
declare function getBillToolDefinitions(): ToolDefinition[];
declare function getPackageToolDefinitions(): ToolDefinition[];
declare function getTravelToolDefinitions(): ToolDefinition[];
declare function getReminderToolDefinitions(): ToolDefinition[];
declare function getCommitmentToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getTaskToolDefinitions, getNotesToolDefinitions, getRoutineToolDefinitions, getShoppingToolDefinitions, getBillToolDefinitions, getPackageToolDefinitions, getTravelToolDefinitions, getReminderToolDefinitions, getCommitmentToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map