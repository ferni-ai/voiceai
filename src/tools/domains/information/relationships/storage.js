/**
 * Relationship Storage
 *
 * Persistence layer for relationship data.
 * Uses Firestore when available, falls back to in-memory storage.
 */
import { getLogger } from '../../../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// STORAGE ABSTRACTION
// ============================================================================
let db = null;
let firestoreInitAttempted = false;
/**
 * Initialize Firestore connection (async)
 */
async function initFirestore() {
    if (db)
        return db;
    if (firestoreInitAttempted)
        return null;
    firestoreInitAttempted = true;
    try {
        const firebaseAdmin = await import('firebase-admin');
        if (firebaseAdmin.apps?.length > 0) {
            db = firebaseAdmin.firestore();
            log.info('Firestore initialized for relationships storage');
            return db;
        }
        log.warn('Firebase Admin not initialized, using in-memory storage for relationships');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Firestore not available, using in-memory storage');
    }
    return null;
}
// In-memory fallback
const inMemoryRelationships = new Map();
// ============================================================================
// CRUD OPERATIONS
// ============================================================================
/**
 * Get all relationships for a user
 */
export async function getRelationships(userId) {
    const firestore = await initFirestore();
    if (firestore) {
        try {
            const snapshot = await firestore
                .collection('users')
                .doc(userId)
                .collection('relationships')
                .get();
            return snapshot.docs.map((doc) => ({
                ...doc.data(),
                id: doc.id,
                createdAt: doc.data().createdAt?.toDate?.() || new Date(),
                updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
                lastContact: doc.data().lastContact?.toDate?.(),
            }));
        }
        catch (error) {
            log.error({ userId, error: String(error) }, 'Failed to get relationships from Firestore');
        }
    }
    // Fallback to in-memory
    const userRelationships = inMemoryRelationships.get(userId);
    return userRelationships ? Array.from(userRelationships.values()) : [];
}
/**
 * Get a specific relationship
 */
export async function getRelationship(userId, relationshipId) {
    const firestore = await initFirestore();
    if (firestore) {
        try {
            const doc = await firestore
                .collection('users')
                .doc(userId)
                .collection('relationships')
                .doc(relationshipId)
                .get();
            if (doc.exists) {
                const data = doc.data();
                return {
                    ...data,
                    id: doc.id,
                    createdAt: data?.createdAt?.toDate?.() || new Date(),
                    updatedAt: data?.updatedAt?.toDate?.() || new Date(),
                    lastContact: data?.lastContact?.toDate?.(),
                };
            }
        }
        catch (error) {
            log.error({ userId, relationshipId, error: String(error) }, 'Failed to get relationship');
        }
    }
    // Fallback to in-memory
    const userRelationships = inMemoryRelationships.get(userId);
    return userRelationships?.get(relationshipId) || null;
}
/**
 * Find relationship by name
 */
export async function findRelationshipByName(userId, name) {
    const relationships = await getRelationships(userId);
    const lowerName = name.toLowerCase();
    return (relationships.find((r) => r.name.toLowerCase() === lowerName || r.nickname?.toLowerCase() === lowerName) || null);
}
/**
 * Add or update a relationship
 */
