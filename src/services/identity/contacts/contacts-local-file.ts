/**
 * The development fallback for user contacts: a JSON file at .ferni/contacts.json, used
 * when Firestore isn't available. Moved out of contacts-management.ts unchanged.
 *
 * @module identity/contacts/contacts-local-file
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Contact } from './contacts-management.js';

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
export function loadLocalContacts(): Map<string, Contact> {
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
export function saveLocalContacts(contacts: Map<string, Contact>): void {
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
