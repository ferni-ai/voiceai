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

import { getLogger } from '../utils/safe-logger.js';
import { runBackground } from '../utils/background-task.js';
import { getConfig } from '../config/environment.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface Contact {
  id: string;
  userId: string;

  // Names
  firstName?: string;
  lastName?: string;
  displayName: string;
  nicknames: string[]; // "mom", "work", "dentist"

  // Contact info
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

  // Address
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    type: 'home' | 'work' | 'other';
  }>;

  // Metadata
  relationship?: string; // "mother", "doctor", "friend", "colleague"
  company?: string;
  jobTitle?: string;
  birthday?: string;
  notes?: string;

  // Organization
  groups: string[]; // "family", "work", "medical"
  isFavorite: boolean;

  // Source tracking
  source: 'manual' | 'google' | 'apple' | 'vcard' | 'csv';
  externalId?: string; // ID from Google/Apple

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastContactedAt?: Date;
}

export interface ContactSearchResult {
  contact: Contact;
  matchScore: number;
  matchReason: string;
}

// ============================================================================
// PERSISTENCE SETUP
// ============================================================================

let db: FirestoreType | null = null;
const CONTACTS_COLLECTION = 'user_contacts';

// Local file fallback for development
const LOCAL_CONTACTS_DIR = '.ferni';
const LOCAL_CONTACTS_FILE = 'contacts.json';

/**
 * Get the path to local contacts file
 */
function getLocalContactsPath(): string {
  return path.join(process.cwd(), LOCAL_CONTACTS_DIR, LOCAL_CONTACTS_FILE);
}

/**
 * Ensure local contacts directory exists
 */
function ensureLocalDir(): void {
  const dir = path.join(process.cwd(), LOCAL_CONTACTS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load contacts from local JSON file (development fallback)
 */
function loadLocalContacts(): Map<string, Contact> {
  const filePath = getLocalContactsPath();
  if (!fs.existsSync(filePath)) {
    return new Map();
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const contacts = new Map<string, Contact>();
    for (const [id, contact] of Object.entries(data)) {
      contacts.set(id, contact as Contact);
    }
    return contacts;
  } catch (err) {
    getLogger().warn({ err }, 'Failed to load local contacts file');
    return new Map();
  }
}

/**
 * Save contacts to local JSON file (development fallback)
 */
function saveLocalContacts(contacts: Map<string, Contact>): void {
  try {
    ensureLocalDir();
    const data: Record<string, Contact> = {};
    for (const [id, contact] of contacts) {
      data[id] = contact;
    }
    fs.writeFileSync(getLocalContactsPath(), JSON.stringify(data, null, 2));
    getLogger().debug({ count: contacts.size }, '💾 Contacts saved to local file');
  } catch (err) {
    getLogger().warn({ err }, 'Failed to save local contacts file');
  }
}

let useLocalFallback = false;

/**
 * Initialize Firestore connection
 */
async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (useLocalFallback) return null;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Contacts service Firestore initialized');
    return db;
  } catch (error) {
    getLogger().info({ error }, '📁 Firestore not available, using local JSON file for contacts');
    useLocalFallback = true;
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore or local file sync)
// ============================================================================

const contactsStore = new Map<string, Contact>();
const loadedUsers = new Set<string>(); // Track which users have been loaded from persistence
let localContactsLoaded = false;

/**
 * Ensure contacts are loaded from persistence for a user
 */
async function ensureContactsLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (firestore) {
    // Load from Firestore
    try {
      const snapshot = await firestore
        .collection(CONTACTS_COLLECTION)
        .where('userId', '==', userId)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const contact: Contact = {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
          lastContactedAt:
            data.lastContactedAt?.toDate?.() ||
            (data.lastContactedAt ? new Date(data.lastContactedAt) : undefined),
        } as Contact;
        contactsStore.set(doc.id, contact);
      }

      loadedUsers.add(userId);
      getLogger().debug({ userId, count: snapshot.size }, 'Loaded contacts from Firestore');
    } catch (err) {
      getLogger().warn({ err, userId }, 'Failed to load contacts from Firestore');
    }
  } else if (!localContactsLoaded) {
    // Load from local file fallback (development)
    const loaded = loadLocalContacts();
    for (const [id, contact] of loaded) {
      contactsStore.set(id, contact);
    }
    localContactsLoaded = true;
    getLogger().info({ count: loaded.size }, '📁 Loaded contacts from local file');
  }
  loadedUsers.add(userId); // Mark as loaded even if persistence unavailable
}

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 */
function stripUndefined<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Persist a contact to storage (Firestore or local file)
 */
