/**
 * Secure token encryption utilities (AES-256-GCM)
 */
import crypto from 'crypto';
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'Encryption' });
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
/**
 * Get encryption key from environment
 * Derives 32-byte key using SHA-256
 *
 * SECURITY: In production, OAUTH_ENCRYPTION_KEY is required.
 * OAuth tokens will not be stored without encryption in production.
 */
function getEncryptionKey() {
    const key = process.env.OAUTH_ENCRYPTION_KEY || process.env.LOG_HASH_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';
    if (!key) {
        if (isProduction) {
            log.error('SECURITY CRITICAL: OAUTH_ENCRYPTION_KEY must be set in production!');
            log.error('OAuth tokens cannot be stored without encryption. Generate with: openssl rand -hex 32');
            // In production, throw to prevent insecure token storage
            throw new Error('OAUTH_ENCRYPTION_KEY is required in production');
        }
        log.warn('SECURITY: OAUTH_ENCRYPTION_KEY not set - tokens stored without encryption (dev only)');
        return null;
    }
    return crypto.createHash('sha256').update(key).digest();
}
/**
 * Encrypt sensitive data before storing
 */
export function encryptData(data) {
    const key = getEncryptionKey();
    if (!key) {
        // Fallback to plain JSON if no key (development mode warning already logged)
        return JSON.stringify(data);
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const plaintext = JSON.stringify(data);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    const payload = {
        encrypted: true,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted,
    };
    return JSON.stringify(payload);
}
/**
 * Decrypt stored data
 */
export function decryptData(encryptedStr) {
    try {
        const parsed = JSON.parse(encryptedStr);
        // If not encrypted, return as-is (legacy/development mode)
        if (!parsed.encrypted) {
            return parsed;
        }
        const key = getEncryptionKey();
        if (!key) {
            log.warn('Cannot decrypt - no encryption key configured');
            return null;
        }
        const iv = Buffer.from(parsed.iv, 'base64');
        const authTag = Buffer.from(parsed.authTag, 'base64');
        const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(parsed.data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
    catch {
        // If decryption fails, try parsing as plain JSON (migration from old format)
        try {
            return JSON.parse(encryptedStr);
        }
        catch {
            log.error('Failed to decrypt or parse token data');
            return null;
        }
    }
}
/**
 * Check if data appears to be encrypted
 */
export function isEncrypted(data) {
    try {
        const parsed = JSON.parse(data);
        return parsed.encrypted === true && parsed.iv && parsed.authTag && parsed.data;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=encryption.js.map