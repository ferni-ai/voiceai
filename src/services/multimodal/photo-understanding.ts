/**
 * Photo Understanding Service - Multi-Modal Visual Intelligence
 *
 * Enables Ferni to understand photos shared by users.
 * Uses Google Cloud Vision API for analysis, then injects context into conversations.
 *
 * Use Cases:
 * - "Remember this receipt" → OCR + expense tracking
 * - "Who's in this photo?" → Face detection + relationship context
 * - "What's this plant?" → Object identification
 * - "Check out this view" → Scene description for memory
 *
 * @module services/multimodal/photo-understanding
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'PhotoUnderstanding' });

// ============================================================================
// Types
// ============================================================================

export interface PhotoAnalysisRequest {
  userId: string;
  imageSource: ImageSource;
  analysisTypes?: AnalysisType[];
  context?: string; // User's prompt or context
}

export type ImageSource =
  | { type: 'url'; url: string }
  | { type: 'base64'; data: string; mimeType: string }
  | { type: 'gcs'; bucket: string; path: string };

export type AnalysisType =
  | 'labels' // Object/scene labels
  | 'text' // OCR
  | 'faces' // Face detection
  | 'landmarks' // Famous places
  | 'logos' // Brand logos
  | 'objects' // Object localization
  | 'safe_search' // Content moderation
  | 'colors' // Dominant colors
  | 'crop_hints' // Image cropping suggestions
  | 'web' // Web search for similar images;

export interface PhotoAnalysisResult {
  success: boolean;
  imageId: string;
  timestamp: string;

  // Analysis results
  labels?: Array<{ description: string; score: number }>;
  text?: { fullText: string; blocks: TextBlock[] };
  faces?: FaceAnnotation[];
  landmarks?: Array<{ description: string; score: number; location?: LatLng }>;
  logos?: Array<{ description: string; score: number }>;
  objects?: Array<{ name: string; score: number; boundingBox: BoundingBox }>;
  safeSearch?: SafeSearchResult;
  colors?: Array<{ color: Color; score: number; pixelFraction: number }>;
  webEntities?: Array<{ description: string; score: number }>;

  // Synthesized understanding
  summary: string; // Human-readable summary
  suggestedActions?: string[]; // What Ferni might do with this
  memoryContext?: string; // Context to inject into conversation

  error?: string;
}

interface TextBlock {
  text: string;
  boundingBox?: BoundingBox;
  confidence?: number;
}

interface FaceAnnotation {
  confidence: number;
  boundingBox: BoundingBox;
  emotions: {
    joy: Likelihood;
    sorrow: Likelihood;
    anger: Likelihood;
    surprise: Likelihood;
  };
  headwear?: boolean;
  landmarks?: Array<{ type: string; position: { x: number; y: number; z: number } }>;
}

type Likelihood = 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

interface BoundingBox {
  vertices: Array<{ x: number; y: number }>;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface Color {
  red: number;
  green: number;
  blue: number;
}

interface SafeSearchResult {
  adult: Likelihood;
  spoof: Likelihood;
  medical: Likelihood;
  violence: Likelihood;
  racy: Likelihood;
}

interface VisualMemory {
  id: string;
  userId: string;
  imageId: string;
  thumbnailUrl?: string;
  analysis: PhotoAnalysisResult;
  userContext?: string;
  createdAt: string;
  tags?: string[];
}

// ============================================================================
// Google Vision API Integration
// ============================================================================

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Call Google Vision API
 */
async function callVisionAPI(
  imageSource: ImageSource,
  features: Array<{ type: string; maxResults?: number }>
): Promise<Record<string, unknown> | null> {
  if (!GOOGLE_API_KEY) {
    log.warn('Google API key not configured');
    return null;
  }

  // Build image payload
  let image: Record<string, unknown>;

  if (imageSource.type === 'url') {
    image = { source: { imageUri: imageSource.url } };
  } else if (imageSource.type === 'base64') {
    image = { content: imageSource.data };
  } else if (imageSource.type === 'gcs') {
    image = { source: { gcsImageUri: `gs://${imageSource.bucket}/${imageSource.path}` } };
  } else {
    return null;
  }

  try {
    const response = await fetch(`${VISION_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image, features }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.status}`);
    }

    const data = await response.json();
    return data.responses?.[0] || null;
  } catch (error) {
    log.error({ error: String(error) }, 'Vision API call failed');
    return null;
  }
}

/**
 * Map analysis type to Vision API feature
 */
