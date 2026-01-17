/**
 * Custom Agent Wizard Types
 * @module wizard/types
 */

import type { CustomAgentPersonality, MemoryType } from '../../services/custom-agent.service.js';

export type WizardStepId = 'type' | 'info' | 'voice' | 'personality' | 'memories';

export interface WizardStep {
  id: WizardStepId;
  title: string;
  subtitle: string;
}

export type VoiceOption = 'clone' | 'library' | 'later';

export interface WizardState {
  modal: HTMLElement | null;
  currentStep: number;
  draft: AgentDraft;
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
  recordedAudioBlob: Blob | null;
  isRecording: boolean;
  createdAgentId: string | null;
}

export interface AgentDraft {
  step: number;
  updatedAt: string;
  type?: import('../../services/custom-agent.service.js').CustomAgentType;
  name?: string;
  displayName?: string;
  description?: string;
  icon?: string;
  voiceOption?: VoiceOption;
  selectedVoiceId?: string;
  personality?: Partial<CustomAgentPersonality>;
  memories?: import('../../services/custom-agent.service.js').AddMemoryRequest[];
}

export interface IconOption {
  id: string;
  svg: string;
}

export interface VoiceLibraryEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
  previewUrl: string;
}

// Re-export types consumers need
export type { CustomAgentPersonality, MemoryType };

