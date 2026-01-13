/**
 * Life Thesis Tools
 *
 * Universal tools for saving, retrieving, and reminding users of their "whys".
 * Each persona uses these tools within their domain expertise.
 *
 * Example Use Cases:
 * - Peter: "Why did I buy this stock?" → remindThesis('investment')
 * - Maya: "I want to quit running" → remindThesis('habit')
 * - Jordan: "I'm discouraged about my goal" → remindThesis('goal')
 * - Ferni: "I'm second-guessing my career" → remindThesis('career')
 * - Nayan: "I'm struggling with my commitment" → remindThesis('commitment')
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const saveHabitThesisDef: ToolDefinition;
export declare const saveGoalThesisDef: ToolDefinition;
export declare const saveCareerThesisDef: ToolDefinition;
export declare const saveRelationshipThesisDef: ToolDefinition;
export declare const saveHealthThesisDef: ToolDefinition;
export declare const saveDecisionThesisDef: ToolDefinition;
export declare const saveBoundaryThesisDef: ToolDefinition;
export declare const saveCommitmentThesisDef: ToolDefinition;
export declare const remindThesisDef: ToolDefinition;
export declare const getThesesDef: ToolDefinition;
export declare const reviewThesisDef: ToolDefinition;
export declare const thesisTools: ToolDefinition[];
export declare function createThesisTools(): ToolDefinition[];
//# sourceMappingURL=thesis-tools.d.ts.map