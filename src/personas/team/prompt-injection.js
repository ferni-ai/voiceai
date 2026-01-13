/**
 * Team Prompt Injection
 *
 * Generates team-aware sections for system prompts.
 * This replaces hardcoded team references with dynamic injection.
 */
import { DEFAULT_TEAM_CONFIG } from './team-config.js';
/**
 * Generate the teammates section for a system prompt
 */
export function generateTeammatesSection(currentRole, team = DEFAULT_TEAM_CONFIG) {
    const teammates = team.members.filter((m) => m.roleId !== currentRole && m.active);
    if (teammates.length === 0)
        return '';
    const lines = teammates.map((t) => `- ${t.displayName}: ${t.roleDescription}`);
    return `
YOUR TEAMMATES (you can mention them but handoffs go through the coordinator):
${lines.join('\n')}
`.trim();
}
/**
 * Generate the handoff instructions section
 */
export function generateHandoffSection(currentRole, team = DEFAULT_TEAM_CONFIG) {
    const coordinator = team.members.find((m) => m.characterId === team.coordinatorId);
    const coordinatorName = coordinator?.displayName || 'the coordinator';
    // Find handoff templates from this role
    const handoffTemplates = team.handoffTemplates?.filter((t) => t.fromRole === currentRole) || [];
    const triggers = handoffTemplates
        .filter((t) => t.triggers && t.triggers.length > 0)
        .map((t) => {
        const target = team.members.find((m) => m.roleId === t.toRole);
        return `- ${target?.displayName || t.toRole}: ${t.triggers.join(', ')}`;
    });
    const examplePhrases = handoffTemplates.slice(0, 3).flatMap((t) => t.phrases.slice(0, 1));
    // For coordinator role
    if (currentRole === 'life-coach') {
        return `
##############################################################################
#  HANDOFF INSTRUCTIONS - YOU ARE THE COORDINATOR                            #
##############################################################################

You coordinate the team. When someone needs specialized help, connect them:

WHEN TO HAND OFF:
${triggers.length > 0 ? triggers.join('\n') : '(Use your judgment based on the topic)'}

Example phrases:
${examplePhrases.map((p) => `"${p}"`).join('\n')}
`.trim();
    }
    // For specialist roles
    return `
##############################################################################
#  HANDOFF INSTRUCTIONS - YOU ARE PART OF A TEAM                             #
##############################################################################

You are a TEAM MEMBER under ${coordinatorName}. When your task is done,
or if the conversation shifts to something outside your expertise, hand back.

Say something like:
${examplePhrases.length > 0 ? examplePhrases.map((p) => `"${p}"`).join('\n') : `"Let me hand you back to ${coordinatorName} for anything else."`}

${generateTeammatesSection(currentRole, team)}
`.trim();
}
/**
 * Generate team coordination section (for cross-team work)
 */
export function generateCoordinationSection(currentRole, team = DEFAULT_TEAM_CONFIG) {
    const taskRouting = team.coordination?.taskRouting || [];
    const relevantRouting = taskRouting.filter((r) => r.targetRole !== currentRole);
    if (relevantRouting.length === 0)
        return '';
    const routingLines = relevantRouting.map((r) => {
        const target = team.members.find((m) => m.roleId === r.targetRole);
        return `- ${r.taskType} → ${target?.displayName || r.targetRole}`;
    });
    return `
TEAM COORDINATION:
When these topics come up, you can mention the relevant teammate:
${routingLines.join('\n')}
`.trim();
}
/**
 * Create a complete team context for prompt building
 */
export function createTeamContext(currentRole, currentCharacter, team = DEFAULT_TEAM_CONFIG) {
    return {
        currentRole,
        currentCharacter,
        team,
        teamPromptSection: generateTeammatesSection(currentRole, team),
        handoffPromptSection: generateHandoffSection(currentRole, team),
    };
}
/**
 * Inject team context into a system prompt
 * Replaces placeholder markers with team-specific content
 */
export function injectTeamContext(systemPrompt, context) {
    let result = systemPrompt;
    // Replace placeholders if they exist
    result = result.replace('{{TEAM_SECTION}}', context.teamPromptSection);
    result = result.replace('{{HANDOFF_SECTION}}', context.handoffPromptSection);
    // If no placeholders, append at the end
    if (!systemPrompt.includes('{{TEAM_SECTION}}') && !systemPrompt.includes('{{HANDOFF_SECTION}}')) {
        if (context.teamPromptSection || context.handoffPromptSection) {
            result += `\n\n${context.handoffPromptSection}`;
        }
    }
    return result;
}
//# sourceMappingURL=prompt-injection.js.map