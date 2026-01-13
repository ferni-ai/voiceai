/**
 * Entity Store Migration
 *
 * Migrates data from legacy fragmented collections into the unified entity store.
 *
 * Legacy collections (all storing overlapping people data):
 * - user_contacts (from contacts.ts)
 * - contact_relationships (from contact-relationship-service.ts)
 * - relationship_network (from superhuman/relationship-network.ts)
 * - relationship_nodes (from semantic-intelligence/relationship-graph.ts)
 * - guest_profiles (from jordan-planning-services.ts)
 * - network/relationships (from research tools)
 *
 * This migration:
 * 1. Reads all legacy collections
 * 2. Deduplicates entities (same person in multiple collections)
 * 3. Creates unified entities with merged data
 * 4. Preserves legacy IDs for backwards compatibility
 *
 * @module memory/entity-store/migration
 */
import { createLogger } from '../../utils/safe-logger.js';
import { createEntity, updateEntity, findEntityByAlias } from './storage.js';
const log = createLogger({ module: 'entity-store:migration' });
// ============================================================================
// FIRESTORE ACCESS
// ============================================================================
let db = null;
async function getFirestore() {
    if (db)
        return db;
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
}
// ============================================================================
// LEGACY COLLECTION READERS
// ============================================================================
/**
 * Read from user_contacts collection
 */
async function readUserContacts(userId) {
    const firestore = await getFirestore();
    try {
        const snapshot = await firestore.collection('user_contacts').doc(userId).collection('contacts').get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            userId,
            ...doc.data(),
        }));
    }
    catch (error) {
        log.warn({ userId, error: String(error) }, 'Failed to read user_contacts');
        return [];
    }
}
/**
 * Read from contact_relationships collection
 */
async function readContactRelationships(userId) {
    const firestore = await getFirestore();
    try {
        const snapshot = await firestore.collection('contact_relationships').where('userId', '==', userId).get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            userId,
            displayName: doc.data().name,
            phone: doc.data().phone,
            email: doc.data().email,
            relationship: doc.data().relationship,
            notes: doc.data().notes,
            createdAt: doc.data().createdAt?.toDate?.(),
            updatedAt: doc.data().updatedAt?.toDate?.(),
        }));
    }
    catch (error) {
        log.warn({ userId, error: String(error) }, 'Failed to read contact_relationships');
        return [];
    }
}
/**
 * Read from relationship_network collection (superhuman service)
 */
async function readRelationshipNetwork(userId) {
    const firestore = await getFirestore();
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('relationship_network')
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            userId,
            name: doc.data().name,
            type: doc.data().type,
            importance: doc.data().importance || 0.5,
            sentiment: doc.data().sentiment || 0,
            mentionCount: doc.data().mentionCount || 1,
            firstMentioned: doc.data().firstMentioned?.toDate?.(),
            lastMentioned: doc.data().lastMentioned?.toDate?.(),
            context: doc.data().context || [],
        }));
    }
    catch (error) {
        log.warn({ userId, error: String(error) }, 'Failed to read relationship_network');
        return [];
    }
}
/**
 * Read from relationship_nodes collection (semantic intelligence)
 */
async function readRelationshipNodes(userId) {
    const firestore = await getFirestore();
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('relationship_nodes')
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            userId,
            name: doc.data().name,
            type: doc.data().type || 'acquaintance',
            importance: doc.data().salience || 0.5,
            sentiment: doc.data().sentiment || 0,
            mentionCount: doc.data().mentionCount || 1,
            firstMentioned: doc.data().firstMentioned?.toDate?.(),
            lastMentioned: doc.data().lastMentioned?.toDate?.(),
        }));
    }
    catch (error) {
        log.warn({ userId, error: String(error) }, 'Failed to read relationship_nodes');
        return [];
    }
}
/**
 * Read from guest_profiles collection (Jordan's planning)
 */
async function readGuestProfiles(userId) {
    const firestore = await getFirestore();
    try {
        const snapshot = await firestore
            .collection('bogle_users')
            .doc(userId)
            .collection('guest_profiles')
            .get();
        return snapshot.docs.map((doc) => ({
            id: doc.id,
            userId,
            displayName: doc.data().name,
            relationship: doc.data().relationship,
            notes: doc.data().preferences || doc.data().notes,
        }));
    }
    catch (error) {
        log.warn({ userId, error: String(error) }, 'Failed to read guest_profiles');
        return [];
    }
}
/**
 * Normalize name for comparison
 */
