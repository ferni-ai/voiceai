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

import { createLogger } from '../../utils/safe-logger.js';
import type { VisionAnalysisResult, VisualMemory } from './types.js';

const log = createLogger({ module: 'vision-analysis' });

// ============================================================================
// GOOGLE CLOUD VISION CLIENT
// ============================================================================

interface VisionClient {
  annotateImage: (request: {
    image: { content?: string; source?: { imageUri: string } };
    features: Array<{ type: string; maxResults?: number }>;
  }) => Promise<
    Array<{
      labelAnnotations?: Array<{ description: string; score: number }>;
      textAnnotations?: Array<{ description: string; confidence?: number }>;
      faceAnnotations?: Array<{
        detectionConfidence: number;
        joyLikelihood?: string;
        sorrowLikelihood?: string;
        angerLikelihood?: string;
        surpriseLikelihood?: string;
        boundingPoly?: { vertices: Array<{ x: number; y: number }> };
      }>;
      landmarkAnnotations?: Array<{
        description: string;
        score: number;
        locations?: Array<{ latLng: { latitude: number; longitude: number } }>;
      }>;
      logoAnnotations?: Array<{ description: string; score: number }>;
      webDetection?: {
        webEntities?: Array<{ description: string; score: number }>;
      };
      safeSearchAnnotation?: {
        adult: string;
        violence: string;
        medical: string;
      };
      imagePropertiesAnnotation?: {
        dominantColors?: {
          colors: Array<{
            color: { red: number; green: number; blue: number };
            pixelFraction: number;
          }>;
        };
      };
    }>
  >;
}

