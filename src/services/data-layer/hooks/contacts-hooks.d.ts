/**
 * Contacts & Relationships Hooks
 *
 * Auto-indexing hooks for contact and relationship data.
 * Enables semantic search over people and relationship context.
 *
 * @module services/data-layer/hooks/contacts-hooks
 */
import type { ContactEntity, RelationshipNoteEntity, GiftIdeaEntity } from '../types.js';
/**
 * Track contacts and their relationships
 */
export declare const onContactChange: import("../hook-generator.js").DomainHook<ContactEntity>;
/**
 * Track notes about relationships
 */
export declare const onRelationshipNoteChange: import("../hook-generator.js").DomainHook<RelationshipNoteEntity>;
/**
 * Track gift ideas for contacts
 */
export declare const onGiftIdeaChange: import("../hook-generator.js").DomainHook<GiftIdeaEntity>;
interface ImportantDateEntity {
    contactName: string;
    date: string;
    type: 'birthday' | 'anniversary' | 'memorial' | 'achievement' | 'other';
    label: string;
    notes?: string;
    reminderDays?: number;
}
/**
 * Track important dates for contacts
 */
export declare const onImportantDateChange: import("../hook-generator.js").DomainHook<ImportantDateEntity>;
interface ContactInteractionEntity {
    contactName: string;
    interactionType: 'call' | 'message' | 'meeting' | 'email' | 'social';
    summary: string;
    date: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    followUpNeeded?: boolean;
}
/**
 * Track interactions with contacts
 */
export declare const onContactInteractionChange: import("../hook-generator.js").DomainHook<ContactInteractionEntity>;
interface RelationshipHealthEntity {
    contactName: string;
    health: 'thriving' | 'stable' | 'needs-attention' | 'strained';
    lastContact: string;
    observations: string;
    suggestions?: string[];
}
/**
 * Track relationship health status
 */
export declare const onRelationshipHealthChange: import("../hook-generator.js").DomainHook<RelationshipHealthEntity>;
interface FamilyMemberEntity {
    name: string;
    relation: string;
    notes?: string;
    livingWith?: boolean;
    importantInfo?: string[];
}
/**
 * Track family member information
 */
export declare const onFamilyMemberChange: import("../hook-generator.js").DomainHook<FamilyMemberEntity>;
interface FriendMemoryEntity {
    friendName: string;
    memory: string;
    sharedExperience: string;
    date?: string;
    emotionalSignificance?: 'minor' | 'meaningful' | 'major';
}
/**
 * Track shared memories with friends
 */
export declare const onFriendMemoryChange: import("../hook-generator.js").DomainHook<FriendMemoryEntity>;
interface ProfessionalContactEntity {
    name: string;
    company?: string;
    role?: string;
    relationship: string;
    howMet?: string;
    notes?: string;
    lastContact?: string;
}
/**
 * Track professional contacts
 */
export declare const onProfessionalContactChange: import("../hook-generator.js").DomainHook<ProfessionalContactEntity>;
interface CommunicationPreferenceEntity {
    contactName: string;
    preferredChannel: 'call' | 'text' | 'email' | 'in-person' | 'video';
    bestTimes?: string;
    responseStyle?: string;
    notes?: string;
}
/**
 * Track communication preferences for contacts
 */
export declare const onCommunicationPreferenceChange: import("../hook-generator.js").DomainHook<CommunicationPreferenceEntity>;
export declare const contactsHooks: {
    onContactChange: import("../hook-generator.js").DomainHook<ContactEntity>;
    onRelationshipNoteChange: import("../hook-generator.js").DomainHook<RelationshipNoteEntity>;
    onGiftIdeaChange: import("../hook-generator.js").DomainHook<GiftIdeaEntity>;
    onImportantDateChange: import("../hook-generator.js").DomainHook<ImportantDateEntity>;
    onContactInteractionChange: import("../hook-generator.js").DomainHook<ContactInteractionEntity>;
    onRelationshipHealthChange: import("../hook-generator.js").DomainHook<RelationshipHealthEntity>;
    onFamilyMemberChange: import("../hook-generator.js").DomainHook<FamilyMemberEntity>;
    onFriendMemoryChange: import("../hook-generator.js").DomainHook<FriendMemoryEntity>;
    onProfessionalContactChange: import("../hook-generator.js").DomainHook<ProfessionalContactEntity>;
    onCommunicationPreferenceChange: import("../hook-generator.js").DomainHook<CommunicationPreferenceEntity>;
};
export default contactsHooks;
//# sourceMappingURL=contacts-hooks.d.ts.map