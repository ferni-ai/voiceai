/**
 * Projects Tools
 *
 * Project management with tasks and milestones:
 * - Create projects with templates
 * - Subtasks and dependencies
 * - Progress tracking
 * - Milestone management
 *
 * DOMAIN: projects
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger();
export const PROJECT_TEMPLATES = [
    {
        id: 'wedding',
        name: 'Wedding Planning',
        description: 'Complete wedding planning checklist',
        category: 'life-events',
        defaultDuration: 365,
        tasks: [
            { title: 'Set the date', priority: 'critical', order: 1, dependencies: [] },
            { title: 'Determine budget', priority: 'critical', order: 2, dependencies: [] },
            { title: 'Book venue', priority: 'high', order: 3, dependencies: [] },
            { title: 'Create guest list', priority: 'high', order: 4, dependencies: [] },
            { title: 'Hire photographer', priority: 'normal', order: 5, dependencies: [] },
            { title: 'Book caterer', priority: 'normal', order: 6, dependencies: [] },
            { title: 'Order invitations', priority: 'normal', order: 7, dependencies: ['Create guest list'] },
            { title: 'Send invitations', priority: 'normal', order: 8, dependencies: ['Order invitations'] },
            { title: 'Choose wedding dress/suit', priority: 'normal', order: 9, dependencies: [] },
            { title: 'Hire DJ or band', priority: 'normal', order: 10, dependencies: [] },
            { title: 'Arrange flowers', priority: 'normal', order: 11, dependencies: [] },
            { title: 'Plan honeymoon', priority: 'normal', order: 12, dependencies: [] },
            { title: 'Get marriage license', priority: 'critical', order: 13, dependencies: [] },
            { title: 'Final venue walkthrough', priority: 'high', order: 14, dependencies: ['Book venue'] },
            { title: 'Rehearsal dinner', priority: 'high', order: 15, dependencies: [] },
        ],
        milestones: [
            { name: 'Venue Booked', taskIds: ['Book venue'], targetDate: undefined },
            { name: 'Invitations Sent', taskIds: ['Send invitations'], targetDate: undefined },
            { name: 'Wedding Day', taskIds: [], targetDate: undefined },
        ],
    },
    {
        id: 'moving',
        name: 'Moving to New Home',
        description: 'Comprehensive moving checklist',
        category: 'life-events',
        defaultDuration: 60,
        tasks: [
            { title: 'Create moving budget', priority: 'high', order: 1, dependencies: [] },
            { title: 'Research moving companies', priority: 'high', order: 2, dependencies: [] },
            { title: 'Get moving quotes', priority: 'high', order: 3, dependencies: ['Research moving companies'] },
            { title: 'Book moving company', priority: 'critical', order: 4, dependencies: ['Get moving quotes'] },
            { title: 'Start decluttering', priority: 'normal', order: 5, dependencies: [] },
            { title: 'Gather packing supplies', priority: 'normal', order: 6, dependencies: [] },
            { title: 'Notify utilities (old address)', priority: 'high', order: 7, dependencies: [] },
            { title: 'Set up utilities (new address)', priority: 'high', order: 8, dependencies: [] },
            { title: 'Change address with USPS', priority: 'high', order: 9, dependencies: [] },
            { title: 'Update address with banks', priority: 'normal', order: 10, dependencies: [] },
            { title: 'Pack non-essentials', priority: 'normal', order: 11, dependencies: ['Gather packing supplies'] },
            { title: 'Pack room by room', priority: 'normal', order: 12, dependencies: ['Pack non-essentials'] },
            { title: 'Final walkthrough (old place)', priority: 'normal', order: 13, dependencies: [] },
            { title: 'Moving day', priority: 'critical', order: 14, dependencies: ['Book moving company'] },
            { title: 'Unpack essentials', priority: 'high', order: 15, dependencies: ['Moving day'] },
        ],
        milestones: [
            { name: 'Movers Booked', taskIds: ['Book moving company'], targetDate: undefined },
            { name: 'Packing Complete', taskIds: ['Pack room by room'], targetDate: undefined },
            { name: 'Moved In', taskIds: ['Moving day', 'Unpack essentials'], targetDate: undefined },
        ],
    },
    {
        id: 'renovation',
        name: 'Home Renovation',
        description: 'Home renovation project checklist',
        category: 'home',
        defaultDuration: 90,
        tasks: [
            { title: 'Define scope of work', priority: 'critical', order: 1, dependencies: [] },
            { title: 'Set renovation budget', priority: 'critical', order: 2, dependencies: [] },
            { title: 'Get contractor referrals', priority: 'high', order: 3, dependencies: [] },
            { title: 'Get multiple quotes', priority: 'high', order: 4, dependencies: ['Get contractor referrals'] },
            { title: 'Select contractor', priority: 'critical', order: 5, dependencies: ['Get multiple quotes'] },
            { title: 'Apply for permits', priority: 'high', order: 6, dependencies: ['Select contractor'] },
            { title: 'Choose materials/finishes', priority: 'normal', order: 7, dependencies: [] },
            { title: 'Order materials', priority: 'normal', order: 8, dependencies: ['Choose materials/finishes'] },
            { title: 'Prepare space', priority: 'normal', order: 9, dependencies: [] },
            { title: 'Demolition phase', priority: 'normal', order: 10, dependencies: ['Prepare space'] },
            { title: 'Rough-in work', priority: 'normal', order: 11, dependencies: ['Demolition phase'] },
            { title: 'Inspections', priority: 'high', order: 12, dependencies: ['Rough-in work'] },
            { title: 'Finishing work', priority: 'normal', order: 13, dependencies: ['Inspections'] },
            { title: 'Final walkthrough', priority: 'high', order: 14, dependencies: ['Finishing work'] },
            { title: 'Final payment', priority: 'normal', order: 15, dependencies: ['Final walkthrough'] },
        ],
        milestones: [
            { name: 'Contractor Hired', taskIds: ['Select contractor'], targetDate: undefined },
            { name: 'Permits Approved', taskIds: ['Apply for permits'], targetDate: undefined },
            { name: 'Project Complete', taskIds: ['Final walkthrough'], targetDate: undefined },
        ],
    },
    {
        id: 'job-search',
        name: 'Job Search',
        description: 'Structured job search plan',
        category: 'career',
        defaultDuration: 90,
        tasks: [
            { title: 'Define target roles', priority: 'critical', order: 1, dependencies: [] },
            { title: 'Update resume', priority: 'critical', order: 2, dependencies: [] },
            { title: 'Update LinkedIn profile', priority: 'high', order: 3, dependencies: ['Update resume'] },
            { title: 'Build target company list', priority: 'high', order: 4, dependencies: ['Define target roles'] },
            { title: 'Research companies', priority: 'normal', order: 5, dependencies: ['Build target company list'] },
            { title: 'Network outreach', priority: 'high', order: 6, dependencies: [] },
            { title: 'Apply to jobs (weekly)', priority: 'normal', order: 7, dependencies: ['Update resume'] },
            { title: 'Prepare interview stories', priority: 'normal', order: 8, dependencies: [] },
            { title: 'Practice interviews', priority: 'normal', order: 9, dependencies: ['Prepare interview stories'] },
            { title: 'Send thank you notes', priority: 'normal', order: 10, dependencies: [] },
            { title: 'Negotiate offer', priority: 'high', order: 11, dependencies: [] },
            { title: 'Accept offer', priority: 'critical', order: 12, dependencies: ['Negotiate offer'] },
            { title: 'Give notice at current job', priority: 'high', order: 13, dependencies: ['Accept offer'] },
        ],
        milestones: [
            { name: 'Ready to Apply', taskIds: ['Update resume', 'Update LinkedIn profile'], targetDate: undefined },
            { name: 'First Interview', taskIds: [], targetDate: undefined },
            { name: 'Offer Received', taskIds: ['Negotiate offer'], targetDate: undefined },
            { name: 'Job Secured', taskIds: ['Accept offer'], targetDate: undefined },
        ],
    },
];
// ============================================================================
// PROJECT STORAGE (simplified - would use Firestore in production)
// ============================================================================
const projectStore = new Map();
function getUserProjects(userId) {
    return projectStore.get(userId) || [];
}
function saveUserProjects(userId, projects) {
    projectStore.set(userId, projects);
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function getProjectToolDefinitions() {
    return [
        // =========================================================================
        // createProject - New project with optional template
        // =========================================================================
        {
            id: 'createProject',
            name: 'Create Project',
            description: 'Create a new project, optionally from a template.',
            domain: 'projects',
            tags: ['project', 'create', 'planning'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Create a new project, optionally from a template.',
                    parameters: z.object({
                        name: z.string().describe('Project name'),
                        template: z
                            .enum(['wedding', 'moving', 'renovation', 'job-search'])
                            .optional()
                            .describe('Template to use'),
                        targetDate: z.string().optional().describe('Target completion date'),
                        description: z.string().optional().describe('Project description'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to create a project.';
                        }
                        const projects = getUserProjects(userId);
                        const now = new Date().toISOString();
                        const project = {
                            id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                            userId,
                            name: params.name,
                            description: params.description,
                            status: 'planning',
                            template: params.template,
                            targetDate: params.targetDate,
                            progress: 0,
                            tasks: [],
                            milestones: [],
                            tags: [],
                            createdAt: now,
                            updatedAt: now,
                        };
                        // Apply template if specified
                        if (params.template) {
                            const template = PROJECT_TEMPLATES.find((t) => t.id === params.template);
                            if (template) {
                                project.tasks = template.tasks.map((t, i) => ({
                                    ...t,
                                    id: `task_${Date.now()}_${i}`,
                                    projectId: project.id,
                                    status: 'pending',
                                    createdAt: now,
                                    updatedAt: now,
                                }));
                                project.milestones = template.milestones.map((m, i) => ({
                                    ...m,
                                    id: `mile_${Date.now()}_${i}`,
                                    projectId: project.id,
                                    createdAt: now,
                                }));
                            }
                        }
                        projects.push(project);
                        saveUserProjects(userId, projects);
                        let response = `✅ Project created: **${project.name}**\n\n`;
                        if (params.template) {
                            response += `📋 Using the **${params.template}** template\n`;
                            response += `- ${project.tasks.length} tasks\n`;
                            response += `- ${project.milestones.length} milestones\n\n`;
                            response += `Say "show project tasks" to see the full list.`;
                        }
                        else {
                            response += `Start adding tasks with "add task to ${project.name}".`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // addProjectTask - Task within a project
        // =========================================================================
        {
            id: 'addProjectTask',
            name: 'Add Project Task',
            description: 'Add a task to a project.',
            domain: 'projects',
            tags: ['project', 'task', 'add'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Add a task to a project.',
                    parameters: z.object({
                        projectName: z.string().describe('Name of the project'),
                        task: z.string().describe('Task description'),
                        priority: z
                            .enum(['low', 'normal', 'high', 'critical'])
                            .optional()
                            .describe('Task priority'),
                        dueDate: z.string().optional().describe('Due date'),
                        dependsOn: z
                            .array(z.string())
                            .optional()
                            .describe('Tasks this depends on'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to add tasks.';
                        }
                        const projects = getUserProjects(userId);
                        const project = projects.find((p) => p.name.toLowerCase().includes(params.projectName.toLowerCase()));
                        if (!project) {
                            return `I couldn't find a project matching "${params.projectName}".`;
                        }
                        const now = new Date().toISOString();
                        const task = {
                            id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                            projectId: project.id,
                            title: params.task,
                            status: 'pending',
                            priority: params.priority || 'normal',
                            dependencies: params.dependsOn || [],
                            dueDate: params.dueDate,
                            order: project.tasks.length + 1,
                            createdAt: now,
                            updatedAt: now,
                        };
                        project.tasks.push(task);
                        project.updatedAt = now;
                        saveUserProjects(userId, projects);
                        return `✅ Added task to **${project.name}**: "${params.task}"`;
                    },
                });
            },
        },
        // =========================================================================
        // getProjectStatus - Progress overview
        // =========================================================================
        {
            id: 'getProjectStatus',
            name: 'Get Project Status',
            description: 'Get the status and progress of a project.',
            domain: 'projects',
            tags: ['project', 'status', 'progress'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Get the status and progress of a project.',
                    parameters: z.object({
                        projectName: z.string().optional().describe('Project name (shows all if not specified)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to show your projects.';
                        }
                        const projects = getUserProjects(userId);
                        if (projects.length === 0) {
                            return "You don't have any projects yet. " +
                                "Create one with \"create project [name]\" or use a template like \"create wedding project\".";
                        }
                        if (params.projectName) {
                            const project = projects.find((p) => p.name.toLowerCase().includes(params.projectName.toLowerCase()));
                            if (!project) {
                                return `I couldn't find a project matching "${params.projectName}".`;
                            }
                            const completed = project.tasks.filter((t) => t.status === 'completed').length;
                            const total = project.tasks.length;
                            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
                            let response = `📊 **${project.name}**\n\n`;
                            response += `Status: ${project.status}\n`;
                            response += `Progress: ${progress}% (${completed}/${total} tasks)\n`;
                            if (project.targetDate) {
                                response += `Target: ${project.targetDate}\n`;
                            }
                            response += `\n`;
                            const pending = project.tasks.filter((t) => t.status === 'pending').slice(0, 5);
                            if (pending.length > 0) {
                                response += `**Next tasks:**\n`;
                                for (const task of pending) {
                                    response += `- ${task.title}`;
                                    if (task.priority === 'critical')
                                        response += ' 🔴';
                                    else if (task.priority === 'high')
                                        response += ' 🟠';
                                    response += `\n`;
                                }
                            }
                            return response;
                        }
                        // Show all projects
                        let response = `📋 **Your Projects**\n\n`;
                        for (const project of projects.filter((p) => p.status !== 'completed')) {
                            const completed = project.tasks.filter((t) => t.status === 'completed').length;
                            const total = project.tasks.length;
                            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
                            response += `**${project.name}** - ${progress}% complete\n`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // completeProjectTask - Mark task done
        // =========================================================================
        {
            id: 'completeProjectTask',
            name: 'Complete Project Task',
            description: 'Mark a project task as completed.',
            domain: 'projects',
            tags: ['project', 'task', 'complete'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Mark a project task as completed.',
                    parameters: z.object({
                        projectName: z.string().describe('Name of the project'),
                        taskTitle: z.string().describe('Task to complete'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to complete tasks.';
                        }
                        const projects = getUserProjects(userId);
                        const project = projects.find((p) => p.name.toLowerCase().includes(params.projectName.toLowerCase()));
                        if (!project) {
                            return `I couldn't find a project matching "${params.projectName}".`;
                        }
                        const task = project.tasks.find((t) => t.title.toLowerCase().includes(params.taskTitle.toLowerCase()));
                        if (!task) {
                            return `I couldn't find a task matching "${params.taskTitle}".`;
                        }
                        task.status = 'completed';
                        task.completedAt = new Date().toISOString();
                        task.updatedAt = task.completedAt;
                        project.updatedAt = task.completedAt;
                        saveUserProjects(userId, projects);
                        // Calculate progress
                        const completed = project.tasks.filter((t) => t.status === 'completed').length;
                        const total = project.tasks.length;
                        const progress = Math.round((completed / total) * 100);
                        return `✅ Completed: "${task.title}"\n\n` +
                            `**${project.name}** is now ${progress}% complete (${completed}/${total} tasks)`;
                    },
                });
            },
        },
        // =========================================================================
        // listProjectTemplates - Available templates
        // =========================================================================
        {
            id: 'listProjectTemplates',
            name: 'List Project Templates',
            description: 'Show available project templates.',
            domain: 'projects',
            tags: ['project', 'template', 'list'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Show available project templates.',
                    parameters: z.object({}),
                    execute: async () => {
                        let response = `📋 **Project Templates**\n\n`;
                        for (const template of PROJECT_TEMPLATES) {
                            response += `**${template.name}** (${template.id})\n`;
                            response += `  ${template.description}\n`;
                            response += `  📝 ${template.tasks.length} tasks, ${template.milestones.length} milestones\n`;
                            response += `  ⏱️ Typical duration: ${template.defaultDuration} days\n\n`;
                        }
                        response += `Create a project from a template with:\n`;
                        response += `"create wedding project" or "create project [name] using moving template"`;
                        return response;
                    },
                });
            },
        },
    ];
}
// ============================================================================
// DOMAIN EXPORT
// ============================================================================
export function getToolDefinitions() {
    return getProjectToolDefinitions();
}
export const definitions = getProjectToolDefinitions();
//# sourceMappingURL=index.js.map