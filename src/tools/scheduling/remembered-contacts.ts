/**
 * The address book as the contacts tools read it back, without what the
 * caller asked Ferni to forget (FORGET_EVERY_READER=on).
 *
 * Forget never reached the address book. On dev (2026-11-19, deleting off as
 * on prod) Ferni saved a caller's brother's new number as a contact, the
 * caller asked him to forget it, and on the next call he read it back from
 * the contact in both runs.
 *
 * A contact whose name, nicknames, relationship, company or notes are about a
 * forgotten topic ("forget Theo") is left out. A phone number or email that
 * is ("forget Theo's number") is left off the contact, which stays. Each
 * detail is read with what it is ("Theo's mobile cell phone number 435..."),
 * so a topic that names the detail matches it as well as one that is the
 * number itself. Every word of a topic must match, as in every reader: "Theo's
 * new number" needs the number topic forget adds beside it (forget-related.ts). Nothing is deleted; flag off, the contacts are unchanged.
 *
 * @module tools/scheduling/remembered-contacts
 */
import { keepRemembered } from '../../memory/index.js';
import { formatPhoneForDisplay, type Contact } from '../../services/contacts.js';

type Phone = Contact['phones'][number];
type Email = Contact['emails'][number];

type Part =
  | { contact: Contact; kind: 'contact' }
  | { contact: Contact; kind: 'phone'; phone: Phone }
  | { contact: Contact; kind: 'email'; email: Email };

function nameOf(c: Contact): string {
  return c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ');
}

/** What a part of a contact is about, in words a forget topic would use. */
function partText(part: Part): string {
  const c = part.contact;
  const name = nameOf(c);
  if (part.kind === 'phone') {
    const type = part.phone.type === 'mobile' ? 'mobile cell' : part.phone.type;
    // Both forms: the national "(435) 555-0142" matches a topic without the
    // country code ("4355550142", "435-555-0142"), the stored "+14355550142"
    // one with it ("+1 435 555 0142", "1-435-555-0142", "14355550142"). The
    // "or" keeps the two apart as words, whatever a matcher does with digits.
    const { number } = part.phone;
    return `${name}'s ${type} phone number ${formatPhoneForDisplay(number)} or ${number}`;
  }
  if (part.kind === 'email')
    return `${name}'s ${part.email.type} email address ${part.email.address}`;
  return [
    name,
    c.firstName,
    c.lastName,
    ...(c.nicknames ?? []),
    c.relationship,
    c.company,
    c.jobTitle,
    c.notes,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The contacts, in order, without what is about a forgotten topic (see the module doc). */
export async function rememberedContacts<C extends Contact>(
  userId: string,
  contacts: readonly C[]
): Promise<C[]> {
  if (contacts.length === 0) return [];
  const parts: Part[] = contacts.flatMap((contact): Part[] => [
    { contact, kind: 'contact' },
    // Older contacts can lack a list; a missing one reads as empty.
    ...(contact.phones ?? []).map((phone): Part => ({ contact, kind: 'phone', phone })),
    ...(contact.emails ?? []).map((email): Part => ({ contact, kind: 'email', email })),
  ]);
  const kept = new Set(await keepRemembered(userId, parts, partText));
  if (kept.size === parts.length) return [...contacts];
  return contacts.flatMap((contact) => {
    const own = parts.filter((p) => p.contact === contact);
    if (!own.some((p) => p.kind === 'contact' && kept.has(p))) return [];
    const phones = own.flatMap((p) => (p.kind === 'phone' && kept.has(p) ? [p.phone] : []));
    const emails = own.flatMap((p) => (p.kind === 'email' && kept.has(p) ? [p.email] : []));
    return [{ ...contact, phones, emails }];
  });
}