async function getVisionClient(): Promise<VisionClient | null> {
  try {
    // Dynamic import for Google Cloud Vision
    // @ts-expect-error - @google-cloud/vision may not be installed
    const vision = await import('@google-cloud/vision');
    const client = new vision.ImageAnnotatorClient();

    return {
      annotateImage: async (request) => {
        const [result] = await client.annotateImage(request);
        return [result];
      },
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Vision API not available');
    return null;
  }
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze an image using Cloud Vision API
 */
export async function analyzeImage(
  imageData: string, // Base64 encoded
  options: {
    detectLabels?: boolean;
    detectText?: boolean;
    detectFaces?: boolean;
    detectLandmarks?: boolean;
    detectLogos?: boolean;
    webDetection?: boolean;
    safeSearch?: boolean;
    imageProperties?: boolean;
  } = {}
): Promise<VisionAnalysisResult | null> {
  const client = await getVisionClient();
  if (!client) {
    log.warn('Vision API client not available');
    return null;
  }

  // Default to common features
  const {
    detectLabels = true,
    detectText = true,
    detectFaces = true,
    detectLandmarks = true,
    detectLogos = false,
    webDetection = false,
    safeSearch = true,
    imageProperties = false,
  } = options;

  try {
    log.debug('Analyzing image with Vision API');

    // Build feature requests
    const features: Array<{ type: string; maxResults?: number }> = [];

    if (detectLabels) features.push({ type: 'LABEL_DETECTION', maxResults: 15 });
    if (detectText) features.push({ type: 'TEXT_DETECTION' });
    if (detectFaces) features.push({ type: 'FACE_DETECTION', maxResults: 10 });
    if (detectLandmarks) features.push({ type: 'LANDMARK_DETECTION', maxResults: 5 });
    if (detectLogos) features.push({ type: 'LOGO_DETECTION', maxResults: 5 });
    if (webDetection) features.push({ type: 'WEB_DETECTION', maxResults: 10 });
    if (safeSearch) features.push({ type: 'SAFE_SEARCH_DETECTION' });
    if (imageProperties) features.push({ type: 'IMAGE_PROPERTIES' });

    const [response] = await client.annotateImage({
      image: { content: imageData },
      features,
    });

    // Build result
    const result: VisionAnalysisResult = {
      analyzedAt: new Date().toISOString(),
      labels: [],
    };

    // Labels
    if (response.labelAnnotations) {
      result.labels = response.labelAnnotations.map((label) => ({
        name: label.description,
        confidence: label.score,
      }));
    }

    // Text (OCR)
    if (response.textAnnotations && response.textAnnotations.length > 0) {
      const fullText = response.textAnnotations[0]?.description || '';
      const blocks = response.textAnnotations.slice(1).map((block) => ({
        text: block.description,
        confidence: block.confidence || 0.9,
      }));

      result.text = { fullText, blocks };
    }

    // Faces
    if (response.faceAnnotations) {
      result.faces = response.faceAnnotations.map((face) => {
        const emotions = {
          joy: likelihoodToNumber(face.joyLikelihood),
          sorrow: likelihoodToNumber(face.sorrowLikelihood),
          anger: likelihoodToNumber(face.angerLikelihood),
          surprise: likelihoodToNumber(face.surpriseLikelihood),
        };

        const bounds = face.boundingPoly?.vertices;
        const boundingBox =
          bounds && bounds.length >= 4
            ? {
                x: bounds[0].x || 0,
                y: bounds[0].y || 0,
                width: (bounds[2].x || 0) - (bounds[0].x || 0),
                height: (bounds[2].y || 0) - (bounds[0].y || 0),
              }
            : undefined;

        return {
          confidence: face.detectionConfidence,
          emotions,
          bounds: boundingBox,
        };
      });
    }

    // Landmarks
    if (response.landmarkAnnotations) {
      result.landmarks = response.landmarkAnnotations.map((landmark) => ({
        name: landmark.description,
        confidence: landmark.score,
        location: landmark.locations?.[0]?.latLng
          ? {
              latitude: landmark.locations[0].latLng.latitude,
              longitude: landmark.locations[0].latLng.longitude,
            }
          : undefined,
      }));
    }

    // Logos
    if (response.logoAnnotations) {
      result.logos = response.logoAnnotations.map((logo) => ({
        name: logo.description,
        confidence: logo.score,
      }));
    }

    // Web entities
    if (response.webDetection?.webEntities) {
      result.webEntities = response.webDetection.webEntities
        .filter((e) => e.description)
        .map((entity) => ({
          description: entity.description,
          score: entity.score,
        }));
    }

    // Safe search
    if (response.safeSearchAnnotation) {
      result.safeSearch = {
        adult: response.safeSearchAnnotation
          .adult as VisionAnalysisResult['safeSearch'] extends undefined
          ? never
          : NonNullable<VisionAnalysisResult['safeSearch']>['adult'],
        violence: response.safeSearchAnnotation
          .violence as VisionAnalysisResult['safeSearch'] extends undefined
          ? never
          : NonNullable<VisionAnalysisResult['safeSearch']>['violence'],
        medical: response.safeSearchAnnotation
          .medical as VisionAnalysisResult['safeSearch'] extends undefined
          ? never
          : NonNullable<VisionAnalysisResult['safeSearch']>['medical'],
      };
    }

    // Dominant colors
    if (response.imagePropertiesAnnotation?.dominantColors?.colors) {
      result.dominantColors = response.imagePropertiesAnnotation.dominantColors.colors
        .slice(0, 5)
        .map((color) => ({
          hex: rgbToHex(color.color.red, color.color.green, color.color.blue),
          percentPixels: color.pixelFraction * 100,
        }));
    }

    log.debug(
      {
        labelsCount: result.labels.length,
        hasText: !!result.text,
        facesCount: result.faces?.length || 0,
      },
      'Image analysis complete'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Vision API analysis failed');
    return null;
  }
}

// ============================================================================
// GENERATE AI DESCRIPTION
// ============================================================================

/**
 * Generate a human-readable description of an image from analysis
 */
export function generateImageDescription(analysis: VisionAnalysisResult): string {
  const parts: string[] = [];

  // Main subject from labels
  const topLabels = analysis.labels
    .filter((l) => l.confidence > 0.7)
    .slice(0, 5)
    .map((l) => l.name.toLowerCase());

  if (topLabels.length > 0) {
    parts.push(`An image showing: ${topLabels.join(', ')}`);
  }

  // People
  if (analysis.faces && analysis.faces.length > 0) {
    const faceCount = analysis.faces.length;
    const faceDesc = faceCount === 1 ? '1 person' : `${faceCount} people`;
    parts.push(`Contains ${faceDesc}`);

    // Emotions
    const emotions = analysis.faces[0]?.emotions;
    if (emotions) {
      const dominant = Object.entries(emotions)
        .filter(([_, score]) => score > 0.5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(([emotion]) => emotion);

      if (dominant.length > 0) {
        parts.push(`Appears to express ${dominant[0]}`);
      }
    }
  }

  // Location
  if (analysis.landmarks && analysis.landmarks.length > 0) {
    const landmark = analysis.landmarks[0];
    parts.push(`Location: ${landmark.name}`);
  }

  // Text content
  if (analysis.text?.fullText && analysis.text.fullText.length > 10) {
    const preview = analysis.text.fullText.slice(0, 100).replace(/\n/g, ' ');
    parts.push(`Contains text: "${preview}${analysis.text.fullText.length > 100 ? '...' : ''}"`);
  }

  // Logos
  if (analysis.logos && analysis.logos.length > 0) {
    const logoNames = analysis.logos.map((l) => l.name).join(', ');
    parts.push(`Logos/brands: ${logoNames}`);
  }

  return parts.join('. ') || 'An image';
}

/**
 * Categorize an image based on analysis
 */
export function categorizeImage(analysis: VisionAnalysisResult): VisualMemory['category'] {
  const labels = analysis.labels.map((l) => l.name.toLowerCase());
  const labelSet = new Set(labels);

  // Check for people
  if (analysis.faces && analysis.faces.length > 0) {
    return 'people';
  }

  // Check for places/travel
  if (analysis.landmarks && analysis.landmarks.length > 0) {
    return 'places';
  }

  // Check for documents
  if (analysis.text?.fullText && analysis.text.fullText.length > 200) {
    // Lots of text = probably a document
    return 'documents';
  }

  // Check for receipts
  if (
    labelSet.has('receipt') ||
    labelSet.has('ticket') ||
    (analysis.text?.fullText?.match(/\$[\d,]+\.\d{2}/) && analysis.text.fullText.length < 500)
  ) {
    return 'receipts';
  }

  // Check for achievements
  if (
    labelSet.has('certificate') ||
    labelSet.has('diploma') ||
    labelSet.has('trophy') ||
    labelSet.has('medal')
  ) {
    return 'achievements';
  }

  // Check for health
  if (
    labelSet.has('medical') ||
    labelSet.has('medicine') ||
    labelSet.has('hospital') ||
    analysis.safeSearch?.medical === 'LIKELY' ||
    analysis.safeSearch?.medical === 'VERY_LIKELY'
  ) {
    return 'health';
  }

  // Check for work
  if (
    labelSet.has('office') ||
    labelSet.has('meeting') ||
    labelSet.has('presentation') ||
    labelSet.has('computer')
  ) {
    return 'work';
  }

  // Default
  return 'memories';
}

// ============================================================================
// HELPERS
// ============================================================================

function likelihoodToNumber(likelihood?: string): number {
  switch (likelihood) {
    case 'VERY_UNLIKELY':
      return 0.1;
    case 'UNLIKELY':
      return 0.3;
    case 'POSSIBLE':
      return 0.5;
    case 'LIKELY':
      return 0.7;
    case 'VERY_LIKELY':
      return 0.9;
    default:
      return 0;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const visionAnalysis = {
  analyzeImage,
  generateImageDescription,
  categorizeImage,
};