function normalizeName(name) {
    return name.toLowerCase().trim().replace(/[^a-z\s]/g, '');
}
/**
 * Check if two candidates are likely the same person
 */
function isSamePerson(a, b) {
    // Same phone number
    if (a.phone && b.phone) {
        const phoneA = a.phone.replace(/\D/g, '').slice(-10);
        const phoneB = b.phone.replace(/\D/g, '').slice(-10);
        if (phoneA === phoneB)
            return true;
    }
    // Same email
    if (a.email && b.email) {
        if (a.email.toLowerCase() === b.email.toLowerCase())
            return true;
    }
    // Same name (normalized)
    const nameA = normalizeName(a.name);
    const nameB = normalizeName(b.name);
    if (nameA && nameB && nameA === nameB)
        return true;
    // Same specific relation (only one "mom", "brother", etc.)
    if (a.specificRelation && b.specificRelation) {
        if (a.specificRelation === b.specificRelation)
            return true;
    }
    return false;
}
/**
 * Group candidates that are the same person
 */
function deduplicateCandidates(candidates) {
    const groups = [];
    const assigned = new Set();
    for (let i = 0; i < candidates.length; i++) {
        if (assigned.has(i))
            continue;
        const group = [candidates[i]];
        assigned.add(i);
        for (let j = i + 1; j < candidates.length; j++) {
            if (assigned.has(j))
                continue;
            if (isSamePerson(candidates[i], candidates[j])) {
                group.push(candidates[j]);
                assigned.add(j);
            }
        }
        groups.push(group);
    }
    return groups;
}
/**
 * Merge a group of candidates into a single entity
 */
function mergeCandidates(group) {
    // Pick best name (prefer actual names over relationship terms)
    const RELATIONSHIP_TERMS = ['mom', 'dad', 'brother', 'sister', 'wife', 'husband', 'boss', 'friend'];
    let bestName = group[0].name;
    for (const candidate of group) {
        if (!RELATIONSHIP_TERMS.includes(candidate.name.toLowerCase()) &&
            RELATIONSHIP_TERMS.includes(bestName.toLowerCase())) {
            bestName = candidate.name;
        }
    }
    // Collect all aliases
    const aliases = new Set();
    for (const candidate of group) {
        aliases.add(candidate.name.toLowerCase());
        if (candidate.specificRelation) {
            aliases.add(candidate.specificRelation.toLowerCase());
            aliases.add(`my ${candidate.specificRelation.toLowerCase()}`);
        }
    }
    aliases.delete(bestName.toLowerCase()); // Don't include canonical name in aliases
    // Merge contact info
    const phone = group.find((c) => c.phone)?.phone;
    const email = group.find((c) => c.email)?.email;
    // Get relationship info
    const relationship = group.find((c) => c.relationship)?.relationship || 'other';
    const specificRelation = group.find((c) => c.specificRelation)?.specificRelation;
    // Aggregate stats
    const totalMentions = group.reduce((sum, c) => sum + c.mentionCount, 0);
    const maxImportance = Math.max(...group.map((c) => c.importance));
    const avgSentiment = group.reduce((sum, c) => sum + c.sentiment, 0) / group.length;
    // Get date range
    const firstMentioned = group
        .filter((c) => c.firstMentioned)
        .sort((a, b) => (a.firstMentioned?.getTime() || 0) - (b.firstMentioned?.getTime() || 0))[0]?.firstMentioned;
    const lastMentioned = group
        .filter((c) => c.lastMentioned)
        .sort((a, b) => (b.lastMentioned?.getTime() || 0) - (a.lastMentioned?.getTime() || 0))[0]?.lastMentioned;
    // Collect legacy IDs
    const legacyIds = {};
    for (const candidate of group) {
        switch (candidate.source) {
            case 'user_contacts':
                legacyIds.userContactId = candidate.legacyId;
                break;
            case 'contact_relationships':
                legacyIds.contactRelationshipId = candidate.legacyId;
                break;
            case 'relationship_network':
                legacyIds.relationshipNetworkId = candidate.legacyId;
                break;
            case 'guest_profiles':
                legacyIds.guestProfileId = candidate.legacyId;
                break;
        }
    }
    return {
        type: 'person',
        canonicalName: bestName,
        aliases: [...aliases],
        relationship: mapRelationshipType(relationship),
        specificRelation,
        contact: phone || email ? { phone, email } : undefined,
        source: 'migration',
        confidence: 0.85,
        salience: maxImportance,
        emotionalWeight: Math.abs(avgSentiment),
        mentionCount: totalMentions,
        firstMentionedAt: firstMentioned || new Date(),
        lastMentionedAt: lastMentioned || new Date(),
        topics: [],
        legacyIds,
    };
}
/**
 * Map legacy relationship strings to RelationshipType
 */
