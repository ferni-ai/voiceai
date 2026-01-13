/**
 * Voice Memos Tools
 *
 * Record, save, and playback voice memos using Google Cloud Storage.
 * Simple voice notes that users can capture and retrieve later.
 *
 * @module simple-utilities/voice-memos-tools
 */
import type { ToolDefinition } from '../../registry/types.js';
export interface VoiceMemo {
    id: string;
    userId: string;
    title: string;
    description?: string;
    audioUrl?: string;
    duration?: number;
    transcript?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
}
/**
 * Save a voice memo
 */
export declare const saveVoiceMemoDef: ToolDefinition;
/**
 * List voice memos
 */
export declare const listVoiceMemosDef: ToolDefinition;
/**
 * Play/recall a voice memo
 */
export declare const recallVoiceMemoDef: ToolDefinition;
/**
 * Delete a voice memo
 */
export declare const deleteVoiceMemoDef: ToolDefinition;
/**
 * Search voice memos
 */
export declare const searchVoiceMemosDef: ToolDefinition;
export declare const voiceMemosToolDefinitions: ToolDefinition[];
export default voiceMemosToolDefinitions;
//# sourceMappingURL=voice-memos-tools.d.ts.map