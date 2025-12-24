/**
 * General List Tools
 *
 * Create and manage any type of list: packing lists, bucket lists,
 * guest lists, reading lists, and more.
 *
 * Different from shopping lists (which have their own domain) and
 * tasks (which have due dates/priorities).
 *
 * @module simple-utilities/list-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ListItem {
  id: string;
  text: string;
  checked: boolean;
  addedAt: number;
  checkedAt?: number;
  notes?: string;
}

export interface UserList {
  id: string;
  userId: string;
  name: string;
  type: string; // 'packing', 'bucket', 'guest', 'reading', 'custom'
  items: ListItem[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

// In-memory fallback
const listStore = new Map<string, UserList[]>();

// Common list types with templates
const LIST_TEMPLATES: Record<string, { emoji: string; suggestions: string[] }> = {
  packing: {
    emoji: '🧳',
    suggestions: [
      'Passport',
      'Phone charger',
      'Toiletries',
      'Medications',
      'Underwear',
      'Socks',
      'Weather-appropriate clothes',
    ],
  },
  bucket: {
    emoji: '🌟',
    suggestions: [],
  },
  guest: {
    emoji: '👥',
    suggestions: [],
  },
  reading: {
    emoji: '📚',
    suggestions: [],
  },
  movies: {
    emoji: '🎬',
    suggestions: [],
  },
  groceries: {
    emoji: '🛒',
    suggestions: [],
  },
  gifts: {
    emoji: '🎁',
    suggestions: [],
  },
  restaurants: {
    emoji: '🍽️',
    suggestions: [],
  },
  custom: {
    emoji: '📝',
    suggestions: [],
  },
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function loadLists(userId: string): Promise<UserList[]> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .where('archived', '==', false)
        .get();

      return snapshot.docs.map(
        (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
          ({ id: doc.id, ...doc.data() }) as UserList
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for lists');
  }

  // Fallback to in-memory
  return (listStore.get(userId) || []).filter((l) => !l.archived);
}

async function loadList(userId: string, listId: string): Promise<UserList | null> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .doc(listId)
        .get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() } as UserList;
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore load failed');
  }

  // Fallback
  const lists = listStore.get(userId) || [];
  return lists.find((l) => l.id === listId) || null;
}

async function saveList(userId: string, list: UserList): Promise<UserList> {
  list.updatedAt = Date.now();

  try {
    const db = getFirestoreDb();
    if (db) {
      const ref = db.collection('bogle_users').doc(userId).collection('lists').doc(list.id);
      await ref.set(list);
      log.info({ listId: list.id, userId }, 'List saved to Firestore');
      return list;
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore save failed, using in-memory');
  }

  // Fallback
  const lists = listStore.get(userId) || [];
  const index = lists.findIndex((l) => l.id === list.id);
  if (index >= 0) {
    lists[index] = list;
  } else {
    lists.push(list);
  }
  listStore.set(userId, lists);

  return list;
}

async function findListByName(userId: string, name: string): Promise<UserList | null> {
  const lists = await loadLists(userId);
  const nameLower = name.toLowerCase().trim();

  return (
    lists.find(
      (l) => l.name.toLowerCase() === nameLower || l.name.toLowerCase().includes(nameLower)
    ) || null
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function generateListId(): string {
  return `list_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeListType(input: string): string {
  const lower = input.toLowerCase().trim();

  // Map common variations
  const typeMap: Record<string, string> = {
    pack: 'packing',
    trip: 'packing',
    travel: 'packing',
    vacation: 'packing',
    bucket: 'bucket',
    'bucket list': 'bucket',
    goals: 'bucket',
    dreams: 'bucket',
    guest: 'guest',
    guests: 'guest',
    party: 'guest',
    invites: 'guest',
    read: 'reading',
    books: 'reading',
    'to read': 'reading',
    movie: 'movies',
    'to watch': 'movies',
    watchlist: 'movies',
    gift: 'gifts',
    presents: 'gifts',
    grocery: 'groceries',
    food: 'groceries',
    restaurant: 'restaurants',
    'places to eat': 'restaurants',
    dining: 'restaurants',
  };

  return typeMap[lower] || 'custom';
}

function getListEmoji(type: string): string {
  return LIST_TEMPLATES[type]?.emoji || '📝';
}

function formatListForSpeech(list: UserList): string {
  const emoji = getListEmoji(list.type);
  const unchecked = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);

  const lines: string[] = [`${emoji} **${list.name}**`];

  if (unchecked.length === 0 && checked.length === 0) {
    lines.push('  (empty - add some items!)');
  } else {
    // Show unchecked items first
    for (const item of unchecked.slice(0, 10)) {
      lines.push(`  ☐ ${item.text}`);
    }
    if (unchecked.length > 10) {
      lines.push(`  ...and ${unchecked.length - 10} more`);
    }

    // Show checked count
    if (checked.length > 0) {
      lines.push(`  ✓ ${checked.length} item${checked.length > 1 ? 's' : ''} checked off`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// CREATE LIST TOOL
// ============================================================================

const createListDef: ToolDefinition = {
  id: 'createList',
  name: 'Create List',
  description: 'Create a new list of any type',
  domain: 'simple-utilities',
  tags: ['list', 'create', 'packing', 'bucket', 'organize'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Create a new list. Supports packing lists, bucket lists, guest lists, reading lists, movie watchlists, gift lists, and any custom list type. Use when the user says "Create a packing list for my trip", "Start a bucket list", "Make a guest list for the party", etc.`,
      parameters: z.object({
        name: z.string().describe('The name of the list (e.g., "Paris Trip", "Summer Reading")'),
        type: z
          .string()
          .optional()
          .describe(
            'The type of list: packing, bucket, guest, reading, movies, gifts, restaurants, or custom'
          ),
        items: z.array(z.string()).optional().describe('Optional initial items to add to the list'),
      }),
      execute: async ({ name, type = 'custom', items = [] }) => {
        const listType = normalizeListType(type);

        // Check if list already exists
        const existing = await findListByName(ctx.userId, name);
        if (existing) {
          return `You already have a list called "${existing.name}". Want me to add items to it instead?`;
        }

        const list: UserList = {
          id: generateListId(),
          userId: ctx.userId,
          name,
          type: listType,
          items: items.map((text) => ({
            id: generateItemId(),
            text,
            checked: false,
            addedAt: Date.now(),
          })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          archived: false,
        };

        await saveList(ctx.userId, list);

        log.info({ listId: list.id, type: listType, itemCount: items.length }, 'List created');

        const emoji = getListEmoji(listType);
        let response = `${emoji} Created **"${name}"** list`;

        if (items.length > 0) {
          response += ` with ${items.length} item${items.length > 1 ? 's' : ''}`;
        }

        // Add suggestions for packing lists
        if (listType === 'packing' && items.length === 0) {
          const suggestions = LIST_TEMPLATES.packing.suggestions.slice(0, 3);
          response += `. Don't forget: ${suggestions.join(', ')}!`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// ADD TO LIST TOOL
// ============================================================================

const addToListDef: ToolDefinition = {
  id: 'addToList',
  name: 'Add to List',
  description: 'Add items to an existing list',
  domain: 'simple-utilities',
  tags: ['list', 'add', 'item'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Add one or more items to an existing list. Use when the user says "Add X to my packing list", "Put X on my bucket list", etc.`,
      parameters: z.object({
        listName: z.string().describe('The name of the list to add to'),
        items: z.array(z.string()).describe('The items to add'),
      }),
      execute: async ({ listName, items }) => {
        const list = await findListByName(ctx.userId, listName);

        if (!list) {
          // Offer to create it
          const type = normalizeListType(listName);
          return `I don't see a list called "${listName}". Want me to create one?`;
        }

        // Add items
        const newItems: ListItem[] = items.map((text) => ({
          id: generateItemId(),
          text,
          checked: false,
          addedAt: Date.now(),
        }));

        list.items.push(...newItems);
        await saveList(ctx.userId, list);

        log.info({ listId: list.id, addedCount: items.length }, 'Items added to list');

        const emoji = getListEmoji(list.type);
        if (items.length === 1) {
          return `${emoji} Added "${items[0]}" to **${list.name}**`;
        }
        return `${emoji} Added ${items.length} items to **${list.name}**`;
      },
    });
  },
};

// ============================================================================
// VIEW LIST TOOL
// ============================================================================

const viewListDef: ToolDefinition = {
  id: 'viewList',
  name: 'View List',
  description: 'View items in a list',
  domain: 'simple-utilities',
  tags: ['list', 'view', 'show', 'read'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `View the items in a specific list. Use when the user says "Show my packing list", "What's on my bucket list?", "Read my guest list", etc.`,
      parameters: z.object({
        listName: z.string().describe('The name of the list to view'),
        showChecked: z
          .boolean()
          .optional()
          .describe('Whether to show checked-off items (default: false)'),
      }),
      execute: async ({ listName, showChecked = false }) => {
        const list = await findListByName(ctx.userId, listName);

        if (!list) {
          return `I don't see a list called "${listName}". Say "show my lists" to see all your lists.`;
        }

        return formatListForSpeech(list);
      },
    });
  },
};

// ============================================================================
// GET ALL LISTS TOOL
// ============================================================================

const getAllListsDef: ToolDefinition = {
  id: 'getAllLists',
  name: 'Get All Lists',
  description: 'View all your lists',
  domain: 'simple-utilities',
  tags: ['list', 'all', 'show'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Show all lists the user has created. Use when the user says "Show my lists", "What lists do I have?", etc.`,
      parameters: z.object({}),
      execute: async () => {
        const lists = await loadLists(ctx.userId);

        if (lists.length === 0) {
          return "You don't have any lists yet. Try 'Create a packing list' or 'Start a bucket list'.";
        }

        const lines = lists.map((list) => {
          const emoji = getListEmoji(list.type);
          const unchecked = list.items.filter((i) => !i.checked).length;
          const total = list.items.length;
          return `${emoji} **${list.name}** - ${unchecked}/${total} items`;
        });

        return `**Your Lists:**\n${lines.join('\n')}`;
      },
    });
  },
};

// ============================================================================
// CHECK OFF ITEM TOOL
// ============================================================================

const checkOffItemDef: ToolDefinition = {
  id: 'checkOffItem',
  name: 'Check Off Item',
  description: 'Mark an item as done on a list',
  domain: 'simple-utilities',
  tags: ['list', 'check', 'done', 'complete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Check off or mark an item as done on a list. Use when the user says "Check off passport on my packing list", "Mark X as done", etc.`,
      parameters: z.object({
        listName: z.string().describe('The name of the list'),
        item: z.string().describe('The item to check off (text or number)'),
      }),
      execute: async ({ listName, item }) => {
        const list = await findListByName(ctx.userId, listName);

        if (!list) {
          return `I don't see a list called "${listName}".`;
        }

        const itemLower = item.toLowerCase().trim();

        // Try to find by number
        const num = parseInt(itemLower);
        let targetItem: ListItem | undefined;

        if (!isNaN(num) && num > 0 && num <= list.items.length) {
          const unchecked = list.items.filter((i) => !i.checked);
          targetItem = unchecked[num - 1];
        }

        // Try to find by text
        if (!targetItem) {
          targetItem = list.items.find(
            (i) => !i.checked && i.text.toLowerCase().includes(itemLower)
          );
        }

        if (!targetItem) {
          return `I couldn't find "${item}" on your ${list.name} list.`;
        }

        targetItem.checked = true;
        targetItem.checkedAt = Date.now();
        await saveList(ctx.userId, list);

        const remaining = list.items.filter((i) => !i.checked).length;
        const emoji = getListEmoji(list.type);

        if (remaining === 0) {
          return `${emoji} ✓ **${targetItem.text}** - that's everything on your ${list.name}! 🎉`;
        }

        return `${emoji} ✓ **${targetItem.text}** checked off. ${remaining} item${remaining > 1 ? 's' : ''} left.`;
      },
    });
  },
};

// ============================================================================
// REMOVE FROM LIST TOOL
// ============================================================================

const removeFromListDef: ToolDefinition = {
  id: 'removeFromList',
  name: 'Remove from List',
  description: 'Remove an item from a list',
  domain: 'simple-utilities',
  tags: ['list', 'remove', 'delete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Remove an item from a list entirely. Use when the user says "Remove X from my list", "Delete X from packing list", etc.`,
      parameters: z.object({
        listName: z.string().describe('The name of the list'),
        item: z.string().describe('The item to remove'),
      }),
      execute: async ({ listName, item }) => {
        const list = await findListByName(ctx.userId, listName);

        if (!list) {
          return `I don't see a list called "${listName}".`;
        }

        const itemLower = item.toLowerCase().trim();
        const index = list.items.findIndex((i) => i.text.toLowerCase().includes(itemLower));

        if (index === -1) {
          return `I couldn't find "${item}" on your ${list.name} list.`;
        }

        const removed = list.items.splice(index, 1)[0];
        await saveList(ctx.userId, list);

        const emoji = getListEmoji(list.type);
        return `${emoji} Removed "${removed.text}" from **${list.name}**`;
      },
    });
  },
};

// ============================================================================
// DELETE LIST TOOL
// ============================================================================

const deleteListDef: ToolDefinition = {
  id: 'deleteList',
  name: 'Delete List',
  description: 'Delete an entire list',
  domain: 'simple-utilities',
  tags: ['list', 'delete', 'remove'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Delete an entire list. Use when the user says "Delete my packing list", "Remove the guest list", etc.`,
      parameters: z.object({
        listName: z.string().describe('The name of the list to delete'),
      }),
      execute: async ({ listName }) => {
        const list = await findListByName(ctx.userId, listName);

        if (!list) {
          return `I don't see a list called "${listName}".`;
        }

        // Archive instead of hard delete
        list.archived = true;
        await saveList(ctx.userId, list);

        log.info({ listId: list.id, name: list.name }, 'List archived');

        const emoji = getListEmoji(list.type);
        return `${emoji} Deleted **"${list.name}"** list.`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const listToolDefinitions: ToolDefinition[] = [
  createListDef,
  addToListDef,
  viewListDef,
  getAllListsDef,
  checkOffItemDef,
  removeFromListDef,
  deleteListDef,
];

export {
  createListDef,
  addToListDef,
  viewListDef,
  getAllListsDef,
  checkOffItemDef,
  removeFromListDef,
  deleteListDef,
};
