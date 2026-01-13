/**
 * Calendar Credential Encryption
 *
 * Provides encryption/decryption for sensitive calendar credentials
 * like Apple app-specific passwords and OAuth tokens.
 *
 * Uses AES-256-GCM for authenticated encryption.
 *
 * @module calendar/utils/encryption
 */
export interface EncryptedData {
    /** Encrypted content (base64) */
    encrypted: string;
    /** Initialization vector (base64) */
    iv: string;
    /** Authentication tag (base64) */
    tag: string;
    /** Version for future algorithm changes */
    version: number;
}
/**
 * Encrypt a string value
 */
export declare function encrypt(plaintext: string): EncryptedData;
/**
 * Decrypt an encrypted value
 */
export declare function decrypt(data: EncryptedData): string;
/**
 * Check if a value is encrypted
 */
export declare function isEncrypted(value: unknown): value is EncryptedData;
/**
 * Encrypt an object's sensitive fields
 */
export declare function encryptFields<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T;
/**
 * Decrypt an object's encrypted fields
 */
export declare function decryptFields<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T;
export interface EncryptedAppleCredentials {
    appleId: string;
    appSpecificPassword: EncryptedData;
    principalUrl?: string;
    calendars?: Array<{
        url: string;
        displayName: string;
        ctag?: string;
    }>;
    lastValidated?: string;
}
/**
 * Encrypt Apple credentials before storage
 */
export declare function encryptAppleCredentials(credentials: {
    appleId: string;
    appSpecificPassword: string;
    principalUrl?: string;
    calendars?: Array<{
        url: string;
        displayName: string;
        ctag?: string;
    }>;
    lastValidated?: string;
}): EncryptedAppleCredentials;
/**
 * Decrypt Apple credentials after retrieval
 */
export declare function decryptAppleCredentials(encrypted: EncryptedAppleCredentials): {
    appleId: string;
    appSpecificPassword: string;
    principalUrl?: string;
    calendars?: Array<{
        url: string;
        displayName: string;
        ctag?: string;
    }>;
    lastValidated?: string;
};
export interface EncryptedOAuthTokens {
    accessToken: EncryptedData;
    refreshToken: EncryptedData;
    expiresAt: number;
    email?: string;
    displayName?: string;
}
/**
 * Encrypt OAuth tokens before storage
 */
export declare function encryptOAuthTokens(tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email?: string;
    displayName?: string;
}): EncryptedOAuthTokens;
/**
 * Decrypt OAuth tokens after retrieval
 */
export declare function decryptOAuthTokens(encrypted: EncryptedOAuthTokens): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email?: string;
    displayName?: string;
};
declare const _default: {
    encrypt: typeof encrypt;
    decrypt: typeof decrypt;
    isEncrypted: typeof isEncrypted;
    encryptFields: typeof encryptFields;
    decryptFields: typeof decryptFields;
    encryptAppleCredentials: typeof encryptAppleCredentials;
    decryptAppleCredentials: typeof decryptAppleCredentials;
    encryptOAuthTokens: typeof encryptOAuthTokens;
    decryptOAuthTokens: typeof decryptOAuthTokens;
};
export default _default;
//# sourceMappingURL=encryption.d.ts.map