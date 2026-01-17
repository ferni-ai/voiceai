/**
 * Financial Habits Tools
 *
 * Tools for budgeting, spending analysis, savings goals,
 * and building healthy financial habits.
 *
 * KEY CAPABILITIES:
 * - Real spending analysis via Plaid integration
 * - Budget creation and tracking
 * - Savings goals and automation guidance
 * - Subscription auditing
 * - Debt payoff strategies (snowball vs avalanche)
 * - Behavioral tools (impulse control, spending triggers)
 * - Savings challenges and gamification
 * - Cash flow analysis
 * - Weekly/monthly financial check-ins
 *
 * ALL DATA PERSISTED TO FIRESTORE via FinancialStore
 *
 * @see ./financial-habits/types.ts - Type definitions
 * @see ./financial-habits/helpers.ts - Helper functions
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger, getUserId } from '../../utils/tool-helpers.js';

// Import Plaid tools for real financial data
import {
  hasLinkedAccounts,
  getStoredAccessToken,
  getAccountBalances,
  getTransactions,
  analyzeSpending as analyzeRealSpending,
  formatSpendingForSpeech,
} from './plaid.js';

// Import Firestore-backed financial store and types
import {
  getFinancialStore,
  type BudgetData,
  type BudgetCategoryData,
  type SavingsGoalData,
  type SubscriptionData,
  type SpendingTriggerData,
  type SpendingLimitData,
} from '../../../services/stores/financial-store.js';

// Import extracted types and helpers
import type { SpendingCategory } from '../../financial-habits/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  analyzeSpendingFromBudget,
  findSpendingLeaksFromStore,
} from '../../financial-habits/helpers.js';

// Re-export types for backward compatibility
export type {
  BudgetData,
  BudgetCategoryData,
  SavingsGoalData,
  SubscriptionData,
  SpendingTriggerData,
  SpendingLimitData,
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createFinancialHabitsTools() {
  return {
    // ========== SPENDING ANALYSIS ==========

    analyzeSpending: llm.tool({
      description: getToolDescription('analyzeSpending'),
      parameters: z.object({
        timeframe: z
          .enum(['week', 'month', 'quarter', 'year'])
          .default('month')
          .describe('Time period to analyze'),
      }),
      execute: async ({ timeframe }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const budget = store.getMainBudget(userId);
        const spending = analyzeSpendingFromBudget(budget);

        if (spending.length === 0) {
          return `I don't have spending data yet. Want to set up a budget to start tracking?`;
        }

        let response = `📊 **Spending Breakdown (This ${timeframe})**\n\n`;

        for (const cat of spending) {
          const bar =
            '█'.repeat(Math.round(cat.percentage / 5)) +
            '░'.repeat(20 - Math.round(cat.percentage / 5));
          const trendIcon = cat.trend === 'up' ? '📈' : cat.trend === 'down' ? '📉' : '➡️';
          response += `**${cat.name}** ${trendIcon}\n`;
          response += `${bar} $${cat.amount} (${cat.percentage}%)\n\n`;
        }

        const total = spending.reduce((sum, s) => sum + s.amount, 0);
        response += `**Total:** $${total.toLocaleString()}`;

        return response;
      },
    }),

    findSpendingLeaks: llm.tool({
      description: getToolDescription('findSpendingLeaks'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const leaks = findSpendingLeaksFromStore(userId);

        if (leaks.length === 0) {
          return `Looking good! I don't see any obvious spending leaks. Your spending seems well-managed.`;
        }

        let response = `🔍 **Potential Spending Leaks Found:**\n\n`;
        for (const leak of leaks) {
          response += `• ${leak}\n`;
        }

        response += `\nWant me to dig deeper into any of these?`;

        return response;
      },
    }),

    // ========== BUDGET MANAGEMENT ==========

    getBudgetStatus: llm.tool({
      description: getToolDescription('getBudgetStatus'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const budget = store.getMainBudget(userId);

        if (!budget) {
          return `You don't have a budget set up yet. Want me to help create one?`;
        }

        const percentUsed = Math.round((budget.spent / budget.monthlyLimit) * 100);
        const daysInMonth = 30;
        const dayOfMonth = new Date().getDate();
        const expectedPercent = Math.round((dayOfMonth / daysInMonth) * 100);
        const status = percentUsed <= expectedPercent ? '✅ On track' : '⚠️ Ahead of pace';

        let response = `💰 **Budget Status: ${status}**\n\n`;
        response += `**Spent:** $${budget.spent.toLocaleString()} of $${budget.monthlyLimit.toLocaleString()}\n`;
        response += `**Remaining:** $${budget.remaining.toLocaleString()}\n`;
        response += `**Progress:** ${percentUsed}% used (${expectedPercent}% expected by today)\n\n`;

        response += `**By Category:**\n`;
        for (const cat of budget.categories) {
          const catPercent = Math.round((cat.spent / cat.limit) * 100);
          const statusIcon = catPercent > 100 ? '🔴' : catPercent > 80 ? '🟡' : '🟢';
          response += `${statusIcon} ${cat.name}: $${cat.spent}/$${cat.limit}\n`;
        }

        return response;
      },
    }),

    createBudget: llm.tool({
      description: getToolDescription('createBudget'),
      parameters: z.object({
        category: z.string().describe('Budget category name'),
        monthlyLimit: z.number().positive().describe('Monthly spending limit'),
        isEssential: z.boolean().default(false).describe('Is this an essential expense?'),
      }),
      execute: async ({ category, monthlyLimit, isEssential }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        let budget = store.getMainBudget(userId);
        const now = new Date().toISOString();

        if (!budget) {
          budget = {
            id: `budget_main_${userId}`,
            userId,
            name: 'Monthly Budget',
            monthlyLimit: 0,
            spent: 0,
            remaining: 0,
            categories: [],
            createdAt: now,
            updatedAt: now,
          };
        }

        const existingIndex = budget.categories.findIndex(
          (c) => c.name.toLowerCase() === category.toLowerCase()
        );

        if (existingIndex >= 0) {
          budget.categories[existingIndex].limit = monthlyLimit;
          budget.categories[existingIndex].isEssential = isEssential;
        } else {
          budget.categories.push({
            name: category,
            limit: monthlyLimit,
            spent: 0,
            color: `#${Math.floor(Math.random() * 16777215)
              .toString(16)
              .padStart(6, '0')}`,
            isEssential,
          });
        }

        budget.monthlyLimit = budget.categories.reduce((sum, c) => sum + c.limit, 0);
        budget.remaining = budget.monthlyLimit - budget.spent;

        store.setBudget(userId, budget);
        getLogger().info({ userId, category, monthlyLimit }, '📋 Budget updated (persisted)');

        return `✅ Budget set: **${category}** - $${monthlyLimit}/month\n\nYour total monthly budget is now $${budget.monthlyLimit.toLocaleString()}.`;
      },
    }),

    // ========== SAVINGS GOALS ==========

    getSavingsGoals: llm.tool({
      description: getToolDescription('getSavingsGoals'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const goals = store.getActiveSavingsGoals(userId);

        if (goals.length === 0) {
          return `You don't have any savings goals set up yet. Want to create one? I recommend starting with an emergency fund!`;
        }

        let response = `🎯 **Savings Goals**\n\n`;

        for (const goal of goals) {
          const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100);
          const bar =
            '█'.repeat(Math.round(progress / 5)) + '░'.repeat(20 - Math.round(progress / 5));
          const priorityIcon =
            goal.priority === 'high' ? '🔴' : goal.priority === 'medium' ? '🟡' : '🟢';

          response += `**${goal.name}** ${priorityIcon}${goal.isEmergencyFund ? ' 🛡️' : ''}\n`;
          response += `${bar} ${progress}%\n`;
          response += `$${goal.currentAmount.toLocaleString()} / $${goal.targetAmount.toLocaleString()}\n`;

          if (goal.deadline) {
            const deadline = new Date(goal.deadline);
            const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            response += `⏰ ${daysLeft} days left\n`;
          }

          response += `Contributing: $${goal.monthlyContribution}/month\n\n`;
        }

        return response;
      },
    }),

    createSavingsGoal: llm.tool({
      description: getToolDescription('createSavingsGoal'),
      parameters: z.object({
        name: z.string().describe('Name of the goal (e.g., "Emergency Fund", "Vacation")'),
        targetAmount: z.number().positive().describe('Target amount to save'),
        deadline: z.string().optional().describe('Target date (e.g., "December 2025")'),
        monthlyContribution: z.number().positive().describe('How much to save per month'),
        priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Priority level'),
        isEmergencyFund: z.boolean().default(false).describe('Is this an emergency fund?'),
      }),
      execute: async (
        { name, targetAmount, deadline, monthlyContribution, priority, isEmergencyFund },
        { ctx }
      ) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const now = new Date().toISOString();
        const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const goal: SavingsGoalData = {
          id,
          userId,
          name,
          targetAmount,
          currentAmount: 0,
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
          monthlyContribution,
          priority,
          isEmergencyFund,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };

        store.setSavingsGoal(userId, goal);
        getLogger().info(
          { userId, name, targetAmount, monthlyContribution },
          '🎯 Savings goal created (persisted)'
        );

        const monthsToGoal = Math.ceil(targetAmount / monthlyContribution);

        let response = `🎯 **New Savings Goal Created!**\n\n`;
        response += `**${name}**\n`;
        response += `Target: $${targetAmount.toLocaleString()}\n`;
        response += `Monthly contribution: $${monthlyContribution}\n`;
        response += `Estimated time: ${monthsToGoal} months\n`;

        if (isEmergencyFund) {
          response += `\n🛡️ Great choice starting with an emergency fund! This is the foundation of financial security.`;
        }

        return response;
      },
    }),

    // ========== SUBSCRIPTION MANAGEMENT ==========

    auditSubscriptions: llm.tool({
      description: getToolDescription('auditSubscriptions'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const subs = store.getActiveSubscriptions(userId);

        if (subs.length === 0) {
          return `I don't have any subscriptions tracked. Want to add some?`;
        }

        const monthlyTotal = subs.reduce((sum, s) => {
          if (s.frequency === 'yearly') return sum + s.amount / 12;
          if (s.frequency === 'weekly') return sum + s.amount * 4;
          return sum + s.amount;
        }, 0);

        const yearlyTotal = monthlyTotal * 12;

        let response = `📱 **Subscription Audit**\n\n`;
        response += `**Total:** $${monthlyTotal.toFixed(2)}/month ($${yearlyTotal.toFixed(2)}/year)\n\n`;

        const byUsefulness = {
          essential: subs.filter((s) => s.usefulness === 'essential'),
          'nice-to-have': subs.filter((s) => s.usefulness === 'nice-to-have'),
          unused: subs.filter((s) => s.usefulness === 'unused'),
          unknown: subs.filter((s) => s.usefulness === 'unknown'),
        };

        if (byUsefulness.essential.length > 0) {
          response += `**✅ Essential:**\n`;
          for (const s of byUsefulness.essential) {
            response += `• ${s.name}: $${s.amount}/${s.frequency}\n`;
          }
          response += '\n';
        }

        if (byUsefulness['nice-to-have'].length > 0) {
          response += `**🟡 Nice to Have:**\n`;
          for (const s of byUsefulness['nice-to-have']) {
            response += `• ${s.name}: $${s.amount}/${s.frequency}\n`;
          }
          response += '\n';
        }

        if (byUsefulness.unused.length > 0) {
          const unusedTotal = byUsefulness.unused.reduce((sum, s) => sum + s.amount, 0);
          response += `**🔴 Unused (Potential savings: $${unusedTotal.toFixed(2)}/month):**\n`;
          for (const s of byUsefulness.unused) {
            response += `• ${s.name}: $${s.amount}/${s.frequency}\n`;
          }
          response += '\n';
        }

        if (byUsefulness.unknown.length > 0) {
          response += `**❓ Need to evaluate:**\n`;
          for (const s of byUsefulness.unknown) {
            response += `• ${s.name}: $${s.amount}/${s.frequency}\n`;
          }
        }

        return response;
      },
    }),

    // ========== 50/30/20 RULE ==========

    apply503020Rule: llm.tool({
      description: getToolDescription('apply503020Rule'),
      parameters: z.object({
        monthlyIncome: z.number().positive().describe('Monthly take-home income'),
      }),
      execute: async ({ monthlyIncome }) => {
        const needs = monthlyIncome * 0.5;
        const wants = monthlyIncome * 0.3;
        const savings = monthlyIncome * 0.2;

        let response = `📊 **50/30/20 Budget for $${monthlyIncome.toLocaleString()}/month**\n\n`;

        response += `**50% Needs: $${needs.toLocaleString()}**\n`;
        response += `Housing, utilities, groceries, insurance, minimum debt payments\n\n`;

        response += `**30% Wants: $${wants.toLocaleString()}**\n`;
        response += `Dining out, entertainment, hobbies, subscriptions, shopping\n\n`;

        response += `**20% Savings: $${savings.toLocaleString()}**\n`;
        response += `Emergency fund, retirement, debt payoff (above minimums), goals\n\n`;

        response += `This is a starting point - adjust based on your life! High cost of living area? Maybe 60/20/20. Aggressive debt payoff? Try 50/20/30 with 30% to debt.`;

        return response;
      },
    }),

    // ========== REAL SPENDING DATA (PLAID INTEGRATION) ==========

    getActualSpending: llm.tool({
      description: getToolDescription('getActualSpending'),
      parameters: z.object({
        userId: z.string().describe('User identifier'),
        period: z.enum(['week', 'month', 'quarter']).default('month'),
      }),
      execute: async ({ userId, period }) => {
        // Check if user has linked accounts
        if (!hasLinkedAccounts(userId)) {
          getLogger().info({ userId }, 'No linked accounts - using sample data');
          return `I don't have access to your actual bank data yet. Want to link your accounts? It takes about 30 seconds and lets me give you real insights instead of guesses!\n\nFor now, I can help you track spending manually or set up a budget based on what you tell me.`;
        }

        const accessToken = getStoredAccessToken(userId);
        if (!accessToken) {
          return `Something went wrong accessing your accounts. Want to try reconnecting?`;
        }

        // Get real transactions
        const endDate = new Date();
        const startDate = new Date();
        if (period === 'week') startDate.setDate(startDate.getDate() - 7);
        else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);
        else startDate.setMonth(startDate.getMonth() - 3);

        const transactions = await getTransactions(
          accessToken,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          250
        );

        if (transactions.length === 0) {
          return `I don't see any transactions for the past ${period}. This might be a new connection that's still syncing.`;
        }

        const analysis = analyzeRealSpending(transactions);
        const formatted = formatSpendingForSpeech(
          analysis,
          period === 'week'
            ? 'the past week'
            : period === 'month'
              ? 'the past month'
              : 'the past 3 months'
        );

        // Add Maya's warm commentary
        let mayaComment = '\n\n';
        const topCategory = Object.entries(analysis.byCategory).sort(
          (a, b) => b[1].total - a[1].total
        )[0];

        if (topCategory) {
          mayaComment += `Looking at this, your biggest spending area is ${topCategory[0]}. `;
          if (analysis.recurringExpenses.length > 3) {
            mayaComment += `I also notice you have quite a few recurring charges - worth reviewing to see if they're all serving you.\n\n`;
          }
          mayaComment += `Want to dig into any particular category? No judgment - just awareness!`;
        }

        return formatted + mayaComment;
      },
    }),

    // ========== DEBT PAYOFF STRATEGIES ==========

    compareDebtStrategies: llm.tool({
      description: getToolDescription('compareDebtStrategies'),
      parameters: z.object({
        debts: z
          .array(
            z.object({
              name: z.string().describe('Debt name (e.g., "Chase Credit Card")'),
              balance: z.number().describe('Current balance'),
              interestRate: z.number().describe('Annual interest rate (e.g., 18 for 18%)'),
              minimumPayment: z.number().describe('Minimum monthly payment'),
            })
          )
          .describe('List of debts'),
        extraMonthlyPayment: z.number().describe('Extra money available per month beyond minimums'),
      }),
      execute: async ({ debts, extraMonthlyPayment }) => {
        if (debts.length === 0) {
          return `No debts listed! That's either amazing or we need to add some. What debts are you working on?`;
        }

        // Calculate snowball order (smallest balance first)
        const snowballOrder = [...debts].sort((a, b) => a.balance - b.balance);

        // Calculate avalanche order (highest interest first)
        const avalancheOrder = [...debts].sort((a, b) => b.interestRate - a.interestRate);

        // Calculate total interest for each strategy (simplified)
        const calculateTotalInterest = (orderedDebts: typeof debts) => {
          let totalInterest = 0;
          const remainingDebts = orderedDebts.map((d) => ({ ...d }));
          let months = 0;
          const maxMonths = 360;

          while (remainingDebts.length > 0 && months < maxMonths) {
            months++;
            let extraForFirst = extraMonthlyPayment;

            for (let i = 0; i < remainingDebts.length; i++) {
              const debt = remainingDebts[i];
              const monthlyInterest = debt.balance * (debt.interestRate / 100 / 12);
              totalInterest += monthlyInterest;

              let payment = debt.minimumPayment;
              if (i === 0) payment += extraForFirst;

              debt.balance = debt.balance + monthlyInterest - payment;
              if (debt.balance <= 0) {
                extraForFirst += debt.minimumPayment; // Roll payment to next
                remainingDebts.splice(i, 1);
                i--;
              }
            }
          }

          return { totalInterest: Math.round(totalInterest), months };
        };

        const snowballResult = calculateTotalInterest(snowballOrder);
        const avalancheResult = calculateTotalInterest(avalancheOrder);
        const interestSaved = snowballResult.totalInterest - avalancheResult.totalInterest;

        let response = `💰 **Debt Payoff Strategy Comparison**\n\n`;

        const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
        response += `**Total Debt:** $${totalDebt.toLocaleString()}\n`;
        response += `**Extra Monthly Payment:** $${extraMonthlyPayment}\n\n`;

        response += `**🏔️ AVALANCHE (Highest Interest First)**\n`;
        response += `Order: ${avalancheOrder.map((d) => `${d.name} (${d.interestRate}%)`).join(' → ')}\n`;
        response += `Time to freedom: ~${Math.round((avalancheResult.months / 12) * 10) / 10} years\n`;
        response += `Total interest paid: $${avalancheResult.totalInterest.toLocaleString()}\n\n`;

        response += `**⛄ SNOWBALL (Smallest Balance First)**\n`;
        response += `Order: ${snowballOrder.map((d) => `${d.name} ($${d.balance.toLocaleString()})`).join(' → ')}\n`;
        response += `Time to freedom: ~${Math.round((snowballResult.months / 12) * 10) / 10} years\n`;
        response += `Total interest paid: $${snowballResult.totalInterest.toLocaleString()}\n\n`;

        if (interestSaved > 100) {
          response += `**💡 Bottom Line:** Avalanche saves you $${interestSaved.toLocaleString()} in interest. BUT - the snowball method gives you quick wins that keep you motivated. Pick the one you'll stick with!\n\n`;
        } else {
          response += `**💡 Bottom Line:** These are pretty close! Go with snowball for the psychological wins of crossing debts off fast.\n\n`;
        }

        response += `My take? The best strategy is the one you'll actually do. If you need motivation from quick wins, snowball. If you're disciplined and want to optimize, avalanche.`;

        return response;
      },
    }),

    // ========== IMPULSE SPENDING TOOLS ==========

    impulseSpendingCheck: llm.tool({
      description: getToolDescription('impulseSpendingCheck'),
      parameters: z.object({
        item: z.string().describe('What they want to buy'),
        cost: z.number().describe('How much it costs'),
        monthlyIncome: z.number().optional().describe('Their monthly income if known'),
      }),
      execute: async ({ item, cost, monthlyIncome }) => {
        let response = `🛒 **Impulse Purchase Check: ${item} ($${cost.toLocaleString()})**\n\n`;

        response += `**Quick Questions:**\n`;
        response += `1. Did you know you wanted this before today?\n`;
        response += `2. Will you still want it in 72 hours?\n`;
        response += `3. Do you already own something that does the same thing?\n`;
        response += `4. Can you afford it without touching savings?\n\n`;

        if (monthlyIncome) {
          const workHours = Math.round(cost / (monthlyIncome / 160)); // Assuming 160 work hours/month
          response += `**Reality Check:** This costs ${workHours} hours of your work time.\n\n`;
        }

        response += `**The 72-Hour Rule:** If it's not urgent, wait 72 hours. If you still want it AND can afford it, go for it guilt-free.\n\n`;

        if (cost > 100) {
          response += `**Cost-Per-Use Thinking:** How many times will you use this? $${cost} ÷ 10 uses = $${(cost / 10).toFixed(0)}/use. Worth it?\n\n`;
        }

        response += `No judgment either way! The goal isn't to never spend - it's to spend intentionally on things that actually matter to you.`;

        return response;
      },
    }),

    // ========== SAVINGS CHALLENGES ==========

    startSavingsChallenge: llm.tool({
      description: getToolDescription('startSavingsChallenge'),
      parameters: z.object({
        challengeType: z
          .enum([
            '52-week', // Save $1 week 1, $2 week 2, etc
            'no-spend', // Track no-spend days
            'round-up', // Save the "change" from purchases
            'spare-change', // Save $5s or $1s
            'weather', // Save the high temperature amount
            'custom',
          ])
          .describe('Type of savings challenge'),
        startingAmount: z.number().optional().describe('Starting amount for custom challenges'),
        goal: z.number().optional().describe('Goal amount'),
      }),
      execute: async ({ challengeType, startingAmount, goal }) => {
        let response = '';

        switch (challengeType) {
          case '52-week':
            response = `🎯 **52-Week Money Challenge**\n\n`;
            response += `**How it works:**\n`;
            response += `• Week 1: Save $1\n`;
            response += `• Week 2: Save $2\n`;
            response += `• Week 3: Save $3\n`;
            response += `• ...and so on!\n\n`;
            response += `**Total saved after 1 year:** $1,378! 💰\n\n`;
            response += `**Pro tip:** Start with week 52 ($52) and work backwards. December is expensive, so lighter savings then helps!\n\n`;
            response += `**Alternative:** Save any week's amount you want each week. Feeling flush? Do a high week. Tight month? Do a low week. Same total, more flexible.`;
            break;

          case 'no-spend':
            response = `🚫 **No-Spend Day Challenge**\n\n`;
            response += `**Goal:** Have as many $0 spending days as possible!\n\n`;
            response += `**What counts:**\n`;
            response += `• ✅ No-spend: Nothing but bills/subscriptions\n`;
            response += `• ❌ Spend day: Any discretionary purchase\n\n`;
            response += `**Target levels:**\n`;
            response += `• Beginner: 10 no-spend days/month\n`;
            response += `• Intermediate: 15 no-spend days/month\n`;
            response += `• Expert: 20 no-spend days/month\n\n`;
            response += `**Track it:** Mark calendar with ✅ or ❌. Watch the pattern!`;
            break;

          case 'round-up':
            response = `🔄 **Round-Up Challenge**\n\n`;
            response += `**How it works:** Every purchase, "round up" to the next dollar and save the difference.\n\n`;
            response += `**Example:**\n`;
            response += `• Coffee: $4.50 → Round to $5 → Save $0.50\n`;
            response += `• Groceries: $67.23 → Round to $68 → Save $0.77\n\n`;
            response += `**Typical savings:** $30-50/month without noticing!\n\n`;
            response += `**Apps that do this automatically:** Acorns, Qapital, Chime, many banks now offer this.\n\n`;
            response += `Want me to help you estimate how much you'd save based on your spending?`;
            break;

          case 'spare-change':
            response = `💵 **Spare Bills Challenge**\n\n`;
            response += `**How it works:** Every time you get a $5 bill (or $1 bill), save it. Don't spend it.\n\n`;
            response += `**Why it works:**\n`;
            response += `• $5s feel small but add up fast\n`;
            response += `• Creates awareness of cash spending\n`;
            response += `• Average: $100-200/month if you use cash\n\n`;
            response += `**Digital version:** Transfer $5 every time you would have gotten one (after coffee, small purchases, etc.)`;
            break;

          case 'weather':
            response = `🌡️ **Weather Savings Challenge**\n\n`;
            response += `**How it works:** Save the daily high temperature in cents or dollars!\n\n`;
            response += `**Example (in cents):**\n`;
            response += `• 72°F day → Save $0.72\n`;
            response += `• 85°F day → Save $0.85\n\n`;
            response += `**Example (in dollars):**\n`;
            response += `• 72°F day → Save $7.20\n`;
            response += `• 85°F day → Save $8.50\n\n`;
            response += `**Fun because:** Weather is random, so your savings feel like a game!\n`;
            response += `**Yearly estimate (cents version):** ~$250-300`;
            break;

          default:
            response = `🎯 **Custom Savings Challenge**\n\n`;
            if (goal) {
              const monthlyNeeded = goal / 12;
              const weeklyNeeded = goal / 52;
              response += `**Goal:** $${goal.toLocaleString()}\n\n`;
              response += `**To hit that in 1 year:**\n`;
              response += `• Monthly: $${monthlyNeeded.toFixed(0)}\n`;
              response += `• Weekly: $${weeklyNeeded.toFixed(0)}\n`;
              response += `• Daily: $${(goal / 365).toFixed(2)}\n\n`;
            }
            response += `We can design a challenge that fits your life. What motivates you - small daily wins or bigger weekly milestones?`;
        }

        return response;
      },
    }),

    // ========== CASH FLOW ANALYSIS ==========

    analyzeCashFlow: llm.tool({
      description: getToolDescription('analyzeCashFlow'),
      parameters: z.object({
        payFrequency: z
          .enum(['weekly', 'biweekly', 'semi-monthly', 'monthly'])
          .describe('How often they get paid'),
        payDays: z.string().describe('When they get paid (e.g., "1st and 15th" or "every Friday")'),
        majorBills: z
          .array(
            z.object({
              name: z.string(),
              amount: z.number(),
              dueDay: z.number().describe('Day of month (1-31)'),
            })
          )
          .describe('Major recurring bills'),
      }),
      execute: async ({ payFrequency, payDays, majorBills }) => {
        // Group bills by week of month
        const week1 = majorBills.filter((b) => b.dueDay <= 7);
        const week2 = majorBills.filter((b) => b.dueDay > 7 && b.dueDay <= 14);
        const week3 = majorBills.filter((b) => b.dueDay > 14 && b.dueDay <= 21);
        const week4 = majorBills.filter((b) => b.dueDay > 21);

        const sumBills = (bills: typeof majorBills) => bills.reduce((sum, b) => sum + b.amount, 0);

        let response = `💸 **Cash Flow Analysis**\n\n`;
        response += `**Pay Schedule:** ${payFrequency} (${payDays})\n\n`;

        response += `**Bills by Week:**\n`;
        response += `Week 1 (1st-7th): $${sumBills(week1).toLocaleString()} - ${week1.map((b) => b.name).join(', ') || 'none'}\n`;
        response += `Week 2 (8th-14th): $${sumBills(week2).toLocaleString()} - ${week2.map((b) => b.name).join(', ') || 'none'}\n`;
        response += `Week 3 (15th-21st): $${sumBills(week3).toLocaleString()} - ${week3.map((b) => b.name).join(', ') || 'none'}\n`;
        response += `Week 4 (22nd-31st): $${sumBills(week4).toLocaleString()} - ${week4.map((b) => b.name).join(', ') || 'none'}\n\n`;

        const heaviestWeek = [
          { week: 1, total: sumBills(week1) },
          { week: 2, total: sumBills(week2) },
          { week: 3, total: sumBills(week3) },
          { week: 4, total: sumBills(week4) },
        ].sort((a, b) => b.total - a.total)[0];

        if (heaviestWeek.total > sumBills(majorBills) * 0.5) {
          response += `⚠️ **Issue:** Week ${heaviestWeek.week} has ${Math.round((heaviestWeek.total / sumBills(majorBills)) * 100)}% of your bills!\n\n`;
          response += `**Suggestions:**\n`;
          response += `• Call billers to move due dates (most will do this!)\n`;
          response += `• Spread bills across paychecks\n`;
          response += `• Build a one-month buffer so timing doesn't matter\n\n`;
        }

        response += `**Pro tip:** Many companies let you pick your due date! Call and ask to move bills to right after payday.`;

        return response;
      },
    }),

    // ========== WEEKLY MONEY CHECK-IN ==========

    weeklyCheckIn: llm.tool({
      description: getToolDescription('weeklyCheckIn'),
      parameters: z.object({
        weekNumber: z.number().optional().describe('Week number of the year'),
      }),
      execute: async ({ weekNumber }) => {
        const week =
          weekNumber ||
          Math.ceil(
            (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) /
              (7 * 24 * 60 * 60 * 1000)
          );

        let response = `📅 **Weekly Money Check-In (Week ${week})**\n\n`;

        response += `Let's do a quick review. Answer honestly - no judgment!\n\n`;

        response += `**1. Wins 🎉**\n`;
        response += `What's one money win from this week? (Even small ones count!)\n\n`;

        response += `**2. Oops Moments 😅**\n`;
        response += `Any spending you regret? What triggered it?\n\n`;

        response += `**3. Upcoming Week 📆**\n`;
        response += `Any big expenses coming? Are you ready for them?\n\n`;

        response += `**4. Quick Numbers**\n`;
        response += `• Did you spend more or less than last week?\n`;
        response += `• Did you save anything?\n`;
        response += `• Any bills due this week?\n\n`;

        response += `**5. One Focus**\n`;
        response += `What's ONE money thing you want to do better next week?\n\n`;

        response += `Take your time - this is for you, not for me. What comes up for you?`;

        return response;
      },
    }),

    // ========== SPENDING TRIGGERS JOURNAL ==========

    logSpendingTrigger: llm.tool({
      description: getToolDescription('logSpendingTrigger'),
      parameters: z.object({
        purchase: z.string().describe('What they bought'),
        amount: z.number().describe('How much they spent'),
        emotion: z
          .enum([
            'stressed',
            'bored',
            'sad',
            'anxious',
            'celebrating',
            'tired',
            'lonely',
            'angry',
            'happy',
            'overwhelmed',
            'other',
          ])
          .describe('How they were feeling'),
        situation: z
          .string()
          .optional()
          .describe('What was happening (e.g., "after work", "late night scrolling")'),
        regretLevel: z
          .enum(['none', 'mild', 'moderate', 'high'])
          .optional()
          .describe('Level of regret'),
      }),
      execute: async ({ purchase, amount, emotion, situation, regretLevel }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        // Store this trigger (persisted to Firestore)
        const trigger: SpendingTriggerData = {
          id: `trigger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          timestamp: new Date().toISOString(),
          purchase,
          amount,
          emotion,
          situation: situation || 'unspecified',
          regretLevel: regretLevel || 'unknown',
        };
        store.addSpendingTrigger(userId, trigger);

        let response = `📝 **Spending Trigger Logged**\n\n`;
        response += `**What:** ${purchase} ($${amount})\n`;
        response += `**Feeling:** ${emotion}\n`;
        if (situation) response += `**Situation:** ${situation}\n`;
        response += '\n';

        // Provide insight based on emotion
        const insights: Record<string, string> = {
          stressed: `Stress spending is super common. <break time=\"200ms\"/>Next time you feel that urge, try a 10-minute walk first. The urge usually passes.`,
          bored: `Boredom shopping is a real thing! <break time=\"200ms\"/>Try keeping a "bored list" of free things you enjoy - call a friend, go for a walk, make tea.`,
          sad: `Retail therapy feels good in the moment, <break time=\"200ms\"/>but the relief is temporary. What would actually help you feel better right now?`,
          anxious: `Anxiety can make us seek control through spending. <break time=\"200ms\"/>What's making you anxious? Let's talk about it.`,
          celebrating: `Celebrating with spending isn't bad! <break time=\"200ms\"/>The key is making it intentional. Was this a planned celebration?`,
          tired: `Tired brains make expensive decisions. <break time=\"200ms\"/>Try the "morning test" - if you wouldn't buy it at 9am well-rested, don't buy it at 11pm exhausted.`,
          lonely: `Loneliness spending is about connection, not stuff. <break time=\"200ms\"/>Would reaching out to someone help more than the purchase?`,
          angry: `Anger spending is often about reclaiming power. <break time=\"200ms\"/>What made you angry? Sometimes addressing that helps more.`,
          happy: `Happy spending is the best kind! <break time=\"200ms\"/>As long as it fits your budget, joy spending is valid.`,
          overwhelmed: `When everything feels like too much, <break time=\"200ms\"/>spending can feel like the one thing you can control. What's overwhelming you?`,
          other: `Thanks for sharing. <break time=\"200ms\"/>What do you think was driving this purchase?`,
        };

        response += `**Insight:** ${insights[emotion]}\n\n`;

        // Check for patterns from stored data
        const recentTriggers = store.getRecentSpendingTriggers(userId, 10);
        const emotionCounts = recentTriggers.reduce(
          (acc, t) => {
            acc[t.emotion] = (acc[t.emotion] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
        if (topEmotion && topEmotion[1] >= 3) {
          response += `**Pattern Alert:** You've logged "${topEmotion[0]}" ${topEmotion[1]} times recently. This might be a pattern worth exploring.\n\n`;
        }

        response += `Tracking these helps you see patterns over time. <break time=\"200ms\"/>No shame - just awareness!`;

        return response;
      },
    }),

    getSpendingTriggerPatterns: llm.tool({
      description: getToolDescription('getSpendingTriggerPatterns'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const triggers = store.getUserSpendingTriggers(userId);

        if (triggers.length === 0) {
          return `You haven't logged any spending triggers yet. Next time you make a purchase you're not sure about, tell me and we'll track what triggered it. Over time, patterns will emerge!`;
        }

        const emotionCounts = triggers.reduce(
          (acc, t) => {
            acc[t.emotion] = (acc[t.emotion] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const totalSpent = triggers.reduce((sum, t) => sum + t.amount, 0);
        const avgSpend = totalSpent / triggers.length;

        const byEmotion = triggers.reduce(
          (acc, t) => {
            if (!acc[t.emotion]) acc[t.emotion] = { count: 0, total: 0 };
            acc[t.emotion].count++;
            acc[t.emotion].total += t.amount;
            return acc;
          },
          {} as Record<string, { count: number; total: number }>
        );

        let response = `📊 **Your Spending Trigger Patterns**\n\n`;
        response += `**Total tracked:** ${triggers.length} purchases ($${totalSpent.toFixed(0)} total)\n`;
        response += `**Average emotional purchase:** $${avgSpend.toFixed(0)}\n\n`;

        response += `**By Emotion:**\n`;
        const sorted = Object.entries(byEmotion).sort((a, b) => b[1].total - a[1].total);
        for (const [emotion, data] of sorted) {
          const emoji =
            {
              stressed: '😰',
              bored: '😐',
              sad: '😢',
              anxious: '😟',
              celebrating: '🎉',
              tired: '😴',
              lonely: '💔',
              angry: '😠',
              happy: '😊',
              overwhelmed: '😵',
              other: '❓',
            }[emotion] || '•';
          response += `${emoji} ${emotion}: ${data.count}x totaling $${data.total.toFixed(0)}\n`;
        }

        response += '\n';

        // Top trigger
        if (sorted.length > 0) {
          response += `**Your biggest trigger:** ${sorted[0][0]} ($${sorted[0][1].total.toFixed(0)} total)\n\n`;
          response += `This is valuable self-knowledge! Knowing your triggers means you can create systems to handle them differently.`;
        }

        return response;
      },
    }),

    // ========== BILL NEGOTIATION SCRIPTS ==========

    getBillNegotiationScript: llm.tool({
      description: getToolDescription('getBillNegotiationScript'),
      parameters: z.object({
        billType: z
          .enum([
            'internet',
            'cable',
            'phone',
            'insurance',
            'credit-card-apr',
            'gym',
            'subscription',
            'medical',
            'rent',
            'utility',
          ])
          .describe('Type of bill to negotiate'),
        currentAmount: z.number().optional().describe('Current monthly amount'),
        competitor: z.string().optional().describe('Competitor offering (if known)'),
      }),
      execute: async ({ billType, currentAmount, competitor }) => {
        let response = `📞 **${billType.charAt(0).toUpperCase() + billType.slice(1).replace('-', ' ')} Negotiation Script**\n\n`;

        const scripts: Record<string, { prep: string; script: string; tips: string }> = {
          internet: {
            prep: `• Know your current plan/speed/price\n• Look up competitor prices (T-Mobile, local ISPs)\n• Check if you're out of contract\n• Know the "retention department" is your friend`,
            script: `"Hi, I'm calling because I've been a loyal customer for [X years], but I'm looking at my budget and my internet bill seems high compared to other options. [Competitor] is offering [X speed] for [$ price]. I'd like to stay, but I need a better rate. Can you help?"`,
            tips: `• Ask for the "retention" or "loyalty" department\n• Be polite but firm\n• If first person says no, politely ask for a supervisor\n• Best times: End of month, end of quarter`,
          },
          cable: {
            prep: `• List channels you actually watch\n• Research streaming alternatives (YouTube TV, etc.)\n• Calculate streaming vs cable cost\n• Know contract end date`,
            script: `"Hi, I'm reviewing my expenses and honestly, I'm not sure I need cable anymore - I can get most of what I watch through streaming for less. Before I cancel, is there any way to lower my bill?"`,
            tips: `• Mention specific streaming services as alternatives\n• Ask about promotional rates for existing customers\n• Consider cutting to basic + streaming\n• They'd rather keep you at lower price than lose you`,
          },
          phone: {
            prep: `• Check data usage (most people overestimate)\n• Research prepaid options (Mint, Visible, etc.)\n• Know your phone payoff status\n• Look at family plan options`,
            script: `"Hi, I've been reviewing my phone bill and I'm paying [$ amount] but I only use [X GB] of data. I've seen prepaid options for much less. What can you do to help me lower my bill?"`,
            tips: `• Prepaid carriers use same networks\n• Consider if you really need unlimited\n• Employer discounts are often available\n• Ask about autopay discounts`,
          },
          insurance: {
            prep: `• Get 3+ quotes from competitors (15 min each)\n• Review coverage levels\n• Check for available discounts\n• Know when your policy renews`,
            script: `"Hi, I've been with you for [X years] and I'm reviewing my policies. I got some quotes and I'm seeing lower rates elsewhere. Before I switch, I wanted to see if you can do better on my rate."`,
            tips: `• Bundle discounts (home + auto)\n• Ask about ALL discounts (safe driver, good student, etc.)\n• Raising deductible lowers premium\n• Shop around every 1-2 years`,
          },
          'credit-card-apr': {
            prep: `• Know your current APR\n• Check your credit score\n• Look up 0% balance transfer offers\n• Know your payment history`,
            script: `"Hi, I've been a customer since [year] and I've always paid on time. My APR is [X%] and I've seen offers as low as [Y%]. I'd like to stay with you but I need a lower rate. Can you help?"`,
            tips: `• Good payment history is leverage\n• They'd rather lower rate than lose you to transfer\n• If rejected, ask to speak to supervisor\n• Try again in 6 months if denied`,
          },
          gym: {
            prep: `• Know your contract status\n• Research competitor prices\n• Decide what you actually need\n• Best time: End of month or January`,
            script: `"Hi, I'm reviewing my gym membership. I've been a member for [X time] but honestly, with [reason - budget, not coming enough], I'm considering canceling. Is there any way to lower my rate?"`,
            tips: `• Gyms hate cancellations\n• Ask about "freeze" options\n• January is competitive - use it\n• Annual prepay often cheaper`,
          },
          subscription: {
            prep: `• List what you actually use\n• Check for student/military/senior discounts\n• Look for annual vs monthly savings\n• Know cancellation process`,
            script: `"Hi, I'm thinking of canceling my subscription. Before I do, are there any discounts or promotions available for existing customers?"`,
            tips: `• Many have unadvertised retention offers\n• Click "cancel" online - often triggers discount offer\n• Annual plans usually 15-20% cheaper\n• Share family plans when possible`,
          },
          medical: {
            prep: `• Review itemized bill for errors\n• Research fair prices (fairhealthconsumer.org)\n• Know your income (for financial assistance)\n• Check if provider is in-network`,
            script: `"Hi, I received this bill and I'm having trouble paying the full amount. Do you offer payment plans or financial assistance? Also, is there a discount for paying in full today?"`,
            tips: `• ALWAYS ask for itemized bill\n• Errors are common - dispute them\n• Cash pay discounts can be 20-50%\n• Payment plans usually 0% interest\n• Negotiate BEFORE it goes to collections`,
          },
          rent: {
            prep: `• Research comparable rents nearby\n• Document your history (on-time payments, good tenant)\n• Know the market (renter's vs landlord's market)\n• Time it right (before lease renewal)`,
            script: `"Hi, I've really enjoyed living here and I'd like to renew. I've been a great tenant - always paid on time and took care of the place. I'm hoping we can keep the rent the same or close to it. Is there flexibility?"`,
            tips: `• Offer to sign longer lease for better rate\n• Mid-month moves have more negotiating power\n• Landlords hate turnover - costs them money\n• Offer to handle minor repairs yourself`,
          },
          utility: {
            prep: `• Review usage patterns\n• Check for budget billing programs\n• Look into assistance programs\n• Research smart home savings`,
            script: `"Hi, I'm looking to lower my utility bill. Are there any programs, discounts, or budget billing options I might qualify for?"`,
            tips: `• Budget billing smooths out seasonal spikes\n• Many have low-income assistance programs\n• Ask about energy audits (often free)\n• Check for rebates on efficient appliances`,
          },
        };

        const info = scripts[billType];

        response += `**📋 Before You Call:**\n${info.prep}\n\n`;
        response += `**📱 What to Say:**\n${info.script}\n\n`;
        response += `**💡 Pro Tips:**\n${info.tips}\n\n`;

        if (currentAmount) {
          const targetSavings = Math.round(currentAmount * 0.2);
          response += `**Your Goal:** Save ~$${targetSavings}/month ($${targetSavings * 12}/year)\n\n`;
        }

        response += `**Remember:** The worst they can say is no. Be polite, be persistent, and don't take the first "no" as final. You've got this!`;

        return response;
      },
    }),

    // ========== ACCOUNT RECOMMENDATIONS ==========

    recommendSavingsAccounts: llm.tool({
      description: getToolDescription('recommendSavingsAccounts'),
      parameters: z.object({
        savingsGoal: z
          .enum([
            'emergency-fund',
            'short-term',
            'medium-term',
            'down-payment',
            'vacation',
            'general',
          ])
          .describe('What the savings is for'),
        amount: z.number().optional().describe('Amount to save'),
        timeframe: z
          .enum(['immediate', '3-6-months', '1-year', '2-5-years', '5-plus-years'])
          .optional(),
        riskTolerance: z.enum(['none', 'low', 'medium']).optional(),
      }),
      execute: async ({ savingsGoal, amount, timeframe, riskTolerance = 'none' }) => {
        let response = `💰 **Savings Account Recommendations**\n\n`;
        response += `**Goal:** ${savingsGoal.replace('-', ' ')}\n`;
        if (amount) response += `**Amount:** $${amount.toLocaleString()}\n`;
        if (timeframe) response += `**Timeframe:** ${timeframe.replace('-', ' ')}\n\n`;

        // Base recommendations
        const recommendations = [];

        // Emergency fund is special
        if (savingsGoal === 'emergency-fund') {
          recommendations.push({
            type: 'High-Yield Savings Account (HYSA)',
            why: 'Instant access, FDIC insured, earning 4-5% APY',
            examples: 'Marcus, Ally, Discover, Capital One 360',
            rate: '4.0-5.0% APY',
            liquidity: 'Instant',
            best_for: '3-6 months of expenses',
          });
          response += `**For Emergency Funds:**\n`;
          response += `Your emergency fund needs to be:\n`;
          response += `• ✅ Instantly accessible (no penalties)\n`;
          response += `• ✅ FDIC insured (safe)\n`;
          response += `• ✅ Earning something (not a checking account)\n\n`;
        }

        // Short-term (under 1 year)
        if (
          ['short-term', 'vacation', 'general'].includes(savingsGoal) ||
          timeframe === 'immediate' ||
          timeframe === '3-6-months'
        ) {
          recommendations.push({
            type: 'High-Yield Savings Account (HYSA)',
            why: 'No lock-up, good rates, easy access',
            examples: 'Marcus (Goldman Sachs), Ally Bank, Discover',
            rate: '4.0-5.0% APY',
            liquidity: 'Instant',
            best_for: 'Money you might need anytime',
          });
        }

        // Medium-term (1-2 years)
        if (timeframe === '1-year' || savingsGoal === 'medium-term') {
          recommendations.push({
            type: 'CD (Certificate of Deposit)',
            why: 'Guaranteed rate, slightly higher than HYSA',
            examples: 'Any bank - shop around for best rates',
            rate: '4.5-5.5% APY',
            liquidity: 'Locked (early withdrawal penalty)',
            best_for: "Money you KNOW you won't need for 6-12 months",
          });
          recommendations.push({
            type: 'No-Penalty CD',
            why: 'CD rates with HYSA flexibility',
            examples: 'Ally, Marcus, CIT Bank',
            rate: '4.0-4.5% APY',
            liquidity: 'Flexible after 7 days',
            best_for: 'Best of both worlds',
          });
        }

        // Longer-term / down payment
        if (timeframe === '2-5-years' || savingsGoal === 'down-payment') {
          recommendations.push({
            type: 'CD Ladder',
            why: 'Maximize rates while maintaining some liquidity',
            examples: 'Split across 1, 2, 3-year CDs at any bank',
            rate: '4.5-5.5% APY blended',
            liquidity: 'Staggered access',
            best_for: '2-5 year goals',
          });
          recommendations.push({
            type: 'I-Bonds (Treasury)',
            why: 'Inflation-protected, tax advantages',
            examples: 'TreasuryDirect.gov only',
            rate: 'Inflation rate + fixed (currently ~5%)',
            liquidity: '1-year lockup, then flexible',
            best_for: 'Down payment in 2+ years',
          });
        }

        // Long-term
        if (timeframe === '5-plus-years') {
          recommendations.push({
            type: 'I-Bonds + Brokerage',
            why: 'For 5+ years, consider some market exposure',
            examples: 'I-Bonds at Treasury + index funds at Fidelity/Vanguard',
            rate: 'Variable (potentially higher)',
            liquidity: 'Variable',
            best_for: 'Long-term goals you can ride out volatility for',
          });
        }

        response += `**My Recommendations:**\n\n`;
        for (const rec of recommendations) {
          response += `**${rec.type}**\n`;
          response += `• Why: ${rec.why}\n`;
          response += `• Examples: ${rec.examples}\n`;
          response += `• Current rates: ${rec.rate}\n`;
          response += `• Access: ${rec.liquidity}\n`;
          response += `• Best for: ${rec.best_for}\n\n`;
        }

        response += `**Maya's Take:** For most people, a HYSA is the right starting point. Get that set up first, THEN optimize with CDs or I-Bonds if you want. Don't let perfect be the enemy of good!\n\n`;
        response += `Want me to help you figure out how much to put where?`;

        return response;
      },
    }),

    // ========== SPENDING LIMITS & ALERTS ==========

    setSpendingLimit: llm.tool({
      description: getToolDescription('setSpendingLimit'),
      parameters: z.object({
        category: z
          .string()
          .describe('Spending category (e.g., "dining out", "shopping", "entertainment")'),
        weeklyLimit: z.number().optional().describe('Weekly spending limit'),
        monthlyLimit: z.number().optional().describe('Monthly spending limit'),
        alertAt: z
          .number()
          .optional()
          .describe('Alert when this percentage is reached (e.g., 80 for 80%)'),
      }),
      execute: async ({ category, weeklyLimit, monthlyLimit, alertAt = 80 }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const now = new Date().toISOString();
        const limit: SpendingLimitData = {
          id: `limit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          category,
          weeklyLimit,
          monthlyLimit,
          alertAtPercent: alertAt,
          currentWeekSpend: 0,
          currentMonthSpend: 0,
          lastWeekReset: now,
          lastMonthReset: now,
          createdAt: now,
          updatedAt: now,
        };

        store.setSpendingLimit(userId, limit);
        getLogger().info(
          { userId, category, weeklyLimit, monthlyLimit },
          '🚨 Spending limit set (persisted)'
        );

        let response = `🚨 **Spending Limit Set!**\n\n`;
        response += `**Category:** ${category}\n`;
        if (weeklyLimit) response += `**Weekly limit:** $${weeklyLimit}\n`;
        if (monthlyLimit) response += `**Monthly limit:** $${monthlyLimit}\n`;
        response += `**Alert at:** ${alertAt}% of limit\n\n`;

        // Calculate daily allowance
        if (weeklyLimit) {
          const daily = weeklyLimit / 7;
          response += `**Daily pace:** $${daily.toFixed(0)}/day to stay on track\n`;
        }
        if (monthlyLimit) {
          const daily = monthlyLimit / 30;
          const weekly = monthlyLimit / 4;
          response += `**Weekly pace:** $${weekly.toFixed(0)}/week\n`;
          response += `**Daily pace:** $${daily.toFixed(0)}/day\n`;
        }

        response += `\nI'll help you track against this limit. Just tell me when you spend on ${category} and I'll let you know how you're doing!\n\n`;
        response += `**Tip:** Limits work best when paired with a why. Why this category? What will you do with the money you save?`;

        return response;
      },
    }),

    checkSpendingAgainstLimits: llm.tool({
      description: getToolDescription('checkSpendingAgainstLimits'),
      parameters: z.object({
        category: z.string().optional().describe('Specific category to check, or all'),
      }),
      execute: async ({ category }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        const limits = store.getUserSpendingLimits(userId);

        if (limits.length === 0) {
          return `You don't have any spending limits set up yet. Want to create one? It helps to have guardrails on categories that tend to get away from you.`;
        }

        const toCheck = category
          ? limits.filter((l) => l.category.toLowerCase().includes(category.toLowerCase()))
          : limits;

        if (toCheck.length === 0) {
          return `I don't have a limit set for "${category}". Your current limits are: ${limits.map((l) => l.category).join(', ')}. Want to add one?`;
        }

        let response = `📊 **Spending Limit Check**\n\n`;

        for (const limit of toCheck) {
          response += `**${limit.category}**\n`;

          if (limit.weeklyLimit) {
            const weekPercent = Math.round((limit.currentWeekSpend / limit.weeklyLimit) * 100);
            const weekStatus =
              weekPercent >= 100 ? '🔴' : weekPercent >= limit.alertAtPercent ? '🟡' : '🟢';
            response += `${weekStatus} This week: $${limit.currentWeekSpend} / $${limit.weeklyLimit} (${weekPercent}%)\n`;
            response += `   Remaining: $${Math.max(0, limit.weeklyLimit - limit.currentWeekSpend)}\n`;
          }

          if (limit.monthlyLimit) {
            const monthPercent = Math.round((limit.currentMonthSpend / limit.monthlyLimit) * 100);
            const monthStatus =
              monthPercent >= 100 ? '🔴' : monthPercent >= limit.alertAtPercent ? '🟡' : '🟢';
            response += `${monthStatus} This month: $${limit.currentMonthSpend} / $${limit.monthlyLimit} (${monthPercent}%)\n`;
            response += `   Remaining: $${Math.max(0, limit.monthlyLimit - limit.currentMonthSpend)}\n`;
          }

          response += '\n';
        }

        // Day of month context
        const dayOfMonth = new Date().getDate();
        const daysInMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          0
        ).getDate();
        const expectedPercent = Math.round((dayOfMonth / daysInMonth) * 100);
        response += `We're ${expectedPercent}% through the month. Keep that in mind when checking your pace!`;

        return response;
      },
    }),

    logSpendingAgainstLimit: llm.tool({
      description: getToolDescription('logSpendingAgainstLimit'),
      parameters: z.object({
        category: z.string().describe('Which category'),
        amount: z.number().describe('Amount spent'),
        description: z.string().optional().describe('What it was for'),
      }),
      execute: async ({ category, amount, description }, { ctx }) => {
        const userId = getUserId({ ctx });
        const store = getFinancialStore();
        await store.loadUserData(userId);

        // Use the store's method which handles week/month reset automatically
        const updatedLimit = store.logSpendAgainstLimit(userId, category, amount);

        if (!updatedLimit) {
          return `I logged that $${amount} purchase${description ? ` (${description})` : ''}, but you don't have a limit set for "${category}". Want to set one?`;
        }

        let response = `✅ **Logged:** $${amount} ${updatedLimit.category}${description ? ` - ${description}` : ''}\n\n`;

        // Check against limits
        if (updatedLimit.weeklyLimit) {
          const weekPercent = Math.round(
            (updatedLimit.currentWeekSpend / updatedLimit.weeklyLimit) * 100
          );
          const weekRemaining = updatedLimit.weeklyLimit - updatedLimit.currentWeekSpend;

          if (weekPercent >= 100) {
            response += `🔴 **Weekly limit reached!** You're $${Math.abs(weekRemaining).toFixed(0)} over.\n`;
          } else if (weekPercent >= updatedLimit.alertAtPercent) {
            response += `🟡 **Heads up:** ${weekPercent}% of weekly ${updatedLimit.category} budget used. $${weekRemaining.toFixed(0)} left.\n`;
          } else {
            response += `🟢 Weekly: $${weekRemaining.toFixed(0)} remaining (${100 - weekPercent}%)\n`;
          }
        }

        if (updatedLimit.monthlyLimit) {
          const monthPercent = Math.round(
            (updatedLimit.currentMonthSpend / updatedLimit.monthlyLimit) * 100
          );
          const monthRemaining = updatedLimit.monthlyLimit - updatedLimit.currentMonthSpend;

          if (monthPercent >= 100) {
            response += `🔴 **Monthly limit reached!** You're $${Math.abs(monthRemaining).toFixed(0)} over.\n`;
          } else if (monthPercent >= updatedLimit.alertAtPercent) {
            response += `🟡 **Heads up:** ${monthPercent}% of monthly ${updatedLimit.category} budget used. $${monthRemaining.toFixed(0)} left.\n`;
          } else {
            response += `🟢 Monthly: $${monthRemaining.toFixed(0)} remaining (${100 - monthPercent}%)\n`;
          }
        }

        return response;
      },
    }),

    // ========== PARTNER/FAMILY BUDGETING ==========

    createSharedBudget: llm.tool({
      description: getToolDescription('createSharedBudget'),
      parameters: z.object({
        budgetType: z
          .enum([
            'yours-mine-ours', // Separate accounts + shared account
            'fully-joint', // All money together
            'proportional', // Split by income percentage
            'assigned-categories', // Each person handles certain expenses
          ])
          .describe('Type of shared budget approach'),
        income1: z.number().optional().describe('First person income'),
        income2: z.number().optional().describe('Second person income'),
        sharedExpenses: z.number().optional().describe('Total shared monthly expenses'),
      }),
      execute: async ({ budgetType, income1, income2, sharedExpenses }) => {
        let response = `👫 **Shared Budget Setup: ${budgetType.replace('-', ' ').replace('-', ' ')}**\n\n`;

        switch (budgetType) {
          case 'yours-mine-ours':
            response += `**How it works:**\n`;
            response += `• Each person keeps their own account\n`;
            response += `• Create ONE shared account for joint expenses\n`;
            response += `• Each contributes to the shared account\n`;
            response += `• Personal spending stays personal\n\n`;

            if (income1 && income2 && sharedExpenses) {
              const total = income1 + income2;
              const percent1 = income1 / total;
              const percent2 = income2 / total;
              const contrib1 = sharedExpenses * percent1;
              const contrib2 = sharedExpenses * percent2;

              response += `**Your Numbers:**\n`;
              response += `• Shared expenses: $${sharedExpenses.toLocaleString()}/month\n`;
              response += `• Person 1 contributes: $${contrib1.toFixed(0)} (${(percent1 * 100).toFixed(0)}%)\n`;
              response += `• Person 2 contributes: $${contrib2.toFixed(0)} (${(percent2 * 100).toFixed(0)}%)\n\n`;
            }

            response += `**Why it works:** Independence + partnership. No one feels controlled, but bills are covered.\n`;
            break;

          case 'fully-joint':
            response += `**How it works:**\n`;
            response += `• All income goes to one account\n`;
            response += `• All expenses come from one account\n`;
            response += `• Full transparency and shared decisions\n\n`;

            response += `**Best for:** High-trust couples who want simplicity\n\n`;
            response += `**Watch out for:** Make sure both partners have equal access and say in spending decisions\n\n`;
            response += `**Pro tip:** Give each person a "no questions asked" allowance for personal spending\n`;
            break;

          case 'proportional':
            response += `**How it works:**\n`;
            response += `• Each person contributes based on income percentage\n`;
            response += `• If you earn 60%, you pay 60% of shared expenses\n`;
            response += `• Remaining money is personal\n\n`;

            if (income1 && income2 && sharedExpenses) {
              const total = income1 + income2;
              const percent1 = Math.round((income1 / total) * 100);
              const percent2 = Math.round((income2 / total) * 100);
              const contrib1 = sharedExpenses * (percent1 / 100);
              const contrib2 = sharedExpenses * (percent2 / 100);
              const leftover1 = income1 - contrib1;
              const leftover2 = income2 - contrib2;

              response += `**Your Numbers:**\n`;
              response += `Person 1: ${percent1}% of income ($${income1.toLocaleString()})\n`;
              response += `→ Contributes $${contrib1.toFixed(0)} to shared expenses\n`;
              response += `→ Keeps $${leftover1.toFixed(0)} personal\n\n`;
              response += `Person 2: ${percent2}% of income ($${income2.toLocaleString()})\n`;
              response += `→ Contributes $${contrib2.toFixed(0)} to shared expenses\n`;
              response += `→ Keeps $${leftover2.toFixed(0)} personal\n\n`;
            }

            response += `**Why it works:** Feels fair when incomes differ significantly\n`;
            break;

          case 'assigned-categories':
            response += `**How it works:**\n`;
            response += `• Each person "owns" certain expense categories\n`;
            response += `• Person A pays rent/mortgage\n`;
            response += `• Person B pays utilities, groceries, etc.\n`;
            response += `• Each manages their categories independently\n\n`;

            response += `**Example split:**\n`;
            response += `Person A: Housing, insurance, car payment\n`;
            response += `Person B: Groceries, utilities, subscriptions, dining\n\n`;

            response += `**Why it works:** Clear ownership, less coordination needed\n`;
            response += `**Watch out for:** Make sure the split is actually fair in total!\n`;
            break;
        }

        response += `\n**Money Date Tip:** Schedule a monthly 15-minute "money date" to review how things are going. Keep it light - maybe with wine. 🍷`;

        return response;
      },
    }),

    getPartnerMoneyTalkGuide: llm.tool({
      description: getToolDescription('getPartnerMoneyTalkGuide'),
      parameters: z.object({
        topic: z
          .enum([
            'starting-the-conversation', // First money talk
            'debt-disclosure', // Sharing debt
            'spending-differences', // Different money styles
            'big-purchase', // Agreeing on major purchase
            'financial-goals', // Aligning on goals
            'income-disparity', // When one earns much more
          ])
          .describe('What they need to discuss'),
      }),
      execute: async ({ topic }) => {
        const guides: Record<string, { intro: string; prompts: string[]; tips: string }> = {
          'starting-the-conversation': {
            intro: `Starting money conversations can feel awkward, but it's one of the most important talks you'll have.`,
            prompts: [
              'What did you learn about money growing up?',
              "What's your biggest financial fear?",
              "What does 'financial security' look like to you?",
              'How do you feel about debt?',
              "What's something you'd never compromise on spending-wise?",
            ],
            tips: `• Pick a calm, relaxed time (not during a fight about money!)\n• Frame it as curiosity, not interrogation\n• Share your own answers first\n• Listen without judgment\n• This is a first conversation, not the only one`,
          },
          'debt-disclosure': {
            intro: `Sharing debt can be scary, but secrets are worse for relationships than debt is.`,
            prompts: [
              'I want to be completely honest about my finances...',
              "I have some debt I haven't told you about...",
              'Before we combine finances, you should know...',
              "I'm working on paying off [amount]...",
            ],
            tips: `• Don't wait until you "have to" tell them\n• Come with a plan, not just the problem\n• Focus on what you're doing about it\n• Remember: they might have their own debt too\n• The response tells you a lot about the relationship`,
          },
          'spending-differences': {
            intro: `Spenders and savers often end up together. It's not a problem - it's a balance to find.`,
            prompts: [
              'It seems like we think about spending differently...',
              'When you [spend/save], I feel...',
              'What does that purchase mean to you?',
              'Can we find a middle ground where...',
              "What if we each had 'no questions asked' money?",
            ],
            tips: `• Neither style is "right"\n• Try to understand WHY they spend/save\n• Set shared rules, but allow personal freedom\n• Consider allowances for guilt-free spending\n• Focus on shared goals, not daily battles`,
          },
          'big-purchase': {
            intro: `Major purchases need alignment. Here's how to get there together.`,
            prompts: [
              "I've been thinking about [purchase]. Can we talk through it?",
              "What's your gut reaction to spending [amount] on this?",
              'How would this fit into our financial goals?',
              'What concerns do you have?',
              'What would need to be true for this to feel right?',
            ],
            tips: `• Set a threshold for "we discuss this first"\n• Make a pros/cons list together\n• Sleep on big decisions\n• Consider: if one person really wants it and one doesn't, how do you decide?\n• Have a cooling-off period for major purchases`,
          },
          'financial-goals': {
            intro: `Aligned goals make everything easier. Here's how to find them.`,
            prompts: [
              'Where do you see us financially in 5 years?',
              "What's your dream lifestyle?",
              'What would you do if we had no money worries?',
              'What are you willing to sacrifice for?',
              "What's non-negotiable for you?",
            ],
            tips: `• Dream big first, then get practical\n• Look for overlapping values\n• Rank priorities together\n• Write down your shared goals\n• Review quarterly - goals change!`,
          },
          'income-disparity': {
            intro: `When one partner earns significantly more, it can create complicated dynamics.`,
            prompts: [
              'How do you feel about our income difference?',
              'Does the current setup feel fair to both of us?',
              "What would 'equal' look like in our situation?",
              'How do we handle major decisions?',
              'Is there resentment building anywhere?',
            ],
            tips: `• Higher earner ≠ more say in decisions\n• Consider proportional contributions\n• Value non-financial contributions (childcare, household)\n• The lower earner shouldn't feel like they're asking for permission\n• Revisit this as circumstances change`,
          },
        };

        const guide = guides[topic];

        let response = `💑 **Partner Money Talk: ${topic.replace(/-/g, ' ')}**\n\n`;
        response += `${guide.intro}\n\n`;
        response += `**Conversation Starters:**\n`;
        for (const prompt of guide.prompts) {
          response += `• "${prompt}"\n`;
        }
        response += `\n**Tips:**\n${guide.tips}\n\n`;
        response += `**Remember:** The goal isn't to "win" - it's to understand each other and find solutions that work for both of you. 💜`;

        return response;
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createFinancialHabitsTools;
