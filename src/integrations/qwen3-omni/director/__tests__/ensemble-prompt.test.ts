/**
 * Ensemble Prompt unit tests
 */

import { describe, expect, it } from 'vitest';
import { buildEnsembleSystemPrompt } from '../ensemble-prompt.js';
import type { EnsembleCharacterBlock, SceneState } from '../types.js';

const minimalSceneState: SceneState = {
  mood: 'warm',
  moodIntensity: 0.5,
  pace: 'natural',
  isHeld: false,
  holdInstruction: null,
  emotionArc: null,
  currentArcPhase: 0,
  turnCount: 0,
  startedAt: Date.now(),
  directorNotes: '',
};

const minimalCharacter: EnsembleCharacterBlock = {
  personaId: 'ferni',
  name: 'Ferni',
  role: 'Life coach',
  stagePosition: 'lead',
  voiceDesign: 'warm',
  emotionInstruction: 'warm and supportive',
  systemPromptExcerpt: 'You are Ferni.',
  cognitiveStyle: 'warm',
  specialInstructions: null,
};

describe('ensemble-prompt', () => {
  describe('buildEnsembleSystemPrompt', () => {
    it('builds prompt with minimal config', () => {
      const prompt = buildEnsembleSystemPrompt({
        characters: [minimalCharacter],
        leadPersonaId: 'ferni',
        sceneState: minimalSceneState,
        userName: 'User',
        crossPersonaInsights: '',
        directorNotes: '',
        emotionArc: null,
        currentArcPhase: 0,
      });
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Ferni');
    });

    it('includes lead and supporting sections', () => {
      const supporting: EnsembleCharacterBlock = {
        ...minimalCharacter,
        personaId: 'maya-santos',
        name: 'Maya',
        stagePosition: 'supporting',
      };
      const prompt = buildEnsembleSystemPrompt({
        characters: [minimalCharacter, supporting],
        leadPersonaId: 'ferni',
        sceneState: minimalSceneState,
        userName: 'User',
        crossPersonaInsights: '',
        directorNotes: '',
        emotionArc: null,
        currentArcPhase: 0,
      });
      expect(prompt).toContain('Ferni');
      expect(prompt).toContain('Maya');
    });
  });
});
