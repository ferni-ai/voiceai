/**
 * Bill Pay Reminders Tool
 *
 * Track recurring bills and payment due dates.
 * Get reminders before bills are due, track payment history.
 *
 * Features:
 * - Recurring bill tracking
 * - Due date reminders
 * - Payment confirmation
 * - Bill history
 * - Budget impact awareness
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText, parseAmount, isValidAmount } from './validation.js';
import {
  getProductivityStore,
  type BillData,
  type BillPaymentData,
} from '../services/productivity-store.js';
import { getLogger, generateId } from './utils/tool-helpers.js';

import { getToolDescription } from './utils/tool-descriptions.js';
// Bridge functions for persistence
function billDataToBill(data: BillData, userId: string): Bill {
  return {
    id: data.id,
    userId,
    name: data.name,
    payee: data.payee,
    category: data.category as BillCategory,
    amount: data.amount,
    frequency: data.frequency as BillFrequency,
    dueDay: data.dueDay,
    nextDueDate: new Date(data.nextDueDate),
    reminderDaysBefore: data.reminderDaysBefore,
    isAutoPay: data.isAutoPay,
    autopaySource: data.autopaySource,
    accountNumber: data.accountNumber,
    website: data.website,
    notes: data.notes,
    isActive: data.isActive,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}

function billToBillData(bill: Bill): BillData {
  return {
    id: bill.id,
    name: bill.name,
    payee: bill.payee,
    category: bill.category,
    amount: bill.amount,
    frequency: bill.frequency,
    dueDay: bill.dueDay,
    nextDueDate: bill.nextDueDate.toISOString(),
    reminderDaysBefore: bill.reminderDaysBefore,
    isAutoPay: bill.isAutoPay,
    autopaySource: bill.autopaySource,
    accountNumber: bill.accountNumber,
    website: bill.website,
    notes: bill.notes,
    isActive: bill.isActive,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
  };
}

function paymentToPaymentData(payment: BillPayment): BillPaymentData {
  return {
    id: payment.id,
    billId: payment.billId,
    amount: payment.amount,
    paidDate: payment.paidDate.toISOString(),
    dueDate: payment.dueDate.toISOString(),
    status: payment.status,
    confirmationNumber: payment.confirmationNumber,
    notes: payment.notes,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export type BillCategory =
  | 'housing' // Rent, mortgage
  | 'utilities' // Electric, gas, water
  | 'internet' // Internet, phone
  | 'insurance' // Health, auto, home
  | 'subscription' // Streaming, software
  | 'loan' // Car, student, personal
  | 'credit_card'
  | 'medical'
  | 'childcare'
  | 'other';

export type BillFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export type PaymentStatus = 'pending' | 'paid' | 'late' | 'skipped';

export interface Bill {
  id: string;
  userId: string;
  name: string;
  payee: string;
  category: BillCategory;
  amount: number;
  frequency: BillFrequency;

  // Schedule
  dueDay: number; // Day of month (1-31)
  nextDueDate: Date;
  reminderDaysBefore: number;

  // Settings
  isAutoPay: boolean;
  autopaySource?: string;
  accountNumber?: string; // Last 4 only
  website?: string;
  notes?: string;

  // Status
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillPayment {
  id: string;
  billId: string;
  userId: string;
  amount: number;
  paidDate: Date;
  dueDate: Date;
  status: PaymentStatus;
  confirmationNumber?: string;
  notes?: string;
}

// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================

const billsCache = new Map<string, Bill>();
const paymentsCache = new Map<string, BillPayment>();
const loadedUsers = new Set<string>();

async function ensureUserBillsLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  try {
    const store = getProductivityStore();
    await store.loadUserData(userId);

    const billDataList = store.getUserBills(userId);
    for (const data of billDataList) {
      billsCache.set(data.id, billDataToBill(data, userId));
    }

    const paymentDataList = store.getUserBillPayments(userId);
    for (const data of paymentDataList) {
      paymentsCache.set(data.id, {
        id: data.id,
        billId: data.billId,
        userId,
        amount: data.amount,
        paidDate: new Date(data.paidDate),
        dueDate: new Date(data.dueDate),
        status: data.status as PaymentStatus,
        confirmationNumber: data.confirmationNumber,
        notes: data.notes,
      });
    }

    loadedUsers.add(userId);
    getLogger().debug({ userId, bills: billDataList.length }, 'Loaded bills from store');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to load bills from store');
    loadedUsers.add(userId);
  }
}

function persistBill(userId: string, bill: Bill): void {
  try {
    const store = getProductivityStore();
    store.setBill(userId, billToBillData(bill));
  } catch (error) {
    getLogger().warn({ error, billId: bill.id }, 'Failed to persist bill');
  }
}

function persistPayment(userId: string, payment: BillPayment): void {
  try {
    const store = getProductivityStore();
    store.setBillPayment(userId, paymentToPaymentData(payment));
  } catch (error) {
    getLogger().warn({ error, paymentId: payment.id }, 'Failed to persist payment');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function calculateNextDueDate(dueDay: number, frequency: BillFrequency, fromDate?: Date): Date {
  const now = fromDate || new Date();
  const nextDue = new Date(now);

  // Set to the due day
  nextDue.setDate(dueDay);
  nextDue.setHours(23, 59, 0, 0);

  // If that's in the past, move to next period
  if (nextDue <= now) {
    switch (frequency) {
      case 'weekly':
        nextDue.setDate(nextDue.getDate() + 7);
        break;
      case 'biweekly':
        nextDue.setDate(nextDue.getDate() + 14);
        break;
      case 'monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'semi_annual':
        nextDue.setMonth(nextDue.getMonth() + 6);
        break;
      case 'annual':
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }
  }

  return nextDue;
}

function getUserBills(userId: string): Bill[] {
  return Array.from(billsCache.values())
    .filter((b) => b.userId === userId && b.isActive)
    .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
}

function getUpcomingBills(userId: string, days = 14): Bill[] {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + days);

  return getUserBills(userId).filter((b) => b.nextDueDate <= future);
}

function getOverdueBills(userId: string): Bill[] {
  const now = new Date();
  return getUserBills(userId).filter((b) => {
    // Check if past due and not paid this period
    if (b.nextDueDate > now) return false;

    // Check for payment in current period
    const lastPayment = getLastPayment(b.id);
    if (lastPayment && lastPayment.dueDate.getTime() === b.nextDueDate.getTime()) {
      return false;
    }
    return true;
  });
}

function getLastPayment(billId: string): BillPayment | null {
  const billPayments = Array.from(paymentsCache.values())
    .filter((p) => p.billId === billId)
    .sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime());

  return billPayments[0] || null;
}

function calculateMonthlyTotal(userId: string): number {
  const userBills = getUserBills(userId);
  let total = 0;

  for (const bill of userBills) {
    switch (bill.frequency) {
      case 'weekly':
        total += bill.amount * 4.33;
        break;
      case 'biweekly':
        total += bill.amount * 2.17;
        break;
      case 'monthly':
        total += bill.amount;
        break;
      case 'quarterly':
        total += bill.amount / 3;
        break;
      case 'semi_annual':
        total += bill.amount / 6;
        break;
      case 'annual':
        total += bill.amount / 12;
        break;
    }
  }

  return Math.round(total * 100) / 100;
}

function formatBillForSpeech(bill: Bill): string {
  const now = new Date();
  const daysUntil = Math.ceil((bill.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let status = '';
  if (daysUntil < 0) {
    status = '⚠️ OVERDUE';
  } else if (daysUntil === 0) {
    status = '🔴 Due today';
  } else if (daysUntil <= 3) {
    status = `🟠 Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`;
  } else if (daysUntil <= 7) {
    status = `🟡 Due in ${daysUntil} days`;
  } else {
    const dateStr = bill.nextDueDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    status = `Due ${dateStr}`;
  }

  let result = `${bill.name} - $${bill.amount.toFixed(2)} - ${status}`;
  if (bill.isAutoPay) {
    result += ' (AutoPay ✓)';
  }

  return result;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export function addBill(params: {
  userId: string;
  name: string;
  payee: string;
  amount: number;
  category?: BillCategory;
  frequency?: BillFrequency;
  dueDay: number;
  isAutoPay?: boolean;
  autopaySource?: string;
  reminderDaysBefore?: number;
  website?: string;
  notes?: string;
}): Bill {
  const bill: Bill = {
    id: generateId('bill'),
    userId: params.userId,
    name: sanitizePlainText(params.name, 100),
    payee: sanitizePlainText(params.payee, 100),
    category: params.category || 'other',
    amount: params.amount,
    frequency: params.frequency || 'monthly',
    dueDay: Math.max(1, Math.min(31, params.dueDay)),
    nextDueDate: calculateNextDueDate(params.dueDay, params.frequency || 'monthly'),
    reminderDaysBefore: params.reminderDaysBefore ?? 3,
    isAutoPay: params.isAutoPay || false,
    autopaySource: params.autopaySource,
    website: params.website,
    notes: params.notes,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to cache and persist
  billsCache.set(bill.id, bill);
  persistBill(params.userId, bill);

  getLogger().info({ billId: bill.id, name: bill.name, amount: bill.amount }, '💰 Bill added');

  return bill;
}

export function recordPayment(params: {
  billId: string;
  userId: string;
  amount?: number;
  paidDate?: Date;
  confirmationNumber?: string;
  notes?: string;
}): { payment: BillPayment; bill: Bill } | null {
  const bill = billsCache.get(params.billId);
  if (!bill) return null;

  const payment: BillPayment = {
    id: generateId('payment'),
    billId: params.billId,
    userId: params.userId,
    amount: params.amount || bill.amount,
    paidDate: params.paidDate || new Date(),
    dueDate: bill.nextDueDate,
    status: 'paid',
    confirmationNumber: params.confirmationNumber,
    notes: params.notes,
  };

  // Save to cache and persist
  paymentsCache.set(payment.id, payment);
  persistPayment(params.userId, payment);

  // Update bill's next due date
  bill.nextDueDate = calculateNextDueDate(bill.dueDay, bill.frequency, bill.nextDueDate);
  bill.updatedAt = new Date();
  billsCache.set(bill.id, bill);
  persistBill(bill.userId, bill);

  getLogger().info(
    { billId: bill.id, paymentId: payment.id, amount: payment.amount },
    '✅ Payment recorded'
  );

  return { payment, bill };
}

export function updateBill(
  billId: string,
  updates: Partial<Pick<Bill, 'amount' | 'dueDay' | 'isAutoPay' | 'reminderDaysBefore' | 'notes'>>
): Bill | null {
  const bill = billsCache.get(billId);
  if (!bill) return null;

  if (updates.amount !== undefined) bill.amount = updates.amount;
  if (updates.dueDay !== undefined) {
    bill.dueDay = updates.dueDay;
    bill.nextDueDate = calculateNextDueDate(updates.dueDay, bill.frequency);
  }
  if (updates.isAutoPay !== undefined) bill.isAutoPay = updates.isAutoPay;
  if (updates.reminderDaysBefore !== undefined)
    bill.reminderDaysBefore = updates.reminderDaysBefore;
  if (updates.notes !== undefined) bill.notes = updates.notes;

  bill.updatedAt = new Date();

  // Save to cache and persist
  billsCache.set(billId, bill);
  persistBill(bill.userId, bill);

  return bill;
}

export function deactivateBill(billId: string): boolean {
  const bill = billsCache.get(billId);
  if (!bill) return false;

  bill.isActive = false;
  bill.updatedAt = new Date();

  // Save to cache and persist
  billsCache.set(billId, bill);
  persistBill(bill.userId, bill);

  return true;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

// Export helper functions for use by other modules
export { getUpcomingBills, calculateMonthlyTotal, getOverdueBills, getUserBills };

export function createBillTools() {
  return {
    addBill: llm.tool({
      description: getToolDescription('addBill'),
      parameters: z.object({
        name: z.string().describe('Bill name (e.g., "Electric Bill", "Netflix")'),
        payee: z.string().describe('Who gets paid (e.g., "Con Edison", "Netflix")'),
        amount: z.number().positive().describe('Bill amount in dollars'),
        dueDay: z.number().min(1).max(31).describe("Day of month it's due (1-31)"),
        frequency: z
          .enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual'])
          .optional()
          .default('monthly')
          .describe('How often'),
        category: z
          .enum([
            'housing',
            'utilities',
            'internet',
            'insurance',
            'subscription',
            'loan',
            'credit_card',
            'medical',
            'childcare',
            'other',
          ])
          .optional()
          .default('other')
          .describe('Category'),
        isAutoPay: z.boolean().optional().default(false).describe('Is it on autopay?'),
        reminderDays: z.number().optional().default(3).describe('Days before to remind'),
      }),
      execute: async (
        { name, payee, amount, dueDay, frequency, category, isAutoPay, reminderDays },
        { ctx }
      ) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const bill = addBill({
          userId,
          name,
          payee,
          amount,
          dueDay,
          frequency,
          category,
          isAutoPay,
          reminderDaysBefore: reminderDays,
        });

        const nextDueStr = bill.nextDueDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        let response = `💰 Added "${bill.name}" - $${bill.amount.toFixed(2)} ${frequency}\n`;
        response += `Next due: ${nextDueStr}\n`;
        if (isAutoPay) {
          response += `✓ AutoPay enabled\n`;
        } else {
          response += `I'll remind you ${reminderDays} days before it's due.\n`;
        }

        // Monthly impact
        const monthlyTotal = calculateMonthlyTotal(userId);
        response += `\nTotal monthly bills: $${monthlyTotal.toFixed(2)}`;

        return response;
      },
    }),

    payBill: llm.tool({
      description: getToolDescription('payBill'),
      parameters: z.object({
        billName: z.string().describe('Which bill was paid'),
        amount: z.number().optional().describe('Amount paid (if different from usual)'),
        confirmationNumber: z.string().optional().describe('Confirmation number if provided'),
      }),
      execute: async ({ billName, amount, confirmationNumber }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const userBills = getUserBills(userId);
        const bill = userBills.find((b) => b.name.toLowerCase().includes(billName.toLowerCase()));

        if (!bill) {
          return `I couldn't find a bill matching "${billName}". Want me to show your bills?`;
        }

        const result = recordPayment({
          billId: bill.id,
          userId,
          amount,
          confirmationNumber,
        });

        if (!result) return `Couldn't record that payment. Want to try again?`;

        const nextDueStr = result.bill.nextDueDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        let response = `✅ Paid "${result.bill.name}" - $${result.payment.amount.toFixed(2)}`;
        if (confirmationNumber) {
          response += `\nConfirmation: ${confirmationNumber}`;
        }
        response += `\nNext due: ${nextDueStr}`;

        return response;
      },
    }),

    getUpcomingBills: llm.tool({
      description: getToolDescription('getUpcomingBills'),
      parameters: z.object({
        days: z.number().optional().default(14).describe('How many days ahead to look'),
      }),
      execute: async ({ days }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const upcoming = getUpcomingBills(userId, days);
        const overdue = getOverdueBills(userId);

        if (upcoming.length === 0 && overdue.length === 0) {
          return `✨ No bills due in the next ${days} days!`;
        }

        let response = '';

        if (overdue.length > 0) {
          response += `⚠️ **OVERDUE BILLS:**\n`;
          overdue.forEach((b) => {
            response += `• ${formatBillForSpeech(b)}\n`;
          });
          response += '\n';
        }

        if (upcoming.length > 0) {
          response += `📅 **Coming Up (${days} days):**\n`;
          upcoming.forEach((b) => {
            response += `• ${formatBillForSpeech(b)}\n`;
          });
        }

        // Total due
        const totalDue = [...overdue, ...upcoming]
          .filter((b) => !b.isAutoPay)
          .reduce((sum, b) => sum + b.amount, 0);

        if (totalDue > 0) {
          response += `\n💵 Total due (non-autopay): $${totalDue.toFixed(2)}`;
        }

        return response;
      },
    }),

    getAllBills: llm.tool({
      description: getToolDescription('getAllBills'),
      parameters: z.object({
        category: z
          .enum([
            'housing',
            'utilities',
            'internet',
            'insurance',
            'subscription',
            'loan',
            'credit_card',
            'medical',
            'childcare',
            'other',
            'all',
          ])
          .optional()
          .default('all'),
      }),
      execute: async ({ category }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        let userBills = getUserBills(userId);

        if (category !== 'all') {
          userBills = userBills.filter((b) => b.category === category);
        }

        if (userBills.length === 0) {
          return `No bills tracked${category !== 'all' ? ` in ${category}` : ''}. Want to add some?`;
        }

        // Group by category
        const byCategory: Record<string, Bill[]> = {};
        for (const bill of userBills) {
          if (!byCategory[bill.category]) {
            byCategory[bill.category] = [];
          }
          byCategory[bill.category].push(bill);
        }

        let response = `💰 **Your Bills**\n\n`;

        for (const [cat, catBills] of Object.entries(byCategory)) {
          const catTotal = catBills.reduce((sum, b) => sum + b.amount, 0);
          response += `**${cat.toUpperCase()}** ($${catTotal.toFixed(2)}/mo)\n`;
          catBills.forEach((b) => {
            const autopay = b.isAutoPay ? '✓' : '';
            response += `  • ${b.name}: $${b.amount.toFixed(2)} ${b.frequency} ${autopay}\n`;
          });
          response += '\n';
        }

        const monthlyTotal = calculateMonthlyTotal(userId);
        response += `---\n**Monthly Total:** $${monthlyTotal.toFixed(2)}`;

        const autopayBills = userBills.filter((b) => b.isAutoPay);
        if (autopayBills.length > 0) {
          const autopayTotal = autopayBills.reduce((sum, b) => sum + b.amount, 0);
          response += `\n**AutoPay:** $${autopayTotal.toFixed(2)} (${autopayBills.length} bills)`;
        }

        return response;
      },
    }),

    updateBill: llm.tool({
      description: getToolDescription('updateBill'),
      parameters: z.object({
        billName: z.string().describe('Which bill to update'),
        newAmount: z.number().optional().describe('New amount'),
        newDueDay: z.number().min(1).max(31).optional().describe('New due day'),
        isAutoPay: z.boolean().optional().describe('Enable/disable autopay'),
      }),
      execute: async ({ billName, newAmount, newDueDay, isAutoPay }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const userBills = getUserBills(userId);
        const bill = userBills.find((b) => b.name.toLowerCase().includes(billName.toLowerCase()));

        if (!bill) {
          return `Couldn't find "${billName}".`;
        }

        const updates: Partial<Bill> = {};
        const changes: string[] = [];

        if (newAmount !== undefined) {
          updates.amount = newAmount;
          changes.push(`amount → $${newAmount.toFixed(2)}`);
        }
        if (newDueDay !== undefined) {
          updates.dueDay = newDueDay;
          changes.push(`due day → ${newDueDay}`);
        }
        if (isAutoPay !== undefined) {
          updates.isAutoPay = isAutoPay;
          changes.push(isAutoPay ? 'AutoPay enabled' : 'AutoPay disabled');
        }

        if (changes.length === 0) {
          return `What would you like to change about "${bill.name}"?`;
        }

        updateBill(bill.id, updates);

        return `✅ Updated "${bill.name}":\n${changes.map((c) => `• ${c}`).join('\n')}`;
      },
    }),

    removeBill: llm.tool({
      description: getToolDescription('removeBill'),
      parameters: z.object({
        billName: z.string().describe('Which bill to remove'),
        confirm: z.boolean().describe('User confirmed'),
      }),
      execute: async ({ billName, confirm }, { ctx }) => {
        if (!confirm) {
          return `Are you sure you want to stop tracking "${billName}"? Say "yes, remove it" to confirm.`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const userBills = getUserBills(userId);
        const bill = userBills.find((b) => b.name.toLowerCase().includes(billName.toLowerCase()));

        if (!bill) {
          return `Couldn't find "${billName}".`;
        }

        deactivateBill(bill.id);

        const monthlyTotal = calculateMonthlyTotal(userId);

        return `✅ Removed "${bill.name}" from your bills.\nNew monthly total: $${monthlyTotal.toFixed(2)}`;
      },
    }),

    getBillSummary: llm.tool({
      description: getToolDescription('getBillSummary'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        await ensureUserBillsLoaded(userId);
        const userBills = getUserBills(userId);
        const upcoming = getUpcomingBills(userId, 7);
        const overdue = getOverdueBills(userId);
        const monthlyTotal = calculateMonthlyTotal(userId);

        let response = `📊 **Bill Summary**\n\n`;
        response += `**Total Bills:** ${userBills.length}\n`;
        response += `**Monthly Total:** $${monthlyTotal.toFixed(2)}\n`;

        if (overdue.length > 0) {
          response += `**⚠️ Overdue:** ${overdue.length}\n`;
        }

        response += `**Due This Week:** ${upcoming.length}\n`;

        const autopay = userBills.filter((b) => b.isAutoPay).length;
        response += `**On AutoPay:** ${autopay}/${userBills.length}\n`;

        if (upcoming.length > 0) {
          const nextBill = upcoming[0];
          const daysUntil = Math.ceil(
            (nextBill.nextDueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          response += `\n📅 Next up: "${nextBill.name}" ($${nextBill.amount}) in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        }

        return response;
      },
    }),
  };
}

export default createBillTools;
