/**
 * The ways into voice cloning, each one shown only while voice cloning is on
 * (config/voice-clone-flag.ts). Kept here so the wizard and the marketplace
 * share one gate.
 *
 * @module voice-clone-entry
 */

import { t } from '../i18n/index.js';
import { isVoiceCloneCreationOn } from '../config/voice-clone-flag.js';
import type { AgentDraft, AgentTypeInfo } from '../services/custom-agent.service.js';

type VoiceOption = NonNullable<AgentDraft['voiceOption']>;

const MIC_ICON = `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>`;

/** The feature line that promises cloning from recordings. */
const CLONE_FEATURE_KEY = 'agentTypes.legacy.feature1';

/** The voice option to show: a saved 'clone' choice falls back to the library while off. */
export function effectiveVoiceOption(option: AgentDraft['voiceOption']): VoiceOption {
  if (option === 'clone' && !isVoiceCloneCreationOn()) return 'library';
  return option || 'library';
}

/** Agent types without the "Voice cloning from recordings" line while off. */
export function visibleAgentTypes(types: AgentTypeInfo[]): AgentTypeInfo[] {
  if (isVoiceCloneCreationOn()) return types;
  return types.map((type) => ({
    ...type,
    featureKeys: type.featureKeys.filter((key) => key !== CLONE_FEATURE_KEY),
  }));
}

/** The wizard's "Clone a Voice" option, or nothing while off. */
export function renderCloneVoiceOption(selected: boolean): string {
  if (!isVoiceCloneCreationOn()) return '';
  return `
        <button
          class="voice-option ${selected ? 'voice-option--selected' : ''}"
          data-voice-option="clone"
        >
          <div class="voice-option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MIC_ICON}</svg>
          </div>
          <div class="voice-option-content">
            <h3>${t('customAgentWizard.voiceOption.cloneTitle')}</h3>
            <p>${t('customAgentWizard.voiceOption.cloneDescription')}</p>
          </div>
        </button>`;
}

/** The legacy card's "Voice" button, or nothing while off. */
export function renderRecordVoiceButton(agentId: string): string {
  if (!isVoiceCloneCreationOn()) return '';
  return `
        <button class="custom-agent-action custom-agent-action--voice" data-action="record-voice" data-agent-id="${agentId}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MIC_ICON}</svg>
          ${t('marketplace.actions.voice')}
        </button>`;
}

/** Opens the clone recorder only while on. Returns whether it opened. */
export async function openVoiceCloneRecorderWhenOn(agentId: string): Promise<boolean> {
  if (!isVoiceCloneCreationOn()) return false;
  const { openVoiceCloneRecorder } = await import('./voice-clone-recorder.ui.js');
  await openVoiceCloneRecorder(agentId);
  return true;
}