async function persistContact(contact: Contact): Promise<void> {
  const firestore = await getFirestore();
  if (firestore) {
    try {
      // Strip undefined values before saving - Firestore doesn't accept undefined
      const cleanContact = stripUndefined(contact);
      await firestore.collection(CONTACTS_COLLECTION).doc(contact.id).set(cleanContact, { merge: true });
    } catch (err) {
      getLogger().warn({ err, contactId: contact.id }, 'Failed to persist contact to Firestore');
    }
  } else {
    // Save to local file (development fallback)
    saveLocalContacts(contactsStore);
  }
}

/**
 * Delete a contact from storage
 */
async function deleteContactFromFirestore(contactId: string): Promise<void> {
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore.collection(CONTACTS_COLLECTION).doc(contactId).delete();
    } catch (err) {
      getLogger().warn({ err, contactId }, 'Failed to delete contact from Firestore');
    }
  } else {
    // Save to local file (development fallback) - the contact was already removed from contactsStore
    saveLocalContacts(contactsStore);
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a new contact
 */
export function createContact(
  userId: string,
  data: {
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
  }
): Contact {
  const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const contact: Contact = {
    id,
    userId,
    displayName: data.displayName,
    firstName: data.firstName,
    lastName: data.lastName,
    nicknames: data.nicknames || [],
    phones: data.phone
      ? [
          {
            number: normalizePhone(data.phone),
            type: data.phoneType || 'mobile',
            primary: true,
          },
        ]
      : [],
    emails: data.email
      ? [
          {
            address: data.email.toLowerCase(),
            type: data.emailType || 'personal',
            primary: true,
          },
        ]
      : [],
    relationship: data.relationship,
    company: data.company,
    notes: data.notes,
    groups: data.groups || [],
    isFavorite: false,
    source: data.source || 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  contactsStore.set(id, contact);

  // Persist to Firestore (async, don't block)
  runBackground(persistContact(contact), {
    task: 'persistContact',
    contactId: id,
    userId,
  });

  getLogger().info(
    {
      contactId: id,
      name: contact.displayName,
      hasPhone: contact.phones.length > 0,
      hasEmail: contact.emails.length > 0,
    },
    '👤 Contact created'
  );

  return contact;
}

/**
 * Update an existing contact
 */
export function updateContact(
  contactId: string,
  updates: Partial<Omit<Contact, 'id' | 'userId' | 'createdAt'>>
): Contact | null {
  const contact = contactsStore.get(contactId);
  if (!contact) return null;

  Object.assign(contact, updates, { updatedAt: new Date() });
  contactsStore.set(contactId, contact);

  // Persist to Firestore (async)
  runBackground(persistContact(contact), {
    task: 'persistContact',
    contactId,
    operation: 'update',
  });

  return contact;
}

/**
 * Delete a contact
 */
export function deleteContact(contactId: string): boolean {
  const deleted = contactsStore.delete(contactId);
  if (deleted) {
    runBackground(deleteContactFromFirestore(contactId), {
      task: 'deleteContact',
      contactId,
    });
  }
  return deleted;
}

/**
 * Delete all contacts for a user (GDPR deletion)
 */
export async function deleteAllContacts(userId: string): Promise<void> {
  const log = getLogger();
  const userContacts = Array.from(contactsStore.values()).filter((c) => c.userId === userId);

  // Delete from in-memory store
  for (const contact of userContacts) {
    contactsStore.delete(contact.id);
  }

  // Delete from Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const batch = firestore.batch();
      for (const contact of userContacts) {
        batch.delete(firestore.collection(CONTACTS_COLLECTION).doc(contact.id));
      }
      await batch.commit();
      log.info({ userId, count: userContacts.length }, 'All contacts deleted for user');
    } catch (err) {
      log.error({ error: String(err), userId }, 'Failed to delete contacts from Firestore');
      throw err;
    }
  }
}

/**
 * Get a contact by ID
 */
export function getContact(contactId: string): Contact | undefined {
  return contactsStore.get(contactId);
}

/**
 * Get all contacts for a user
 */
