/**
 * LinkedIn API Client
 *
 * Handles authentication and posting to LinkedIn via OAuth 2.0.
 * Uses LinkedIn Marketing API v2.
 */
interface LinkedInPostResult {
    success: boolean;
    postId?: string;
    url?: string;
    error?: string;
}
interface LinkedInPostParams {
    content: string;
    visibility: 'public' | 'connections';
    mediaUrls?: string[];
}
export declare class LinkedInClient {
    private credentials;
    private readonly baseUrl;
    constructor();
    private loadCredentials;
    isConfigured(): boolean;
    post(params: LinkedInPostParams): Promise<LinkedInPostResult>;
    deletePost(postId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    static getAuthorizationUrl(state: string): string;
    static exchangeCodeForTokens(code: string): Promise<{
        accessToken: string;
        expiresIn: number;
    } | null>;
    getProfile(): Promise<{
        personUrn: string;
        name: string;
    } | null>;
}
export default LinkedInClient;
//# sourceMappingURL=linkedin-client.d.ts.map