/**
 * Google Contacts Import Service
 *
 * "Better Than Human" - Import your entire network with one click.
 * Automatically detects relationships, groups, and important dates.
 *
 * @module services/contacts/google-contacts-import
 */

// Google APIs - dynamically imported to avoid build errors
// import { google, people_v1 } from 'googleapis';
import { createLogger } from '../../utils/safe-logger.js';
import { upsertContact, type ContactRelationship } from './contact-relationship-service.js';
import { createGroup, addToGroup } from './contact-groups.js';

const log = createLogger({ module: 'GoogleContactsImport' });

// ============================================================================
// TYPES
// ============================================================================

export interface GoogleContactPerson {
  resourceName: string;
  etag?: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
  phoneNumbers?: Array<{ value?: string; type?: string }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
  relations?: Array<{ person?: string; type?: string }>;
  memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
  biographies?: Array<{ value?: string }>;
  organizations?: Array<{ name?: string; title?: string }>;
  addresses?: Array<{ formattedValue?: string; type?: string }>;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  contactIds: string[];
  groupsCreated: string[];
}

export interface ImportOptions {
  includeGroups?: boolean;
  detectRelationships?: boolean;
  importBirthdays?: boolean;
  mergeExisting?: boolean;
  maxContacts?: number;
}

// ============================================================================
// RELATIONSHIP DETECTION
// ============================================================================

const RELATIONSHIP_KEYWORDS: Record<string, string[]> = {
  family: [
    'mother',
    'father',
    'mom',
    'dad',
    'parent',
    'sister',
    'brother',
    'sibling',
    'aunt',
    'uncle',
    'cousin',
    'grandmother',
    'grandfather',
    'grandma',
    'grandpa',
    'wife',
    'husband',
    'spouse',
    'son',
    'daughter',
    'child',
  ],
  friend: ['friend', 'buddy', 'pal', 'bestie', 'bff'],
  work: ['colleague', 'coworker', 'boss', 'manager', 'employee', 'work', 'office'],
  mentor: ['mentor', 'coach', 'advisor', 'teacher', 'professor'],
  other: [],
};

function detectRelationship(person: GoogleContactPerson): ContactRelationship['relationship'] {
  // Check explicit relations field
  if (person.relations && person.relations.length > 0) {
    const relationType = person.relations[0].type?.toLowerCase() || '';
    for (const [category, keywords] of Object.entries(RELATIONSHIP_KEYWORDS)) {
      if (keywords.some((k) => relationType.includes(k))) {
        return category as ContactRelationship['relationship'];
      }
    }
  }

  // Check biography/notes for relationship hints
  if (person.biographies && person.biographies.length > 0) {
    const bio = person.biographies[0].value?.toLowerCase() || '';
    for (const [category, keywords] of Object.entries(RELATIONSHIP_KEYWORDS)) {
      if (keywords.some((k) => bio.includes(k))) {
        return category as ContactRelationship['relationship'];
      }
    }
  }

  // Check if work organization is present
  if (person.organizations && person.organizations.length > 0) {
    return 'colleague';
  }

  return 'other';
}

// ============================================================================
// MAIN IMPORT FUNCTIONS
// ============================================================================

/**
 * Import contacts from Google People API
 */
