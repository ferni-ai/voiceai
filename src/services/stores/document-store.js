/**
 * Document Data Store
 *
 * Persistent storage for important documents:
 * - Receipts, warranties, insurance cards
 * - IDs (passport, license, registration)
 * - Contracts, tax documents
 * - Expiration tracking
 *
 * Storage: Firestore (primary) with in-memory fallback
 * Document: /users/{userId}/life_automation/documents
 *
 * @module services/stores/document-store
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getLifeAutomationData, saveLifeAutomationData, isFirestoreAvailable, } from './firestore-life-adapter.js';
const log = createLogger({ module: 'document-store' });
// In-memory fallback when Firestore is unavailable
const documentStorage = new Map();
// ============================================================================
// DEFAULT DATA
// ============================================================================
function createDefaultDocumentData(userId) {
    return {
        userId,
        lastUpdated: new Date(),
        documents: [],
        folders: [
            {
                id: 'folder_receipts',
                userId,
                name: 'Receipts',
                documentIds: [],
                icon: '🧾',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: 'folder_ids',
                userId,
                name: 'IDs & Cards',
                documentIds: [],
                icon: '🪪',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: 'folder_warranties',
                userId,
                name: 'Warranties',
                documentIds: [],
                icon: '📋',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: 'folder_insurance',
                userId,
                name: 'Insurance',
                documentIds: [],
                icon: '🛡️',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: 'folder_taxes',
                userId,
                name: 'Tax Documents',
                documentIds: [],
                icon: '📊',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ],
        alerts: [],
        settings: {
            defaultExpirationReminderDays: 30,
            autoExtractText: true,
            autoCategorizeTags: true,
        },
    };
}
// ============================================================================
// STORE OPERATIONS
// ============================================================================
/**
 * Get document data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export async function getDocumentData(userId) {
    try {
        // Try Firestore first
        if (isFirestoreAvailable()) {
            const firestoreData = await getLifeAutomationData(userId, 'documents');
            if (firestoreData) {
                return {
                    ...createDefaultDocumentData(userId),
                    ...firestoreData,
                    lastUpdated: typeof firestoreData.lastUpdated === 'string'
                        ? new Date(firestoreData.lastUpdated)
                        : firestoreData.lastUpdated || new Date(),
                };
            }
        }
        // Fall back to in-memory
        const data = documentStorage.get(userId);
        if (!data) {
            return createDefaultDocumentData(userId);
        }
        return {
            ...createDefaultDocumentData(userId),
            ...data,
            lastUpdated: typeof data.lastUpdated === 'string'
                ? new Date(data.lastUpdated)
                : data.lastUpdated || new Date(),
        };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get document data');
        return createDefaultDocumentData(userId);
    }
}
/**
 * Save document data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export async function saveDocumentData(userId, data) {
    try {
        const existing = await getDocumentData(userId);
        const updated = {
            ...existing,
            ...data,
            lastUpdated: new Date(),
        };
        // Always save to in-memory for fast access
        documentStorage.set(userId, updated);
        // Save to Firestore if available
        if (isFirestoreAvailable()) {
            const firestoreData = {
                ...updated,
                lastUpdated: updated.lastUpdated.toISOString(),
            };
            const result = await saveLifeAutomationData(userId, 'documents', firestoreData);
            if (!result.success) {
                log.warn({ userId, error: result.error }, 'Failed to save to Firestore, data in memory only');
            }
        }
        log.debug({ userId }, 'Document data saved');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to save document data');
        throw error;
    }
}
// ============================================================================
// DOCUMENT CRUD
// ============================================================================
/**
 * Add a new document
 */
export async function addDocument(userId, document) {
    const data = await getDocumentData(userId);
    const now = new Date().toISOString();
    const newDocument = {
        ...document,
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        createdAt: now,
        updatedAt: now,
    };
    data.documents.push(newDocument);
    // Auto-assign to folder based on type
    const folderId = getDefaultFolderForType(newDocument.type);
    if (folderId) {
        const folder = data.folders.find((f) => f.id === folderId);
        if (folder) {
            folder.documentIds.push(newDocument.id);
        }
    }
    // Create expiration alert if needed
    if (newDocument.hasExpiration && newDocument.expirationDate) {
        const reminderDays = newDocument.expirationReminderDays || data.settings.defaultExpirationReminderDays;
        const alertDate = new Date(newDocument.expirationDate);
        alertDate.setDate(alertDate.getDate() - reminderDays);
        data.alerts.push({
            id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            documentId: newDocument.id,
            userId,
            alertType: 'expiring_soon',
            message: `${newDocument.name} expires in ${reminderDays} days`,
            alertDate: alertDate.toISOString(),
            acknowledged: false,
            createdAt: now,
        });
    }
    await saveDocumentData(userId, data);
    log.info({ userId, documentId: newDocument.id, type: newDocument.type }, 'Document added');
    return newDocument;
}
/**
 * Update a document
 */
