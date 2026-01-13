/**
 * Visual Memory Types
 *
 * > "Better than human means remembering every photo you shared."
 *
 * Types for multi-modal visual memory - photos, screenshots, drawings
 * that become part of Ferni's understanding of your life.
 *
 * @module services/visual-memory/types
 */
/**
 * A visual memory entry (photo, screenshot, etc.)
 */
export interface VisualMemory {
    /** Unique ID */
    id: string;
    /** User ID */
    userId: string;
    /** When the memory was created */
    createdAt: string;
    /** When the visual was originally captured (if known) */
    capturedAt?: string;
    /** Storage URL (Cloud Storage) */
    storageUrl: string;
    /** Thumbnail URL */
    thumbnailUrl?: string;
    /** File type */
    mimeType: string;
    /** File size in bytes */
    sizeBytes: number;
    /** Original filename (if provided) */
    originalFilename?: string;
    /** Source of the visual */
    source: 'shared_in_chat' | 'photo_picker' | 'camera' | 'screenshot' | 'file_upload' | 'receipt' | 'drawing';
    /** Session ID when shared */
    sessionId?: string;
    /** Conversation context when shared */
    conversationContext?: string;
    /** User's description when sharing */
    userDescription?: string;
    /** Tags from user */
    userTags?: string[];
    /** Vision API analysis result */
    visionAnalysis?: VisionAnalysisResult;
    /** Detected objects/labels */
    detectedLabels?: string[];
    /** Detected text (OCR) */
    detectedText?: string;
    /** Detected faces count */
    facesDetected?: number;
    /** Location from EXIF or GPS */
    location?: {
        latitude: number;
        longitude: number;
        placeName?: string;
    };
    /** AI-generated description */
    aiDescription?: string;
    /** Extracted entities (people, places, things) */
    entities?: Array<{
        type: 'person' | 'place' | 'thing' | 'event' | 'organization';
        name: string;
        confidence: number;
    }>;
    /** Emotional context/mood detected */
    emotionalContext?: string;
    /** Life category */
    category?: 'people' | 'places' | 'achievements' | 'memories' | 'documents' | 'receipts' | 'health' | 'work' | 'goals' | 'misc';
    /** Embedding vector for semantic search */
    embedding?: number[];
    /** Related conversation memory IDs */
    relatedMemoryIds?: string[];
    /** Related visual memory IDs */
    relatedVisualIds?: string[];
    /** People identified in this visual */
    peopleIdentified?: string[];
    /** Recurring theme/topic */
    theme?: string;
    /** User marked as private */
    isPrivate: boolean;
    /** Auto-delete after date */
    expiresAt?: string;
    /** Deletion reason if deleted */
    deletedReason?: string;
    /** Soft-deleted at */
    deletedAt?: string;
}
/**
 * Vision API analysis result
 */
export interface VisionAnalysisResult {
    /** Processing timestamp */
    analyzedAt: string;
    /** Labels/objects detected */
    labels: Array<{
        name: string;
        confidence: number;
    }>;
    /** Text detected (OCR) */
    text?: {
        fullText: string;
        blocks: Array<{
            text: string;
            confidence: number;
        }>;
    };
    /** Faces detected */
    faces?: Array<{
        confidence: number;
        emotions?: {
            joy: number;
            sorrow: number;
            anger: number;
            surprise: number;
        };
        bounds?: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
    }>;
    /** Landmarks detected */
    landmarks?: Array<{
        name: string;
        confidence: number;
        location?: {
            latitude: number;
            longitude: number;
        };
    }>;
    /** Logos detected */
    logos?: Array<{
        name: string;
        confidence: number;
    }>;
    /** Web entities (reverse image search) */
    webEntities?: Array<{
        description: string;
        score: number;
    }>;
    /** Safe search results */
    safeSearch?: {
        adult: 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';
        violence: 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';
        medical: 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';
    };
    /** Colors detected */
    dominantColors?: Array<{
        hex: string;
        percentPixels: number;
    }>;
    /** Image properties */
    properties?: {
        width: number;
        height: number;
        format: string;
    };
}
/**
 * Request to upload a visual
 */
export interface VisualUploadRequest {
    /** User ID */
    userId: string;
    /** Base64 encoded image data */
    imageData: string;
    /** MIME type */
    mimeType: string;
    /** Source of the visual */
    source: VisualMemory['source'];
    /** Optional description */
    description?: string;
    /** Optional tags */
    tags?: string[];
    /** Session context */
    sessionId?: string;
    /** Conversation context */
    conversationContext?: string;
    /** Mark as private */
    isPrivate?: boolean;
}
/**
 * Response from visual upload
 */
export interface VisualUploadResponse {
    /** Whether upload succeeded */
    success: boolean;
    /** Visual memory ID */
    memoryId?: string;
    /** Error message if failed */
    error?: string;
    /** Quick analysis preview */
    quickAnalysis?: {
        description: string;
        labels: string[];
        detectedText?: string;
    };
}
/**
 * Search request for visual memories
 */
export interface VisualSearchRequest {
    /** User ID */
    userId: string;
    /** Natural language query */
    query?: string;
    /** Filter by category */
    category?: VisualMemory['category'];
    /** Filter by source */
    source?: VisualMemory['source'];
    /** Filter by date range */
    dateRange?: {
        start: string;
        end: string;
    };
    /** Filter by people */
    people?: string[];
    /** Filter by location (approximate) */
    location?: {
        latitude: number;
        longitude: number;
        radiusKm: number;
    };
    /** Maximum results */
    limit?: number;
    /** Use semantic search (embedding) */
    semantic?: boolean;
}
/**
 * Search result
 */
export interface VisualSearchResult {
    /** Matching visual memories */
    results: Array<{
        memory: VisualMemory;
        relevanceScore: number;
        matchReason?: string;
    }>;
    /** Total count */
    totalCount: number;
    /** Search execution time */
    searchTimeMs: number;
}
/**
 * Visual context to inject into LLM
 */
export interface VisualMemoryContext {
    /** Whether user has any visual memories */
    hasVisualMemories: boolean;
    /** Count of visual memories */
    totalCount: number;
    /** Recent visuals shared */
    recentVisuals?: Array<{
        id: string;
        description: string;
        category?: string;
        sharedAt: string;
    }>;
    /** Relevant visuals for current context */
    relevantVisuals?: Array<{
        id: string;
        description: string;
        relevanceReason: string;
    }>;
    /** People frequently photographed */
    frequentPeople?: string[];
    /** Recent places photographed */
    recentPlaces?: string[];
}
/**
 * User preferences for visual memory
 */
export interface VisualMemoryPreferences {
    /** Visual memory enabled */
    enabled: boolean;
    /** Auto-analyze shared images */
    autoAnalyze: boolean;
    /** Store images permanently (vs session-only) */
    storePermanently: boolean;
    /** Enable face detection */
    enableFaceDetection: boolean;
    /** Enable location extraction */
    enableLocationExtraction: boolean;
    /** Default privacy setting */
    defaultPrivate: boolean;
    /** Auto-delete after days (0 = never) */
    autoDeleteDays: number;
    /** Last updated */
    updatedAt: string;
}
//# sourceMappingURL=types.d.ts.map