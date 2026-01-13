/**
 * Privacy & Cryptographic Utilities
 *
 * Privacy-preserving functions for handling sensitive user data.
 * Designed to be "better than human" at protecting user information.
 *
 * Core Principles:
 * 1. Minimize data - Only store what's absolutely needed
 * 2. Hash identifiers - Phone numbers, emails are stored as hashes
 * 3. Encrypt at rest - Sensitive fields are encrypted
 * 4. Audit access - All sensitive data access is logged
 *
 * PERSISTENCE: Token vault is persisted to Firestore for durability.
 *
 * @module PrivacyCrypto
 */
/**
 * Hash a phone number for storage and lookup.
 *
 * Uses HMAC-SHA256 with a secret key to create a one-way hash
 * that can still be used for lookups (deterministic).
 *
 * @param phoneNumber - E.164 format phone number (+15551234567)
 * @returns Hashed phone number (hex string)
 *
 * @example
 * const hash = hashPhoneNumber('+15551234567');
 * // Returns: 'ph_a1b2c3d4e5f6...' (64 char hex)
 */
export declare function hashPhoneNumber(phoneNumber: string): string;
/**
 * Verify a phone number matches a stored hash
 *
 * @param phoneNumber - Plain phone number to check
 * @param storedHash - Previously hashed phone number
 * @returns true if phone matches hash
 */
export declare function verifyPhoneHash(phoneNumber: string, storedHash: string): boolean;
/**
 * Hash an email address for storage
 *
 * @param email - Email address
 * @returns Hashed email (hex string)
 */
export declare function hashEmail(email: string): string;
/**
 * Verify an email matches a stored hash
 */
export declare function verifyEmailHash(email: string, storedHash: string): boolean;
/**
 * Encrypt sensitive data
 *
 * Uses AES-256-GCM with a random IV and derived key.
 * Output format: base64(salt + iv + authTag + ciphertext)
 *
 * @param plaintext - Data to encrypt (string or JSON-serializable object)
 * @returns Encrypted data as base64 string
 */
export declare function encryptSensitive(plaintext: string | Record<string, unknown>): Promise<string>;
/**
 * Decrypt sensitive data
 *
 * @param encryptedData - Data encrypted with encryptSensitive()
 * @returns Decrypted string (or parsed JSON if it was an object)
 */
export declare function decryptSensitive<T = string>(encryptedData: string): Promise<T>;
/**
 * Encrypt a voice sketch for storage
 * Voice sketches are biometric-adjacent data and should be encrypted
 */
export declare function encryptVoiceSketch(voiceSketch: {
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchStdDev: number;
    speakingRateMean: number;
    pauseFrequency: number;
    avgPauseDuration: number;
    spectralCentroidMean: number;
    spectralCentroidStdDev: number;
    spectralRolloffMean: number;
    energyMean: number;
    energyStdDev: number;
    samplesAnalyzed: number;
    totalDurationMs: number;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
}): Promise<string>;
/**
 * Decrypt a voice sketch for use
 */
export declare function decryptVoiceSketch(encryptedSketch: string): Promise<{
    pitchMean: number;
    pitchMin: number;
    pitchMax: number;
    pitchStdDev: number;
    speakingRateMean: number;
    pauseFrequency: number;
    avgPauseDuration: number;
    spectralCentroidMean: number;
    spectralCentroidStdDev: number;
    spectralRolloffMean: number;
    energyMean: number;
    energyStdDev: number;
    samplesAnalyzed: number;
    totalDurationMs: number;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
}>;
/**
 * Tokenize a sensitive value
 * Returns a random token that can be used to retrieve the original value
 *
 * @param value - Sensitive value to tokenize
 * @param category - Category for the token (e.g., 'phone', 'email')
 * @returns Token that maps to the value
 */
export declare function tokenize(value: string, category: string): string;
/**
 * Tokenize a sensitive value (async version that checks Firestore first)
 */
export declare function tokenizeAsync(value: string, category: string): Promise<string>;
/**
 * Detokenize to get original value (sync - from cache)
 */
export declare function detokenize(token: string): string | null;
/**
 * Detokenize to get original value (async - checks Firestore)
 */
export declare function detokenizeAsync(token: string): Promise<string | null>;
/**
 * Strip PII from an object for logging
 */
export declare function stripPII<T extends Record<string, unknown>>(obj: T, fieldsToStrip?: string[]): Partial<T>;
/**
 * Mask a phone number for display
 * +15551234567 -> +1 (***) ***-4567
 */
export declare function maskPhoneNumber(phone: string): string;
/**
 * Mask an email for display
 * user@example.com -> u***@e***.com
 */
export declare function maskEmail(email: string): string;
/**
 * Generate a cryptographically secure random string
 */
export declare function generateSecureToken(length?: number): string;
/**
 * Generate a URL-safe random string
 */
export declare function generateUrlSafeToken(length?: number): string;
/**
 * Generate a short, human-readable code (e.g., for verification)
 */
export declare function generateVerificationCode(length?: number): string;
declare const _default: {
    hashPhoneNumber: typeof hashPhoneNumber;
    verifyPhoneHash: typeof verifyPhoneHash;
    maskPhoneNumber: typeof maskPhoneNumber;
    hashEmail: typeof hashEmail;
    verifyEmailHash: typeof verifyEmailHash;
    maskEmail: typeof maskEmail;
    encryptSensitive: typeof encryptSensitive;
    decryptSensitive: typeof decryptSensitive;
    encryptVoiceSketch: typeof encryptVoiceSketch;
    decryptVoiceSketch: typeof decryptVoiceSketch;
    tokenize: typeof tokenize;
    detokenize: typeof detokenize;
    stripPII: typeof stripPII;
    generateSecureToken: typeof generateSecureToken;
    generateUrlSafeToken: typeof generateUrlSafeToken;
    generateVerificationCode: typeof generateVerificationCode;
};
export default _default;
//# sourceMappingURL=privacy-crypto.d.ts.map