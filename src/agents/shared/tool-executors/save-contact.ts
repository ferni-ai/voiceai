/**
 * saveContact / saveContactInfo / addContact on the executor path (scheduling-executor.ts).
 *
 * @module agents/shared/tool-executors/save-contact
 */
import type { ContactRelationship } from '../../../services/contacts/contact-relationship-service.js';
import { WHERE_TO_ADD_NUMBER } from '../../../tools/shared/where-to-add-number.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SaveContact' });

/** Said when no one else is named: the owner's own number and email are the verified ones. */
const OWN_DETAILS_NOT_HERE = `I can't change your own number or email from here: I only use the ones verified on your account. ${WHERE_TO_ADD_NUMBER}`;

/** Words that name the caller, not someone else. */
const SELF_WORDS = new Set(['me', 'myself', 'my', 'mine', 'i', 'self', 'user', 'owner']);
const RELATIONSHIPS = ['family', 'friend', 'colleague', 'acquaintance', 'professional', 'other'];
const FAMILY =
  /^(mom|mum|mother|dad|father|parent|sister|brother|sibling|son|daughter|wife|husband|spouse|grand\w*|aunt|uncle|cousin|niece|nephew)$/;
type Relationship = NonNullable<ContactRelationship['relationship']>;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function relationshipOf(said: string): Relationship | undefined {
  const lower = said.toLowerCase();
  if (RELATIONSHIPS.includes(lower)) return lower as Relationship;
  return FAMILY.test(lower) ? 'family' : undefined;
}

/**
 * saveContact / saveContactInfo / addContact: a named person (or one named by relationship,
 * "my mom") goes into the user's contacts, the store reachOut resolves names from. It never
 * writes the owner's own contact info: a model argument is not a verified number, and writing
 * someone else's phone there made the owner's own texts and check-ins go to them.
 */
export async function saveContact(args: Record<string, unknown>, userId: string): Promise<string> {
  const relationship = text(args.relationship);
  const said = text(args.name) || relationship;
  const name = SELF_WORDS.has(said.toLowerCase()) ? '' : said;
  const phone = text(args.phone);
  const email = text(args.email);

  log.info({ hasName: !!name, hasPhone: !!phone, hasEmail: !!email, userId }, '👤 Saving contact');

  if (!name) return OWN_DETAILS_NOT_HERE;
  if (!phone && !email) return `What's the best way to reach ${name}? Phone number or email?`;
  if (userId === 'unknown') return 'I need to know who you are before I can save a contact.';

  try {
    const { getContacts, upsertContact } =
      await import('../../../services/contacts/contact-relationship-service.js');
    const existing = (await getContacts(userId)).find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    const kind = relationshipOf(relationship);
    const saved = await upsertContact(userId, {
      name: existing?.name ?? name,
      contactId:
        existing?.contactId ??
        (email || `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(kind ? { relationship: kind } : {}),
    });
    const what = [phone && 'number', email && 'email'].filter(Boolean).join(' and ');
    return `Got it. I saved ${saved.name}'s ${what} in your contacts.`;
  } catch (err) {
    log.error({ error: String(err), userId }, '👤 Failed to save contact');
    return "I couldn't save that contact right now. Try again in a moment?";
  }
}
