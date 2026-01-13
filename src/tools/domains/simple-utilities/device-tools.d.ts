/**
 * Device & Phone Tools
 *
 * Tools for finding and controlling devices:
 * - Find my phone (ring it)
 * - Battery status
 * - Do not disturb
 *
 * These fill gaps identified in synthetic LLM testing.
 *
 * @module simple-utilities/device-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
export interface DeviceInfo {
    id: string;
    userId: string;
    name: string;
    type: 'phone' | 'tablet' | 'watch' | 'speaker' | 'other';
    platform?: 'ios' | 'android' | 'web';
    pushToken?: string;
    lastSeen: number;
    batteryLevel?: number;
}
declare const findMyPhoneDef: ToolDefinition;
declare const stopRingingDef: ToolDefinition;
declare const checkBatteryDef: ToolDefinition;
declare const listDevicesDef: ToolDefinition;
declare const doNotDisturbDef: ToolDefinition;
export declare const deviceToolDefinitions: ToolDefinition[];
export { findMyPhoneDef, stopRingingDef, checkBatteryDef, listDevicesDef, doNotDisturbDef };
//# sourceMappingURL=device-tools.d.ts.map