/**
 * Behavior Domain Tools
 *
 * Functions that change HOW Ferni speaks, not WHAT Ferni does.
 * These enable the bidirectional behavior loop where the LLM can:
 * - Shift into different presence modes
 * - Control pacing and pauses
 * - Show visible processing
 * - Hold intentional silence
 * - Express non-verbal presence
 *
 * DOMAIN: behavior
 * TOOLS:
 *   - shiftMode: Change presence mode (presence, deep_listening, processing, etc.)
 *   - adjustPacing: Control speech rhythm (slower/faster, pause duration)
 *   - processing: Take visible thinking time with context-aware phrases
 *   - holdSpace: Create intentional meaningful silence
 *   - expressPresence: Show non-verbal presence (breath, hum, nod, etc.)
 *
 * @module BehaviorTools
 */
import { z } from 'zod';
import type { ToolDefinition } from '../../registry/types.js';
export declare const shiftModeSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        presence: "presence";
        celebration: "celebration";
        processing: "processing";
        grounding: "grounding";
        deep_listening: "deep_listening";
        holding_space: "holding_space";
        energy_match: "energy_match";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const adjustPacingSchema: z.ZodObject<{
    speed: z.ZodEnum<{
        normal: "normal";
        faster: "faster";
        slower: "slower";
    }>;
    pauses: z.ZodOptional<z.ZodEnum<{
        longer: "longer";
        normal: "normal";
        shorter: "shorter";
    }>>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const processingSchema: z.ZodObject<{
    type: z.ZodEnum<{
        emotional: "emotional";
        thinking: "thinking";
        tool_call: "tool_call";
        memory_recall: "memory_recall";
    }>;
    weight: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        medium: "medium";
        light: "light";
        heavy: "heavy";
    }>>>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const holdSpaceSchema: z.ZodObject<{
    duration: z.ZodEnum<{
        medium: "medium";
        brief: "brief";
        extended: "extended";
    }>;
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const expressPresenceSchema: z.ZodObject<{
    type: z.ZodEnum<{
        breath: "breath";
        sigh: "sigh";
        hum: "hum";
        nod: "nod";
        soft_sound: "soft_sound";
    }>;
    intensity: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        subtle: "subtle";
        visible: "visible";
    }>>>;
}, z.core.$strip>;
export declare const shiftModeDef: ToolDefinition;
export declare const adjustPacingDef: ToolDefinition;
export declare const processingDef: ToolDefinition;
export declare const holdSpaceDef: ToolDefinition;
export declare const expressPresenceDef: ToolDefinition;
export declare const behaviorToolDefinitions: {
    shiftMode: ToolDefinition;
    adjustPacing: ToolDefinition;
    processing: ToolDefinition;
    holdSpace: ToolDefinition;
    expressPresence: ToolDefinition;
};
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map