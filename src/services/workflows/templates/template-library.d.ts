/**
 * Workflow Template Library
 *
 * Pre-built workflow templates for common life automation scenarios.
 * Users can browse, customize, and activate these templates.
 *
 * Categories:
 * - Morning routines
 * - Work productivity
 * - Health & fitness
 * - Home automation
 * - Financial management
 * - Social & relationships
 * - Travel & commute
 *
 * @module services/workflows/templates/template-library
 */
import type { WorkflowTrigger, WorkflowAction, WorkflowCondition, Workflow } from '../../stores/workflow-store.js';
export type TemplateCategory = 'morning_routine' | 'work_productivity' | 'health_fitness' | 'home_automation' | 'financial' | 'social' | 'travel' | 'evening_routine' | 'custom';
export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon: string;
    trigger: WorkflowTrigger;
    conditions: WorkflowCondition[];
    actions: WorkflowAction[];
    variables: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean' | 'time' | 'location';
        label: string;
        description?: string;
        defaultValue: unknown;
        required: boolean;
    }>;
    estimatedTimeToSetup: string;
    tags: string[];
    popularity: number;
    featured: boolean;
    requiredIntegrations: string[];
    requiredPermissions: string[];
}
export declare class TemplateLibrary {
    private templates;
    constructor();
    /**
     * Get all templates
     */
    getAll(): WorkflowTemplate[];
    /**
     * Get template by ID
     */
    getById(templateId: string): WorkflowTemplate | undefined;
    /**
     * Get templates by category
     */
    getByCategory(category: TemplateCategory): WorkflowTemplate[];
    /**
     * Get featured templates
     */
    getFeatured(): WorkflowTemplate[];
    /**
     * Search templates
     */
    search(query: string): WorkflowTemplate[];
    /**
     * Get popular templates
     */
    getPopular(limit?: number): WorkflowTemplate[];
    /**
     * Create a workflow from a template
     */
    createFromTemplate(templateId: string, userId: string, variables?: Record<string, unknown>): Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> | null;
    /**
     * Apply variables to a trigger
     */
    private applyVariables;
    /**
     * Apply variables to an object (recursive)
     */
    private applyVariablesToObject;
    /**
     * Interpolate variables in a string
     */
    private interpolateString;
    /**
     * Get all categories with counts
     */
    getCategories(): Array<{
        category: TemplateCategory;
        count: number;
        label: string;
    }>;
}
export declare function getTemplateLibrary(): TemplateLibrary;
export declare function resetTemplateLibrary(): void;
//# sourceMappingURL=template-library.d.ts.map