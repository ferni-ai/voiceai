/**
 * What PUT /api/custom-agents/:id may change.
 *
 * The route used to deep-merge any body into the stored agent, so a request
 * could set server-owned fields (marketplaceId, privacy, type, ownerId...) or
 * point `voice.voiceId` at a voice the agent may not use. Now only the fields
 * below are accepted and anything else is refused with 400.
 *
 * The editor sends the whole `voice` and `status` back on save, so those two
 * are special: `voice` may change only its settings and preferences (the id,
 * type, status and sample are written by the voice routes; echoing them back
 * unchanged is fine), and `status` follows the /status route's rules.
 *
 * @module api/custom-agent/agent-update-policy
 */

import type { CustomAgent, CustomAgentStatus } from '../../types/custom-agent-api.js';
import { customAgentVoiceAllowed } from '../../services/custom-agent/custom-agent-voice-policy.js';

const EDITABLE_FIELDS = new Set([
  'name',
  'displayName',
  'description',
  'personality',
  'memories',
  'behaviors',
  'category',
  'tags',
  'icon',
  'colors',
  'status',
  'voice',
]);
const VOICE_EDITABLE = new Set(['settings', 'preferences']);
const VOICE_ECHO_ONLY = new Set(['voiceId', 'type', 'status', 'audioSampleUrl']);
const SETTINGS_FIELDS = new Set(['speed', 'stability', 'similarityBoost', 'emotion']);
const USER_STATUSES: readonly CustomAgentStatus[] = ['active', 'paused', 'draft'];

export type AgentUpdateResult =
  | { ok: true; update: Partial<CustomAgent> }
  | { ok: false; error: string; fields?: string[]; validationErrors?: string[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why `agent` can't be made active (empty when it can). Shared with PUT /status. */
export function activationErrors(agent: CustomAgent): string[] {
  const errors: string[] = [];
  if (!agent.voice?.voiceId) errors.push('Voice is not configured');
  if (agent.voice?.status !== 'ready') errors.push('Voice is not ready');
  else if (agent.voice?.voiceId && !customAgentVoiceAllowed(agent.voice)) {
    errors.push('Voice is not available');
  }
  if (!agent.description || agent.description.length < 10) errors.push('Description is too short');
  return errors;
}

/** The part of `body` PUT may write to `existing`, or why it is refused. */
export function readAgentUpdate(body: unknown, existing: CustomAgent): AgentUpdateResult {
  if (!isPlainObject(body)) return { ok: false, error: 'Body must be an object' };

  const refused = Object.keys(body).filter((key) => !EDITABLE_FIELDS.has(key));
  if (refused.length > 0) return { ok: false, error: 'Fields not editable', fields: refused };

  const update: Record<string, unknown> = { ...body };

  if ('voice' in body) {
    const voice = body.voice;
    if (!isPlainObject(voice)) return { ok: false, error: 'voice must be an object' };
    const stored = (existing.voice ?? {}) as unknown as Record<string, unknown>;
    const voiceRefused = Object.keys(voice).filter(
      (key) => !VOICE_EDITABLE.has(key) && !(VOICE_ECHO_ONLY.has(key) && voice[key] === stored[key])
    );
    const settings = voice.settings;
    if (settings !== undefined) {
      if (!isPlainObject(settings)) voiceRefused.push('settings');
      else
        voiceRefused.push(
          ...Object.keys(settings)
            .filter((k) => !SETTINGS_FIELDS.has(k))
            .map((k) => `settings.${k}`)
        );
    }
    if (voiceRefused.length > 0) {
      return {
        ok: false,
        error: 'Voice fields not editable here',
        fields: voiceRefused.map((k) => `voice.${k}`),
      };
    }
    const editable: Record<string, unknown> = {};
    for (const key of VOICE_EDITABLE) if (key in voice) editable[key] = voice[key];
    update.voice = editable;
  }

  if ('status' in body && body.status !== existing.status) {
    const status = body.status as CustomAgentStatus;
    if (!USER_STATUSES.includes(status)) {
      return { ok: false, error: 'Valid status is required (active, paused, draft)' };
    }
    if (status === 'active') {
      const validationErrors = activationErrors(existing);
      if (validationErrors.length > 0) {
        return { ok: false, error: 'Agent cannot be activated', validationErrors };
      }
    }
  } else {
    delete update.status;
  }

  return { ok: true, update: update as Partial<CustomAgent> };
}
