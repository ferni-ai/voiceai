/**
 * Firestore Utilities
 *
 * Helper functions for working with Firestore.
 *
 * IMPORTANT: Firestore doesn't accept `undefined` values in documents.
 * Use `removeUndefined()` or `cleanForFirestore()` before writing.
 *
 * @module utils/firestore-utils
 */
/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 *
 * @example
 * ```typescript
 * await docRef.set(removeUndefined({
 *   name: user.name,
 *   email: user.email,
 *   phone: user.phone, // might be undefined - will be filtered out
 * }));
 * ```
 */
export function removeUndefined(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Deep remove undefined values from an object (recursive)
 *
 * Use this when you have nested objects that might contain undefined values.
 *
 * @example
 * ```typescript
 * await docRef.set(deepRemoveUndefined({
 *   user: {
 *     name: 'John',
 *     settings: {
 *       theme: undefined, // will be removed
 *       lang: 'en',
 *     }
 *   }
 * }));
 * ```
 */
export function deepRemoveUndefined(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => deepRemoveUndefined(item));
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                result[key] = deepRemoveUndefined(value);
            }
        }
        return result;
    }
    return obj;
}
/**
 * Clean an object for Firestore by:
 * 1. Removing undefined values
 * 2. Converting Date objects to ISO strings
 * 3. Handling nested objects recursively
 *
 * This is the safest way to prepare data for Firestore writes.
 *
 * @example
 * ```typescript
 * await docRef.set(cleanForFirestore({
 *   name: user.name,
 *   createdAt: new Date(),
 *   metadata: {
 *     source: undefined, // removed
 *     version: 1,
 *   }
 * }));
 * ```
 */
export function cleanForFirestore(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (obj instanceof Date) {
        return obj.toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => cleanForFirestore(item));
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                result[key] = cleanForFirestore(value);
            }
        }
        return result;
    }
    return obj;
}
