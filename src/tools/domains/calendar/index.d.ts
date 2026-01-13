/**
 * Calendar Domain Tools
 *
 * Tools for scheduling, appointments, reservations, and contact management.
 * This domain provides properly-routed tools that dispatch to correct functions.
 *
 * DOMAIN: calendar
 * TOOLS:
 *   Appointments: manageAppointment (schedule, confirm, cancel, status)
 *   Reservations: restaurant (search, reserve)
 *   Delivery: foodOrder (search, start, add, checkout, status)
 *   Places: findBusiness (search, phone, call)
 *   Contacts: manageContact (add, find, update, delete, list, call)
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function getAppointmentToolDefinitions(): ToolDefinition[];
declare function getDeliveryToolDefinitions(): ToolDefinition[];
declare function getPlacesToolDefinitions(): ToolDefinition[];
declare function getContactsToolDefinitions(): ToolDefinition[];
import { smartCalendarTools } from './smart-calendar-tools.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getAppointmentToolDefinitions, getContactsToolDefinitions, getDeliveryToolDefinitions, getPlacesToolDefinitions, smartCalendarTools, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map