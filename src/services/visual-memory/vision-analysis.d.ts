/**
 * Vision Analysis Service
 *
 * > "Better than human means understanding what you show me."
 *
 * Analyzes images using Google Cloud Vision API to extract
 * semantic understanding for visual memories.
 *
 * @module services/visual-memory/vision-analysis
 */
import type { VisionAnalysisResult, VisualMemory } from './types.js';
/**
 * Analyze an image using Cloud Vision API
 */
export declare function analyzeImage(imageData: string, // Base64 encoded
options?: {
    detectLabels?: boolean;
    detectText?: boolean;
    detectFaces?: boolean;
    detectLandmarks?: boolean;
    detectLogos?: boolean;
    webDetection?: boolean;
    safeSearch?: boolean;
    imageProperties?: boolean;
}): Promise<VisionAnalysisResult | null>;
/**
 * Generate a human-readable description of an image from analysis
 */
export declare function generateImageDescription(analysis: VisionAnalysisResult): string;
/**
 * Categorize an image based on analysis
 */
export declare function categorizeImage(analysis: VisionAnalysisResult): VisualMemory['category'];
export declare const visionAnalysis: {
    analyzeImage: typeof analyzeImage;
    generateImageDescription: typeof generateImageDescription;
    categorizeImage: typeof categorizeImage;
};
//# sourceMappingURL=vision-analysis.d.ts.map