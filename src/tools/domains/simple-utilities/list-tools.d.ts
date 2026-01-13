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
import type { ToolDefinition } from '../../registry/types.js';
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
    type: string;
    items: ListItem[];
    createdAt: number;
    updatedAt: number;
    archived: boolean;
}
declare const createListDef: ToolDefinition;
declare const addToListDef: ToolDefinition;
declare const viewListDef: ToolDefinition;
declare const getAllListsDef: ToolDefinition;
declare const checkOffItemDef: ToolDefinition;
declare const removeFromListDef: ToolDefinition;
declare const deleteListDef: ToolDefinition;
export declare const listToolDefinitions: ToolDefinition[];
export { createListDef, addToListDef, viewListDef, getAllListsDef, checkOffItemDef, removeFromListDef, deleteListDef, };
//# sourceMappingURL=list-tools.d.ts.map