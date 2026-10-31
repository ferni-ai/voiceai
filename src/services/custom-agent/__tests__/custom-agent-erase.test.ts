/**
 * Deleting a custom agent deletes its own Cartesia clone and its GCS audio too,
 * and never a shared voice (stock, persona or retired clone).
 */
import { describe, expect, it, vi } from 'vitest';
import { RETIRED_CLONE_VOICE_IDS, VOICE_IDS } from '../../../config/voice-ids.js';
import { CUSTOM_AGENT_VOICE_CATALOG } from '../custom-agent-voice-catalog.js';
import { deleteCartesiaVoice } from '../cartesia-voice-delete.js';
import {
  eraseCustomAgent,
  ownCloneVoiceId,
  type CustomAgentEraseDeps,
} from '../custom-agent-erase.js';

const OWN_CLONE = '11111111-2222-4333-8444-555555555555';
const STOCK = CUSTOM_AGENT_VOICE_CATALOG[0].voiceId;
const PERSONA = Object.values(VOICE_IDS)[0];
const RETIRED = [...RETIRED_CLONE_VOICE_IDS][0];

function deps(voice: Record<string, unknown> | undefined, opts: { exists?: boolean } = {}) {
  const d = {
    getCustomAgent: vi.fn(async () =>
      opts.exists === false ? null : ({ id: 'agent_1', voice } as never)
    ),
    deleteCustomAgent: vi.fn(async () => true),
    deleteCartesiaVoice: vi.fn(async () => 'deleted' as const),
    deleteAgentAudioFiles: vi.fn(async () => 3),
  };
  return d as typeof d & CustomAgentEraseDeps;
}

describe('eraseCustomAgent', () => {
  it('deletes the doc, the agent’s own clone and its audio', async () => {
    const d = deps({ type: 'cloned', voiceId: OWN_CLONE, status: 'ready' });
    const result = await eraseCustomAgent('uid_1', 'agent_1', d);
    expect(result).toEqual({ found: true, clone: 'deleted', audioFilesDeleted: 3 });
    expect(d.deleteCustomAgent).toHaveBeenCalledWith('uid_1', 'agent_1');
    expect(d.deleteCartesiaVoice).toHaveBeenCalledWith(OWN_CLONE);
    expect(d.deleteAgentAudioFiles).toHaveBeenCalledWith('uid_1', 'agent_1');
  });

  it.each([
    ['a stock voice', { type: 'selected', voiceId: STOCK }],
    ['a stock id marked cloned', { type: 'cloned', voiceId: STOCK }],
    ['a persona voice marked cloned', { type: 'cloned', voiceId: PERSONA }],
    ['a retired clone marked cloned', { type: 'cloned', voiceId: RETIRED }],
    ['an uppercase persona voice', { type: 'cloned', voiceId: PERSONA.toUpperCase() }],
    ['no voice', undefined],
  ])('never deletes %s at Cartesia, but still deletes the audio', async (_label, voice) => {
    const d = deps(voice);
    const result = await eraseCustomAgent('uid_1', 'agent_1', d);
    expect(d.deleteCartesiaVoice).not.toHaveBeenCalled();
    expect(d.deleteAgentAudioFiles).toHaveBeenCalled();
    expect(result.clone).toBe('none');
  });

  it('touches nothing when the agent does not exist', async () => {
    const d = deps(undefined, { exists: false });
    expect(await eraseCustomAgent('uid_1', 'agent_x', d)).toEqual({
      found: false,
      clone: 'none',
      audioFilesDeleted: 0,
    });
    expect(d.deleteCustomAgent).not.toHaveBeenCalled();
    expect(d.deleteCartesiaVoice).not.toHaveBeenCalled();
    expect(d.deleteAgentAudioFiles).not.toHaveBeenCalled();
  });

  it('still reports the agent deleted when the clone delete fails', async () => {
    const d = deps({ type: 'cloned', voiceId: OWN_CLONE });
    d.deleteCartesiaVoice.mockResolvedValueOnce('failed' as never);
    expect(await eraseCustomAgent('uid_1', 'agent_1', d)).toMatchObject({
      found: true,
      clone: 'failed',
    });
  });

  it('still reports the agent deleted when the audio cleanup throws', async () => {
    const d = deps({ type: 'cloned', voiceId: OWN_CLONE });
    d.deleteAgentAudioFiles.mockRejectedValueOnce(new Error('storage down'));
    expect(await eraseCustomAgent('uid_1', 'agent_1', d)).toEqual({
      found: true,
      clone: 'deleted',
      audioFilesDeleted: 0,
    });
  });
});

describe('ownCloneVoiceId', () => {
  it('is the id only for the agent’s own clone', () => {
    expect(ownCloneVoiceId({ type: 'cloned', voiceId: OWN_CLONE })).toBe(OWN_CLONE);
    expect(ownCloneVoiceId({ type: 'selected', voiceId: OWN_CLONE })).toBeNull();
  });
});

describe('deleteCartesiaVoice', () => {
  const ok = (status: number) => vi.fn(async () => new Response(null, { status }));

  it('calls DELETE /voices/{id} with the key and version', async () => {
    const fetch = ok(204);
    expect(await deleteCartesiaVoice(OWN_CLONE, { apiKey: 'test-key', fetch })).toBe('deleted');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.cartesia.ai/voices/${OWN_CLONE}`);
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('test-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((init.headers as Record<string, string>)['Cartesia-Version']).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    );
  });

  it('counts a 404 as already gone and a 500 as failed', async () => {
    expect(await deleteCartesiaVoice(OWN_CLONE, { apiKey: 'k', fetch: ok(404) })).toBe(
      'already_gone'
    );
    expect(await deleteCartesiaVoice(OWN_CLONE, { apiKey: 'k', fetch: ok(500) })).toBe('failed');
  });

  it('does not throw when the network fails', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await deleteCartesiaVoice(OWN_CLONE, { apiKey: 'k', fetch })).toBe('failed');
  });

  it('skips an id that is not a Cartesia voice (simulated clones)', async () => {
    const fetch = ok(204);
    expect(await deleteCartesiaVoice('voice_sim_1_abc', { apiKey: 'k', fetch })).toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails without an API key instead of pretending', async () => {
    const fetch = ok(204);
    expect(await deleteCartesiaVoice(OWN_CLONE, { apiKey: '', fetch })).toBe('failed');
    expect(fetch).not.toHaveBeenCalled();
  });
});