function analysisTypeToFeature(
  type: AnalysisType
): { type: string; maxResults?: number } {
  const mapping: Record<AnalysisType, { type: string; maxResults?: number }> = {
    labels: { type: 'LABEL_DETECTION', maxResults: 20 },
    text: { type: 'TEXT_DETECTION' },
    faces: { type: 'FACE_DETECTION', maxResults: 10 },
    landmarks: { type: 'LANDMARK_DETECTION', maxResults: 5 },
    logos: { type: 'LOGO_DETECTION', maxResults: 5 },
    objects: { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
    safe_search: { type: 'SAFE_SEARCH_DETECTION' },
    colors: { type: 'IMAGE_PROPERTIES' },
    crop_hints: { type: 'CROP_HINTS' },
    web: { type: 'WEB_DETECTION', maxResults: 10 },
  };

  return mapping[type];
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze a photo
 */
export async function analyzePhoto(
  request: PhotoAnalysisRequest
): Promise<PhotoAnalysisResult> {
  const startTime = Date.now();
  const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Default to comprehensive analysis
  const analysisTypes = request.analysisTypes || [
    'labels',
    'text',
    'faces',
    'objects',
    'safe_search',
  ];

  const features = analysisTypes.map(analysisTypeToFeature);

  const result: PhotoAnalysisResult = {
    success: false,
    imageId,
    timestamp: new Date().toISOString(),
    summary: '',
  };

  try {
    const visionResponse = await callVisionAPI(request.imageSource, features);

    if (!visionResponse) {
      result.error = 'Vision API unavailable';
      return result;
    }

    // Parse labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawResponse = visionResponse as any;
    if (rawResponse.labelAnnotations) {
      result.labels = rawResponse.labelAnnotations.map(
        (l: { description: string; score: number }) => ({
          description: l.description,
          score: l.score,
        })
      );
    }

    // Parse text (OCR)
    if (rawResponse.textAnnotations) {
      result.text = {
        fullText: rawResponse.textAnnotations[0]?.description || '',
        blocks: rawResponse.textAnnotations.slice(1).map(
          (t: { description: string; boundingPoly: { vertices: unknown[] } }) => ({
            text: t.description,
            boundingBox: t.boundingPoly,
          })
        ),
      };
    }

    // Parse faces
    if (rawResponse.faceAnnotations) {
      result.faces = rawResponse.faceAnnotations.map(
        (f: {
          detectionConfidence: number;
          boundingPoly: { vertices: unknown[] };
          joyLikelihood: Likelihood;
          sorrowLikelihood: Likelihood;
          angerLikelihood: Likelihood;
          surpriseLikelihood: Likelihood;
          headwearLikelihood: Likelihood;
        }) => ({
          confidence: f.detectionConfidence,
          boundingBox: f.boundingPoly,
          emotions: {
            joy: f.joyLikelihood,
            sorrow: f.sorrowLikelihood,
            anger: f.angerLikelihood,
            surprise: f.surpriseLikelihood,
          },
          headwear: f.headwearLikelihood === 'LIKELY' || f.headwearLikelihood === 'VERY_LIKELY',
        })
      );
    }

    // Parse objects
    if (rawResponse.localizedObjectAnnotations) {
      result.objects = rawResponse.localizedObjectAnnotations.map(
        (o: {
          name: string;
          score: number;
          boundingPoly: { normalizedVertices: unknown[] };
        }) => ({
          name: o.name,
          score: o.score,
          boundingBox: o.boundingPoly,
        })
      );
    }

    // Parse safe search
    if (rawResponse.safeSearchAnnotation) {
      result.safeSearch = rawResponse.safeSearchAnnotation;
    }

    // Parse landmarks
    if (rawResponse.landmarkAnnotations) {
      result.landmarks = rawResponse.landmarkAnnotations.map(
        (l: {
          description: string;
          score: number;
          locations?: Array<{ latLng: { latitude: number; longitude: number } }>;
        }) => ({
          description: l.description,
          score: l.score,
          location: l.locations?.[0]?.latLng,
        })
      );
    }

    // Parse logos
    if (rawResponse.logoAnnotations) {
      result.logos = rawResponse.logoAnnotations.map(
        (l: { description: string; score: number }) => ({
          description: l.description,
          score: l.score,
        })
      );
    }

    // Parse web entities
    if (rawResponse.webDetection?.webEntities) {
      result.webEntities = rawResponse.webDetection.webEntities
        .filter((e: { description?: string }) => e.description)
        .map((e: { description: string; score: number }) => ({
          description: e.description,
          score: e.score,
        }));
    }

    // Generate summary and context
    const synthesis = synthesizeUnderstanding(result, request.context);
    result.summary = synthesis.summary;
    result.suggestedActions = synthesis.suggestedActions;
    result.memoryContext = synthesis.memoryContext;

    result.success = true;

    // Store in visual memory
    await storeVisualMemory(request.userId, result, request.context);

    const duration = Date.now() - startTime;
    log.info(
      {
        imageId,
        userId: request.userId,
        labelCount: result.labels?.length || 0,
        hasText: !!result.text?.fullText,
        faceCount: result.faces?.length || 0,
        duration,
      },
      'Photo analysis completed'
    );
  } catch (error) {
    result.error = String(error);
    log.error({ error: String(error), imageId }, 'Photo analysis failed');
  }

  return result;
}

/**
 * Synthesize understanding from raw analysis
 */
function synthesizeUnderstanding(
  result: PhotoAnalysisResult,
  userContext?: string
): {
  summary: string;
  suggestedActions: string[];
  memoryContext: string;
} {
  const summaryParts: string[] = [];
  const suggestedActions: string[] = [];

  // Process labels for general description
  if (result.labels && result.labels.length > 0) {
    const topLabels = result.labels
      .slice(0, 5)
      .map((l) => l.description)
      .join(', ');
    summaryParts.push(`I see: ${topLabels}`);
  }

  // Process text (receipts, documents, signs)
  if (result.text?.fullText) {
    const textLength = result.text.fullText.length;
    if (textLength > 0) {
      summaryParts.push(`Contains text (${textLength} characters)`);

      // Check if it looks like a receipt
      const lowerText = result.text.fullText.toLowerCase();
      if (
        lowerText.includes('total') ||
        lowerText.includes('subtotal') ||
        lowerText.includes('$')
      ) {
        suggestedActions.push('Track this expense');
        suggestedActions.push('Add receipt to budget');
      }

      // Check if it looks like a business card
      if (lowerText.includes('@') || lowerText.includes('phone') || lowerText.includes('email')) {
        suggestedActions.push('Save as a contact');
      }
    }
  }

  // Process faces
  if (result.faces && result.faces.length > 0) {
    const faceCount = result.faces.length;
    summaryParts.push(
      `${faceCount} ${faceCount === 1 ? 'person' : 'people'} in the photo`
    );

    // Check emotions
    const happyFaces = result.faces.filter(
      (f) => f.emotions.joy === 'LIKELY' || f.emotions.joy === 'VERY_LIKELY'
    ).length;
    if (happyFaces > 0) {
      summaryParts.push(`${happyFaces} looking happy`);
    }

    suggestedActions.push('Remember who this is');
    suggestedActions.push('Add to visual memory');
  }

  // Process landmarks
  if (result.landmarks && result.landmarks.length > 0) {
    const landmark = result.landmarks[0];
    summaryParts.push(`Location: ${landmark.description}`);
    suggestedActions.push('Remember this place');
  }

  // Process logos
  if (result.logos && result.logos.length > 0) {
    const brands = result.logos.map((l) => l.description).join(', ');
    summaryParts.push(`Brands: ${brands}`);
  }

  // Generate memory context for conversation injection
  const memoryContext = generateMemoryContext(result, userContext);

  return {
    summary: summaryParts.join('. ') || 'I processed the image but couldn\'t identify specific details.',
    suggestedActions,
    memoryContext,
  };
}

/**
 * Generate context string for conversation injection
 */
function generateMemoryContext(result: PhotoAnalysisResult, userContext?: string): string {
  const contextParts: string[] = [];

  if (userContext) {
    contextParts.push(`User said: "${userContext}"`);
  }

  // Add key findings
  if (result.labels && result.labels.length > 0) {
    contextParts.push(
      `Photo contains: ${result.labels.slice(0, 5).map((l) => l.description).join(', ')}`
    );
  }

  if (result.text?.fullText) {
    // Include truncated text
    const textPreview =
      result.text.fullText.length > 200
        ? result.text.fullText.substring(0, 200) + '...'
        : result.text.fullText;
    contextParts.push(`Text in image: "${textPreview}"`);
  }

  if (result.faces && result.faces.length > 0) {
    contextParts.push(`People in photo: ${result.faces.length}`);
  }

  if (result.landmarks && result.landmarks.length > 0) {
    contextParts.push(`Location: ${result.landmarks[0].description}`);
  }

  return contextParts.join('\n');
}

/**
 * Store analysis in visual memory
 */
async function storeVisualMemory(
  userId: string,
  analysis: PhotoAnalysisResult,
  userContext?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const memory: VisualMemory = {
    id: analysis.imageId,
    userId,
    imageId: analysis.imageId,
    analysis,
    userContext,
    createdAt: new Date().toISOString(),
    tags: analysis.labels?.slice(0, 10).map((l) => l.description),
  };

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .doc(memory.id)
      .set(memory);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store visual memory');
  }
}

/**
 * Search visual memories
 */
export async function searchVisualMemories(
  userId: string,
  query: string,
  limit = 10
): Promise<VisualMemory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    // Simple tag-based search (could be enhanced with embeddings)
    const queryLower = query.toLowerCase();
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const memories = snapshot.docs.map((doc) => doc.data() as VisualMemory);

    // Filter by tag match
    return memories
      .filter((m) =>
        m.tags?.some((tag) => tag.toLowerCase().includes(queryLower)) ||
        m.analysis.summary.toLowerCase().includes(queryLower)
      )
      .slice(0, limit);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Visual memory search failed');
    return [];
  }
}

/**
 * Get recent visual memories for context
 */
export async function getRecentVisualMemories(
  userId: string,
  limit = 5
): Promise<VisualMemory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('visual_memories')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as VisualMemory);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent visual memories');
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export const photoUnderstanding = {
  analyze: analyzePhoto,
  search: searchVisualMemories,
  getRecent: getRecentVisualMemories,
};

export default photoUnderstanding;
