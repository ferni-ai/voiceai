/**
 * Shopping Lists Tool
 *
 * Manage shopping lists for groceries, household items, etc.
 *
 * Features:
 * - Multiple lists (groceries, household, etc.)
 * - Voice-friendly item management
 * - Smart categorization
 * - Recurring items
 * - Sharing (future)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from './validation.js';
import { getProductivityStore, type ShoppingListData } from '../services/productivity-store.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

// Bridge function for persistence
function listToListData(list: ShoppingList): ShoppingListData {
  return {
    id: list.id,
    name: list.name,
    type: list.type,
    items: list.items.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      notes: i.notes,
      isChecked: i.isChecked,
      addedAt: i.addedAt.toISOString(),
    })),
    isActive: list.isActive,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

function listDataToList(data: ShoppingListData, userId: string): ShoppingList {
  return {
    id: data.id,
    userId,
    name: data.name,
    type: data.type as ListType,
    items: data.items.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      notes: i.notes,
      isChecked: i.isChecked,
      addedAt: new Date(i.addedAt),
    })),
    isActive: data.isActive,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type ListType = 'groceries' | 'household' | 'pharmacy' | 'hardware' | 'gifts' | 'other';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string; // "lbs", "oz", "pack", etc.
  category?: string;
  notes?: string;
  isChecked: boolean;
  addedAt: Date;
}

export interface ShoppingList {
  id: string;
  userId: string;
  name: string;
  type: ListType;
  items: ShoppingItem[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

const listsCache: Map<string, ShoppingList> = new Map();
const loadedUsers: Set<string> = new Set();

async function ensureUserListsLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;
  
  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);
    
    const listDataList = store.getUserShoppingLists(userId);
    for (const data of listDataList) {
      listsCache.set(data.id, listDataToList(data, userId));
    }
    
    loadedUsers.add(userId);
    getLogger().debug({ userId, lists: listDataList.length }, 'Loaded shopping lists from store');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load shopping lists from store');
    loadedUsers.add(userId);
  }
}

function persistList(userId: string, list: ShoppingList): void {
  try {
    const store = getProductivityStore();
    store.setShoppingList(userId, listToListData(list));
  } catch (error) {
    getLogger().warn({ error, listId: list.id }, 'Failed to persist shopping list');
  }
}

// ============================================================================
// GROCERY CATEGORIES
// ============================================================================

const GROCERY_CATEGORIES: Record<string, string[]> = {
  produce: ['apple', 'banana', 'orange', 'lettuce', 'tomato', 'onion', 'potato', 'carrot', 'broccoli', 'spinach', 'avocado', 'lemon', 'lime', 'garlic', 'ginger', 'cucumber', 'pepper', 'celery', 'mushroom', 'berry', 'grape', 'melon', 'mango', 'pear', 'peach'],
  dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg', 'cottage', 'sour cream'],
  meat: ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'steak', 'ground', 'ham'],
  seafood: ['fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'cod', 'tilapia'],
  bakery: ['bread', 'bagel', 'muffin', 'croissant', 'roll', 'tortilla', 'pita', 'bun'],
  frozen: ['frozen', 'ice cream', 'pizza', 'waffle', 'frozen vegetable'],
  pantry: ['rice', 'pasta', 'cereal', 'oatmeal', 'flour', 'sugar', 'oil', 'vinegar', 'sauce', 'soup', 'bean', 'nut', 'honey', 'jam', 'peanut butter', 'syrup'],
  beverages: ['water', 'juice', 'soda', 'coffee', 'tea', 'wine', 'beer', 'energy drink'],
  snacks: ['chip', 'cracker', 'cookie', 'candy', 'popcorn', 'pretzel', 'granola', 'bar'],
  household: ['paper towel', 'toilet paper', 'napkin', 'trash bag', 'soap', 'detergent', 'sponge', 'foil', 'wrap'],
  personal: ['shampoo', 'conditioner', 'toothpaste', 'deodorant', 'lotion', 'razor'],
};

function categorizeItem(itemName: string): string {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of Object.entries(GROCERY_CATEGORIES)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return 'other';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserLists(userId: string): ShoppingList[] {
  return Array.from(listsCache.values())
    .filter((l) => l.userId === userId && l.isActive)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function getOrCreateList(userId: string, type: ListType = 'groceries'): ShoppingList {
  const existing = getUserLists(userId).find((l) => l.type === type);
  if (existing) return existing;

  const list: ShoppingList = {
    id: generateId('list'),
    userId,
    name: `${type.charAt(0).toUpperCase() + type.slice(1)} List`,
    type,
    items: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  listsCache.set(list.id, list);
  persistList(userId, list);
  return list;
}

function parseItemWithQuantity(input: string): { name: string; quantity: number; unit?: string } {
  // Parse patterns like "2 apples", "1 lb chicken", "dozen eggs"
  const patterns = [
    /^(\d+)\s*(lb|lbs|oz|g|kg|gallon|gal|pack|bag|box|can|jar|bottle|dozen)s?\s+(.+)$/i,
    /^(\d+)\s+(.+)$/,
    /^(a|an)\s+(.+)$/i,
    /^(dozen|half dozen)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      if (pattern === patterns[0]) {
        return {
          quantity: parseInt(match[1]),
          unit: match[2].toLowerCase(),
          name: match[3].trim(),
        };
      } else if (pattern === patterns[1]) {
        return {
          quantity: parseInt(match[1]),
          name: match[2].trim(),
        };
      } else if (pattern === patterns[2]) {
        return {
          quantity: 1,
          name: match[2].trim(),
        };
      } else if (pattern === patterns[3]) {
        const qty = match[1].toLowerCase().includes('half') ? 6 : 12;
        return {
          quantity: qty,
          name: match[2].trim(),
        };
      }
    }
  }

  return { name: input.trim(), quantity: 1 };
}

function formatItemForSpeech(item: ShoppingItem): string {
  const qty = item.quantity > 1 ? `${item.quantity}${item.unit ? ' ' + item.unit : ''} ` : '';
  const checked = item.isChecked ? '✓ ' : '';
  return `${checked}${qty}${item.name}`;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export function addToList(params: {
  userId: string;
  items: string[];
  listType?: ListType;
}): { list: ShoppingList; addedItems: ShoppingItem[] } {
  const list = getOrCreateList(params.userId, params.listType || 'groceries');
  const addedItems: ShoppingItem[] = [];

  for (const itemStr of params.items) {
    const parsed = parseItemWithQuantity(itemStr);

    // Check if item already exists
    const existing = list.items.find(
      (i) => i.name.toLowerCase() === parsed.name.toLowerCase() && !i.isChecked
    );

    if (existing) {
      existing.quantity += parsed.quantity;
      addedItems.push(existing);
    } else {
      const item: ShoppingItem = {
        id: generateId('item'),
        name: sanitizePlainText(parsed.name, 100),
        quantity: parsed.quantity,
        unit: parsed.unit,
        category: categorizeItem(parsed.name),
        isChecked: false,
        addedAt: new Date(),
      };
      list.items.push(item);
      addedItems.push(item);
    }
  }

  list.updatedAt = new Date();
  listsCache.set(list.id, list);
  persistList(params.userId, list);

  getLogger().info(
    { listId: list.id, itemCount: addedItems.length },
    '🛒 Items added to list'
  );

  return { list, addedItems };
}

export function checkOffItem(
  userId: string,
  itemName: string,
  listType?: ListType
): ShoppingItem | null {
  const list = getOrCreateList(userId, listType || 'groceries');
  const item = list.items.find(
    (i) => i.name.toLowerCase().includes(itemName.toLowerCase()) && !i.isChecked
  );

  if (item) {
    item.isChecked = true;
    list.updatedAt = new Date();
    listsCache.set(list.id, list);
    persistList(userId, list);
    return item;
  }

  return null;
}

export function removeItem(userId: string, itemName: string, listType?: ListType): boolean {
  const list = getOrCreateList(userId, listType || 'groceries');
  const index = list.items.findIndex((i) =>
    i.name.toLowerCase().includes(itemName.toLowerCase())
  );

  if (index >= 0) {
    list.items.splice(index, 1);
    list.updatedAt = new Date();
    listsCache.set(list.id, list);
    persistList(userId, list);
    return true;
  }

  return false;
}

export function clearCheckedItems(userId: string, listType?: ListType): number {
  const list = getOrCreateList(userId, listType || 'groceries');
  const originalCount = list.items.length;
  list.items = list.items.filter((i) => !i.isChecked);
  list.updatedAt = new Date();
  listsCache.set(list.id, list);
  persistList(userId, list);

  return originalCount - list.items.length;
}

export function clearList(userId: string, listType?: ListType): void {
  const list = getOrCreateList(userId, listType || 'groceries');
  list.items = [];
  list.updatedAt = new Date();
  listsCache.set(list.id, list);
  persistList(userId, list);
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createShoppingTools() {
  return {
    addToShoppingList: llm.tool({
      description: `Add items to a shopping list.
Use when user says:
- "Add milk to my list"
- "I need eggs and bread"
- "Put 2 lbs chicken on my grocery list"`,
      parameters: z.object({
        items: z.array(z.string()).describe('Items to add (can include quantities like "2 apples")'),
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
      }),
      execute: async ({ items, listType }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const result = addToList({ userId, items, listType });

        let response = `🛒 Added to ${listType} list:\n`;
        result.addedItems.forEach((item) => {
          response += `  • ${formatItemForSpeech(item)}\n`;
        });

        const unchecked = result.list.items.filter((i) => !i.isChecked);
        response += `\nTotal: ${unchecked.length} item${unchecked.length !== 1 ? 's' : ''} on list`;

        return response;
      },
    }),

    getShoppingList: llm.tool({
      description: `Show the current shopping list.
Use when user asks "what's on my list?" or "read my grocery list"`,
      parameters: z.object({
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
        showChecked: z.boolean().optional().default(false),
      }),
      execute: async ({ listType, showChecked }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const list = getOrCreateList(userId, listType);
        const items = showChecked ? list.items : list.items.filter((i) => !i.isChecked);

        if (items.length === 0) {
          return `Your ${listType} list is empty! Say "add [item] to my list" to get started.`;
        }

        // Group by category
        const byCategory: Record<string, ShoppingItem[]> = {};
        items.forEach((item) => {
          const cat = item.category || 'other';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(item);
        });

        let response = `🛒 **${list.name}** (${items.length} items)\n\n`;

        for (const [category, categoryItems] of Object.entries(byCategory)) {
          response += `**${category.charAt(0).toUpperCase() + category.slice(1)}**\n`;
          categoryItems.forEach((item) => {
            const checkbox = item.isChecked ? '✓' : '☐';
            response += `  ${checkbox} ${formatItemForSpeech(item)}\n`;
          });
          response += '\n';
        }

        return response;
      },
    }),

    checkOffItem: llm.tool({
      description: `Mark an item as gotten/checked off.
Use when user says "got the milk" or "check off eggs"`,
      parameters: z.object({
        itemName: z.string().describe('Item to check off'),
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
      }),
      execute: async ({ itemName, listType }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const item = checkOffItem(userId, itemName, listType);

        if (!item) {
          return `Couldn't find "${itemName}" on your ${listType} list.`;
        }

        const list = getOrCreateList(userId, listType);
        const remaining = list.items.filter((i) => !i.isChecked);

        let response = `✓ Got ${item.name}!`;
        if (remaining.length > 0) {
          response += `\n${remaining.length} item${remaining.length !== 1 ? 's' : ''} left.`;
        } else {
          response += `\n🎉 List complete!`;
        }

        return response;
      },
    }),

    removeFromList: llm.tool({
      description: `Remove an item from the shopping list entirely.`,
      parameters: z.object({
        itemName: z.string().describe('Item to remove'),
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
      }),
      execute: async ({ itemName, listType }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const removed = removeItem(userId, itemName, listType);

        if (!removed) {
          return `Couldn't find "${itemName}" on your list.`;
        }

        return `🗑️ Removed "${itemName}" from your ${listType} list.`;
      },
    }),

    clearCheckedItems: llm.tool({
      description: `Remove all checked-off items from the list.`,
      parameters: z.object({
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
      }),
      execute: async ({ listType }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const count = clearCheckedItems(userId, listType);

        if (count === 0) {
          return `No checked items to clear.`;
        }

        return `🧹 Cleared ${count} checked item${count !== 1 ? 's' : ''} from your ${listType} list.`;
      },
    }),

    clearShoppingList: llm.tool({
      description: `Clear the entire shopping list. Use with caution!`,
      parameters: z.object({
        listType: z
          .enum(['groceries', 'household', 'pharmacy', 'hardware', 'gifts', 'other'])
          .optional()
          .default('groceries'),
        confirm: z.boolean().describe('User has confirmed'),
      }),
      execute: async ({ listType, confirm }, { ctx }) => {
        if (!confirm) {
          return `Are you sure you want to clear your entire ${listType} list? Say "yes, clear it" to confirm.`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        clearList(userId, listType);

        return `🗑️ ${listType.charAt(0).toUpperCase() + listType.slice(1)} list cleared.`;
      },
    }),

    getListSummary: llm.tool({
      description: `Get a quick summary of all shopping lists.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        const userLists = getUserLists(userId);

        if (userLists.length === 0) {
          return `No shopping lists yet. Say "add [item] to my grocery list" to start!`;
        }

        let response = `🛒 **Shopping Lists**\n\n`;

        for (const list of userLists) {
          const unchecked = list.items.filter((i) => !i.isChecked);
          const checked = list.items.filter((i) => i.isChecked);

          response += `**${list.name}**\n`;
          response += `  ${unchecked.length} to get`;
          if (checked.length > 0) {
            response += ` | ${checked.length} done`;
          }
          response += '\n\n';
        }

        return response;
      },
    }),

    quickAdd: llm.tool({
      description: `Quick add common items - just say what you need.
Handles natural language like "I'm out of milk and eggs"`,
      parameters: z.object({
        statement: z.string().describe('Natural language statement about what\'s needed'),
      }),
      execute: async ({ statement }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserListsLoaded(userId);
        // Extract items from natural language
        const commonPhrases = [
          /I(?:'m| am) out of (.+)/i,
          /(?:I |we )need (.+)/i,
          /(?:get|buy|pick up) (.+)/i,
          /running low on (.+)/i,
          /don't forget (.+)/i,
        ];

        let itemString = statement;
        for (const pattern of commonPhrases) {
          const match = statement.match(pattern);
          if (match) {
            itemString = match[1];
            break;
          }
        }

        // Split by common separators
        const items = itemString
          .split(/,|and|&/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (items.length === 0) {
          return `I couldn't understand what to add. Try "add milk and eggs to my list"`;
        }

        const result = addToList({ userId, items, listType: 'groceries' });

        let response = `🛒 Added:\n`;
        result.addedItems.forEach((item) => {
          response += `  • ${item.name}\n`;
        });

        return response;
      },
    }),
  };
}

export default createShoppingTools;

