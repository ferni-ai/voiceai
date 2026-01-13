/**
 * Documents Tools
 *
 * Document management tools:
 * - Save receipts, warranties, IDs
 * - Expiration tracking
 * - Search and organize
 *
 * DOMAIN: documents
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createLogger } from '../../../utils/safe-logger.js';
import { getDocumentData, addDocument, searchDocuments, getExpiringDocuments, getWarrantyStatus, } from '../../../services/stores/document-store.js';
const log = createLogger({ module: 'documents-tools' });
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function getDocumentToolDefinitions() {
    return [
        // =========================================================================
        // saveDocument - Store with metadata
        // =========================================================================
        {
            id: 'saveDocument',
            name: 'Save Document',
            description: 'Save an important document like a receipt, warranty, or ID.',
            domain: 'documents',
            tags: ['document', 'save', 'receipt', 'warranty', 'id'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Save an important document like a receipt, warranty, or ID.',
                    parameters: z.object({
                        name: z.string().describe('Document name'),
                        type: z
                            .enum([
                            'receipt', 'warranty', 'insurance', 'id_passport', 'id_license',
                            'vehicle_registration', 'contract', 'tax_w2', 'medical', 'other'
                        ])
                            .describe('Type of document'),
                        expirationDate: z.string().optional().describe('Expiration date if applicable'),
                        notes: z.string().optional().describe('Additional notes'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to save documents.';
                        }
                        const doc = await addDocument(userId, {
                            name: params.name,
                            type: params.type,
                            status: 'active',
                            hasExpiration: !!params.expirationDate,
                            expirationDate: params.expirationDate,
                            notes: params.notes,
                            tags: [],
                        });
                        let response = `✅ Document saved: **${doc.name}**\n`;
                        response += `Type: ${params.type}\n`;
                        if (params.expirationDate) {
                            response += `Expires: ${params.expirationDate}\n`;
                            response += `I'll remind you before it expires.`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // findDocument - Search by type, date, keywords
        // =========================================================================
        {
            id: 'findDocument',
            name: 'Find Document',
            description: 'Search for a document by name, type, or keywords.',
            domain: 'documents',
            tags: ['document', 'search', 'find'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Search for a document by name, type, or keywords.',
                    parameters: z.object({
                        query: z.string().describe('Search term (name, type, or keyword)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to search documents.';
                        }
                        const results = await searchDocuments(userId, params.query);
                        if (results.length === 0) {
                            return `No documents found matching "${params.query}".`;
                        }
                        let response = `📄 **Found ${results.length} document(s):**\n\n`;
                        for (const doc of results.slice(0, 5)) {
                            response += `**${doc.name}**\n`;
                            response += `  Type: ${doc.type}\n`;
                            if (doc.expirationDate) {
                                response += `  Expires: ${doc.expirationDate}\n`;
                            }
                            response += '\n';
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // trackExpiration - Alert before expiry
        // =========================================================================
        {
            id: 'trackExpiration',
            name: 'Track Expiration',
            description: 'Get documents that are expiring soon.',
            domain: 'documents',
            tags: ['document', 'expiration', 'alert'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Get documents that are expiring soon.',
                    parameters: z.object({
                        days: z.number().optional().describe('Days ahead to check (default: 30)'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to check expirations.';
                        }
                        const expiring = await getExpiringDocuments(userId, params.days || 30);
                        if (expiring.length === 0) {
                            return `No documents expiring in the next ${params.days || 30} days.`;
                        }
                        let response = `⚠️ **Expiring Soon:**\n\n`;
                        for (const doc of expiring) {
                            const daysLeft = Math.ceil((new Date(doc.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            response += `- **${doc.name}** expires in ${daysLeft} days (${doc.expirationDate})\n`;
                        }
                        return response;
                    },
                });
            },
        },
        // =========================================================================
        // getWarrantyStatus - Is product under warranty?
        // =========================================================================
        {
            id: 'getWarrantyStatus',
            name: 'Get Warranty Status',
            description: 'Check if a product is still under warranty.',
            domain: 'documents',
            tags: ['warranty', 'product', 'coverage'],
            create: (ctx) => {
                return llm.tool({
                    description: 'Check if a product is still under warranty.',
                    parameters: z.object({
                        productName: z.string().describe('Name of the product to check'),
                    }),
                    execute: async (params) => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to check warranties.';
                        }
                        const status = await getWarrantyStatus(userId, params.productName);
                        if (!status.found) {
                            return `I don't have a warranty on file for "${params.productName}". ` +
                                `You can add it with "save warranty for ${params.productName}".`;
                        }
                        if (status.isActive) {
                            return `✅ **${params.productName}** is under warranty!\n` +
                                `Warranty expires: ${status.warranty?.warrantyData?.warrantyEndDate || status.warranty?.expirationDate}\n` +
                                `Days remaining: ${status.daysRemaining}`;
                        }
                        else {
                            return `❌ **${params.productName}** warranty has expired.`;
                        }
                    },
                });
            },
        },
        // =========================================================================
        // organizeReceipts - Auto-categorize receipts
        // =========================================================================
        {
            id: 'organizeReceipts',
            name: 'Organize Receipts',
            description: 'View and organize your saved receipts.',
            domain: 'documents',
            tags: ['receipt', 'organize', 'category'],
            create: (ctx) => {
                return llm.tool({
                    description: 'View and organize your saved receipts.',
                    parameters: z.object({}),
                    execute: async () => {
                        const userId = ctx.userId;
                        if (!userId) {
                            return 'I need to know who you are to organize receipts.';
                        }
                        const data = await getDocumentData(userId);
                        const receipts = data.documents.filter((d) => d.type === 'receipt');
                        if (receipts.length === 0) {
                            return "You don't have any receipts saved yet. " +
                                "Save receipts with \"save receipt for [product]\".";
                        }
                        // Group by month
                        const byMonth = {};
                        for (const receipt of receipts) {
                            const date = new Date(receipt.createdAt);
                            const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                            if (!byMonth[month])
                                byMonth[month] = [];
                            byMonth[month].push(receipt);
                        }
                        let response = `🧾 **Your Receipts** (${receipts.length} total)\n\n`;
                        for (const [month, items] of Object.entries(byMonth).slice(0, 3)) {
                            response += `**${month}:**\n`;
                            for (const item of items.slice(0, 5)) {
                                response += `- ${item.name}`;
                                if (item.receiptData?.totalAmount) {
                                    response += ` ($${item.receiptData.totalAmount})`;
                                }
                                response += '\n';
                            }
                            response += '\n';
                        }
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
    return getDocumentToolDefinitions();
}
export const definitions = getDocumentToolDefinitions();
//# sourceMappingURL=index.js.map