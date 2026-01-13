/**
 * User Contacts Service
 *
 * Manages user's personal contacts for Alex to call, text, or email.
 *
 * Ways to add contacts:
 * 1. Voice: "Add my mom's number: 555-1234"
 * 2. Google Contacts sync (OAuth)
 * 3. Apple Contacts via iCloud (OAuth)
 * 4. vCard import (file upload)
 * 5. CSV import
 * 6. Share from phone (deep link)
 *
 * Features:
 * - Nickname support ("my mom", "the dentist", "work")
 * - Relationship tracking
 * - Favorite contacts
 * - Recent contacts
 * - Smart matching ("call John" finds the right John)
 *
 * @module services/contacts
 *
 * PERSISTENCE:
 * - Production: Firestore with in-memory caching
 * - Development: Local JSON file fallback at .ferni/contacts.json
 */
export interface Contact {
    id: string;
    userId: string;
    firstName?: string;
    lastName?: string;
    displayName: string;
    nicknames: string[];
    phones: Array<{
        number: string;
        type: 'mobile' | 'home' | 'work' | 'other';
        primary?: boolean;
    }>;
    emails: Array<{
        address: string;
        type: 'personal' | 'work' | 'other';
        primary?: boolean;
    }>;
    addresses?: Array<{
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
        type: 'home' | 'work' | 'other';
    }>;
    relationship?: string;
    company?: string;
    jobTitle?: string;
    birthday?: string;
    notes?: string;
    groups: string[];
    isFavorite: boolean;
    source: 'manual' | 'google' | 'apple' | 'vcard' | 'csv';
    externalId?: string;
    createdAt: Date;
    updatedAt: Date;
    lastContactedAt?: Date;
}
export interface ContactSearchResult {
    contact: Contact;
    matchScore: number;
    matchReason: string;
}
/**
 * Create a new contact
 */
export declare function createContact(userId: string, data: {
    displayName: string;
    firstName?: string;
    lastName?: string;
    nicknames?: string[];
    phone?: string;
    phoneType?: 'mobile' | 'home' | 'work' | 'other';
    email?: string;
    emailType?: 'personal' | 'work' | 'other';
    relationship?: string;
    company?: string;
    notes?: string;
    groups?: string[];
    source?: Contact['source'];
}): Contact;
/**
 * Update an existing contact
 */
export declare function updateContact(contactId: string, updates: Partial<Omit<Contact, 'id' | 'userId' | 'createdAt'>>): Contact | null;
/**
 * Delete a contact
 */
export declare function deleteContact(contactId: string): boolean;
/**
 * Delete all contacts for a user (GDPR deletion)
 */
export declare function deleteAllContacts(userId: string): Promise<void>;
/**
 * Get a contact by ID
 */
export declare function getContact(contactId: string): Contact | undefined;
/**
 * Get all contacts for a user
 */
export declare function getUserContacts(userId: string): Promise<Contact[]>;
/**
 * Get all contacts for a user (sync version for backward compatibility)
 * Only returns cached contacts - may be incomplete on first call
 */
export declare function getUserContactsSync(userId: string): Contact[];
/**
 * Get favorite contacts
 */
export declare function getFavoriteContacts(userId: string): Promise<Contact[]>;
/**
 * Get recent contacts
 */
export declare function getRecentContacts(userId: string, limit?: number): Promise<Contact[]>;
/**
 * Get contacts by group
 */
export declare function getContactsByGroup(userId: string, group: string): Promise<Contact[]>;
/**
 * Search contacts by name, nickname, or relationship
 * Handles fuzzy matching: "my mom", "John from work", "the dentist"
 */
export declare function searchContacts(userId: string, query: string): Promise<ContactSearchResult[]>;
/**
 * Find best matching contact
 */
export declare function findContact(userId: string, query: string): Promise<Contact | null>;
/**
 * Find contact by phone number
 */
export declare function findContactByPhone(userId: string, phone: string): Promise<Contact | null>;
/**
 * Find contact by email
 */
export declare function findContactByEmail(userId: string, email: string): Promise<Contact | null>;
/**
 * Import contacts from Google (requires OAuth token)
 */
export declare function importFromGoogle(userId: string, accessToken: string): Promise<{
    imported: number;
    skipped: number;
    errors: number;
}>;
/**
 * Parse and import contacts from vCard format
 */
export declare function importFromVCard(userId: string, vCardData: string): {
    imported: number;
    errors: number;
};
/**
 * Import contacts from CSV
 * Supports common formats: Google Contacts export, Outlook, generic
 */
export declare function importFromCSV(userId: string, csvData: string, mapping?: {
    name?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    company?: string;
}): {
    imported: number;
    errors: number;
};
/**
 * Format phone for display
 */
export declare function formatPhoneForDisplay(phone: string): string;
/**
 * Format contact for speech
 */
export declare function formatContactForSpeech(contact: Contact): string;
/**
 * Mark contact as recently contacted
 */
export declare function markContacted(contactId: string): void;
/**
 * Toggle favorite status
 */
export declare function toggleFavorite(contactId: string): Contact | null;
/**
 * Add nickname to contact
 */
export declare function addNickname(contactId: string, nickname: string): Contact | null;
declare const _default: {
    createContact: typeof createContact;
    updateContact: typeof updateContact;
    deleteContact: typeof deleteContact;
    getContact: typeof getContact;
    getUserContacts: typeof getUserContacts;
    getFavoriteContacts: typeof getFavoriteContacts;
    getRecentContacts: typeof getRecentContacts;
    getContactsByGroup: typeof getContactsByGroup;
    searchContacts: typeof searchContacts;
    findContact: typeof findContact;
    findContactByPhone: typeof findContactByPhone;
    findContactByEmail: typeof findContactByEmail;
    importFromGoogle: typeof importFromGoogle;
    importFromVCard: typeof importFromVCard;
    importFromCSV: typeof importFromCSV;
    formatPhoneForDisplay: typeof formatPhoneForDisplay;
    formatContactForSpeech: typeof formatContactForSpeech;
    markContacted: typeof markContacted;
    toggleFavorite: typeof toggleFavorite;
    addNickname: typeof addNickname;
};
export default _default;
//# sourceMappingURL=contacts.d.ts.map