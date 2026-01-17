/**
 * Custom Agent API Types
 *
 * Shared types for the custom agent API routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';

// Re-export from types module
export type {
  CreateCustomAgentRequest,
  CustomAgent,
  CustomAgentVoice,
} from '../../types/custom-agent-api.js';

/**
 * Route handler function signature
 */
export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  segments: string[],
  parsedUrl: URL
) => Promise<boolean>;

/**
 * Voice upload request body
 */
export interface VoiceUploadBody {
  audio: string;
  mimeType: string;
  filename?: string;
}

/**
 * Voice clone request body
 */
export interface VoiceCloneBody {
  uploadId?: string;
  userName: string;
}

/**
 * Journal entry request body
 */
export interface JournalEntryBody {
  audio: string;
  mimeType?: string;
  mood?: string;
  context?: string;
}

/**
 * Memory request body
 */
export interface MemoryBody {
  type: string;
  content: string;
  audioUrl?: string;
  title?: string;
  phrase?: string;
  context?: string;
  mood?: string;
  keywords?: string[];
  themes?: string[];
  emotions?: string[];
}
