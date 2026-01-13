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
export type ListType = 'groceries' | 'household' | 'pharmacy' | 'hardware' | 'gifts' | 'other';
export interface ShoppingItem {
    id: string;
    name: string;
    quantity: number;
    unit?: string;
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
export declare function addToList(params: {
    userId: string;
    items: string[];
    listType?: ListType;
}): {
    list: ShoppingList;
    addedItems: ShoppingItem[];
};
export declare function checkOffItem(userId: string, itemName: string, listType?: ListType): ShoppingItem | null;
export declare function removeItem(userId: string, itemName: string, listType?: ListType): boolean;
export declare function clearCheckedItems(userId: string, listType?: ListType): number;
export declare function clearList(userId: string, listType?: ListType): void;
export declare function createShoppingTools(): {
    addToShoppingList: llm.FunctionTool<{
        items: string[];
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
    }, unknown, string>;
    getShoppingList: llm.FunctionTool<{
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
        showChecked: boolean;
    }, unknown, string>;
    checkOffItem: llm.FunctionTool<{
        itemName: string;
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
    }, unknown, string>;
    removeFromList: llm.FunctionTool<{
        itemName: string;
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
    }, unknown, string>;
    clearCheckedItems: llm.FunctionTool<{
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
    }, unknown, string>;
    clearShoppingList: llm.FunctionTool<{
        listType: "other" | "gifts" | "pharmacy" | "groceries" | "household" | "hardware";
        confirm: boolean;
    }, unknown, string>;
    getListSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
    quickAdd: llm.FunctionTool<{
        statement: string;
    }, unknown, string>;
};
export default createShoppingTools;
//# sourceMappingURL=shopping.d.ts.map