export async function importGoogleContacts(
  userId: string,
  accessToken: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const {
    includeGroups = true,
    detectRelationships = true,
    importBirthdays = true,
    mergeExisting = true,
    maxContacts = 1000,
  } = options;

  const result: ImportResult = {
    success: false,
    imported: 0,
    skipped: 0,
    errors: [],
    contactIds: [],
    groupsCreated: [],
  };

  try {
    // Initialize Google People API client (dynamic import)
    // Note: googleapis must be installed separately: npm install googleapis
    let google: {
      auth: {
        OAuth2: new (...args: unknown[]) => {
          setCredentials: (creds: unknown) => void;
          getToken: (
            code: string
          ) => Promise<{ tokens: { access_token?: string; refresh_token?: string } }>;
          generateAuthUrl: (opts: unknown) => string;
        };
      };
      people: (config: { version: string; auth: unknown }) => {
        contactGroups: {
          list: (opts: {
            pageSize: number;
          }) => Promise<{
            data: {
              contactGroups?: Array<{ resourceName?: string; name?: string; groupType?: string }>;
            };
          }>;
        };
        people: {
          connections: {
            list: (
              opts: unknown
            ) => Promise<{ data: { connections?: GoogleContactPerson[]; nextPageToken?: string } }>;
          };
        };
      };
    };

    try {
      const googleapis = await import('googleapis');
      google = googleapis.google as typeof google;
    } catch {
      log.warn('googleapis package not installed. Google Contacts import unavailable.');
      result.errors.push('googleapis package not installed. Run: npm install googleapis');
      return result;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const peopleApi = google.people({ version: 'v1', auth: oauth2Client });

    // Fetch contact groups first if needed
    const groupMap = new Map<string, string>();
    if (includeGroups) {
      try {
        const groupsResponse = await peopleApi.contactGroups.list({
          pageSize: 100,
        });

        for (const group of groupsResponse.data.contactGroups || []) {
          if (group.resourceName && group.name && group.groupType === 'USER_CONTACT_GROUP') {
            groupMap.set(group.resourceName, group.name);
          }
        }
      } catch (groupError) {
        log.warn({ error: String(groupError) }, 'Failed to fetch contact groups');
      }
    }

    // Fetch all contacts with pagination
    let nextPageToken: string | undefined;
    let totalFetched = 0;

    do {
      const response = await peopleApi.people.connections.list({
        resourceName: 'people/me',
        pageSize: Math.min(100, maxContacts - totalFetched),
        pageToken: nextPageToken,
        personFields:
          'names,emailAddresses,phoneNumbers,birthdays,relations,memberships,biographies,organizations,addresses',
      });

      const connections = response.data.connections || [];
      totalFetched += connections.length;

      for (const person of connections) {
        try {
          const imported = await importSingleContact(userId, person as GoogleContactPerson, {
            detectRelationships,
            importBirthdays,
            mergeExisting,
            groupMap,
          });

          if (imported) {
            result.imported++;
            result.contactIds.push(imported.contactId);

            // Handle group memberships
            if (includeGroups && person.memberships) {
              for (const membership of person.memberships) {
                const groupResourceName =
                  membership.contactGroupMembership?.contactGroupResourceName;
                if (groupResourceName && groupMap.has(groupResourceName)) {
                  const groupName = groupMap.get(groupResourceName)!;
                  await ensureGroupAndAddContact(userId, groupName, imported.contactId, result);
                }
              }
            }
          } else {
            result.skipped++;
          }
        } catch (contactError) {
          result.errors.push(
            `Failed to import ${person.names?.[0]?.displayName || 'unknown'}: ${String(contactError)}`
          );
        }
      }

      nextPageToken = response.data.nextPageToken || undefined;
    } while (nextPageToken && totalFetched < maxContacts);

    result.success = true;
    log.info(
      { imported: result.imported, skipped: result.skipped },
      'Google contacts import completed'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Google contacts import failed');
    result.errors.push(`Import failed: ${String(error)}`);
  }

  return result;
}

/**
 * Import a single contact from Google
 */
async function importSingleContact(
  userId: string,
  person: GoogleContactPerson,
  options: {
    detectRelationships: boolean;
    importBirthdays: boolean;
    mergeExisting: boolean;
    groupMap: Map<string, string>;
  }
): Promise<ContactRelationship | null> {
  // Skip contacts without name or contact info
  const name = person.names?.[0]?.displayName;
  if (!name) {
    return null;
  }

  const email = person.emailAddresses?.[0]?.value;
  const phone = person.phoneNumbers?.[0]?.value;

  if (!email && !phone) {
    return null;
  }

  // Generate contactId from email or phone
  const contactId = email || phone || `google_${person.resourceName}`;

  // Detect relationship type
  const relationship = options.detectRelationships ? detectRelationship(person) : 'other';

  // Extract birthday if present
  const importantDates: ContactRelationship['importantDates'] = [];
  if (options.importBirthdays && person.birthdays && person.birthdays.length > 0) {
    const birthday = person.birthdays[0].date;
    if (birthday?.month && birthday?.day) {
      const monthStr = String(birthday.month).padStart(2, '0');
      const dayStr = String(birthday.day).padStart(2, '0');
      importantDates.push({
        date: `${monthStr}-${dayStr}`,
        type: 'birthday',
        label: `${name}'s Birthday`,
      });
    }
  }

  // Build notes from biography and organization
  const notes: string[] = [];
  if (person.biographies?.[0]?.value) {
    notes.push(person.biographies[0].value);
  }
  if (person.organizations?.[0]) {
    const org = person.organizations[0];
    if (org.name) notes.push(`Works at ${org.name}`);
    if (org.title) notes.push(`Title: ${org.title}`);
  }

  // Create or update contact
  const contact = await upsertContact(userId, {
    name,
    contactId,
    email: email || undefined,
    phone: phone || undefined,
    relationship,
    notes: notes.length > 0 ? notes.join('\n') : undefined,
    importantDates: importantDates.length > 0 ? importantDates : undefined,
  });

  return contact;
}

/**
 * Ensure a group exists and add contact to it
 */
async function ensureGroupAndAddContact(
  userId: string,
  groupName: string,
  contactId: string,
  result: ImportResult
): Promise<void> {
  try {
    // Try to get or create the group
    const { getGroups } = await import('./contact-groups.js');
    const existingGroups = await getGroups(userId);
    let group = existingGroups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());

    if (!group) {
      group = await createGroup(userId, {
        name: groupName,
        description: `Imported from Google Contacts`,
        members: [contactId],
      });
      result.groupsCreated.push(groupName);
    } else {
      await addToGroup(userId, group.id, [contactId]);
    }
  } catch (error) {
    log.warn({ error: String(error), groupName }, 'Failed to add contact to group');
  }
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

/**
 * Sync contacts - compare and update changes
 */
export async function syncGoogleContacts(
  userId: string,
  accessToken: string
): Promise<{
  added: number;
  updated: number;
  removed: number;
}> {
  // For now, just do a full import with merge
  const result = await importGoogleContacts(userId, accessToken, {
    mergeExisting: true,
    includeGroups: true,
    detectRelationships: true,
    importBirthdays: true,
  });

  return {
    added: result.imported,
    updated: 0, // Would need change tracking to compute this
    removed: 0,
  };
}

/**
 * Get OAuth URL for Google Contacts permission
 */
export async function getGoogleContactsAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): Promise<string> {
  try {
    const { google } = (await import('googleapis')) as {
      google: {
        auth: {
          OAuth2: new (...args: unknown[]) => { generateAuthUrl: (opts: unknown) => string };
        };
      };
    };
    const oauth2Client = new google.auth.OAuth2(clientId, undefined, redirectUri);

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/contacts.other.readonly',
      ],
      state,
      prompt: 'consent',
    });
  } catch {
    throw new Error('googleapis package not installed. Run: npm install googleapis');
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGoogleContactsCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<{ accessToken: string; refreshToken?: string }> {
  try {
    const { google } = (await import('googleapis')) as {
      google: {
        auth: {
          OAuth2: new (...args: unknown[]) => {
            getToken: (
              code: string
            ) => Promise<{ tokens: { access_token?: string; refresh_token?: string } }>;
          };
        };
      };
    };
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || undefined,
    };
  } catch {
    throw new Error('googleapis package not installed. Run: npm install googleapis');
  }
}
