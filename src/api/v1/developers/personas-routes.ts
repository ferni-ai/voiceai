/**
 * Developer Console Persona Routes
 *
 * Provides CRUD operations for developer personas:
 * - GET    /api/v1/developers/personas           - List all personas
 * - POST   /api/v1/developers/personas           - Create draft
 * - GET    /api/v1/developers/personas/:id       - Get specific persona
 * - PUT    /api/v1/developers/personas/:id       - Update draft
 * - POST   /api/v1/developers/personas/:id/validate - Validate manifest
 * - POST   /api/v1/developers/personas/:id/submit   - Submit for review
 * - DELETE /api/v1/developers/personas/:id       - Delete draft
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../../../utils/safe-logger.js';
import { handleCorsPreflightIfNeeded, parseBody, sendJSON, sendError } from '../../helpers.js';
import { getPublisherFromToken, getFirestore } from './shared/developer-auth.js';

const log = getLogger().child({ module: 'developers-personas' });

// ============================================================================
// TYPES
// ============================================================================

/** Persona status in the development lifecycle */
type PersonaStatus = 'draft' | 'validating' | 'submitted' | 'approved' | 'rejected' | 'published';

/** Simplified persona manifest for developer wizard */
interface PersonaManifest {
  identity: {
    id: string;
    name: string;
    tagline: string;
    description?: string;
    aliases?: string[];
  };
  voice: {
    provider: 'cartesia';
    voice_id: string;
    name?: string;
  };
  personality: {
    warmth: number; // 0-1
    humor_level: number; // 0-1
    directness: number; // 0-1
    formality: number; // 0-1
    traits: string[];
  };
  knowledge: {
    category: string;
    domains: string[];
    expertise_tags: string[];
    out_of_scope_topics?: string[];
  };
  behaviors?: {
    greetings?: string[];
    backchannels?: string[];
    thinking_sounds?: string[];
  };
}

/** Stored persona document */
interface StoredPersona {
  id: string;
  publisherId: string;
  status: PersonaStatus;
  manifest: PersonaManifest;
  validationErrors?: string[];
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  publishedAt?: Date;
}

// ============================================================================
// VALIDATION
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate persona manifest against requirements
 */
function validateManifest(manifest: PersonaManifest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Identity validation
  if (!manifest.identity) {
    errors.push('Identity section is required');
  } else {
    if (!manifest.identity.id || !/^[a-z0-9-]+$/.test(manifest.identity.id)) {
      errors.push('Identity ID must be kebab-case (lowercase letters, numbers, hyphens)');
    }
    if (!manifest.identity.name || manifest.identity.name.length < 2) {
      errors.push('Persona name must be at least 2 characters');
    }
    if (!manifest.identity.tagline || manifest.identity.tagline.length < 10) {
      errors.push('Tagline must be at least 10 characters');
    }
    if (manifest.identity.name && manifest.identity.name.length > 50) {
      errors.push('Persona name must be 50 characters or less');
    }
  }

  // Voice validation
  if (!manifest.voice) {
    errors.push('Voice section is required');
  } else {
    if (manifest.voice.provider !== 'cartesia') {
      errors.push('Voice provider must be "cartesia"');
    }
    if (!manifest.voice.voice_id) {
      errors.push('Voice ID is required');
    }
  }

  // Personality validation
  if (!manifest.personality) {
    errors.push('Personality section is required');
  } else {
    const scales = ['warmth', 'humor_level', 'directness', 'formality'] as const;
    for (const scale of scales) {
      const value = manifest.personality[scale];
      if (typeof value !== 'number' || value < 0 || value > 1) {
        errors.push(`Personality.${scale} must be a number between 0 and 1`);
      }
    }
    if (!Array.isArray(manifest.personality.traits) || manifest.personality.traits.length < 2) {
      errors.push('At least 2 personality traits are required');
    }
    if (manifest.personality.traits && manifest.personality.traits.length > 10) {
      warnings.push('Consider limiting personality traits to 10 for coherence');
    }
  }

  // Knowledge validation
  if (!manifest.knowledge) {
    errors.push('Knowledge section is required');
  } else {
    if (!manifest.knowledge.category) {
      errors.push('Knowledge category is required');
    }
    if (!Array.isArray(manifest.knowledge.domains) || manifest.knowledge.domains.length < 1) {
      errors.push('At least 1 knowledge domain is required');
    }
    if (!Array.isArray(manifest.knowledge.expertise_tags) || manifest.knowledge.expertise_tags.length < 3) {
      warnings.push('Consider adding at least 3 expertise tags for better discoverability');
    }
  }

  // Behaviors validation (optional but recommended)
  if (!manifest.behaviors?.greetings || manifest.behaviors.greetings.length < 3) {
    warnings.push('Adding at least 3 greeting variations improves conversation naturalness');
  }
  if (!manifest.behaviors?.backchannels || manifest.behaviors.backchannels.length < 5) {
    warnings.push('Adding backchannels (mm-hmm, I see, etc.) makes voice more natural');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// PERSONA STORAGE
// ============================================================================

const PERSONAS_COLLECTION = 'publisher_personas';

/**
 * Generate a unique persona ID
 */
function generatePersonaId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `persona_${timestamp}${random}`;
}

/**
 * List all personas for a publisher
 */
async function listPersonas(publisherId: string): Promise<StoredPersona[]> {
  const db = await getFirestore();
  const query = db
    .collection(PERSONAS_COLLECTION)
    .where('publisherId', '==', publisherId)
    .orderBy('updatedAt', 'desc');

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      publisherId: data.publisherId as string,
      status: data.status as PersonaStatus,
      manifest: data.manifest as PersonaManifest,
      validationErrors: data.validationErrors as string[] | undefined,
      rejectionReason: data.rejectionReason as string | undefined,
      createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() || new Date(),
      updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() || new Date(),
      submittedAt: (data.submittedAt as { toDate: () => Date })?.toDate?.(),
      publishedAt: (data.publishedAt as { toDate: () => Date })?.toDate?.(),
    };
  });
}

