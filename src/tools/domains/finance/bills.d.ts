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
export type BillCategory = 'housing' | 'utilities' | 'internet' | 'insurance' | 'subscription' | 'loan' | 'credit_card' | 'medical' | 'childcare' | 'other';
export type BillFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type PaymentStatus = 'pending' | 'paid' | 'late' | 'skipped';
export interface Bill {
    id: string;
    userId: string;
    name: string;
    payee: string;
    category: BillCategory;
    amount: number;
    frequency: BillFrequency;
    dueDay: number;
    nextDueDate: Date;
    reminderDaysBefore: number;
    isAutoPay: boolean;
    autopaySource?: string;
    accountNumber?: string;
    website?: string;
    notes?: string;
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
declare function getUserBills(userId: string): Bill[];
declare function getUpcomingBills(userId: string, days?: number): Bill[];
declare function getOverdueBills(userId: string): Bill[];
declare function calculateMonthlyTotal(userId: string): number;
export declare function addBill(params: {
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
}): Promise<Bill>;
export declare function recordPayment(params: {
    billId: string;
    userId: string;
    amount?: number;
    paidDate?: Date;
    confirmationNumber?: string;
    notes?: string;
}): Promise<{
    payment: BillPayment;
    bill: Bill;
} | null>;
export declare function updateBill(billId: string, updates: Partial<Pick<Bill, 'amount' | 'dueDay' | 'isAutoPay' | 'reminderDaysBefore' | 'notes'>>): Bill | null;
export declare function deactivateBill(billId: string): Promise<boolean>;
export { getUpcomingBills, calculateMonthlyTotal, getOverdueBills, getUserBills };
export declare function createBillTools(): {
    addBill: llm.FunctionTool<{
        name: string;
        payee: string;
        amount: number;
        dueDay: number;
        frequency: "quarterly" | "monthly" | "weekly" | "annual" | "biweekly" | "semi_annual";
        category: "other" | "loan" | "medical" | "subscription" | "housing" | "utilities" | "internet" | "insurance" | "credit_card" | "childcare";
        isAutoPay: boolean;
        reminderDays: number;
    }, unknown, string>;
    payBill: llm.FunctionTool<{
        billName: string;
        amount?: number | undefined;
        confirmationNumber?: string | undefined;
    }, unknown, string>;
    getUpcomingBills: llm.FunctionTool<{
        days: number;
    }, unknown, string>;
    getAllBills: llm.FunctionTool<{
        category: "all" | "other" | "loan" | "medical" | "subscription" | "housing" | "utilities" | "internet" | "insurance" | "credit_card" | "childcare";
    }, unknown, string>;
    updateBill: llm.FunctionTool<{
        billName: string;
        newAmount?: number | undefined;
        newDueDay?: number | undefined;
        isAutoPay?: boolean | undefined;
    }, unknown, string>;
    removeBill: llm.FunctionTool<{
        billName: string;
        confirm: boolean;
    }, unknown, string>;
    getBillSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createBillTools;
//# sourceMappingURL=bills.d.ts.map