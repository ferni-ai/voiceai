/**
 * Cross-Domain Shortcut Tools
 *
 * Convenience delegates that route common requests to the correct domain tools.
 * These make Ferni feel more responsive for common voice commands.
 *
 * PATTERN: "Set an alarm" → shortcut validates intent → delegates to alarm-tools
 *
 * @module simple-utilities/shortcuts-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
interface CapabilityUsage {
    toolId: string;
    count: number;
    lastUsed: number;
    successRate: number;
}
export declare function trackCapabilityUsage(userId: string, toolId: string, success?: boolean): void;
export declare function getTopCapabilities(userId: string, limit?: number): CapabilityUsage[];
export declare function getRecentCapabilities(userId: string, limit?: number): CapabilityUsage[];
declare const quickAlarmDef: ToolDefinition;
declare const quickTimerDef: ToolDefinition;
declare const quickWeatherDef: ToolDefinition;
declare const quickMusicDef: ToolDefinition;
declare const quickCalendarDef: ToolDefinition;
declare const quickSmartHomeDef: ToolDefinition;
declare const quickCallDef: ToolDefinition;
declare const quickTextDef: ToolDefinition;
declare const quickEmailDef: ToolDefinition;
export declare const shortcutsToolDefinitions: ToolDefinition[];
export { quickAlarmDef, quickTimerDef, quickWeatherDef, quickMusicDef, quickCalendarDef, quickSmartHomeDef, quickCallDef, quickTextDef, quickEmailDef, };
//# sourceMappingURL=shortcuts-tools.d.ts.map