/**
 * Team Coordination Tools
 *
 * LLM tools for team coordination between Jordan, Maya, and Alex.
 */
import { llm } from '@livekit/agents';
export declare function createTeamIntegrationTools(): {
    createTeamGoal: llm.FunctionTool<{
        title: string;
        category: string;
        userId: string;
        financialTarget?: number | undefined;
        timeline?: string | undefined;
        needsBudget?: boolean | undefined;
        needsReminders?: boolean | undefined;
    }, unknown, string>;
    requestTeamHelp: llm.FunctionTool<{
        teamMember: "nayan-patel" | "peter-john" | "maya" | "alex";
        request: string;
        userId: string;
        context?: string | undefined;
    }, unknown, string>;
    getTeamStatus: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    findBestTeamMember: llm.FunctionTool<{
        need: string;
    }, unknown, string>;
    coordinateMilestone: llm.FunctionTool<{
        milestoneName: string;
        userId: string;
        milestoneId?: string | undefined;
        targetDate?: string | undefined;
        budget?: number | undefined;
        scheduleCheckIns?: boolean | undefined;
    }, unknown, string>;
    syncFinancialsWithMaya: llm.FunctionTool<{
        goalOrMilestone: string;
        targetAmount: number;
        currentAmount: number;
        userId: string;
        deadline?: string | undefined;
    }, unknown, string>;
    syncScheduleWithAlex: llm.FunctionTool<{
        eventName: string;
        date: string;
        userId: string;
        remindersBefore?: string[] | undefined;
        addCheckIns?: boolean | undefined;
    }, unknown, string>;
    startTeamPlanningSession: llm.FunctionTool<{
        topic: string;
        involveMembers: ("nayan-patel" | "peter-john" | "maya" | "alex")[];
        userId: string;
    }, unknown, string>;
};
//# sourceMappingURL=tools.d.ts.map