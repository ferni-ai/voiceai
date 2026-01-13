/**
 * Retirement Planning Tools - Jordan's Retirement Coordination
 *
 * Comprehensive retirement planning that integrates with:
 * - Maya for savings goals and budget allocation
 * - Jack for investment strategy
 * - Alex for scheduling retirement planning sessions
 *
 * Jordan helps users envision, plan, and track their path to retirement.
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText, parseAmount, isValidAmount } from '../../validation.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// VALIDATION HELPERS
// ============================================================================
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;
const MAX_MONTHLY_INCOME = 1_000_000; // $1M/month max
const MIN_AGE = 18;
const MAX_AGE = 120;
function validatePlanName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Plan name is required' };
    }
    const sanitized = sanitizePlainText(name, MAX_NAME_LENGTH);
    if (sanitized.length < 2) {
        return { valid: false, error: 'Plan name must be at least 2 characters' };
    }
    return { valid: true, sanitized };
}
function validateAge(age, fieldName = 'age') {
    if (typeof age !== 'number' || !Number.isInteger(age)) {
        return { valid: false, error: `${fieldName} must be a whole number` };
    }
    if (age < MIN_AGE || age > MAX_AGE) {
        return { valid: false, error: `${fieldName} must be between ${MIN_AGE} and ${MAX_AGE}` };
    }
    return { valid: true, sanitized: age };
}
function validateMonthlyIncome(amount) {
    const parsed = parseAmount(amount);
    if (parsed === null || !isValidAmount(parsed, 0, MAX_MONTHLY_INCOME)) {
        return {
            valid: false,
            error: `Monthly income must be between $0 and $${MAX_MONTHLY_INCOME.toLocaleString()}`,
        };
    }
    return { valid: true, sanitized: parsed };
}
function validateDescription(desc) {
    if (!desc) {
        return { valid: true, sanitized: '' };
    }
    if (typeof desc !== 'string') {
        return { valid: false, error: 'Description must be a string' };
    }
    return { valid: true, sanitized: sanitizePlainText(desc, MAX_DESCRIPTION_LENGTH) };
}
// In-memory storage
const retirementPlans = new Map();
// ============================================================================
// RETIREMENT CHECKLISTS BY TIMELINE
// ============================================================================
const RETIREMENT_CHECKLIST_TEMPLATES = {
    '10-years-out': [
        {
            task: 'Estimate retirement expenses and income needs',
            category: 'financial',
            yearsBeforeRetirement: 10,
            completed: false,
        },
        {
            task: 'Review and consolidate retirement accounts',
            category: 'financial',
            yearsBeforeRetirement: 10,
            completed: false,
        },
        {
            task: 'Create or update estate plan (will, trust)',
            category: 'legal',
            yearsBeforeRetirement: 10,
            completed: false,
        },
        {
            task: 'Assess current health and insurance needs',
            category: 'health',
            yearsBeforeRetirement: 10,
            completed: false,
        },
        {
            task: 'Start envisioning retirement lifestyle',
            category: 'lifestyle',
            yearsBeforeRetirement: 10,
            completed: false,
        },
        {
            task: 'Consider long-term care insurance',
            category: 'health',
            yearsBeforeRetirement: 10,
            completed: false,
        },
    ],
    '5-years-out': [
        {
            task: 'Calculate Social Security benefits timeline',
            category: 'financial',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Research Medicare options and enrollment',
            category: 'health',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Plan healthcare bridge if retiring before 65',
            category: 'health',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Decide on retirement location',
            category: 'lifestyle',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Start building post-retirement social network',
            category: 'social',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Review investment allocation for risk reduction',
            category: 'financial',
            yearsBeforeRetirement: 5,
            completed: false,
        },
        {
            task: 'Plan for debt payoff before retirement',
            category: 'financial',
            yearsBeforeRetirement: 5,
            completed: false,
        },
    ],
    '1-year-out': [
        {
            task: 'Finalize retirement date with employer',
            category: 'lifestyle',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Understand pension options (if applicable)',
            category: 'financial',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Plan for health insurance transition',
            category: 'health',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Create detailed first-year retirement budget',
            category: 'financial',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Plan retirement celebration',
            category: 'social',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Set up retirement income streams',
            category: 'financial',
            yearsBeforeRetirement: 1,
            completed: false,
        },
        {
            task: 'Decide what to do with 401k/employer plans',
            category: 'financial',
            yearsBeforeRetirement: 1,
            completed: false,
        },
    ],
    'retirement-year': [
        {
            task: 'Submit retirement paperwork',
            category: 'lifestyle',
            yearsBeforeRetirement: 0,
            completed: false,
        },
        {
            task: 'Enroll in Medicare (if 65+)',
            category: 'health',
            yearsBeforeRetirement: 0,
            completed: false,
        },
        {
            task: 'Activate retirement income plan',
            category: 'financial',
            yearsBeforeRetirement: 0,
            completed: false,
        },
        {
            task: 'Update address and beneficiaries on all accounts',
            category: 'legal',
            yearsBeforeRetirement: 0,
            completed: false,
        },
        {
            task: 'Plan first month of retirement activities',
            category: 'lifestyle',
            yearsBeforeRetirement: 0,
            completed: false,
        },
    ],
};
// ============================================================================
// RETIREMENT VISION TEMPLATES
// ============================================================================
const VISION_PROMPTS = {
    location: [
        'Where do you dream of living? Same house? Downsize? New city?',
        'Beach, mountains, city, or countryside?',
        'Near family or somewhere new?',
    ],
    activities: [
        'What hobbies do you want to finally have time for?',
        'Golf? Gardening? Art? Music? Reading?',
        'Learning something new - language, instrument, skill?',
    ],
    travel: [
        "What's on your bucket list?",
        'RV adventures? International trips? Cruises?',
        'How often do you want to travel?',
    ],
    family: [
        'More time with grandchildren?',
        "Family reunions and gatherings you'll host?",
        'Helping adult children or aging parents?',
    ],
    health: [
        'Fitness goals for retirement?',
        'Activities that keep you active and engaged?',
        'Preventive care and wellness routines?',
    ],
    legacy: [
        'Volunteering or giving back?',
        'Mentoring the next generation?',
        'Charitable causes you care about?',
    ],
    work: [
        'Part-time consulting or freelancing?',
        'Turning a hobby into income?',
        'Board positions or advisory roles?',
    ],
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateYearsToRetirement(currentAge, targetAge) {
    return Math.max(0, targetAge - currentAge);
}
function getPhaseFromYears(yearsToRetirement) {
    if (yearsToRetirement <= 0)
        return 'retired';
    if (yearsToRetirement <= 2)
        return 'transitioning';
    if (yearsToRetirement <= 10)
        return 'pre-retirement';
    return 'accumulating';
}
function buildChecklist(yearsToRetirement) {
    const checklist = [];
    let itemIndex = 0;
    // Add relevant checklists based on timeline
    if (yearsToRetirement <= 10) {
        RETIREMENT_CHECKLIST_TEMPLATES['10-years-out'].forEach((item) => {
            checklist.push({ ...item, id: `ret_task_${itemIndex++}` });
        });
    }
    if (yearsToRetirement <= 5) {
        RETIREMENT_CHECKLIST_TEMPLATES['5-years-out'].forEach((item) => {
            checklist.push({ ...item, id: `ret_task_${itemIndex++}` });
        });
    }
    if (yearsToRetirement <= 1) {
        RETIREMENT_CHECKLIST_TEMPLATES['1-year-out'].forEach((item) => {
            checklist.push({ ...item, id: `ret_task_${itemIndex++}` });
        });
    }
    if (yearsToRetirement <= 0) {
        RETIREMENT_CHECKLIST_TEMPLATES['retirement-year'].forEach((item) => {
            checklist.push({ ...item, id: `ret_task_${itemIndex++}` });
        });
    }
    return checklist;
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
export function createRetirementPlan(userId, currentAge, targetAge, style = 'traditional', monthlyIncomeGoal = 5000) {
    // Validate inputs
    const currentAgeValidation = validateAge(currentAge, 'current age');
    if (!currentAgeValidation.valid) {
        throw new Error(currentAgeValidation.error);
    }
    const targetAgeValidation = validateAge(targetAge, 'target retirement age');
    if (!targetAgeValidation.valid) {
        throw new Error(targetAgeValidation.error);
    }
    if (targetAge <= currentAge) {
        throw new Error('Target retirement age must be greater than current age');
    }
    const incomeValidation = validateMonthlyIncome(monthlyIncomeGoal);
    if (!incomeValidation.valid) {
        throw new Error(incomeValidation.error);
    }
    const validatedCurrentAge = currentAgeValidation.sanitized;
    const validatedTargetAge = targetAgeValidation.sanitized;
    const validatedIncome = incomeValidation.sanitized;
    const id = generateId('retirement');
    const yearsToRetirement = calculateYearsToRetirement(validatedCurrentAge, validatedTargetAge);
    const phase = getPhaseFromYears(yearsToRetirement);
    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() + yearsToRetirement);
    const plan = {
        id,
        userId,
        name: `Retirement at ${validatedTargetAge}`,
        style,
        phase,
        targetAge: validatedTargetAge,
        currentAge: validatedCurrentAge,
        targetDate,
        monthlyIncomeGoal: validatedIncome,
        currentSavings: 0,
        monthlySavingsTarget: 0,
        savingsProgress: 0,
        visionItems: [],
        checklist: buildChecklist(yearsToRetirement),
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    retirementPlans.set(id, plan);
    getLogger().info({ planId: id, targetAge: validatedTargetAge, yearsToRetirement }, '🎯 Retirement plan created');
    return plan;
}
export function getRetirementPlan(userId) {
    return Array.from(retirementPlans.values()).find((p) => p.userId === userId);
}
export function updateRetirementSavings(planId, currentSavings, monthlySavingsTarget) {
    const plan = retirementPlans.get(planId);
    if (!plan)
        return undefined;
    plan.currentSavings = currentSavings;
    if (monthlySavingsTarget !== undefined) {
        plan.monthlySavingsTarget = monthlySavingsTarget;
    }
    // Calculate progress (simple estimate: need 25x annual expenses for 4% rule)
    const annualIncomeNeeded = plan.monthlyIncomeGoal * 12;
    const targetSavings = annualIncomeNeeded * 25; // 4% safe withdrawal rate
    plan.savingsProgress = Math.min(100, Math.round((currentSavings / targetSavings) * 100));
    plan.updatedAt = new Date();
    retirementPlans.set(planId, plan);
    return plan;
}
export function addVisionItem(planId, category, description, priority = 'nice-to-have', estimatedCost) {
    // Validate description
    const descValidation = validateDescription(description);
    if (!descValidation.valid) {
        getLogger().warn({ planId, error: descValidation.error }, 'Invalid vision item description');
        return undefined;
    }
    const plan = retirementPlans.get(planId);
    if (!plan)
        return undefined;
    const item = {
        id: generateId('vision'),
        category,
        description: descValidation.sanitized || description,
        priority,
        estimatedCost,
    };
    plan.visionItems.push(item);
    plan.updatedAt = new Date();
    retirementPlans.set(planId, plan);
    return item;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createRetirementPlanningTools() {
    return {
        // ========== CREATE RETIREMENT PLAN ==========
        createRetirementPlan: llm.tool({
            description: getToolDescription('createRetirementPlan'),
            parameters: z.object({
                currentAge: z.number().min(18).max(100).describe("User's current age"),
                targetAge: z.number().min(30).max(100).describe('Desired retirement age'),
                style: z
                    .enum(['early-retirement', 'traditional', 'semi-retirement', 'encore-career', 'flexible'])
                    .optional()
                    .default('traditional')
                    .describe('Retirement style/approach'),
                monthlyIncomeGoal: z
                    .number()
                    .positive()
                    .optional()
                    .default(5000)
                    .describe('Desired monthly income in retirement'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ currentAge, targetAge, style = 'traditional', monthlyIncomeGoal = 5000, userId, }) => {
                const plan = createRetirementPlan(userId, currentAge, targetAge, style, monthlyIncomeGoal);
                const yearsToRetirement = calculateYearsToRetirement(currentAge, targetAge);
                let response = `🎯 **Retirement Plan Created!**\n\n`;
                response += `**Target:** Retire at age ${targetAge} (in ${yearsToRetirement} years)\n`;
                response += `**Style:** ${style.replace('-', ' ')}\n`;
                response += `**Monthly Income Goal:** $${monthlyIncomeGoal.toLocaleString()}\n`;
                response += `**Phase:** ${plan.phase}\n\n`;
                response += `**Using the 4% Rule:**\n`;
                const annualIncome = monthlyIncomeGoal * 12;
                const targetSavings = annualIncome * 25;
                response += `• You'll need approximately $${targetSavings.toLocaleString()} saved\n`;
                response += `• That provides $${annualIncome.toLocaleString()}/year sustainably\n\n`;
                response += `**Your Timeline Checklist (${plan.checklist.length} items):**\n`;
                const checklistPreview = plan.checklist.slice(0, 5);
                checklistPreview.forEach((item) => {
                    response += `☐ ${item.task} (${item.category})\n`;
                });
                if (plan.checklist.length > 5) {
                    response += `...and ${plan.checklist.length - 5} more tasks\n`;
                }
                response += `\n💡 **Next Steps:**\n`;
                response += `1. Let's work with Maya to set up your retirement savings goal\n`;
                response += `2. Talk to Jack about your investment strategy\n`;
                response += `3. Start building your retirement vision!\n\n`;
                response += `What aspect would you like to focus on first?`;
                return response;
            },
        }),
        // ========== GET RETIREMENT STATUS ==========
        getRetirementStatus: llm.tool({
            description: getToolDescription('getRetirementStatus'),
            parameters: z.object({
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ userId }) => {
                const plan = getRetirementPlan(userId);
                if (!plan) {
                    return `You don't have a retirement plan set up yet! Want to create one? Just tell me your current age and when you'd like to retire.`;
                }
                const yearsToRetirement = calculateYearsToRetirement(plan.currentAge, plan.targetAge);
                const completedTasks = plan.checklist.filter((t) => t.completed).length;
                let response = `📊 **Retirement Plan Status**\n\n`;
                response += `**Goal:** Retire at ${plan.targetAge} (${yearsToRetirement} years away)\n`;
                response += `**Style:** ${plan.style.replace('-', ' ')}\n`;
                response += `**Phase:** ${plan.phase}\n\n`;
                response += `**Financial Progress:**\n`;
                response += `• Current Savings: $${plan.currentSavings.toLocaleString()}\n`;
                response += `• Monthly Income Goal: $${plan.monthlyIncomeGoal.toLocaleString()}\n`;
                response += `• Progress: ${plan.savingsProgress}% to target\n\n`;
                response += `**Checklist Progress:** ${completedTasks}/${plan.checklist.length} tasks completed\n`;
                const nextTasks = plan.checklist.filter((t) => !t.completed).slice(0, 3);
                if (nextTasks.length > 0) {
                    response += `**Next Tasks:**\n`;
                    nextTasks.forEach((task) => {
                        response += `☐ ${task.task}\n`;
                    });
                }
                if (plan.visionItems.length > 0) {
                    response += `\n**Your Retirement Vision:** ${plan.visionItems.length} items defined\n`;
                }
                return response;
            },
        }),
        // ========== ADD VISION ITEM ==========
        addRetirementVisionItem: llm.tool({
            description: getToolDescription('addRetirementVisionItem'),
            parameters: z.object({
                category: z
                    .enum(['location', 'activities', 'travel', 'family', 'health', 'legacy', 'work'])
                    .describe('Category of the vision item'),
                description: z.string().describe('Description of this retirement dream'),
                priority: z
                    .enum(['must-have', 'nice-to-have', 'dream'])
                    .optional()
                    .default('nice-to-have')
                    .describe('How important is this?'),
                estimatedAnnualCost: z
                    .number()
                    .positive()
                    .optional()
                    .describe('Estimated annual cost for this item'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ category, description, priority = 'nice-to-have', estimatedAnnualCost, userId, }) => {
                const plan = getRetirementPlan(userId);
                if (!plan) {
                    return `Let's create your retirement plan first! What's your current age and target retirement age?`;
                }
                const item = addVisionItem(plan.id, category, description, priority, estimatedAnnualCost);
                let response = `✨ **Added to Your Retirement Vision!**\n\n`;
                response += `**${category.toUpperCase()}:** ${description}\n`;
                response += `**Priority:** ${priority}\n`;
                if (estimatedAnnualCost) {
                    response += `**Estimated Cost:** $${estimatedAnnualCost.toLocaleString()}/year\n`;
                }
                response += `\n💭 **More questions to consider for ${category}:**\n`;
                VISION_PROMPTS[category].forEach((prompt) => {
                    response += `• ${prompt}\n`;
                });
                return response;
            },
        }),
        // ========== UPDATE SAVINGS PROGRESS ==========
        updateRetirementSavings: llm.tool({
            description: getToolDescription('updateRetirementSavings'),
            parameters: z.object({
                currentSavings: z.number().min(0).describe('Total current retirement savings'),
                monthlySavingsTarget: z.number().min(0).optional().describe('Monthly savings goal'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ currentSavings, monthlySavingsTarget, userId }) => {
                const plan = getRetirementPlan(userId);
                if (!plan) {
                    return `No retirement plan found. Let's create one first!`;
                }
                const updated = updateRetirementSavings(plan.id, currentSavings, monthlySavingsTarget);
                if (!updated)
                    return `Couldn't update savings.`;
                let response = `💰 **Retirement Savings Updated!**\n\n`;
                response += `**Current Savings:** $${currentSavings.toLocaleString()}\n`;
                if (monthlySavingsTarget) {
                    response += `**Monthly Target:** $${monthlySavingsTarget.toLocaleString()}\n`;
                }
                response += `**Progress:** ${updated.savingsProgress}% to retirement goal\n\n`;
                if (updated.savingsProgress < 25) {
                    response += `📈 We're just getting started! Every bit counts. Want me to have Maya help set up automatic savings?`;
                }
                else if (updated.savingsProgress < 50) {
                    response += `📈 Making progress! You're on your way. Let's talk to Jack about optimizing your investments.`;
                }
                else if (updated.savingsProgress < 75) {
                    response += `🎯 Over halfway there! Looking good! Time to fine-tune the plan.`;
                }
                else {
                    response += `🎉 You're in great shape! Let's make sure your vision matches your resources.`;
                }
                return response;
            },
        }),
        // ========== COMPLETE CHECKLIST ITEM ==========
        completeRetirementTask: llm.tool({
            description: getToolDescription('completeRetirementTask'),
            parameters: z.object({
                taskDescription: z
                    .string()
                    .describe('Description of the task to mark complete (partial match)'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ taskDescription, userId }) => {
                const plan = getRetirementPlan(userId);
                if (!plan)
                    return `No retirement plan found.`;
                const task = plan.checklist.find((t) => t.task.toLowerCase().includes(taskDescription.toLowerCase()) && !t.completed);
                if (!task) {
                    return `Couldn't find that task. Here are your pending tasks:\n${plan.checklist
                        .filter((t) => !t.completed)
                        .map((t) => `• ${t.task}`)
                        .join('\n')}`;
                }
                task.completed = true;
                plan.updatedAt = new Date();
                retirementPlans.set(plan.id, plan);
                const completedCount = plan.checklist.filter((t) => t.completed).length;
                const totalCount = plan.checklist.length;
                return `✅ **Task Complete!**\n\n"${task.task}"\n\nProgress: ${completedCount}/${totalCount} tasks completed (${Math.round((completedCount / totalCount) * 100)}%)`;
            },
        }),
        // ========== GET RETIREMENT VISION PROMPTS ==========
        getRetirementVisionPrompts: llm.tool({
            description: getToolDescription('getRetirementVisionPrompts'),
            parameters: z.object({
                category: z
                    .enum(['location', 'activities', 'travel', 'family', 'health', 'legacy', 'work'])
                    .optional()
                    .describe('Specific category to explore, or leave empty for all'),
            }),
            execute: async ({ category }) => {
                let response = `🔮 **Envision Your Retirement**\n\n`;
                if (category) {
                    response += `**${category.toUpperCase()}**\n`;
                    VISION_PROMPTS[category].forEach((prompt) => {
                        response += `• ${prompt}\n`;
                    });
                }
                else {
                    Object.entries(VISION_PROMPTS).forEach(([cat, prompts]) => {
                        response += `**${cat.toUpperCase()}**\n`;
                        prompts.forEach((prompt) => {
                            response += `• ${prompt}\n`;
                        });
                        response += '\n';
                    });
                }
                response += `\nTell me about your dreams and I'll add them to your vision board!`;
                return response;
            },
        }),
        // ========== COORDINATE WITH MAYA ==========
        requestMayaRetirementHelp: llm.tool({
            description: getToolDescription('requestMayaRetirementHelp'),
            parameters: z.object({
                helpType: z
                    .enum(['savings-goal', 'budget-allocation', 'expense-reduction', 'investment-review'])
                    .describe('Type of financial help needed'),
                context: z.string().optional().describe('Additional context for Maya'),
                userId: z.string().optional().default('default').describe('User identifier'),
            }),
            execute: async ({ helpType, context, userId }) => {
                const plan = getRetirementPlan(userId);
                const helpMessages = {
                    'savings-goal': 'set up a retirement savings goal',
                    'budget-allocation': 'allocate budget towards retirement',
                    'expense-reduction': 'find ways to save more for retirement',
                    'investment-review': 'review retirement investment allocation',
                };
                let response = `🤝 **Team Coordination: Jordan → Maya**\n\n`;
                response += `I'm setting up a handoff to Maya to help ${helpMessages[helpType]}.\n\n`;
                if (plan) {
                    response += `**Context for Maya:**\n`;
                    response += `• Retirement target: Age ${plan.targetAge}\n`;
                    response += `• Monthly income goal: $${plan.monthlyIncomeGoal.toLocaleString()}\n`;
                    response += `• Current savings: $${plan.currentSavings.toLocaleString()}\n`;
                    response += `• Progress: ${plan.savingsProgress}%\n`;
                }
                if (context) {
                    response += `• Additional notes: ${context}\n`;
                }
                response += `\nSay "talk to Maya" and she'll have all this context ready!`;
                return response;
            },
        }),
    };
}
export default createRetirementPlanningTools;
//# sourceMappingURL=retirement-planning.js.map