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
import { createTaskTools } from './tasks.js';
import { createNotesTools } from './notes.js';
import { createRoutineTools } from './routines.js';
import { createShoppingTools } from '../home/shopping.js';
import { createBillTools } from '../finance/bills.js';
import { createPackageTools } from '../home/packages.js';
import { createTravelTools } from '../travel/travel.js';

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
// TASK TOOLS (Consolidated: 7 → 4 essential tools)
// ============================================================================

function getTaskToolDefinitions(): ToolDefinition[] {
  const legacyTools = createTaskTools();

  // Consolidated: addTask, completeTask, getTasks, getTaskSummary
  // Removed: updateTaskPriority, rescheduleTask, deleteTask (can be handled via addTask with update semantics)
  return [
    wrapLegacyTool(
      'addTask',
      'Add Task',
      'Create a new task or to-do item with optional due date and priority. Can also update existing tasks by providing the task ID.',
      legacyTools.addTask,
      ['tasks', 'create', 'update']
    ),
    wrapLegacyTool(
      'completeTask',
      'Complete Task',
      'Mark a task as completed, or delete it entirely if no longer needed',
      legacyTools.completeTask,
      ['tasks', 'complete', 'delete']
    ),
    wrapLegacyTool(
      'getTasks',
      'Get Tasks',
      'Get list of tasks filtered by status, category, or due date. Also shows upcoming items and anything waiting for attention.',
      legacyTools.getTasks,
      ['tasks', 'list', 'summary']
    ),
  ];
}

// ============================================================================
// NOTES TOOLS (Consolidated: 9 → 4 essential tools)
// ============================================================================

function getNotesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createNotesTools();

  // Consolidated: saveNote handles notes/gratitude/mood, getNotes combines recent+search,
  // journal combines start/complete/history/prompts into one tool
  return [
    wrapLegacyTool(
      'saveNote',
      'Save Note',
      'Save a note, thought, gratitude, or mood entry. Specify type: "note", "gratitude", or "mood".',
      legacyTools.saveNote,
      ['notes', 'create', 'gratitude', 'mood']
    ),
    wrapLegacyTool(
      'getNotes',
      'Get Notes',
      'Get recent notes or search by keyword. Returns notes, gratitude entries, and mood logs.',
      legacyTools.getRecentNotes,
      ['notes', 'list', 'search']
    ),
    wrapLegacyTool(
      'journal',
      'Journal',
      'Start a journaling session, record entries, get prompts, or view journal history. Action: "start", "write", "prompt", or "history".',
      legacyTools.startJournal,
      ['notes', 'journal']
    ),
  ];
}

// ============================================================================
// ROUTINE TOOLS (Consolidated: 6 → 3 essential tools)
// ============================================================================

function getRoutineToolDefinitions(): ToolDefinition[] {
  const legacyTools = createRoutineTools();

  // Consolidated: manageRoutine handles create/list/delete, runRoutine handles start/progress/step
  return [
    wrapLegacyTool(
      'manageRoutine',
      'Manage Routine',
      'Create, list, or delete routines. For creating, specify steps and frequency (daily/weekly).',
      legacyTools.createRoutine,
      ['routines', 'create', 'list', 'delete']
    ),
    wrapLegacyTool(
      'runRoutine',
      'Run Routine',
      'Start a routine, mark steps complete, skip steps, or check progress. Action: "start", "done", "skip", or "status".',
      legacyTools.startRoutine,
      ['routines', 'start', 'progress']
    ),
  ];
}

// ============================================================================
// SHOPPING TOOLS (Consolidated: 8 → 3 essential tools)
// ============================================================================

function getShoppingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createShoppingTools();

  // Consolidated: shoppingList handles add/view/check/remove/clear as a unified tool
  return [
    wrapLegacyTool(
      'shoppingList',
      'Shopping List',
      'Manage shopping list: add items (supports multiple), view list, check off items, remove items, or clear list. Action: "add", "view", "check", "remove", or "clear".',
      legacyTools.addToShoppingList,
      ['shopping', 'add', 'list', 'check', 'remove']
    ),
  ];
}