/**
 * Get a single persona by ID
 */
async function getPersona(personaId: string): Promise<StoredPersona | null> {
  const db = await getFirestore();
  const doc = await db.collection(PERSONAS_COLLECTION).doc(personaId).get();

  if (!doc.exists) return null;

  const data = doc.data() as Record<string, unknown>;
  return {
    id: doc.id,
    publisherId: data.publisherId as string,
    status: data.status as PersonaStatus,
    manifest: data.manifest as PersonaManifest,
    validationErrors: data.validationErrors as string[] | undefined,
    rejectionReason: data.rejectionReason as string | undefined,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() || new Date(),
    updatedAt: (data.updatedAt as { toDate: () => Date })?.toDate?.() || new Date(),
    submittedAt: (data.submittedAt as { toDate: () => Date })?.toDate?.(),
    publishedAt: (data.publishedAt as { toDate: () => Date })?.toDate?.(),
  };
}

/**
 * Create a new persona draft
 */
async function createPersona(publisherId: string, manifest: PersonaManifest): Promise<StoredPersona> {
  const db = await getFirestore();
  const personaId = generatePersonaId();
  const now = new Date();

  const persona: Omit<StoredPersona, 'id'> = {
    publisherId,
    status: 'draft',
    manifest,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(PERSONAS_COLLECTION).doc(personaId).set({
    ...persona,
    createdAt: now,
    updatedAt: now,
  });

  return { id: personaId, ...persona };
}

/**
 * Update a persona draft
 */
async function updatePersona(
  personaId: string,
  manifest: PersonaManifest
): Promise<StoredPersona | null> {
  const db = await getFirestore();
  const docRef = db.collection(PERSONAS_COLLECTION).doc(personaId);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const now = new Date();
  await docRef.update({
    manifest,
    updatedAt: now,
    status: 'draft', // Reset to draft on edit
    validationErrors: [], // Clear validation errors
  });

  const updated = await docRef.get();
  const data = updated.data() as Record<string, unknown>;

  return {
    id: personaId,
    publisherId: data.publisherId as string,
    status: 'draft',
    manifest,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() || new Date(),
    updatedAt: now,
  };
}

/**
 * Submit persona for review
 */
async function submitPersona(personaId: string): Promise<StoredPersona | null> {
  const db = await getFirestore();
  const docRef = db.collection(PERSONAS_COLLECTION).doc(personaId);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const data = doc.data() as Record<string, unknown>;
  const manifest = data.manifest as PersonaManifest;

  // Validate before submission
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    await docRef.update({
      status: 'draft',
      validationErrors: validation.errors,
    });
    return null;
  }

  const now = new Date();
  await docRef.update({
    status: 'submitted',
    submittedAt: now,
    updatedAt: now,
    validationErrors: [],
  });

  return {
    id: personaId,
    publisherId: data.publisherId as string,
    status: 'submitted',
    manifest,
    createdAt: (data.createdAt as { toDate: () => Date })?.toDate?.() || new Date(),
    updatedAt: now,
    submittedAt: now,
  };
}

