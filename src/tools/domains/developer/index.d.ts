/**
 * Developer Tools Domain
 *
 * Provides voice-driven access to:
 * - Ferni CLI commands (deploy, status, logs, etc.)
 * - Git operations (status, commit, diff)
 * - File reading and editing
 * - Bash command execution
 * - Background job tracking
 *
 * VOICE-OPTIMIZED: All outputs are summarized for spoken delivery (~300 chars max)
 *
 * Use cases:
 * - "Deploy the agent" → runs `ferni deploy agent`
 * - "What's my git status?" → shows changed files
 * - "Commit with message fix typo" → creates commit
 * - "Read the README file" → reads and summarizes README.md
 *
 * @module developer
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const gitStatusDef: ToolDefinition;
declare const gitDiffDef: ToolDefinition;
declare const gitCommitDef: ToolDefinition;
declare const gitLogDef: ToolDefinition;
declare const runFerniCommandDef: ToolDefinition;
declare const checkJobDef: ToolDefinition;
declare const readFileDef: ToolDefinition;
declare const editFileDef: ToolDefinition;
declare const runBashDef: ToolDefinition;
declare const searchFilesDef: ToolDefinition;
export declare const developerToolDefinitions: ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { gitStatusDef, gitDiffDef, gitCommitDef, gitLogDef, runFerniCommandDef, checkJobDef, readFileDef, editFileDef, runBashDef, searchFilesDef, };
//# sourceMappingURL=index.d.ts.map