function mapRelationshipType(rel) {
    const normalized = rel.toLowerCase();
    if (['family', 'mother', 'father', 'brother', 'sister', 'son', 'daughter', 'aunt', 'uncle', 'cousin', 'grandmother', 'grandfather'].includes(normalized)) {
        return 'family';
    }
    if (['wife', 'husband', 'partner', 'boyfriend', 'girlfriend', 'romantic'].includes(normalized)) {
        return 'romantic';
    }
    if (['friend', 'bestfriend', 'buddy'].includes(normalized)) {
        return 'friend';
    }
    if (['colleague', 'coworker', 'boss', 'manager', 'employee'].includes(normalized)) {
        return 'colleague';
    }
    if (['professional', 'therapist', 'doctor', 'coach', 'mentor'].includes(normalized)) {
        return 'professional';
    }
    if (['acquaintance', 'neighbor', 'roommate'].includes(normalized)) {
        return 'acquaintance';
    }
    return 'other';
}
// ============================================================================
// MIGRATION RUNNER
// ============================================================================
/**
 * Migrate a single user's data to the unified entity store
 */
export async function migrateUser(userId, options = {}) {
    const startTime = Date.now();
    const result = {
        userId,
        entitiesCreated: 0,
        entitiesMerged: 0,
        mentionsCreated: 0,
        legacyCollections: {
            userContacts: 0,
            relationshipNetwork: 0,
            contactRelationships: 0,
            guestProfiles: 0,
            relationshipNodes: 0,
        },
        errors: [],
        duration: 0,
    };
    log.info({ userId, dryRun: options.dryRun }, 'Starting migration');
    try {
        // Step 1: Read all legacy collections
        const [userContacts, contactRelationships, relationshipNetwork, relationshipNodes, guestProfiles] = await Promise.all([
            readUserContacts(userId),
            readContactRelationships(userId),
            readRelationshipNetwork(userId),
            readRelationshipNodes(userId),
            readGuestProfiles(userId),
        ]);
        result.legacyCollections = {
            userContacts: userContacts.length,
            contactRelationships: contactRelationships.length,
            relationshipNetwork: relationshipNetwork.length,
            relationshipNodes: relationshipNodes.length,
            guestProfiles: guestProfiles.length,
        };
        log.info({ userId, ...result.legacyCollections }, 'Read legacy collections');
        // Step 2: Convert to candidates
        const candidates = [];
        for (const contact of userContacts) {
            candidates.push({
                name: contact.displayName || contact.name || 'Unknown',
                phone: contact.phone || contact.phones?.[0]?.number,
                email: contact.email || contact.emails?.[0]?.address,
                relationship: contact.relationship,
                specificRelation: contact.relationship,
                importance: 0.5,
                sentiment: 0,
                mentionCount: 1,
                legacyId: contact.id,
                source: 'user_contacts',
            });
        }
        for (const contact of contactRelationships) {
            candidates.push({
                name: contact.displayName || contact.name || 'Unknown',
                phone: contact.phone,
                email: contact.email,
                relationship: contact.relationship,
                specificRelation: contact.notes, // notes often contains specific relation like "mom"
                importance: 0.5,
                sentiment: 0,
                mentionCount: 1,
                legacyId: contact.id,
                source: 'contact_relationships',
            });
        }
        for (const person of relationshipNetwork) {
            candidates.push({
                name: person.name,
                relationship: person.type,
                specificRelation: person.type,
                importance: person.importance,
                sentiment: person.sentiment,
                mentionCount: person.mentionCount,
                firstMentioned: person.firstMentioned,
                lastMentioned: person.lastMentioned,
                context: person.context,
                legacyId: person.id,
                source: 'relationship_network',
            });
        }
        for (const node of relationshipNodes) {
            candidates.push({
                name: node.name,
                relationship: node.type,
                importance: node.importance,
                sentiment: node.sentiment,
                mentionCount: node.mentionCount,
                firstMentioned: node.firstMentioned,
                lastMentioned: node.lastMentioned,
                legacyId: node.id,
                source: 'relationship_nodes',
            });
        }
        for (const guest of guestProfiles) {
            candidates.push({
                name: guest.displayName || guest.name || 'Unknown',
                relationship: guest.relationship,
                importance: 0.5,
                sentiment: 0,
                mentionCount: 1,
                legacyId: guest.id,
                source: 'guest_profiles',
            });
        }
        log.info({ userId, totalCandidates: candidates.length }, 'Created candidates');
        // Step 3: Deduplicate
        const groups = deduplicateCandidates(candidates);
        const mergedCount = candidates.length - groups.length;
        log.info({ userId, groups: groups.length, merged: mergedCount }, 'Deduplicated candidates');
        // Step 4: Create entities
        if (!options.dryRun) {
            for (const group of groups) {
                try {
                    const entityData = mergeCandidates(group);
                    // Check if entity already exists in new store
                    const existing = await findEntityByAlias(userId, entityData.canonicalName, 'person');
                    if (existing) {
                        // Update existing
                        await updateEntity(userId, existing.id, entityData);
                        log.debug({ entityId: existing.id, name: entityData.canonicalName }, 'Updated existing entity');
                    }
                    else {
                        // Create new
                        await createEntity(userId, {
                            ...entityData,
                            userId,
                            createdAt: entityData.firstMentionedAt || new Date(),
                            updatedAt: new Date(),
                        });
                        result.entitiesCreated++;
                    }
                }
                catch (error) {
                    result.errors.push(`Failed to create entity for ${group[0].name}: ${error}`);
                    log.warn({ userId, name: group[0].name, error: String(error) }, 'Failed to create entity');
                }
            }
        }
        result.entitiesMerged = mergedCount;
        result.duration = Date.now() - startTime;
        log.info({
            userId,
            entitiesCreated: result.entitiesCreated,
            entitiesMerged: result.entitiesMerged,
            duration: result.duration,
            errors: result.errors.length,
        }, 'Migration complete');
        return result;
    }
    catch (error) {
        result.errors.push(String(error));
        result.duration = Date.now() - startTime;
        log.error({ userId, error: String(error) }, 'Migration failed');
        return result;
    }
}
/**
 * Run migration for all users (batch job)
 */