export async function updateDocument(userId, documentId, updates) {
    const data = await getDocumentData(userId);
    const index = data.documents.findIndex((d) => d.id === documentId);
    if (index === -1) {
        return null;
    }
    data.documents[index] = {
        ...data.documents[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    await saveDocumentData(userId, data);
    return data.documents[index];
}
/**
 * Delete a document
 */
export async function deleteDocument(userId, documentId) {
    const data = await getDocumentData(userId);
    const index = data.documents.findIndex((d) => d.id === documentId);
    if (index === -1) {
        return false;
    }
    data.documents.splice(index, 1);
    // Remove from folders
    for (const folder of data.folders) {
        folder.documentIds = folder.documentIds.filter((id) => id !== documentId);
    }
    // Remove alerts
    data.alerts = data.alerts.filter((a) => a.documentId !== documentId);
    await saveDocumentData(userId, data);
    return true;
}
/**
 * Get document by ID
 */
export async function getDocument(userId, documentId) {
    const data = await getDocumentData(userId);
    return data.documents.find((d) => d.id === documentId) || null;
}
// ============================================================================
// QUERIES
// ============================================================================
/**
 * Get documents by type
 */
export async function getDocumentsByType(userId, type) {
    const data = await getDocumentData(userId);
    return data.documents.filter((d) => d.type === type);
}
/**
 * Get expiring documents
 */
export async function getExpiringDocuments(userId, daysAhead = 30) {
    const data = await getDocumentData(userId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    return data.documents.filter((d) => {
        if (!d.hasExpiration || !d.expirationDate)
            return false;
        const expDate = new Date(d.expirationDate);
        return expDate <= cutoff && expDate >= new Date();
    });
}
/**
 * Get expired documents
 */
export async function getExpiredDocuments(userId) {
    const data = await getDocumentData(userId);
    const now = new Date();
    return data.documents.filter((d) => {
        if (!d.hasExpiration || !d.expirationDate)
            return false;
        return new Date(d.expirationDate) < now;
    });
}
/**
 * Search documents
 */
export async function searchDocuments(userId, query) {
    const data = await getDocumentData(userId);
    const lowerQuery = query.toLowerCase();
    return data.documents.filter((d) => {
        return (d.name.toLowerCase().includes(lowerQuery) ||
            d.description?.toLowerCase().includes(lowerQuery) ||
            d.extractedText?.toLowerCase().includes(lowerQuery) ||
            d.tags.some((t) => t.toLowerCase().includes(lowerQuery)) ||
            d.notes?.toLowerCase().includes(lowerQuery));
    });
}
/**
 * Get warranty status for a product
 */
export async function getWarrantyStatus(userId, productName) {
    const data = await getDocumentData(userId);
    const lowerProduct = productName.toLowerCase();
    const warranty = data.documents.find((d) => d.type === 'warranty' &&
        (d.warrantyData?.productName.toLowerCase().includes(lowerProduct) ||
            d.name.toLowerCase().includes(lowerProduct)));
    if (!warranty) {
        return { found: false, isActive: false };
    }
    const endDate = warranty.warrantyData?.warrantyEndDate
        ? new Date(warranty.warrantyData.warrantyEndDate)
        : warranty.expirationDate
            ? new Date(warranty.expirationDate)
            : null;
    if (!endDate) {
        return { found: true, isActive: true, warranty };
    }
    const now = new Date();
    const isActive = endDate >= now;
    const daysRemaining = isActive
        ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    return { found: true, isActive, warranty, daysRemaining };
}
// ============================================================================
// FOLDERS
// ============================================================================
/**
 * Create a folder
 */
export async function createFolder(userId, folder) {
    const data = await getDocumentData(userId);
    const now = new Date().toISOString();
    const newFolder = {
        ...folder,
        id: `folder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        documentIds: [],
        createdAt: now,
        updatedAt: now,
    };
    data.folders.push(newFolder);
    await saveDocumentData(userId, data);
    return newFolder;
}
/**
 * Add document to folder
 */
export async function addDocumentToFolder(userId, documentId, folderId) {
    const data = await getDocumentData(userId);
    const folder = data.folders.find((f) => f.id === folderId);
    if (!folder)
        return false;
    if (!folder.documentIds.includes(documentId)) {
        folder.documentIds.push(documentId);
        folder.updatedAt = new Date().toISOString();
        await saveDocumentData(userId, data);
    }
    return true;
}
/**
 * Get documents in folder
 */
export async function getDocumentsInFolder(userId, folderId) {
    const data = await getDocumentData(userId);
    const folder = data.folders.find((f) => f.id === folderId);
    if (!folder)
        return [];
    return data.documents.filter((d) => folder.documentIds.includes(d.id));
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Get default folder for document type
 */
function getDefaultFolderForType(type) {
    switch (type) {
        case 'receipt':
            return 'folder_receipts';
        case 'warranty':
        case 'manual':
            return 'folder_warranties';
        case 'id_passport':
        case 'id_license':
        case 'id_ssn':
        case 'id_other':
            return 'folder_ids';
        case 'insurance':
        case 'vehicle_insurance':
            return 'folder_insurance';
        case 'tax_w2':
        case 'tax_1099':
        case 'tax_return':
            return 'folder_taxes';
        default:
            return null;
    }
}
// ============================================================================
// MIGRATION HELPER
// ============================================================================
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export async function migrateUserToFirestore(userId) {
    const inMemoryData = documentStorage.get(userId);
    if (!inMemoryData) {
        return false;
    }
    if (!isFirestoreAvailable()) {
        log.warn({ userId }, 'Cannot migrate: Firestore unavailable');
        return false;
    }
    const firestoreData = {
        ...inMemoryData,
        lastUpdated: inMemoryData.lastUpdated instanceof Date
            ? inMemoryData.lastUpdated.toISOString()
            : inMemoryData.lastUpdated,
    };
    const result = await saveLifeAutomationData(userId, 'documents', firestoreData);
    if (result.success) {
        log.info({ userId }, 'Successfully migrated document data to Firestore');
    }
    return result.success;
}
//# sourceMappingURL=document-store.js.map