/**
 * Environment Configuration
 *
 * Unified configuration that works seamlessly in:
 * - Local development (in-memory or Docker services)
 * - Google Cloud Run (Firestore + Memorystore)
 *
 * Auto-detects environment and selects appropriate backends.
 */
export type Environment = 'development' | 'production' | 'test';
export declare function detectEnvironment(): Environment;
export declare function isGoogleCloud(): boolean;
/**
 * Get the GCP project ID from any of the common env var names
 * Handles: GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, GCP_PROJECT_ID, FIREBASE_PROJECT_ID
 */
export declare function getGCPProjectId(): string | undefined;
/**
 * Get the Firestore database ID (defaults to '(default)')
 */
export declare function getFirestoreDatabase(): string;
export interface AppConfig {
    environment: Environment;
    isGoogleCloud: boolean;
    personaId: string;
    storage: {
        type: 'memory' | 'firestore' | 'postgres';
        postgresUrl?: string;
        firestoreProject?: string;
    };
    cache: {
        enabled: boolean;
        redisUrl?: string;
    };
    features: {
        /** Enable/disable all music functionality (tools, playback, ambient music) */
        musicEnabled: boolean;
    };
    apis: {
        livekitUrl: string;
        livekitApiKey: string;
        livekitApiSecret: string;
        googleApiKey: string;
        cartesiaApiKey: string;
    };
    payments: {
        stripeSecretKey?: string;
        stripeWebhookSecret?: string;
        stripePublishableKey?: string;
        seedFundPrices: {
            seed5?: string;
            seed10?: string;
            seed25?: string;
            seed50?: string;
        };
        subscriptionPrices: {
            foundingMember?: string;
            foundingPatron?: string;
        };
    };
    urls: {
        webhookBaseUrl?: string;
        dashboardUrl?: string;
    };
    integrations: {
        alphaVantage?: string;
        sendgrid?: string;
        resend?: string;
        hume?: string;
        openai?: string;
        slackAlertsWebhook?: string;
        twilio?: {
            accountSid: string;
            authToken: string;
            phoneNumber: string;
        };
        spotify?: {
            clientId: string;
            clientSecret: string;
            refreshToken: string;
        };
        yelp?: string;
        delivery?: {
            doordashApiKey?: string;
            doordashDeveloperId?: string;
            doordashKeyId?: string;
            doordashSigningSecret?: string;
            uberClientId?: string;
            uberClientSecret?: string;
        };
        sip?: {
            trunkId: string;
            domain: string;
        };
    };
    cloudStorage: {
        voiceBucket?: string;
    };
}
/**
 * Load configuration from environment
 * Auto-detects the best settings for current environment
 */
export declare function loadConfig(): AppConfig;
/**
 * Validate configuration and report issues
 */
export declare function validateConfig(config: AppConfig): {
    valid: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * Print configuration summary (safe - no secrets)
 */
export declare function printConfigSummary(config: AppConfig): void;
/**
 * Check if music functionality is enabled
 * Returns false by default - set MUSIC_ENABLED=true to enable
 */
export declare function isMusicEnabled(): boolean;
export declare function getConfig(): AppConfig;
export declare function resetConfig(): void;
declare const _default: {
    load: typeof loadConfig;
    get: typeof getConfig;
    validate: typeof validateConfig;
    print: typeof printConfigSummary;
    detectEnvironment: typeof detectEnvironment;
    isGoogleCloud: typeof isGoogleCloud;
    isMusicEnabled: typeof isMusicEnabled;
    getGCPProjectId: typeof getGCPProjectId;
    getFirestoreDatabase: typeof getFirestoreDatabase;
};
export default _default;
//# sourceMappingURL=environment.d.ts.map