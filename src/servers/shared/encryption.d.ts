/**
 * Secure token encryption utilities (AES-256-GCM)
 */
/**
 * Encrypt sensitive data before storing
 */
export declare function encryptData<T>(data: T): string;
/**
 * Decrypt stored data
 */
export declare function decryptData<T>(encryptedStr: string): T | null;
/**
 * Check if data appears to be encrypted
 */
export declare function isEncrypted(data: string): boolean;
//# sourceMappingURL=encryption.d.ts.map