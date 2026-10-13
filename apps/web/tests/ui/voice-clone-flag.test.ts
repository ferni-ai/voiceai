/**
 * Voice cloning stays hidden until there is a consent design
 * (VITE_VOICE_CLONE_CREATION, off by default).
 *
 * The flow took any uploaded audio file, had no consent step, and its copy
 * invited people to clone "someone you cherish" "from recordings". While off,
 * no way in is shown: not the wizard's "Clone a Voice" option (even for a saved
 * draft that picked it), not the "Voice cloning from recordings" line on the
 * Legacy type, not the legacy card's "Voice" button, and the recorder never opens.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

Element.prototype.animate = vi.fn(() => ({ finished: Promise.resolve() })) as never;

const recorder = vi.hoisted(() => ({ open: vi.fn(async (_agentId: string) => undefined) }));
vi.mock('../../src/ui/voice-clone-recorder.ui.js', () => ({
  openVoiceCloneRecorder: recorder.open,
}));

const { t } = await import('../../src/i18n/index.js');
const { openVoiceCloneRecorderWhenOn, renderRecordVoiceButton, voiceCopyKey } =
  await import('../../src/ui/voice-clone-entry.js');

const VOICE_STEP = 2;

/** A fresh wizard module each time: the shared setup empties the body between tests. */
async function openWizardAt(step: number, voiceOption?: 'clone' | 'library'): Promise<void> {
  vi.resetModules();
  await (await import('../../src/i18n/index.js')).initI18n();
  const { saveAgentDraft } = await import('../../src/services/custom-agent.service.js');
  const { openCustomAgentWizard } = await import('../../src/ui/custom-agent-wizard.ui.js');
  saveAgentDraft({ step, updatedAt: '', type: 'legacy', name: 'grandpa', voiceOption });
  openCustomAgentWizard(true);
}

function legacyCardText(): string {
  return document.querySelector('.type-card[data-type="legacy"]')?.textContent ?? '';
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
  recorder.open.mockClear();
});

describe('voice cloning while off (the default)', () => {
  it('shows no Clone a Voice option in the wizard, only the library and later', async () => {
    await openWizardAt(VOICE_STEP);
    expect(document.querySelector('[data-voice-option="library"]')).not.toBeNull();
    expect(document.querySelector('[data-voice-option="clone"]')).toBeNull();
  });

  it('falls back to the library for a saved draft that chose cloning', async () => {
    await openWizardAt(VOICE_STEP, 'clone');
    expect(document.querySelector('.voice-clone-section')).toBeNull();
    expect(document.querySelector('#audio-upload')).toBeNull();
    expect(document.querySelector('[data-voice-option="library"].voice-option--selected')).not.toBeNull();
  });

  it('drops "Voice cloning from recordings" from the Legacy type', async () => {
    await openWizardAt(0);
    expect(legacyCardText()).toContain(t('agentTypes.legacy.name'));
    expect(legacyCardText()).not.toContain(t('agentTypes.legacy.feature1'));
  });

  it('renders no Voice button on a legacy card', () => {
    expect(renderRecordVoiceButton('agent-1')).toBe('');
  });

  it('never opens the clone recorder', async () => {
    expect(await openVoiceCloneRecorderWhenOn('agent-1')).toBe(false);
    expect(recorder.open).not.toHaveBeenCalled();
  });

  it('hides copy that promises someone\'s voice, without deleting it', async () => {
    expect(t(voiceCopyKey('agentTypes.legacy.description'))).not.toMatch(/voice/i);
    expect(t(voiceCopyKey('marketplace.creations.legacyDesc'))).not.toMatch(/voice/i);
    expect(t(voiceCopyKey('marketplace.creations.emptyHint'))).not.toMatch(/voice/i);
    expect(t(voiceCopyKey('customAgentWizard.voiceStep.subtitle'))).not.toMatch(/clone/i);
    // The cherished-person copy is kept for when cloning returns, consent-gated.
    expect(t('agentTypes.legacy.description')).toMatch(/someone you cherish/);
    await openWizardAt(0);
    expect(legacyCardText()).not.toMatch(/voice/i);
    expect(legacyCardText()).toContain('someone you cherish');
  });
});

describe('voice cloning when VITE_VOICE_CLONE_CREATION=true', () => {
  it('shows the Clone a Voice option and keeps a saved clone choice', async () => {
    vi.stubEnv('VITE_VOICE_CLONE_CREATION', 'true');
    await openWizardAt(VOICE_STEP, 'clone');
    expect(document.querySelector('[data-voice-option="clone"].voice-option--selected')).not.toBeNull();
    expect(document.querySelector('.voice-clone-section')).not.toBeNull();
  });

  it('lists the cloning line on the Legacy type', async () => {
    vi.stubEnv('VITE_VOICE_CLONE_CREATION', 'true');
    await openWizardAt(0);
    expect(legacyCardText()).toContain(t('agentTypes.legacy.feature1'));
  });

  it('shows the original voice copy again', async () => {
    vi.stubEnv('VITE_VOICE_CLONE_CREATION', 'true');
    expect(voiceCopyKey('marketplace.creations.legacyDesc')).toBe('marketplace.creations.legacyDesc');
    expect(t(voiceCopyKey('customAgentWizard.voiceStep.subtitle'))).toMatch(/clone/i);
    await openWizardAt(0);
    expect(legacyCardText()).toContain('voice and wisdom');
  });

  it('renders the Voice button and opens the recorder', async () => {
    vi.stubEnv('VITE_VOICE_CLONE_CREATION', 'true');
    expect(renderRecordVoiceButton('agent-1')).toContain('data-action="record-voice"');
    expect(renderRecordVoiceButton('agent-1')).toContain('data-agent-id="agent-1"');
    expect(await openVoiceCloneRecorderWhenOn('agent-1')).toBe(true);
    expect(recorder.open).toHaveBeenCalledWith('agent-1');
  });
});