export async function getUserContacts(userId: string): Promise<Contact[]> {
  await ensureContactsLoaded(userId);
  return Array.from(contactsStore.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Get all contacts for a user (sync version for backward compatibility)
 * Only returns cached contacts - may be incomplete on first call
 */
export function getUserContactsSync(userId: string): Contact[] {
  // Trigger async load in background
  void ensureContactsLoaded(userId);
  return Array.from(contactsStore.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Get favorite contacts
 */
export async function getFavoriteContacts(userId: string): Promise<Contact[]> {
  const contacts = await getUserContacts(userId);
  return contacts.filter((c) => c.isFavorite);
}

/**
 * Get recent contacts
 */
export async function getRecentContacts(userId: string, limit = 10): Promise<Contact[]> {
  const contacts = await getUserContacts(userId);
  return contacts
    .filter((c) => c.lastContactedAt)
    .sort((a, b) => (b.lastContactedAt?.getTime() || 0) - (a.lastContactedAt?.getTime() || 0))
    .slice(0, limit);
}

/**
 * Get contacts by group
 */
export async function getContactsByGroup(userId: string, group: string): Promise<Contact[]> {
  const contacts = await getUserContacts(userId);
  return contacts.filter((c) => c.groups.some((g) => g.toLowerCase() === group.toLowerCase()));
}

// ============================================================================
// SMART SEARCH
// ============================================================================

/**
 * Search contacts by name, nickname, or relationship
 * Handles fuzzy matching: "my mom", "John from work", "the dentist"
 */
export async function searchContacts(
  userId: string,
  query: string
): Promise<ContactSearchResult[]> {
  const contacts = await getUserContacts(userId);
  const queryLower = query.toLowerCase().trim();
  const results: ContactSearchResult[] = [];

  // Parse common patterns
  const patterns = {
    possessive: /^my\s+(.+)$/i, // "my mom", "my dentist"
    relationship: /^the\s+(.+)$/i, // "the dentist", "the plumber"
    fromPlace: /^(.+)\s+from\s+(.+)$/i, // "John from work"
    atPlace: /^(.+)\s+at\s+(.+)$/i, // "Sarah at the gym"
  };

  let searchTerms: string[] = [queryLower];
  let contextHints: string[] = [];

  // Extract patterns
  const possessiveMatch = queryLower.match(patterns.possessive);
  if (possessiveMatch) {
    searchTerms = [possessiveMatch[1]];
  }

  const relationshipMatch = queryLower.match(patterns.relationship);
  if (relationshipMatch) {
    searchTerms = [relationshipMatch[1]];
  }

  const fromMatch = queryLower.match(patterns.fromPlace);
  if (fromMatch) {
    searchTerms = [fromMatch[1]];
    contextHints = [fromMatch[2]];
  }

  const atMatch = queryLower.match(patterns.atPlace);
  if (atMatch) {
    searchTerms = [atMatch[1]];
    contextHints = [atMatch[2]];
  }

  for (const contact of contacts) {
    let score = 0;
    let matchReason = '';

    for (const term of searchTerms) {
      // Exact name match
      if (contact.displayName.toLowerCase() === term) {
        score += 100;
        matchReason = 'Exact name match';
      }
      // First name match
      else if (contact.firstName?.toLowerCase() === term) {
        score += 90;
        matchReason = 'First name match';
      }
      // Last name match
      else if (contact.lastName?.toLowerCase() === term) {
        score += 80;
        matchReason = 'Last name match';
      }
      // Nickname match
      else if (contact.nicknames.some((n) => n.toLowerCase() === term)) {
        score += 95;
        matchReason = 'Nickname match';
      }
      // Relationship match
      else if (contact.relationship?.toLowerCase() === term) {
        score += 85;
        matchReason = 'Relationship match';
      }
      // Partial name match
      else if (contact.displayName.toLowerCase().includes(term)) {
        score += 60;
        matchReason = 'Partial name match';
      }
      // Company match
      else if (contact.company?.toLowerCase().includes(term)) {
        score += 50;
        matchReason = 'Company match';
      }
      // Group match
      else if (contact.groups.some((g) => g.toLowerCase().includes(term))) {
        score += 40;
        matchReason = 'Group match';
      }
    }

    // Context hints boost
    for (const hint of contextHints) {
      if (contact.company?.toLowerCase().includes(hint)) {
        score += 20;
        matchReason += ' + company context';
      }
      if (contact.groups.some((g) => g.toLowerCase().includes(hint))) {
        score += 20;
        matchReason += ' + group context';
      }
      if (contact.notes?.toLowerCase().includes(hint)) {
        score += 10;
        matchReason += ' + notes context';
      }
    }

    // Favorite boost
    if (score > 0 && contact.isFavorite) {
      score += 15;
    }

    // Recent contact boost
    if (score > 0 && contact.lastContactedAt) {
      const daysSince = (Date.now() - contact.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 10;
      else if (daysSince < 30) score += 5;
    }

    if (score > 0) {
      results.push({ contact, matchScore: score, matchReason });
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Find best matching contact
 */
export async function findContact(userId: string, query: string): Promise<Contact | null> {
  const results = await searchContacts(userId, query);
  return results.length > 0 ? results[0].contact : null;
}

/**
 * Find contact by phone number
 */
export async function findContactByPhone(userId: string, phone: string): Promise<Contact | null> {
  const normalized = normalizePhone(phone);
  const contacts = await getUserContacts(userId);
  return (
    contacts.find((c) => c.phones.some((p) => normalizePhone(p.number) === normalized)) || null
  );
}

/**
 * Find contact by email
 */
export async function findContactByEmail(userId: string, email: string): Promise<Contact | null> {
  const normalized = email.toLowerCase();
  const contacts = await getUserContacts(userId);
  return contacts.find((c) => c.emails.some((e) => e.address === normalized)) || null;
}

// ============================================================================
// GOOGLE CONTACTS IMPORT
// ============================================================================

const GOOGLE_PEOPLE_API = 'https://people.googleapis.com/v1';

/**
 * Import contacts from Google (requires OAuth token)
 */
export async function importFromGoogle(
  userId: string,
  accessToken: string
): Promise<{ imported: number; skipped: number; errors: number }> {
  const stats = { imported: 0, skipped: 0, errors: 0 };

  try {
    // Fetch contacts from Google People API
    const response = await fetch(
      `${GOOGLE_PEOPLE_API}/people/me/connections?personFields=names,phoneNumbers,emailAddresses,organizations,addresses,birthdays,relations&pageSize=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      getLogger().error({ status: response.status }, 'Google Contacts API error');
      return stats;
    }

    const data = (await response.json()) as {
      connections?: Array<{
        resourceName: string;
        names?: Array<{ displayName: string; givenName?: string; familyName?: string }>;
        phoneNumbers?: Array<{ value: string; type?: string }>;
        emailAddresses?: Array<{ value: string; type?: string }>;
        organizations?: Array<{ name?: string; title?: string }>;
        addresses?: Array<{
          streetAddress?: string;
          city?: string;
          region?: string;
          postalCode?: string;
          country?: string;
          type?: string;
        }>;
        birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
        relations?: Array<{ person?: string; type?: string }>;
      }>;
    };

    for (const person of data.connections || []) {
      try {
        const name = person.names?.[0];
        if (!name?.displayName) {
          stats.skipped++;
          continue;
        }

        // Check if already exists
        const existingByPhone = person.phoneNumbers?.[0]?.value
          ? findContactByPhone(userId, person.phoneNumbers[0].value)
          : null;
        const existingByEmail = person.emailAddresses?.[0]?.value
          ? findContactByEmail(userId, person.emailAddresses[0].value)
          : null;

        if (existingByPhone || existingByEmail) {
          stats.skipped++;
          continue;
        }

        // Create new contact
        const contact = createContact(userId, {
          displayName: name.displayName,
          firstName: name.givenName,
          lastName: name.familyName,
          phone: person.phoneNumbers?.[0]?.value,
          phoneType: mapGooglePhoneType(person.phoneNumbers?.[0]?.type),
          email: person.emailAddresses?.[0]?.value,
          emailType: mapGoogleEmailType(person.emailAddresses?.[0]?.type),
          company: person.organizations?.[0]?.name,
          source: 'google',
        });

        // Add additional phones
        if (person.phoneNumbers && person.phoneNumbers.length > 1) {
          contact.phones = person.phoneNumbers.map((p, i) => ({
            number: normalizePhone(p.value),
            type: mapGooglePhoneType(p.type),
            primary: i === 0,
          }));
        }

        // Add additional emails
        if (person.emailAddresses && person.emailAddresses.length > 1) {
          contact.emails = person.emailAddresses.map((e, i) => ({
            address: e.value.toLowerCase(),
            type: mapGoogleEmailType(e.type),
            primary: i === 0,
          }));
        }

        // Add addresses
        if (person.addresses) {
          contact.addresses = person.addresses.map((a) => ({
            street: a.streetAddress,
            city: a.city,
            state: a.region,
            zipCode: a.postalCode,
            country: a.country,
            type: (a.type?.toLowerCase() || 'home') as 'home' | 'work' | 'other',
          }));
        }

        // Add birthday
        if (person.birthdays?.[0]?.date) {
          const bd = person.birthdays[0].date;
          if (bd.month && bd.day) {
            contact.birthday = `${bd.month}/${bd.day}${bd.year ? `/${bd.year}` : ''}`;
          }
        }

        // Set external ID for syncing
        contact.externalId = person.resourceName;
        contactsStore.set(contact.id, contact);

        stats.imported++;
      } catch (error) {
        getLogger().warn({ error, person: person.resourceName }, 'Failed to import contact');
        stats.errors++;
      }
    }

    getLogger().info(stats, '📥 Google Contacts import complete');
  } catch (error) {
    getLogger().error({ error }, 'Google Contacts import failed');
  }

  return stats;
}

function mapGooglePhoneType(type?: string): 'mobile' | 'home' | 'work' | 'other' {
  if (!type) return 'mobile';
  const t = type.toLowerCase();
  if (t.includes('mobile') || t.includes('cell')) return 'mobile';
  if (t.includes('home')) return 'home';
  if (t.includes('work')) return 'work';
  return 'other';
}

function mapGoogleEmailType(type?: string): 'personal' | 'work' | 'other' {
  if (!type) return 'personal';
  const t = type.toLowerCase();
  if (t.includes('home') || t.includes('personal')) return 'personal';
  if (t.includes('work')) return 'work';
  return 'other';
}

// ============================================================================
// VCARD IMPORT
// ============================================================================

/**
 * Parse and import contacts from vCard format
 */
export function importFromVCard(
  userId: string,
  vCardData: string
): { imported: number; errors: number } {
  const stats = { imported: 0, errors: 0 };

  // Split into individual vCards
  const cards = vCardData.split(/(?=BEGIN:VCARD)/i).filter((c) => c.trim());

  for (const card of cards) {
    try {
      const contact = parseVCard(userId, card);
      if (contact) {
        stats.imported++;
      }
    } catch (error) {
      getLogger().warn({ error }, 'Failed to parse vCard');
      stats.errors++;
    }
  }

  getLogger().info(stats, '📥 vCard import complete');
  return stats;
}

function parseVCard(userId: string, vcard: string): Contact | null {
  const lines = vcard.split(/\r?\n/);

  let displayName = '';
  let firstName = '';
  let lastName = '';
  let phone = '';
  let phoneType: 'mobile' | 'home' | 'work' | 'other' = 'mobile';
  let email = '';
  let company = '';

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':');

    if (key.startsWith('FN')) {
      displayName = value;
    } else if (key.startsWith('N')) {
      const parts = value.split(';');
      lastName = parts[0] || '';
      firstName = parts[1] || '';
    } else if (key.startsWith('TEL')) {
      phone = value.replace(/[^\d+]/g, '');
      if (key.toLowerCase().includes('cell') || key.toLowerCase().includes('mobile')) {
        phoneType = 'mobile';
      } else if (key.toLowerCase().includes('home')) {
        phoneType = 'home';
      } else if (key.toLowerCase().includes('work')) {
        phoneType = 'work';
      }
    } else if (key.startsWith('EMAIL')) {
      email = value;
    } else if (key.startsWith('ORG')) {
      company = value.split(';')[0];
    }
  }

  if (!displayName && !firstName && !lastName) {
    return null;
  }

  return createContact(userId, {
    displayName: displayName || `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    phone,
    phoneType,
    email,
    company,
    source: 'vcard',
  });
}

// ============================================================================
// CSV IMPORT
// ============================================================================

/**
 * Import contacts from CSV
 * Supports common formats: Google Contacts export, Outlook, generic
 */
export function importFromCSV(
  userId: string,
  csvData: string,
  mapping?: {
    name?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    company?: string;
  }
): { imported: number; errors: number } {
  const stats = { imported: 0, errors: 0 };

  const lines = csvData.split(/\r?\n/);
  if (lines.length < 2) return stats;

  // Parse header
  const header = parseCSVLine(lines[0]);
  const headerLower = header.map((h) => h.toLowerCase());

  // Auto-detect columns if no mapping provided
  const columnMap = {
    name: mapping?.name
      ? header.indexOf(mapping.name)
      : findColumn(headerLower, ['name', 'full name', 'display name']),
    firstName: mapping?.firstName
      ? header.indexOf(mapping.firstName)
      : findColumn(headerLower, ['first name', 'given name', 'first']),
    lastName: mapping?.lastName
      ? header.indexOf(mapping.lastName)
      : findColumn(headerLower, ['last name', 'family name', 'surname', 'last']),
    phone: mapping?.phone
      ? header.indexOf(mapping.phone)
      : findColumn(headerLower, ['phone', 'mobile', 'cell', 'telephone', 'phone 1']),
    email: mapping?.email
      ? header.indexOf(mapping.email)
      : findColumn(headerLower, ['email', 'e-mail', 'email address']),
    company: mapping?.company
      ? header.indexOf(mapping.company)
      : findColumn(headerLower, ['company', 'organization', 'org']),
  };

  // Parse rows
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    try {
      const values = parseCSVLine(lines[i]);

      const name = columnMap.name >= 0 ? values[columnMap.name] : '';
      const firstName = columnMap.firstName >= 0 ? values[columnMap.firstName] : '';
      const lastName = columnMap.lastName >= 0 ? values[columnMap.lastName] : '';
      const phone = columnMap.phone >= 0 ? values[columnMap.phone] : '';
      const email = columnMap.email >= 0 ? values[columnMap.email] : '';
      const company = columnMap.company >= 0 ? values[columnMap.company] : '';

      const displayName = name || `${firstName} ${lastName}`.trim();
      if (!displayName) continue;

      createContact(userId, {
        displayName,
        firstName,
        lastName,
        phone,
        email,
        company,
        source: 'csv',
      });

      stats.imported++;
    } catch (error) {
      stats.errors++;
    }
  }

  getLogger().info(stats, '📥 CSV import complete');
  return stats;
}

function findColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Normalize phone number to consistent format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digits except +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Add +1 for US numbers if not present
  if (normalized.length === 10) {
    normalized = `+1${normalized}`;
  } else if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = `+${normalized}`;
  } else if (!normalized.startsWith('+')) {
    normalized = `+${normalized}`;
  }

  return normalized;
}

/**
 * Format phone for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone);

  // Format US numbers nicely
  if (normalized.startsWith('+1') && normalized.length === 12) {
    const num = normalized.slice(2);
    return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
  }

  return phone;
}

/**
 * Format contact for speech
 */
export function formatContactForSpeech(contact: Contact): string {
  let result = contact.displayName;

  if (contact.relationship) {
    result += ` (${contact.relationship})`;
  } else if (contact.company) {
    result += ` at ${contact.company}`;
  }

  return result;
}

/**
 * Mark contact as recently contacted
 */
export function markContacted(contactId: string): void {
  const contact = contactsStore.get(contactId);
  if (contact) {
    contact.lastContactedAt = new Date();
    contactsStore.set(contactId, contact);
  }
}

/**
 * Toggle favorite status
 */
export function toggleFavorite(contactId: string): Contact | null {
  const contact = contactsStore.get(contactId);
  if (!contact) return null;

  contact.isFavorite = !contact.isFavorite;
  contact.updatedAt = new Date();
  contactsStore.set(contactId, contact);

  return contact;
}

/**
 * Add nickname to contact
 */
export function addNickname(contactId: string, nickname: string): Contact | null {
  const contact = contactsStore.get(contactId);
  if (!contact) return null;

  const normalizedNickname = nickname.toLowerCase().trim();
  if (!contact.nicknames.includes(normalizedNickname)) {
    contact.nicknames.push(normalizedNickname);
    contact.updatedAt = new Date();
    contactsStore.set(contactId, contact);
  }

  return contact;
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  createContact,
  updateContact,
  deleteContact,
  getContact,
  getUserContacts,
  getFavoriteContacts,
  getRecentContacts,
  getContactsByGroup,
  searchContacts,
  findContact,
  findContactByPhone,
  findContactByEmail,
  importFromGoogle,
  importFromVCard,
  importFromCSV,
  formatPhoneForDisplay,
  formatContactForSpeech,
  markContacted,
  toggleFavorite,
  addNickname,
};
