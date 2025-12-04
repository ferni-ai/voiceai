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

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import legacy tool creators
import { createTaskTools } from '../../tasks.js';
import { createNotesTools } from '../../notes.js';
import { createRoutineTools } from '../../routines.js';
import { createShoppingTools } from '../../shopping.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

/**
 * Wraps a legacy tool function in a registry-compatible definition
 */
function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'productivity',
    tags: ['productivity', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// TASK TOOLS
// ============================================================================

function getTaskToolDefinitions(): ToolDefinition[] {
  const legacyTools = createTaskTools();

  return [
    wrapLegacyTool(
      'addTask',
      'Add Task',
      'Create a new task or to-do item with optional due date and priority',
      legacyTools.addTask,
      ['tasks', 'create']
    ),
    wrapLegacyTool(
      'completeTask',
      'Complete Task',
      'Mark a task as completed with optional completion notes',
      legacyTools.completeTask,
      ['tasks', 'complete']
    ),
    wrapLegacyTool(
      'getTasks',
      'Get Tasks',
      'Get list of tasks filtered by status, category, or due date',
      legacyTools.getTasks,
      ['tasks', 'list']
    ),
    wrapLegacyTool(
      'updateTaskPriority',
      'Update Task Priority',
      'Change the priority of an existing task',
      legacyTools.updateTaskPriority,
      ['tasks', 'update']
    ),
    wrapLegacyTool(
      'rescheduleTask',
      'Reschedule Task',
      'Change the due date or time of a task',
      legacyTools.rescheduleTask,
      ['tasks', 'update']
    ),
    wrapLegacyTool(
      'deleteTask',
      'Delete Task',
      'Remove a task from the list',
      legacyTools.deleteTask,
      ['tasks', 'delete']
    ),
    wrapLegacyTool(
      'getTaskSummary',
      'Get Task Summary',
      'Get a summary of tasks including counts by status and upcoming items',
      legacyTools.getTaskSummary,
      ['tasks', 'summary']
    ),
  ];
}

// ============================================================================
// NOTES TOOLS
// ============================================================================

function getNotesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createNotesTools();

  return [
    wrapLegacyTool(
      'saveNote',
      'Save Note',
      'Save a quick note, thought, or idea for later reference',
      legacyTools.saveNote,
      ['notes', 'create']
    ),
    wrapLegacyTool(
      'getRecentNotes',
      'Get Recent Notes',
      'Retrieve recently saved notes',
      legacyTools.getRecentNotes,
      ['notes', 'list']
    ),
    wrapLegacyTool(
      'searchNotes',
      'Search Notes',
      'Search through saved notes by keyword or topic',
      legacyTools.searchNotes,
      ['notes', 'search']
    ),
    wrapLegacyTool(
      'startJournal',
      'Start Journal',
      'Begin a journaling session with prompts and mood tracking',
      legacyTools.startJournal,
      ['notes', 'journal']
    ),
    wrapLegacyTool(
      'addGratitude',
      'Add Gratitude',
      'Record something you are grateful for today',
      legacyTools.addGratitude,
      ['notes', 'gratitude', 'journal']
    ),
    wrapLegacyTool(
      'recordMood',
      'Record Mood',
      'Log your current mood and emotional state',
      legacyTools.recordMood,
      ['notes', 'mood', 'journal']
    ),
    wrapLegacyTool(
      'completeJournal',
      'Complete Journal',
      'Finish and save the current journaling session',
      legacyTools.completeJournal,
      ['notes', 'journal']
    ),
    wrapLegacyTool(
      'getJournalHistory',
      'Get Journal History',
      'View past journal entries and mood trends',
      legacyTools.getJournalHistory,
      ['notes', 'journal', 'history']
    ),
    wrapLegacyTool(
      'getJournalPrompt',
      'Get Journal Prompt',
      'Get a thoughtful prompt to inspire journaling',
      legacyTools.getJournalPrompt,
      ['notes', 'journal', 'prompts']
    ),
  ];
}

// ============================================================================
// ROUTINE TOOLS
// ============================================================================

function getRoutineToolDefinitions(): ToolDefinition[] {
  const legacyTools = createRoutineTools();

  return [
    wrapLegacyTool(
      'createRoutine',
      'Create Routine',
      'Create a new daily or weekly routine with steps',
      legacyTools.createRoutine,
      ['routines', 'create']
    ),
    wrapLegacyTool(
      'startRoutine',
      'Start Routine',
      'Begin a routine and track progress through its steps',
      legacyTools.startRoutine,
      ['routines', 'start']
    ),
    wrapLegacyTool(
      'routineStepDone',
      'Routine Step Done',
      'Mark the current step of a routine as complete',
      legacyTools.routineStepDone,
      ['routines', 'progress']
    ),
    wrapLegacyTool(
      'skipRoutineStep',
      'Skip Routine Step',
      'Skip a step in the current routine',
      legacyTools.skipRoutineStep,
      ['routines', 'progress']
    ),
    wrapLegacyTool(
      'getRoutineProgress',
      'Get Routine Progress',
      'Check progress on the current routine',
      legacyTools.getRoutineProgress,
      ['routines', 'progress']
    ),
    wrapLegacyTool(
      'listRoutines',
      'List Routines',
      'View all saved routines',
      legacyTools.listRoutines,
      ['routines', 'list']
    ),
  ];
}

// ============================================================================
// SHOPPING TOOLS
// ============================================================================

function getShoppingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createShoppingTools();

  return [
    wrapLegacyTool(
      'addToShoppingList',
      'Add to Shopping List',
      'Add an item to the shopping list with optional quantity and category',
      legacyTools.addToShoppingList,
      ['shopping', 'add']
    ),
    wrapLegacyTool(
      'getShoppingList',
      'Get Shopping List',
      'View the current shopping list',
      legacyTools.getShoppingList,
      ['shopping', 'list']
    ),
    wrapLegacyTool(
      'checkOffItem',
      'Check Off Item',
      'Mark an item as purchased/obtained',
      legacyTools.checkOffItem,
      ['shopping', 'complete']
    ),
    wrapLegacyTool(
      'removeFromList',
      'Remove from List',
      'Remove an item from the shopping list',
      legacyTools.removeFromList,
      ['shopping', 'delete']
    ),
    wrapLegacyTool(
      'clearCheckedItems',
      'Clear Checked Items',
      'Remove all checked items from the shopping list',
      legacyTools.clearCheckedItems,
      ['shopping', 'cleanup']
    ),
    wrapLegacyTool(
      'clearShoppingList',
      'Clear Shopping List',
      'Clear the entire shopping list',
      legacyTools.clearShoppingList,
      ['shopping', 'cleanup']
    ),
    wrapLegacyTool(
      'getListSummary',
      'Get List Summary',
      'Get a summary of shopping list status',
      legacyTools.getListSummary,
      ['shopping', 'summary']
    ),
    wrapLegacyTool(
      'quickAdd',
      'Quick Add',
      'Quickly add multiple items to the shopping list from natural language',
      legacyTools.quickAdd,
      ['shopping', 'add', 'bulk']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const productivityTools: ToolDefinition[] = [
  ...getTaskToolDefinitions(),
  ...getNotesToolDefinitions(),
  ...getRoutineToolDefinitions(),
  ...getShoppingToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'productivity',
  productivityTools
);

// Export individual tool groups for selective imports
export { getTaskToolDefinitions, getNotesToolDefinitions, getRoutineToolDefinitions, getShoppingToolDefinitions };

export default getToolDefinitions;