export async function migrateAllUsers(options) {
    const firestore = await getFirestore();
    const limit = options.limit || 100;
    let query = firestore.collection('bogle_users').limit(limit);
    if (options.startAfter) {
        query = query.startAfter(options.startAfter);
    }
    const snapshot = await query.get();
    const userIds = snapshot.docs.map((doc) => doc.id);
    log.info({ userCount: userIds.length, dryRun: options.dryRun }, 'Starting batch migration');
    const results = {
        totalUsers: userIds.length,
        successfulUsers: 0,
        failedUsers: 0,
        totalEntities: 0,
        totalMerged: 0,
        errors: [],
    };
    for (const userId of userIds) {
        try {
            const result = await migrateUser(userId, { dryRun: options.dryRun });
            if (result.errors.length === 0) {
                results.successfulUsers++;
            }
            else {
                results.failedUsers++;
                results.errors.push(...result.errors);
            }
            results.totalEntities += result.entitiesCreated;
            results.totalMerged += result.entitiesMerged;
        }
        catch (error) {
            results.failedUsers++;
            results.errors.push(`User ${userId}: ${error}`);
        }
    }
    log.info(results, 'Batch migration complete');
    return results;
}
// ============================================================================
// EXPORT
// ============================================================================
export { readUserContacts, readContactRelationships, readRelationshipNetwork, readRelationshipNodes, readGuestProfiles };
//# sourceMappingURL=migration.js.map