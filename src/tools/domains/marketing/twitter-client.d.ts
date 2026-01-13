/**
 * Twitter/X API Client
 *
 * Handles authentication and posting to Twitter via OAuth 2.0.
 * Uses Twitter API v2.
 */
interface TwitterPostResult {
    success: boolean;
    tweetIds?: string[];
    url?: string;
    error?: string;
}
export declare class TwitterClient {
    private credentials;
    private readonly baseUrl;
    constructor();
    private loadCredentials;
    isConfigured(): boolean;
    postThread(tweets: string[]): Promise<TwitterPostResult>;
    private postSingleTweet;
    deleteTweet(tweetId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    static getAuthorizationUrl(state: string): string;
    static exchangeCodeForTokens(code: string, codeVerifier: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    } | null>;
}
export default TwitterClient;
//# sourceMappingURL=twitter-client.d.ts.map