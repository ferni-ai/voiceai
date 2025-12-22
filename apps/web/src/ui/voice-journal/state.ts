/**
 * Voice Journal State
 *
 * Module-level state management for the voice journal.
 *
 * @module voice-journal/state
 */

import type { VoiceJournalState, JournalTab, JournalPrompt } from './types.js';
import type { CustomAgent, CustomAgentMemory } from '../../services/custom-agent.service.js';

// ============================================================================
// STATE
// ============================================================================

const state: VoiceJournalState = {
  modal: null,
  currentAgent: null,
  entries: [],
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  recordingStartTime: null,
  recordingDuration: 0,
  animationFrameId: null,
  audioContext: null,
  analyser: null,
  currentTab: 'record',
  currentPrompt: null,
  calendarMonth: new Date(),
};

// ============================================================================
// STATE ACCESSORS
// ============================================================================

export function getState(): VoiceJournalState {
  return state;
}

export function getModal(): HTMLElement | null {
  return state.modal;
}

export function setModal(modal: HTMLElement | null): void {
  state.modal = modal;
}

export function getCurrentAgent(): CustomAgent | null {
  return state.currentAgent;
}

export function setCurrentAgent(agent: CustomAgent | null): void {
  state.currentAgent = agent;
}

export function getEntries(): CustomAgentMemory[] {
  return state.entries;
}

export function setEntries(entries: CustomAgentMemory[]): void {
  state.entries = entries;
}

export function getCurrentTab(): JournalTab {
  return state.currentTab;
}

export function setCurrentTab(tab: JournalTab): void {
  state.currentTab = tab;
}

export function getCurrentPrompt(): JournalPrompt | null {
  return state.currentPrompt;
}

export function setCurrentPrompt(prompt: JournalPrompt | null): void {
  state.currentPrompt = prompt;
}

export function getCalendarMonth(): Date {
  return state.calendarMonth;
}

export function setCalendarMonth(month: Date): void {
  state.calendarMonth = month;
}

export function isRecording(): boolean {
  return state.isRecording;
}

export function setIsRecording(recording: boolean): void {
  state.isRecording = recording;
}

export function getRecordingStartTime(): number | null {
  return state.recordingStartTime;
}

export function setRecordingStartTime(time: number | null): void {
  state.recordingStartTime = time;
}

export function getRecordingDuration(): number {
  return state.recordingDuration;
}

export function setRecordingDuration(duration: number): void {
  state.recordingDuration = duration;
}

export function getMediaRecorder(): MediaRecorder | null {
  return state.mediaRecorder;
}

export function setMediaRecorder(recorder: MediaRecorder | null): void {
  state.mediaRecorder = recorder;
}

export function getAudioChunks(): Blob[] {
  return state.audioChunks;
}

export function setAudioChunks(chunks: Blob[]): void {
  state.audioChunks = chunks;
}

export function pushAudioChunk(chunk: Blob): void {
  state.audioChunks.push(chunk);
}

export function clearAudioChunks(): void {
  state.audioChunks = [];
}

export function getAnimationFrameId(): number | null {
  return state.animationFrameId;
}

export function setAnimationFrameId(id: number | null): void {
  state.animationFrameId = id;
}

export function getAudioContext(): AudioContext | null {
  return state.audioContext;
}

export function setAudioContext(ctx: AudioContext | null): void {
  state.audioContext = ctx;
}

export function getAnalyser(): AnalyserNode | null {
  return state.analyser;
}

export function setAnalyser(analyser: AnalyserNode | null): void {
  state.analyser = analyser;
}

// ============================================================================
// STATE RESET
// ============================================================================

export function resetState(): void {
  state.currentAgent = null;
  state.entries = [];
  state.currentTab = 'record';
  state.isRecording = false;
  state.recordingStartTime = null;
  state.recordingDuration = 0;
  state.audioChunks = [];
}

