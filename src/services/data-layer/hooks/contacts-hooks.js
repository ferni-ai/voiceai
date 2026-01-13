/**
 * Contacts & Relationships Hooks
 *
 * Auto-indexing hooks for contact and relationship data.
 * Enables semantic search over people and relationship context.
 *
 * @module services/data-layer/hooks/contacts-hooks
 */
import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
// ============================================================================
// CONTACTS
// ============================================================================
/**
 * Track contacts and their relationships
 */
export const onContactChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'contact',
    contentBuilder: (c) => joinNonEmpty([
        `Contact: ${c.name}.`,
        `Relationship: ${c.relationship}.`,
        formatField('Notes', c.notes),
        c.importantDates?.length
            ? `Important dates: ${c.importantDates.map((d) => `${d.label}: ${d.date}`).join(', ')}.`
            : '',
    ]),
    metadataExtractor: (c) => ({
        relationship: c.relationship,
        communicationPreference: c.communicationPreference,
    }),
});
// ============================================================================
// RELATIONSHIP NOTES
// ============================================================================
/**
 * Track notes about relationships
 */
export const onRelationshipNoteChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'relationship_note',
    contentBuilder: (r) => joinNonEmpty([`Note about ${r.contactName}: ${r.note}.`, formatField('Context', r.context)]),
    metadataExtractor: (r) => ({
        contactName: r.contactName,
        date: r.date,
    }),
});
// ============================================================================
// GIFT IDEAS
// ============================================================================
/**
 * Track gift ideas for contacts
 */
export const onGiftIdeaChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'gift_idea',
    contentBuilder: (g) => joinNonEmpty([
        `Gift idea for ${g.forContact}: ${g.idea}.`,
        formatField('Occasion', g.occasion),
        formatField('Price range', g.priceRange),
    ]),
    metadataExtractor: (g) => ({
        forContact: g.forContact,
        occasion: g.occasion,
        status: g.status,
    }),
    shouldSkip: (g) => g.status === 'given',
});
/**
 * Track important dates for contacts
 */
export const onImportantDateChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'important_date',
    contentBuilder: (d) => joinNonEmpty([
        `Important date for ${d.contactName}: ${d.label}.`,
        `Date: ${formatDate(d.date)}.`,
        `Type: ${d.type}.`,
        formatField('Notes', d.notes),
    ]),
    metadataExtractor: (d) => ({
        contactName: d.contactName,
        type: d.type,
        date: d.date,
    }),
});
/**
 * Track interactions with contacts
 */
export const onContactInteractionChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'contact_interaction',
    contentBuilder: (i) => joinNonEmpty([
        `Interaction with ${i.contactName}: ${i.interactionType}.`,
        `Summary: ${i.summary}.`,
        `Date: ${formatDate(i.date)}.`,
        formatField('Sentiment', i.sentiment),
    ]),
    metadataExtractor: (i) => ({
        contactName: i.contactName,
        interactionType: i.interactionType,
        sentiment: i.sentiment,
        followUpNeeded: i.followUpNeeded,
    }),
});
/**
 * Track relationship health status
 */
export const onRelationshipHealthChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'relationship_health',
    contentBuilder: (r) => joinNonEmpty([
        `Relationship with ${r.contactName}: ${r.health}.`,
        `Last contact: ${formatDate(r.lastContact)}.`,
        `Observations: ${r.observations}.`,
        r.suggestions?.length ? `Suggestions: ${r.suggestions.join(', ')}.` : '',
    ]),
    metadataExtractor: (r) => ({
        contactName: r.contactName,
        health: r.health,
        lastContact: r.lastContact,
    }),
});
/**
 * Track family member information
 */
export const onFamilyMemberChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'family_member',
    contentBuilder: (f) => joinNonEmpty([
        `Family member: ${f.name}.`,
        `Relation: ${f.relation}.`,
        formatField('Notes', f.notes),
        f.importantInfo?.length ? `Important: ${f.importantInfo.join(', ')}.` : '',
    ]),
    metadataExtractor: (f) => ({
        relation: f.relation,
        livingWith: f.livingWith,
    }),
});
/**
 * Track shared memories with friends
 */
export const onFriendMemoryChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'friend_memory',
    contentBuilder: (f) => joinNonEmpty([
        `Memory with ${f.friendName}: ${f.memory}.`,
        `Shared experience: ${f.sharedExperience}.`,
        formatField('Significance', f.emotionalSignificance),
    ]),
    metadataExtractor: (f) => ({
        friendName: f.friendName,
        emotionalSignificance: f.emotionalSignificance,
        date: f.date,
    }),
});
/**
 * Track professional contacts
 */
export const onProfessionalContactChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'professional_contact',
    contentBuilder: (p) => joinNonEmpty([
        `Professional contact: ${p.name}.`,
        formatField('Company', p.company),
        formatField('Role', p.role),
        `Relationship: ${p.relationship}.`,
        formatField('How met', p.howMet),
    ]),
    metadataExtractor: (p) => ({
        company: p.company,
        role: p.role,
        lastContact: p.lastContact,
    }),
});
/**
 * Track communication preferences for contacts
 */
export const onCommunicationPreferenceChange = createDomainHook({
    storeType: 'contacts',
    entityType: 'communication_preference',
    contentBuilder: (c) => joinNonEmpty([
        `${c.contactName} prefers: ${c.preferredChannel}.`,
        formatField('Best times', c.bestTimes),
        formatField('Response style', c.responseStyle),
        formatField('Notes', c.notes),
    ]),
    metadataExtractor: (c) => ({
        contactName: c.contactName,
        preferredChannel: c.preferredChannel,
    }),
});
// ============================================================================
// EXPORTS
// ============================================================================
export const contactsHooks = {
    onContactChange,
    onRelationshipNoteChange,
    onGiftIdeaChange,
    onImportantDateChange,
    onContactInteractionChange,
    onRelationshipHealthChange,
    onFamilyMemberChange,
    onFriendMemoryChange,
    onProfessionalContactChange,
    onCommunicationPreferenceChange,
};
export default contactsHooks;
//# sourceMappingURL=contacts-hooks.js.map