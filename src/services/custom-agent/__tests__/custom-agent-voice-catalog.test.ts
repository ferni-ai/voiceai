/**
 * The voices people can pick for their own agent are real, distinct, never a Ferni
 * persona's or a retired clone's, and are exactly what select-premade accepts.
 */
import type { ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';
import {
  FERNI_CALM_A_VOICE_ID,
  FERNI_CALM_B_VOICE_ID,
  FERNI_CALM_C_VOICE_ID,
  isValidVoiceId,
  VOICE_IDS,
} from '../../../config/voice-ids.js';
import {
  CUSTOM_AGENT_VOICE_CATALOG,
  DEFAULT_CUSTOM_AGENT_VOICE_ID,
  LEGACY_CUSTOM_AGENT_VOICE_IDS,
} from '../custom-agent-voice-catalog.js';
import {
  customAgentVoiceAllowed,
  isForbiddenCustomAgentVoiceId,
  isStockCustomAgentVoiceId,
  runtimeVoiceId,
  SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID,
} from '../custom-agent-voice-policy.js';
import { handleListVoices } from '../../../api/custom-agent/voice-routes.js';

const ARCHIVED_CHILD = '2ee87190-8f84-4925-97da-e52547f9462c'; // the old list's "Dr. Chen"

describe('the custom-agent voice catalog', () => {
  it('holds distinct, well-formed voices', () => {
    const ids = CUSTOM_AGENT_VOICE_CATALOG.map((v) => v.voiceId);
    const names = CUSTOM_AGENT_VOICE_CATALOG.map((v) => v.name);
    expect(CUSTOM_AGENT_VOICE_CATALOG.length).toBe(19);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    for (const v of CUSTOM_AGENT_VOICE_CATALOG) {
      expect(isValidVoiceId(v.voiceId), v.name).toBe(true);
      expect(v.description.length, v.name).toBeGreaterThan(10);
    }
  });

  it("never offers a Ferni persona's voice or a retired clone", () => {
    for (const v of CUSTOM_AGENT_VOICE_CATALOG) {
      expect(isForbiddenCustomAgentVoiceId(v.voiceId), v.name).toBe(false);
    }
    // Both of Ferni's voices: the live one and calm B, its rollback outside VOICE_IDS.
    expect(isForbiddenCustomAgentVoiceId(VOICE_IDS.FERNI)).toBe(true);
    expect(isForbiddenCustomAgentVoiceId(FERNI_CALM_B_VOICE_ID)).toBe(true);
  });

  it('forbids calm A, B and C however the id is cased or padded', () => {
    for (const id of [FERNI_CALM_A_VOICE_ID, FERNI_CALM_B_VOICE_ID, FERNI_CALM_C_VOICE_ID]) {
      for (const variant of [id.toUpperCase(), ` ${id} `, `\n${id.toUpperCase()}\t`]) {
        expect(isForbiddenCustomAgentVoiceId(variant), JSON.stringify(variant)).toBe(true);
      }
    }
    expect(isForbiddenCustomAgentVoiceId(VOICE_IDS.FERNI.toUpperCase())).toBe(true);
  });

  it("forbids every calm clone of Ferni's own voice, spares A and C included, even as a ready clone", () => {
    expect(FERNI_CALM_A_VOICE_ID).toBe('24a60cd5-9428-453d-8a95-92f50567f32e');
    expect(FERNI_CALM_C_VOICE_ID).toBe('5b13b172-56f9-4821-887a-a943fe949830');
    for (const voiceId of [FERNI_CALM_A_VOICE_ID, FERNI_CALM_B_VOICE_ID, FERNI_CALM_C_VOICE_ID]) {
      expect(isForbiddenCustomAgentVoiceId(voiceId), voiceId).toBe(true);
      expect(customAgentVoiceAllowed({ type: 'cloned', voiceId, status: 'ready' }), voiceId).toBe(
        false
      );
      expect(isStockCustomAgentVoiceId(voiceId), voiceId).toBe(false);
    }
  });

  it('offers a woman and a man for every accent', () => {
    for (const accent of ['american', 'british', 'australian', 'indian'] as const) {
      const genders = new Set(
        CUSTOM_AGENT_VOICE_CATALOG.filter((v) => v.accent === accent).map((v) => v.gender)
      );
      expect(genders, accent).toEqual(new Set(['female', 'male']));
    }
  });

  it('is exactly what select-premade accepts, plus the voices agents already use', () => {
    for (const v of CUSTOM_AGENT_VOICE_CATALOG)
      expect(isStockCustomAgentVoiceId(v.voiceId), v.name).toBe(true);
    for (const id of LEGACY_CUSTOM_AGENT_VOICE_IDS)
      expect(isStockCustomAgentVoiceId(id), id).toBe(true);
    expect(isStockCustomAgentVoiceId('cartesia-friendly-female')).toBe(false);
  });

  it('defaults to a catalog voice, and drops the archived one', () => {
    expect(SAFE_DEFAULT_CUSTOM_AGENT_VOICE_ID).toBe(DEFAULT_CUSTOM_AGENT_VOICE_ID);
    expect(
      CUSTOM_AGENT_VOICE_CATALOG.some((v) => v.voiceId === DEFAULT_CUSTOM_AGENT_VOICE_ID)
    ).toBe(true);
    expect(isStockCustomAgentVoiceId(ARCHIVED_CHILD)).toBe(false);
    expect(
      customAgentVoiceAllowed({ type: 'selected', voiceId: ARCHIVED_CHILD, status: 'ready' })
    ).toBe(false);
    expect(
      runtimeVoiceId('agent_1', { type: 'selected', voiceId: ARCHIVED_CHILD, status: 'ready' })
    ).toBe(DEFAULT_CUSTOM_AGENT_VOICE_ID);
  });

  it('keeps a legacy voice an agent already speaks in', () => {
    const legacy = LEGACY_CUSTOM_AGENT_VOICE_IDS[0];
    expect(runtimeVoiceId('agent_1', { type: 'selected', voiceId: legacy, status: 'ready' })).toBe(
      legacy
    );
  });
});

describe('GET /api/custom-agents/voices', () => {
  it('returns the catalog', () => {
    let status = 0;
    let raw = '';
    const res = {
      writeHead: vi.fn((code: number) => (status = code)),
      setHeader: vi.fn(),
      end: vi.fn((data?: string) => (raw = data ?? '')),
    } as unknown as ServerResponse;
    expect(handleListVoices(res)).toBe(true);
    expect(status).toBe(200);
    expect(JSON.parse(raw).voices).toEqual(CUSTOM_AGENT_VOICE_CATALOG);
  });
});