export async function saveRelationship(userId, relationship) {
    const now = new Date();
    const id = relationship.id || `rel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fullRelationship = {
        ...relationship,
        id,
        createdAt: now,
        updatedAt: now,
    };
    const firestore = await initFirestore();
    if (firestore) {
        try {
            const docRef = firestore.collection('users').doc(userId).collection('relationships').doc(id);
            // Check if exists for createdAt
            const existing = await docRef.get();
            if (existing.exists) {
                fullRelationship.createdAt = existing.data()?.createdAt?.toDate?.() || now;
            }
            await docRef.set({
                ...fullRelationship,
                createdAt: fullRelationship.createdAt,
                updatedAt: fullRelationship.updatedAt,
                lastContact: fullRelationship.lastContact || null,
            });
            log.info({ userId, relationshipId: id, name: relationship.name }, 'Saved relationship');
        }
        catch (error) {
            log.error({ userId, error: String(error) }, 'Failed to save relationship to Firestore');
        }
    }
    // Always update in-memory for fallback
    if (!inMemoryRelationships.has(userId)) {
        inMemoryRelationships.set(userId, new Map());
    }
    inMemoryRelationships.get(userId).set(id, fullRelationship);
    return fullRelationship;
}
/**
 * Delete a relationship
 */
export async function deleteRelationship(userId, relationshipId) {
    const firestore = await initFirestore();
    if (firestore) {
        try {
            await firestore
                .collection('users')
                .doc(userId)
                .collection('relationships')
                .doc(relationshipId)
                .delete();
            log.info({ userId, relationshipId }, 'Deleted relationship');
        }
        catch (error) {
            log.error({ userId, relationshipId, error: String(error) }, 'Failed to delete relationship');
            return false;
        }
    }
    // Update in-memory
    const userRelationships = inMemoryRelationships.get(userId);
    userRelationships?.delete(relationshipId);
    return true;
}
/**
 * Update last contact date
 */
export async function updateLastContact(userId, relationshipId, date = new Date()) {
    const relationship = await getRelationship(userId, relationshipId);
    if (relationship) {
        await saveRelationship(userId, {
            ...relationship,
            lastContact: date,
        });
        log.info({ userId, relationshipId, date }, 'Updated last contact');
    }
}
/**
 * Add a gift record
 */
export async function addGiftRecord(userId, relationshipId, gift) {
    const relationship = await getRelationship(userId, relationshipId);
    if (relationship) {
        const newGift = {
            ...gift,
            id: `gift_${Date.now()}`,
        };
        await saveRelationship(userId, {
            ...relationship,
            giftHistory: [...(relationship.giftHistory || []), newGift],
        });
        log.info({ userId, relationshipId, gift: gift.gift }, 'Added gift record');
    }
}
/**
 * Add an important date
 */
export async function addImportantDate(userId, relationshipId, date) {
    const relationship = await getRelationship(userId, relationshipId);
    if (relationship) {
        const newDate = {
            ...date,
            id: `date_${Date.now()}`,
        };
        await saveRelationship(userId, {
            ...relationship,
            importantDates: [...(relationship.importantDates || []), newDate],
        });
        log.info({ userId, relationshipId, description: date.description }, 'Added important date');
    }
}
// ============================================================================
// QUERY HELPERS
// ============================================================================
/**
 * Get relationships with upcoming birthdays
 */
export async function getUpcomingBirthdays(userId, daysAhead = 30) {
    const relationships = await getRelationships(userId);
    const today = new Date();
    const results = [];
    for (const rel of relationships) {
        if (!rel.birthday)
            continue;
        // Calculate days until birthday
        let daysUntil;
        const birthdayThisYear = new Date(today.getFullYear(), rel.birthday.month - 1, rel.birthday.day);
        if (birthdayThisYear < today) {
            // Birthday passed this year, calculate for next year
            const birthdayNextYear = new Date(today.getFullYear() + 1, rel.birthday.month - 1, rel.birthday.day);
            daysUntil = Math.ceil((birthdayNextYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        else {
            daysUntil = Math.ceil((birthdayThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }
        if (daysUntil <= daysAhead) {
            results.push({ relationship: rel, daysUntil });
        }
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
/**
 * Get relationships needing contact
 */
export async function getRelationshipsNeedingContact(userId) {
    const relationships = await getRelationships(userId);
    const today = new Date();
    const results = [];
    for (const rel of relationships) {
        if (!rel.lastContact || !rel.targetContactFrequency)
            continue;
        const daysSince = Math.floor((today.getTime() - rel.lastContact.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > rel.targetContactFrequency) {
            const overdueDays = daysSince - rel.targetContactFrequency;
            let urgency;
            if (overdueDays > rel.targetContactFrequency) {
                urgency = 'urgent';
            }
            else if (overdueDays > rel.targetContactFrequency * 0.5) {
                urgency = 'moderate';
            }
            else {
                urgency = 'gentle';
            }
            results.push({ relationship: rel, daysSinceContact: daysSince, urgency });
        }
    }
    return results.sort((a, b) => {
        const urgencyOrder = { urgent: 0, moderate: 1, gentle: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
}
/**
 * Get relationships by favorite team
 */
export async function getRelationshipsByTeam(userId, teamName) {
    const relationships = await getRelationships(userId);
    const lowerTeam = teamName.toLowerCase();
    return relationships.filter((rel) => rel.favoriteTeams.some((t) => t.toLowerCase().includes(lowerTeam)));
}
//# sourceMappingURL=storage.js.map