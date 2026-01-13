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
export type DocumentType = 'receipt' | 'warranty' | 'insurance' | 'id_passport' | 'id_license' | 'id_ssn' | 'id_other' | 'vehicle_registration' | 'vehicle_insurance' | 'vehicle_title' | 'contract' | 'lease' | 'tax_w2' | 'tax_1099' | 'tax_return' | 'medical' | 'prescription' | 'certificate' | 'diploma' | 'manual' | 'other';
export type DocumentStatus = 'active' | 'expired' | 'archived' | 'pending_review';
export interface Document {
    id: string;
    userId: string;
    name: string;
    description?: string;
    type: DocumentType;
    status: DocumentStatus;
    storageUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    extractedText?: string;
    ocrConfidence?: number;
    hasExpiration: boolean;
    expirationDate?: string;
    expirationReminderDays?: number;
    associatedWith?: {
        type: 'product' | 'vehicle' | 'property' | 'person' | 'subscription';
        id?: string;
        name?: string;
    };
    receiptData?: {
        vendor: string;
        purchaseDate: string;
        totalAmount: number;
        currency: string;
        items?: Array<{
            name: string;
            quantity: number;
            price: number;
        }>;
        paymentMethod?: string;
        category?: string;
    };
    warrantyData?: {
        productName: string;
        purchaseDate: string;
        warrantyStartDate: string;
        warrantyEndDate: string;
        warrantyType: 'manufacturer' | 'extended' | 'store';
        claimPhone?: string;
        claimUrl?: string;
        serialNumber?: string;
    };
    idData?: {
        issuer?: string;
        issueDate?: string;
        idNumber?: string;
        holderName?: string;
    };
    tags: string[];
    notes?: string;
    sourceEmail?: string;
    createdAt: string;
    updatedAt: string;
    lastViewedAt?: string;
}
export interface DocumentFolder {
    id: string;
    userId: string;
    name: string;
    description?: string;
    parentFolderId?: string;
    documentIds: string[];
    color?: string;
    icon?: string;
    createdAt: string;
    updatedAt: string;
}
export interface DocumentAlert {
    id: string;
    documentId: string;
    userId: string;
    alertType: 'expiring_soon' | 'expired' | 'review_needed';
    message: string;
    alertDate: string;
    acknowledged: boolean;
    acknowledgedAt?: string;
    createdAt: string;
}
export interface DocumentData {
    userId: string;
    lastUpdated: Date | string;
    documents: Document[];
    folders: DocumentFolder[];
    alerts: DocumentAlert[];
    settings: {
        defaultExpirationReminderDays: number;
        autoExtractText: boolean;
        autoCategorizeTags: boolean;
    };
}
/**
 * Get document data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export declare function getDocumentData(userId: string): Promise<DocumentData>;
/**
 * Save document data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export declare function saveDocumentData(userId: string, data: Partial<DocumentData>): Promise<void>;
/**
 * Add a new document
 */
export declare function addDocument(userId: string, document: Omit<Document, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<Document>;
/**
 * Update a document
 */
export declare function updateDocument(userId: string, documentId: string, updates: Partial<Document>): Promise<Document | null>;
/**
 * Delete a document
 */
export declare function deleteDocument(userId: string, documentId: string): Promise<boolean>;
/**
 * Get document by ID
 */
export declare function getDocument(userId: string, documentId: string): Promise<Document | null>;
/**
 * Get documents by type
 */
export declare function getDocumentsByType(userId: string, type: DocumentType): Promise<Document[]>;
/**
 * Get expiring documents
 */
export declare function getExpiringDocuments(userId: string, daysAhead?: number): Promise<Document[]>;
/**
 * Get expired documents
 */
export declare function getExpiredDocuments(userId: string): Promise<Document[]>;
/**
 * Search documents
 */
export declare function searchDocuments(userId: string, query: string): Promise<Document[]>;
/**
 * Get warranty status for a product
 */
export declare function getWarrantyStatus(userId: string, productName: string): Promise<{
    found: boolean;
    isActive: boolean;
    warranty?: Document;
    daysRemaining?: number;
}>;
/**
 * Create a folder
 */
export declare function createFolder(userId: string, folder: Omit<DocumentFolder, 'id' | 'userId' | 'documentIds' | 'createdAt' | 'updatedAt'>): Promise<DocumentFolder>;
/**
 * Add document to folder
 */
export declare function addDocumentToFolder(userId: string, documentId: string, folderId: string): Promise<boolean>;
/**
 * Get documents in folder
 */
export declare function getDocumentsInFolder(userId: string, folderId: string): Promise<Document[]>;
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export declare function migrateUserToFirestore(userId: string): Promise<boolean>;
//# sourceMappingURL=document-store.d.ts.map