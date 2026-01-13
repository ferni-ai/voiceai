/**
 * Team Configuration Types
 *
 * Team configuration defines how personas work together,
 * including handoff patterns, coordination, and team structure.
 * This is an injectable layer that keeps team awareness
 * decoupled from individual persona definitions.
 */
/** Role identifier - kebab-case string (e.g., 'sage-mentor', 'life-coach') */
export type RoleId = string;
/** Character/Persona identifier - kebab-case string (e.g., 'nayan-patel', 'ferni') */
export type CharacterId = string;
/**
 * Team member definition
 */
export interface TeamMember {
    /** Role ID for this team member */
    roleId: RoleId;
    /** Character ID assigned to this role */
    characterId: CharacterId;
    /** Display name (from character or override) */
    displayName: string;
    /** Short description of what they do */
    roleDescription: string;
    /** Whether this member is currently active */
    active?: boolean;
}
/**
 * Handoff template for transitioning between personas
 */
export interface HandoffTemplate {
    /** From role ID */
    fromRole: RoleId;
    /** To role ID */
    toRole: RoleId;
    /** Template phrases for handoff (use {name} for target name) */
    phrases: string[];
    /** When to suggest this handoff */
    triggers?: string[];
}
/**
 * Team coordination config
 */
export interface TeamCoordination {
    /** How team members reference each other */
    teammateReferences: Array<{
        /** Role ID */
        roleId: RoleId;
        /** How other members refer to this role */
        informalReference: string;
        /** Formal reference */
        formalReference: string;
    }>;
    /** Cross-team task routing */
    taskRouting?: Array<{
        /** Task type keyword */
        taskType: string;
        /** Target role ID */
        targetRole: RoleId;
    }>;
}
/**
 * Full team configuration
 */
export interface TeamConfig {
    /** Team identifier */
    id: string;
    /** Team name */
    name: string;
    /** Team description */
    description: string;
    /** Team members */
    members: TeamMember[];
    /** Coordinator/lead persona ID */
    coordinatorId: CharacterId;
    /** Handoff templates */
    handoffTemplates?: HandoffTemplate[];
    /** Team coordination rules */
    coordination?: TeamCoordination;
    /** Whether team mode is enabled */
    enabled: boolean;
}
/**
 * Injected team context for system prompts
 */
export interface TeamContext {
    /** Current persona's role */
    currentRole: RoleId;
    /** Current persona's character */
    currentCharacter: CharacterId;
    /** Team config */
    team: TeamConfig;
    /** Generated team section for system prompt */
    teamPromptSection: string;
    /** Generated handoff section for system prompt */
    handoffPromptSection: string;
}
/**
 * Partial team config for updates
 */
export type PartialTeamConfig = Partial<TeamConfig> & Pick<TeamConfig, 'id'>;
//# sourceMappingURL=types.d.ts.map