/**
 * Social Content Generator
 *
 * Uses Claude to generate platform-specific social media content
 * from blog posts, topics, or announcements.
 */
interface GenerateParams {
    source: 'blog' | 'topic' | 'announcement';
    blogUrl?: string;
    topic?: string;
    announcement?: string;
    platforms: ('twitter' | 'linkedin' | 'instagram')[];
    tone: 'professional' | 'casual' | 'thought-leadership';
}
interface GeneratedContent {
    twitter?: {
        thread: string[];
        characterCounts: number[];
    };
    linkedin?: {
        post: string;
        hashtags: string[];
    };
    instagram?: {
        slides: string[];
        caption: string;
        hashtags: string[];
    };
}
export declare function generateSocialContentFromBlog(params: GenerateParams): Promise<GeneratedContent>;
export default generateSocialContentFromBlog;
//# sourceMappingURL=content-generator.d.ts.map