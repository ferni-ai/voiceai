/**
 * Contacts & Communication Tools
 *
 * LLM-callable tools for managing contacts and communication.
 *
 * @module scheduling/contacts-tools
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { z } from 'zod';
import { validatePhone, sanitizePhoneForLog } from '../validation.js';
import {
  createContact,
  searchContacts,
  findContact,
  getUserContacts,
  getRecentContacts,
  getFavoriteContacts,
  markContacted,
  formatPhoneForDisplay,
  formatContactForSpeech,
  updateContact,
  deleteContact,
  addNickname,
  toggleFavorite,
  importFromVCard,
  importFromCSV,
  type Contact,
} from '../../services/contacts.js';

export function createContactsTools() {
  return {
    // ========== ADD CONTACT ==========

    addContact: llm.tool({
      description: `Add a new contact to the user's address book.
Use when:
- "Save my mom's number: 555-1234"
- "Add John Smith, his email is john@example.com"
- "My dentist is Dr. Chen, number 555-9999"`,
      parameters: z.object({
        name: z.string().describe('Contact name (e.g., "Mom", "John Smith", "Dr. Chen")'),
        phone: z.string().optional().describe('Phone number'),
        email: z.string().optional().describe('Email address'),
        nickname: z.string().optional().describe('Nickname like "mom", "work", "dentist"'),
        relationship: z
          .string()
          .optional()
          .describe('Relationship like "mother", "friend", "doctor"'),
        company: z.string().optional().describe('Company or workplace'),
        notes: z.string().optional().describe('Any additional notes'),
      }),
      execute: async ({ name, phone, email, nickname, relationship, company, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        if (!phone && !email) {
          return `I need at least a phone number or email for ${name}. What should I save?`;
        }

        const _contact = createContact(userId, {
          displayName: name,
          phone,
          email,
          nicknames: nickname ? [nickname.toLowerCase()] : undefined,
          relationship,
          company,
          notes,
        });

        let response = `✅ Saved ${name}`;
        if (phone) response += ` - ${formatPhoneForDisplay(phone)}`;
        if (email) response += ` - ${email}`;
        if (nickname) response += `\n\nYou can say "${nickname}" and I'll know who you mean!`;

        return response;
      },
    }),

    // ========== FIND CONTACT ==========

    findMyContact: llm.tool({
      description: `Find a contact from the user's address book.
Use when:
- "What's my mom's number?"
- "Call John"
- "Find my dentist's info"`,
      parameters: z.object({
        query: z.string().describe('Who to find (name, nickname, or relationship like "my mom")'),
      }),
      execute: async ({ query }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const results = await searchContacts(userId, query);

        if (results.length === 0) {
          return `I don't have "${query}" in your contacts. Would you like to add them?`;
        }

        if (results.length === 1) {
          const { contact } = results[0];
          let response = `📇 ${contact.displayName}`;
          if (contact.relationship) response += ` (${contact.relationship})`;
          response += '\n';

          if (contact.phones.length > 0) {
            const primary = contact.phones.find((p) => p.primary) || contact.phones[0];
            response += `📞 ${formatPhoneForDisplay(primary.number)}`;
            if (primary.type !== 'mobile') response += ` (${primary.type})`;
            response += '\n';
          }

          if (contact.emails.length > 0) {
            response += `✉️ ${contact.emails[0].address}\n`;
          }

          if (contact.company) {
            response += `🏢 ${contact.company}\n`;
          }

          response += `\nWant me to call or text them?`;
          return response;
        }

        // Multiple matches
        const list = results
          .slice(0, 5)
          .map((r, i) => {
            const c = r.contact;
            let line = `${i + 1}. ${c.displayName}`;
            if (c.relationship) line += ` (${c.relationship})`;
            if (c.phones.length > 0) line += ` - ${formatPhoneForDisplay(c.phones[0].number)}`;
            return line;
          })
          .join('\n');

        return `Found ${results.length} contact${results.length > 1 ? 's' : ''} matching "${query}":\n\n${list}\n\nWhich one did you mean?`;
      },
    }),

    // ========== CALL CONTACT ==========

    callMyContact: llm.tool({
      description: `Find a contact and prepare to call them.
Use when:
- "Call my mom"
- "Call John from work"
- "Phone the dentist"`,
      parameters: z.object({
        who: z.string().describe('Who to call (name, nickname, or relationship)'),
        purpose: z.string().optional().describe('Why calling (for appointment, to chat, etc.)'),
      }),
      execute: async ({ who, purpose }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I don't have "${who}" in your contacts. Do you have their number, or should I look them up?`;
        }

        if (contact.phones.length === 0) {
          return `I have ${contact.displayName} saved, but no phone number. Want to add one?`;
        }

        const phone =
          contact.phones.find((p: { primary?: boolean }) => p.primary) || contact.phones[0];

        // Mark as contacted
        markContacted(contact.id);

        let response = `📞 Calling ${formatContactForSpeech(contact)}\n`;
        response += `Number: ${formatPhoneForDisplay(phone.number)}\n`;

        if (purpose) {
          response += `\nPurpose: ${purpose}\n`;
        }

        response += `\nReady to dial!`;

        return response;
      },
    }),

    // ========== LIST CONTACTS ==========

    listContacts: llm.tool({
      description: `List user's contacts.
Use when:
- "Show my contacts"
- "Who's in my favorites?"
- "Recent contacts"
- "Show family contacts"`,
      parameters: z.object({
        filter: z.enum(['all', 'favorites', 'recent', 'group']).default('all'),
        group: z.string().optional().describe('Group name if filter is "group"'),
        limit: z.number().default(10).describe('How many to show'),
      }),
      execute: async ({ filter, group, limit }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        let contacts: Contact[];
        let title: string;

        switch (filter) {
          case 'favorites':
            contacts = await getFavoriteContacts(userId);
            title = '⭐ Favorite Contacts';
            break;
          case 'recent':
            contacts = await getRecentContacts(userId, limit);
            title = '🕐 Recent Contacts';
            break;
          case 'group':
            if (group) {
              const allContacts = await getUserContacts(userId);
              contacts = allContacts.filter((c: Contact) =>
                c.groups.some((g: string) => g.toLowerCase() === group.toLowerCase())
              );
            } else {
              contacts = [];
            }
            title = `👥 ${group || 'Group'} Contacts`;
            break;
          default:
            contacts = (await getUserContacts(userId)).slice(0, limit);
            title = '📇 Your Contacts';
        }

        if (contacts.length === 0) {
          if (filter === 'all') {
            return `You don't have any contacts saved yet. Say "add contact" to get started!`;
          }
          return `No ${filter} contacts found.`;
        }

        const list = contacts
          .map((c, i) => {
            let line = `${i + 1}. ${c.displayName}`;
            if (c.isFavorite) line += ' ⭐';
            if (c.relationship) line += ` (${c.relationship})`;
            if (c.phones.length > 0) line += ` - ${formatPhoneForDisplay(c.phones[0].number)}`;
            return line;
          })
          .join('\n');

        return `${title} (${contacts.length}):\n\n${list}`;
      },
    }),

    // ========== UPDATE CONTACT ==========

    updateMyContact: llm.tool({
      description: `Update an existing contact.
Use when:
- "Change mom's number to 555-1234"
- "Add a nickname for John: Johnny"
- "Mark Sarah as favorite"`,
      parameters: z.object({
        who: z.string().describe('Which contact to update'),
        phone: z.string().optional().describe('New phone number'),
        email: z.string().optional().describe('New email'),
        nickname: z.string().optional().describe('Add a nickname'),
        makeFavorite: z.boolean().optional().describe('Mark as favorite'),
        notes: z.string().optional().describe('Add notes'),
      }),
      execute: async ({ who, phone, email, nickname, makeFavorite, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I couldn't find "${who}" in your contacts.`;
        }

        const updates: string[] = [];

        if (phone) {
          updateContact(contact.id, {
            phones: [{ number: phone, type: 'mobile', primary: true }, ...contact.phones.slice(1)],
          });
          updates.push(`phone → ${formatPhoneForDisplay(phone)}`);
        }

        if (email) {
          updateContact(contact.id, {
            emails: [
              { address: email.toLowerCase(), type: 'personal', primary: true },
              ...contact.emails.slice(1),
            ],
          });
          updates.push(`email → ${email}`);
        }

        if (nickname) {
          addNickname(contact.id, nickname);
          updates.push(`added nickname "${nickname}"`);
        }

        if (makeFavorite !== undefined) {
          if (contact.isFavorite !== makeFavorite) {
            toggleFavorite(contact.id);
            updates.push(makeFavorite ? 'marked as favorite ⭐' : 'removed from favorites');
          }
        }

        if (notes) {
          updateContact(contact.id, {
            notes: contact.notes ? `${contact.notes}\n${notes}` : notes,
          });
          updates.push('added notes');
        }

        if (updates.length === 0) {
          return `Nothing to update for ${contact.displayName}. What would you like to change?`;
        }

        return `✅ Updated ${contact.displayName}:\n${updates.map((u) => `  • ${u}`).join('\n')}`;
      },
    }),

    // ========== DELETE CONTACT ==========

    deleteMyContact: llm.tool({
      description: `Delete a contact.
Use when user explicitly asks to remove someone.`,
      parameters: z.object({
        who: z.string().describe('Which contact to delete'),
        confirm: z.boolean().describe('User has confirmed deletion'),
      }),
      execute: async ({ who, confirm }, { ctx }) => {
        if (!confirm) {
          return `Are you sure you want to delete ${who} from your contacts? Say "yes, delete" to confirm.`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I couldn't find "${who}" in your contacts.`;
        }

        deleteContact(contact.id);

        return `✅ Deleted ${contact.displayName} from your contacts.`;
      },
    }),

    // ========== IMPORT CONTACTS ==========

    importContacts: llm.tool({
      description: `Import contacts from Google, vCard, or CSV.
Guides user through the import process.`,
      parameters: z.object({
        source: z.enum(['google', 'vcard', 'csv', 'help']).describe('Where to import from'),
        data: z.string().optional().describe('vCard or CSV data if provided'),
      }),
      execute: async ({ source, data }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        switch (source) {
          case 'google':
            return (
              `To import from Google Contacts:\n\n` +
              `1. I'll need to connect to your Google account\n` +
              `2. You'll authorize access to your contacts\n` +
              `3. I'll import them automatically\n\n` +
              `Would you like to connect your Google account? (This would open a secure login)`
            );

          case 'vcard':
            if (data) {
              const result = importFromVCard(userId, data);
              return `✅ Imported ${result.imported} contact${result.imported !== 1 ? 's' : ''} from vCard!${
                result.errors > 0 ? ` (${result.errors} couldn't be imported)` : ''
              }`;
            }
            return (
              `To import from vCard:\n\n` +
              `1. Export contacts from your phone/email as .vcf file\n` +
              `2. Share or paste the vCard data\n` +
              `3. I'll import them for you\n\n` +
              `Do you have a vCard file ready?`
            );

          case 'csv':
            if (data) {
              const result = importFromCSV(userId, data);
              return `✅ Imported ${result.imported} contact${result.imported !== 1 ? 's' : ''} from CSV!${
                result.errors > 0 ? ` (${result.errors} couldn't be imported)` : ''
              }`;
            }
            return (
              `To import from CSV:\n\n` +
              `1. Export contacts from your phone/email as .csv file\n` +
              `2. The file should have columns like Name, Phone, Email\n` +
              `3. Share or paste the CSV data\n\n` +
              `Do you have a CSV file ready?`
            );

          default:
            return (
              `📥 **Import Contacts**\n\n` +
              `I can import contacts from:\n` +
              `• **Google Contacts** - Connect your Google account\n` +
              `• **vCard (.vcf)** - Export from iPhone, Android, or email\n` +
              `• **CSV** - Spreadsheet format\n\n` +
              `Which would you like to use?`
            );
        }
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================