/**
 * Delete a persona (only drafts)
 */
async function deletePersona(personaId: string): Promise<boolean> {
  const db = await getFirestore();
  const docRef = db.collection(PERSONAS_COLLECTION).doc(personaId);
  const doc = await docRef.get();

  if (!doc.exists) return false;

  const data = doc.data() as Record<string, unknown>;
  if (data.status === 'published') {
    throw new Error('Cannot delete published personas');
  }

  await docRef.delete();
  return true;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleDeveloperPersonasRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle our routes
  if (!pathname.startsWith('/api/v1/developers/personas')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method?.toUpperCase();

  // Authenticate
  const publisherId = await getPublisherFromToken(req);
  if (!publisherId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  try {
    // GET /api/v1/developers/personas - List all personas
    if (pathname === '/api/v1/developers/personas' && method === 'GET') {
      const personas = await listPersonas(publisherId);

      sendJSON(res, {
        success: true,
        personas: personas.map((p) => ({
          id: p.id,
          name: p.manifest.identity.name,
          tagline: p.manifest.identity.tagline,
          category: p.manifest.knowledge.category,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          submittedAt: p.submittedAt?.toISOString(),
        })),
      });
      return true;
    }

    // POST /api/v1/developers/personas - Create new persona
    if (pathname === '/api/v1/developers/personas' && method === 'POST') {
      const body = await parseBody<{ manifest: PersonaManifest }>(req);

      if (!body.manifest) {
        sendError(res, 'Manifest is required', 400);
        return true;
      }

      // Basic validation before saving
      const validation = validateManifest(body.manifest);

      const persona = await createPersona(publisherId, body.manifest);

      log.info(
        { publisherId, personaId: persona.id, personaName: persona.manifest.identity.name },
        'Persona draft created'
      );

      sendJSON(
        res,
        {
          success: true,
          persona: {
            id: persona.id,
            name: persona.manifest.identity.name,
            status: persona.status,
            createdAt: persona.createdAt.toISOString(),
          },
          validation: {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        },
        201
      );
      return true;
    }

    // GET /api/v1/developers/personas/:id - Get specific persona
    const getMatch = pathname.match(/^\/api\/v1\/developers\/personas\/(persona_[a-z0-9]+)$/);
    if (getMatch && method === 'GET') {
      const personaId = getMatch[1];
      const persona = await getPersona(personaId);

      if (!persona) {
        sendError(res, 'Persona not found', 404);
        return true;
      }

      if (persona.publisherId !== publisherId) {
        sendError(res, 'Not authorized to view this persona', 403);
        return true;
      }

      sendJSON(res, {
        success: true,
        persona: {
          id: persona.id,
          status: persona.status,
          manifest: persona.manifest,
          validationErrors: persona.validationErrors,
          rejectionReason: persona.rejectionReason,
          createdAt: persona.createdAt.toISOString(),
          updatedAt: persona.updatedAt.toISOString(),
          submittedAt: persona.submittedAt?.toISOString(),
          publishedAt: persona.publishedAt?.toISOString(),
        },
      });
      return true;
    }

    // PUT /api/v1/developers/personas/:id - Update persona
    const putMatch = pathname.match(/^\/api\/v1\/developers\/personas\/(persona_[a-z0-9]+)$/);
    if (putMatch && method === 'PUT') {
      const personaId = putMatch[1];
      const persona = await getPersona(personaId);

      if (!persona) {
        sendError(res, 'Persona not found', 404);
        return true;
      }

      if (persona.publisherId !== publisherId) {
        sendError(res, 'Not authorized to update this persona', 403);
        return true;
      }

      if (persona.status === 'published') {
        sendError(res, 'Cannot edit published personas. Create a new version instead.', 400);
        return true;
      }

      const body = await parseBody<{ manifest: PersonaManifest }>(req);

      if (!body.manifest) {
        sendError(res, 'Manifest is required', 400);
        return true;
      }

      const validation = validateManifest(body.manifest);
      const updated = await updatePersona(personaId, body.manifest);

      if (!updated) {
        sendError(res, 'Failed to update persona', 500);
        return true;
      }

      log.info({ publisherId, personaId }, 'Persona updated');

      sendJSON(res, {
        success: true,
        persona: {
          id: updated.id,
          name: updated.manifest.identity.name,
          status: updated.status,
          updatedAt: updated.updatedAt.toISOString(),
        },
        validation: {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      });
      return true;
    }

    // POST /api/v1/developers/personas/:id/validate - Validate manifest
    const validateMatch = pathname.match(
      /^\/api\/v1\/developers\/personas\/(persona_[a-z0-9]+)\/validate$/
    );
    if (validateMatch && method === 'POST') {
      const personaId = validateMatch[1];
      const persona = await getPersona(personaId);

      if (!persona) {
        sendError(res, 'Persona not found', 404);
        return true;
      }

      if (persona.publisherId !== publisherId) {
        sendError(res, 'Not authorized to validate this persona', 403);
        return true;
      }

      const validation = validateManifest(persona.manifest);

      sendJSON(res, {
        success: true,
        validation: {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        readyToSubmit: validation.valid,
      });
      return true;
    }

    // POST /api/v1/developers/personas/:id/submit - Submit for review
    const submitMatch = pathname.match(
      /^\/api\/v1\/developers\/personas\/(persona_[a-z0-9]+)\/submit$/
    );
    if (submitMatch && method === 'POST') {
      const personaId = submitMatch[1];
      const persona = await getPersona(personaId);

      if (!persona) {
        sendError(res, 'Persona not found', 404);
        return true;
      }

      if (persona.publisherId !== publisherId) {
        sendError(res, 'Not authorized to submit this persona', 403);
        return true;
      }

      if (persona.status === 'submitted') {
        sendError(res, 'Persona is already submitted for review', 400);
        return true;
      }

      if (persona.status === 'published') {
        sendError(res, 'Persona is already published', 400);
        return true;
      }

      // Validate before submission
      const validation = validateManifest(persona.manifest);
      if (!validation.valid) {
        sendJSON(res, {
          success: false,
          error: 'Persona validation failed',
          validation: {
            valid: false,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        });
        return true;
      }

      const submitted = await submitPersona(personaId);

      if (!submitted) {
        sendError(res, 'Failed to submit persona', 500);
        return true;
      }

      log.info({ publisherId, personaId }, 'Persona submitted for review');

      sendJSON(res, {
        success: true,
        message: 'Persona submitted for review. You\'ll receive an email when it\'s approved.',
        persona: {
          id: submitted.id,
          name: submitted.manifest.identity.name,
          status: submitted.status,
          submittedAt: submitted.submittedAt?.toISOString(),
        },
      });
      return true;
    }

    // DELETE /api/v1/developers/personas/:id - Delete persona
    const deleteMatch = pathname.match(/^\/api\/v1\/developers\/personas\/(persona_[a-z0-9]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const personaId = deleteMatch[1];
      const persona = await getPersona(personaId);

      if (!persona) {
        sendError(res, 'Persona not found', 404);
        return true;
      }

      if (persona.publisherId !== publisherId) {
        sendError(res, 'Not authorized to delete this persona', 403);
        return true;
      }

      try {
        await deletePersona(personaId);

        log.info({ publisherId, personaId }, 'Persona deleted');

        sendJSON(res, {
          success: true,
          message: 'Persona deleted successfully',
        });
        return true;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.message.includes('published')) {
          sendError(res, 'Cannot delete published personas', 400);
          return true;
        }

        throw err;
      }
    }

    // Unknown personas route
    sendError(res, 'Not found', 404);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname, publisherId }, 'Developer personas error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}
