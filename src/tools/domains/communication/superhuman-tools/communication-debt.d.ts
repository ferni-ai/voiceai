/**
 * Communication Debt Dashboard - Better Than Human Service
 *
 * What no human friend can do: Track all your communication obligations.
 *
 * "🔴 High priority: Dad (4 weeks since your last real conversation)
 *  🟡 Medium: College roommate (unreturned text from 2 weeks ago)
 *  🟢 Low: Sarah (you're current)
 *
 *  Your relationship with your dad typically suffers when you go this long
 *  without checking in. He won't reach out first - he waits for you."
 *
 * @module tools/domains/communication/superhuman-tools/communication-debt
 */
import type { CommunicationDebt } from './types.js';
/**
 * Detect communication debt from a transcript.
 */
export declare function detectCommunicationDebt(transcript: string): Array<{
    type: CommunicationDebt['type'];
    description: string;
    contactName?: string;
}>;
/**
 * Record a communication debt.
 */
export declare function recordDebt(userId: string, debt: Omit<CommunicationDebt, 'id' | 'userId' | 'createdAt' | 'daysPastDue'>): Promise<CommunicationDebt>;
/**
 * Get all pending debts for a user.
 */
export declare function getPendingDebts(userId: string): Promise<CommunicationDebt[]>;
/**
 * Mark a debt as addressed.
 */
export declare function markDebtAddressed(userId: string, debtId: string): Promise<void>;
/**
 * Dismiss a debt (no longer relevant).
 */
export declare function dismissDebt(userId: string, debtId: string, reason: 'forgiven' | 'expired'): Promise<void>;
/**
 * Generate a communication debt dashboard.
 */
export declare function generateDashboard(userId: string): Promise<string>;
/**
 * Build communication debt context for LLM injection.
 */
export declare function buildDebtContext(userId: string): Promise<string>;
/**
 * Get debts for a specific contact.
 */
export declare function getDebtsForContact(userId: string, contactName: string): Promise<CommunicationDebt[]>;
export declare const communicationDebt: {
    detect: typeof detectCommunicationDebt;
    record: typeof recordDebt;
    getPending: typeof getPendingDebts;
    markAddressed: typeof markDebtAddressed;
    dismiss: typeof dismissDebt;
    generateDashboard: typeof generateDashboard;
    buildContext: typeof buildDebtContext;
    getForContact: typeof getDebtsForContact;
};
export default communicationDebt;
//# sourceMappingURL=communication-debt.d.ts.map