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
import type { ToolDefinition } from '../../registry/types.js';
export interface Project {
    id: string;
    userId: string;
    name: string;
    description?: string;
    status: 'planning' | 'active' | 'paused' | 'completed' | 'cancelled';
    template?: string;
    startDate?: string;
    targetDate?: string;
    completedDate?: string;
    progress: number;
    tasks: ProjectTask[];
    milestones: ProjectMilestone[];
    tags: string[];
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface ProjectTask {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped';
    priority: 'low' | 'normal' | 'high' | 'critical';
    parentTaskId?: string;
    dependencies: string[];
    dueDate?: string;
    completedAt?: string;
    assignedTo?: string;
    estimatedMinutes?: number;
    actualMinutes?: number;
    order: number;
    createdAt: string;
    updatedAt: string;
}
export interface ProjectMilestone {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    targetDate?: string;
    completedDate?: string;
    taskIds: string[];
    createdAt: string;
}
export interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    defaultDuration: number;
    tasks: Array<Omit<ProjectTask, 'id' | 'projectId' | 'status' | 'completedAt' | 'createdAt' | 'updatedAt'>>;
    milestones: Array<Omit<ProjectMilestone, 'id' | 'projectId' | 'completedDate' | 'createdAt'>>;
}
export declare const PROJECT_TEMPLATES: ProjectTemplate[];
export declare function getProjectToolDefinitions(): ToolDefinition[];
export declare function getToolDefinitions(): ToolDefinition[];
export declare const definitions: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map