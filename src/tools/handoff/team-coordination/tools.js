/**
 * Team Coordination Tools
 *
 * LLM tools for team coordination between Jordan, Maya, and Alex.
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { generateId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { jordanRequestMayaSavingsGoal, jordanRequestAlexSchedule, jordanRequestAlexReminders, jordanShareMilestoneWithMaya, jordanShareMilestoneWithAlex, } from '../../../services/agent-bus.js';
import { getLifeDataStore } from '../../../services/stores/life-data-store.js';
import { getProactiveScheduler } from '../../../services/scheduling/proactive-scheduler.js';
import { TEAM_CAPABILITIES } from './types.js';
import { getOrCreateTeamContext, findBestTeamMember } from './helpers.js';
import { createSharedGoal, createTeamHandoff, linkMilestoneToTeam } from './core.js';
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createTeamIntegrationTools() {
    return {
        // ========== CREATE TEAM GOAL ==========
        createTeamGoal: llm.tool({
            description: getToolDescription('createTeamGoal'),
            parameters: z.object({
                title: z.string().describe('Goal title'),
                category: z.string().describe('Goal category'),
                financialTarget: z.number().optional().describe('Financial target (Maya will help track)'),
                timeline: z
                    .string()
                    .optional()
                    .describe('Target timeline (e.g., "6 months", "end of 2025")'),
                needsBudget: z.boolean().optional().describe('Whether Maya should create a budget'),
                needsReminders: z.boolean().optional().describe('Whether Alex should set up reminders'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ title, category, financialTarget, timeline, needsBudget, needsReminders, userId, }) => {
                await createSharedGoal(userId, title, category, financialTarget, timeline);
                let response = `🤝 **Team Goal Created: "${title}"**\n\n`;
                response += `**Category:** ${category}\n`;
                if (timeline)
                    response += `**Timeline:** ${timeline}\n`;
                if (financialTarget)
                    response += `**Financial Target:** $${financialTarget.toLocaleString()}\n`;
                response += `\n**Team Assignments:**\n`;
                response += `• **Jordan** (Lead): Creating plan and tracking progress\n`;
                if (needsBudget || financialTarget) {
                    response += `• **Maya**: Setting up budget and savings tracking\n`;
                }
                if (needsReminders) {
                    response += `• **Alex**: Scheduling check-ins and reminders\n`;
                }
                response += `\n💡 Say "talk to Maya" to set up the budget, or "talk to Alex" to schedule reminders.`;
                return response;
            },
        }),
        // ========== REQUEST TEAM HELP ==========
        requestTeamHelp: llm.tool({
            description: getToolDescription('requestTeamHelp'),
            parameters: z.object({
                teamMember: z
                    .enum(['maya', 'alex', 'nayan-patel', 'peter-john'])
                    .describe('Team member to request help from'),
                request: z.string().describe('What you need help with'),
                context: z.string().optional().describe('Additional context to share'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ teamMember, request, context, userId }) => {
                const memberInfo = TEAM_CAPABILITIES[teamMember];
                createTeamHandoff(userId, 'jordan', teamMember, request, {
                    request,
                    additionalContext: context,
                });
                let response = `📨 **Requesting Help from ${memberInfo.name}**\n\n`;
                response += `**Request:** ${request}\n`;
                if (context) {
                    response += `**Context:** ${context}\n`;
                }
                response += `\n**${memberInfo.name}'s Expertise:**\n`;
                memberInfo.expertise.forEach((e) => (response += `• ${e}\n`));
                response += `\n✅ Handoff prepared. Say "talk to ${memberInfo.name}" to connect.`;
                return response;
            },
        }),
        // ========== GET TEAM STATUS ==========
        getTeamStatus: llm.tool({
            description: getToolDescription('getTeamStatus'),
            parameters: z.object({
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ userId }) => {
                const context = await getOrCreateTeamContext(userId);
                let response = `👥 **Team Coordination Status**\n\n`;
                // Shared Goals
                response += `**Shared Goals (${context.sharedGoals.length})**\n`;
                if (context.sharedGoals.length === 0) {
                    response += `No shared goals yet.\n`;
                }
                else {
                    context.sharedGoals.forEach((g) => {
                        response += `• ${g.title} (${g.status})`;
                        if (g.financialTarget)
                            response += ` - $${g.financialTarget.toLocaleString()} target`;
                        response += '\n';
                    });
                }
                response += '\n';
                // Shared Milestones
                response += `**Shared Milestones (${context.sharedMilestones.length})**\n`;
                if (context.sharedMilestones.length === 0) {
                    response += `No shared milestones yet.\n`;
                }
                else {
                    context.sharedMilestones.forEach((m) => {
                        response += `• ${m.name}`;
                        if (m.targetDate)
                            response += ` (${new Date(m.targetDate).toLocaleDateString()})`;
                        if (m.mayaBudgetId)
                            response += ` - Budget linked: ${m.mayaBudgetId}`;
                        response += '\n';
                    });
                }
                response += '\n';
                // Pending Handoffs
                if (context.pendingHandoffs.length > 0) {
                    response += `**Pending Handoffs (${context.pendingHandoffs.length})**\n`;
                    context.pendingHandoffs.forEach((h) => {
                        response += `• ${h.fromMember} → ${h.toMember}: ${h.reason}\n`;
                    });
                }
                return response;
            },
        }),
        // ========== FIND BEST TEAM MEMBER ==========
        findBestTeamMember: llm.tool({
            description: getToolDescription('findBestTeamMember'),
            parameters: z.object({
                need: z.string().describe('What you need help with'),
            }),
            execute: async ({ need }) => {
                const bestMember = findBestTeamMember(need);
                const memberInfo = TEAM_CAPABILITIES[bestMember];
                let response = `🎯 **Best Team Member for "${need}"**\n\n`;
                response += `**Recommendation:** ${memberInfo.name}\n\n`;
                response += `**Why ${memberInfo.name.split(' ')[0]}?**\n`;
                response += `Expertise in: ${memberInfo.expertise.join(', ')}\n\n`;
                response += `**${memberInfo.name.split(' ')[0]} can help with:**\n`;
                memberInfo.canHelpWith.forEach((h) => (response += `• ${h}\n`));
                response += `\nSay "talk to ${memberInfo.name.split(' ')[0]}" to connect!`;
                return response;
            },
        }),
        // ========== COORDINATE MILESTONE ==========
        coordinateMilestone: llm.tool({
            description: getToolDescription('coordinateMilestone'),
            parameters: z.object({
                milestoneName: z.string().describe('Name of the milestone'),
                milestoneId: z.string().optional().describe('ID of existing Jordan milestone'),
                targetDate: z.string().optional().describe('Target date'),
                budget: z.number().optional().describe('Budget for this milestone'),
                scheduleCheckIns: z.boolean().optional().describe('Have Alex schedule check-ins'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ milestoneName, milestoneId, targetDate, budget, scheduleCheckIns, userId, }) => {
                const parsedDate = targetDate ? new Date(targetDate) : undefined;
                const finalMilestoneId = milestoneId || generateId('milestone');
                linkMilestoneToTeam(userId, finalMilestoneId, milestoneName, parsedDate, undefined // mayaBudgetId - can be linked later via Maya
                );
                // Save to persistent storage
                const store = getLifeDataStore();
                await store.saveMilestone(userId, {
                    id: finalMilestoneId,
                    userId,
                    name: milestoneName,
                    category: 'other',
                    targetDate: parsedDate,
                    status: 'planning',
                    budget,
                    checklist: [],
                    notes: '',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                // Register for proactive notifications
                const scheduler = getProactiveScheduler();
                scheduler.registerUser(userId);
                let response = `🎯 **Team Milestone Coordination: "${milestoneName}"**\n\n`;
                response += `**Jordan's Role:** Life planning and progress tracking\n`;
                response += `✅ Milestone created and saved\n\n`;
                // ACTUALLY sync with Maya if budget provided
                if (budget) {
                    await jordanRequestMayaSavingsGoal(`${milestoneName} Fund`, budget, targetDate, userId);
                    jordanShareMilestoneWithMaya(finalMilestoneId, milestoneName, budget, parsedDate, userId);
                    response += `**Maya's Role:** Budget management\n`;
                    response += `💰 Budget: $${budget.toLocaleString()} - Savings goal created ✓\n\n`;
                }
                // ACTUALLY sync with Alex if check-ins requested or date provided
                if (scheduleCheckIns || parsedDate) {
                    if (parsedDate) {
                        await jordanRequestAlexSchedule(milestoneName, targetDate, [30, 14, 7, 1], userId);
                    }
                    if (scheduleCheckIns) {
                        await jordanRequestAlexReminders(milestoneName, 'weekly', userId);
                    }
                    jordanShareMilestoneWithAlex(finalMilestoneId, milestoneName, parsedDate, [], userId);
                    response += `**Alex's Role:** Scheduling and reminders\n`;
                    response += `📅 Calendar event created ✓\n`;
                    if (scheduleCheckIns) {
                        response += `🔔 Weekly check-ins scheduled ✓\n`;
                    }
                    response += '\n';
                }
                if (parsedDate) {
                    const daysUntil = Math.ceil((parsedDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    response += `⏱️ **${daysUntil} days** until ${milestoneName}!\n`;
                }
                response += `\n🤝 **Full team coordination active!** I'll check in proactively as the date approaches.`;
                return response;
            },
        }),
        // ========== SYNC WITH MAYA ==========
        syncFinancialsWithMaya: llm.tool({
            description: getToolDescription('syncFinancialsWithMaya'),
            parameters: z.object({
                goalOrMilestone: z.string().describe('Name of the goal or milestone'),
                targetAmount: z.number().describe('Target amount to save'),
                currentAmount: z.number().optional().default(0).describe('Amount already saved'),
                deadline: z.string().optional().describe('When this money is needed'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ goalOrMilestone, targetAmount, currentAmount = 0, deadline, userId }) => {
                const store = getLifeDataStore();
                const context = await getOrCreateTeamContext(userId);
                // Create shared budget
                const budget = {
                    id: generateId('budget'),
                    name: `${goalOrMilestone} Fund`,
                    totalBudget: targetAmount,
                    allocated: {},
                    spent: 0,
                    linkedMilestoneId: undefined,
                };
                context.sharedBudgets.push(budget);
                context.updatedAt = new Date();
                await store.saveTeamContext(userId, context);
                const progressPercent = Math.round((currentAmount / targetAmount) * 100);
                const remaining = targetAmount - currentAmount;
                // ACTUALLY request Maya to create a savings goal via Agent Bus
                await jordanRequestMayaSavingsGoal(`${goalOrMilestone} Fund`, targetAmount, deadline, userId);
                // Share context with Maya
                jordanShareMilestoneWithMaya(budget.id, goalOrMilestone, targetAmount, deadline ? new Date(deadline) : undefined, userId);
                let response = `💰 **Financial Sync: Jordan → Maya**\n\n`;
                response += `**Goal:** ${goalOrMilestone}\n`;
                response += `**Target:** $${targetAmount.toLocaleString()}\n`;
                response += `**Current:** $${currentAmount.toLocaleString()} (${progressPercent}%)\n`;
                response += `**Remaining:** $${remaining.toLocaleString()}\n`;
                if (deadline) {
                    response += `**Deadline:** ${deadline}\n`;
                    const deadlineDate = new Date(deadline);
                    const monthsUntil = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
                    if (monthsUntil > 0) {
                        const monthlyTarget = Math.ceil(remaining / monthsUntil);
                        response += `**Monthly savings needed:** $${monthlyTarget.toLocaleString()}/month\n`;
                    }
                }
                response += `\n✅ **Savings goal created in Maya's system!**\n`;
                response += `Maya will track this automatically. Say "talk to Maya" for detailed budgeting.`;
                return response;
            },
        }),
        // ========== SYNC WITH ALEX ==========
        syncScheduleWithAlex: llm.tool({
            description: getToolDescription('syncScheduleWithAlex'),
            parameters: z.object({
                eventName: z.string().describe('Name of the event or milestone'),
                date: z.string().describe('Event date'),
                remindersBefore: z
                    .array(z.string())
                    .optional()
                    .describe('When to remind (e.g., ["1 week", "1 day"])'),
                addCheckIns: z.boolean().optional().describe('Add regular check-in reminders'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ eventName, date, remindersBefore, addCheckIns, userId }) => {
                const parsedDate = new Date(date);
                // Convert reminder strings to days
                const reminderDays = [];
                if (remindersBefore) {
                    for (const reminder of remindersBefore) {
                        if (reminder.includes('week')) {
                            const weeks = parseInt(reminder) || 1;
                            reminderDays.push(weeks * 7);
                        }
                        else if (reminder.includes('day')) {
                            const days = parseInt(reminder) || 1;
                            reminderDays.push(days);
                        }
                        else if (reminder.includes('month')) {
                            const months = parseInt(reminder) || 1;
                            reminderDays.push(months * 30);
                        }
                    }
                }
                // ACTUALLY request Alex to schedule the event via Agent Bus
                await jordanRequestAlexSchedule(eventName, date, reminderDays.length > 0 ? reminderDays : [7, 1], userId);
                // If check-ins requested, set up recurring reminders
                if (addCheckIns) {
                    await jordanRequestAlexReminders(eventName, 'weekly', userId);
                }
                // Share context with Alex
                jordanShareMilestoneWithAlex(generateId('milestone'), eventName, parsedDate, [], // checklist items
                userId);
                let response = `📅 **Schedule Sync: Jordan → Alex**\n\n`;
                response += `**Event:** ${eventName}\n`;
                response += `**Date:** ${parsedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
                if (reminderDays.length > 0) {
                    response += `**Reminders set:** ${reminderDays.map((d) => `${d} days before`).join(', ')}\n`;
                }
                if (addCheckIns) {
                    response += `**Check-ins:** Weekly progress reviews scheduled ✓\n`;
                }
                response += `\n✅ **Calendar event and reminders created in Alex's system!**\n`;
                response += `Alex will send reminders automatically. Say "talk to Alex" to adjust.`;
                return response;
            },
        }),
        // ========== TEAM PLANNING SESSION ==========
        startTeamPlanningSession: llm.tool({
            description: getToolDescription('startTeamPlanningSession'),
            parameters: z.object({
                topic: z.string().describe('What are we planning?'),
                involveMembers: z
                    .array(z.enum(['maya', 'alex', 'nayan-patel', 'peter-john']))
                    .describe('Which team members to involve'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ topic, involveMembers, userId }) => {
                const store = getLifeDataStore();
                const context = await getOrCreateTeamContext(userId);
                // Create team project
                context.activeProject = {
                    id: generateId('project'),
                    name: topic,
                    type: 'milestone',
                    leadTeamMember: 'jordan',
                    supportingMembers: involveMembers,
                    status: 'planning',
                    context: {},
                };
                context.updatedAt = new Date();
                await store.saveTeamContext(userId, context);
                let response = `🚀 **Team Planning Session: "${topic}"**\n\n`;
                response += `**Lead:** Jordan (Life Planning)\n\n`;
                response += `**Team Assembled:**\n`;
                involveMembers.forEach((member) => {
                    const info = TEAM_CAPABILITIES[member];
                    response += `• **${info.name}**: ${info.expertise[0]}\n`;
                });
                response += `\n**Planning Agenda:**\n`;
                response += `1. Define the vision and goals (Jordan)\n`;
                if (involveMembers.includes('maya')) {
                    response += `2. Set budget and savings plan (Maya)\n`;
                }
                if (involveMembers.includes('alex')) {
                    response += `3. Schedule milestones and reminders (Alex)\n`;
                }
                if (involveMembers.includes('nayan-patel') || involveMembers.includes('peter-john')) {
                    response += `4. Investment strategy for funding (Investment team)\n`;
                }
                response += `\nLet's start! What's your vision for "${topic}"?`;
                return response;
            },
        }),
    };
}
//# sourceMappingURL=tools.js.map