// ============================================================================
// BILL TOOLS (Consolidated: 6 → 3 essential tools)
// ============================================================================

function getBillToolDefinitions(): ToolDefinition[] {
  const legacyTools = createBillTools();

  // Consolidated: addBill creates/manages bills, payBill records payments, getBills shows status
  return [
    wrapLegacyTool(
      'addBill',
      'Add Bill',
      'Add a recurring bill to track (rent, utilities, subscriptions, etc). Includes amount, due date, frequency, and autopay status.',
      legacyTools.addBill,
      ['bills', 'create', 'recurring', 'payments']
    ),
    wrapLegacyTool(
      'payBill',
      'Pay Bill',
      'Record a bill payment. Tracks payment history and updates next due date.',
      legacyTools.payBill,
      ['bills', 'payment', 'record']
    ),
    wrapLegacyTool(
      'getBills',
      'Get Bills',
      'View upcoming bills, overdue bills, or monthly bill summary. Shows amounts, due dates, and autopay status.',
      legacyTools.getUpcomingBills,
      ['bills', 'list', 'upcoming', 'overdue', 'summary']
    ),
  ];
}

// ============================================================================
// PACKAGE TRACKING TOOLS (Consolidated: 4 → 3 essential tools)
// ============================================================================

function getPackageToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPackageTools();

  // Consolidated: trackPackage adds new, getPackages shows all, checkPackageStatus for specific
  return [
    wrapLegacyTool(
      'trackPackage',
      'Track Package',
      'Add a package to track by providing tracking number. Auto-detects carrier (UPS, FedEx, USPS, Amazon, DHL).',
      legacyTools.trackPackage,
      ['packages', 'track', 'delivery', 'shipping']
    ),
    wrapLegacyTool(
      'getPackages',
      'Get Packages',
      'View all packages being tracked. Shows status, expected delivery, and carrier for each package.',
      legacyTools.getPackages,
      ['packages', 'list', 'status', 'delivery']
    ),
    wrapLegacyTool(
      'checkPackageStatus',
      'Check Package Status',
      'Check status of a specific package by tracking number or description.',
      legacyTools.checkPackageStatus,
      ['packages', 'status', 'tracking']
    ),
  ];
}

// ============================================================================
// TRAVEL TOOLS (Consolidated: 5 → 4 essential tools)
// ============================================================================

function getTravelToolDefinitions(): ToolDefinition[] {
  const legacyTools = createTravelTools();

  // Consolidated: searchFlights, searchHotels, planTrip, getSavedTrips
  return [
    wrapLegacyTool(
      'searchFlights',
      'Search Flights',
      'Search for flights between cities. Specify origin, destination, dates, passengers, and cabin class.',
      legacyTools.searchFlights,
      ['travel', 'flights', 'search', 'booking']
    ),
    wrapLegacyTool(
      'searchHotels',
      'Search Hotels',
      'Search for hotels in a destination. Specify city, check-in/out dates, guests, and rooms.',
      legacyTools.searchHotels,
      ['travel', 'hotels', 'search', 'accommodation']
    ),
    wrapLegacyTool(
      'planTrip',
      'Plan Trip',
      'Save a trip plan with destination, dates, flight/hotel selections, and notes.',
      legacyTools.planTrip,
      ['travel', 'trip', 'planning', 'save']
    ),
    wrapLegacyTool(
      'getSavedTrips',
      'Get Saved Trips',
      'View saved trips and upcoming travel plans.',
      legacyTools.getSavedTrips,
      ['travel', 'trips', 'list', 'upcoming']
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
  ...getBillToolDefinitions(),
  ...getPackageToolDefinitions(),
  ...getTravelToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'productivity',
  productivityTools
);

// Export individual tool groups for selective imports
export {
  getTaskToolDefinitions,
  getNotesToolDefinitions,
  getRoutineToolDefinitions,
  getShoppingToolDefinitions,
  getBillToolDefinitions,
  getPackageToolDefinitions,
  getTravelToolDefinitions,
};

export default getToolDefinitions;
