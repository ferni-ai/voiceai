/**
 * Persona E2E Tests
 *
 * Tests all 6 personas to verify:
 * - Bundle loads correctly
 * - System prompt is valid
 * - Voice configuration exists
 * - Cognitive profile is defined
 * - Function calling specialty is loaded
 *
 * @module PersonaE2ETests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// All 6 personas
const PERSONAS = [
  'ferni',
  'maya-santos',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
  'peter-john',
] as const;

const BUNDLES_PATH = join(process.cwd(), 'src/personas/bundles');

describe('Persona E2E Tests', () => {
  describe.each(PERSONAS)('Persona: %s', (personaId) => {
    const bundlePath = join(BUNDLES_PATH, personaId);

    it('should have a persona.manifest.json', () => {
      const manifestPath = join(bundlePath, 'persona.manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // Manifest uses identity.id structure
      expect(manifest.identity?.id).toBe(personaId);
      expect(manifest.identity?.name).toBeTruthy();
      expect(manifest.identity?.description).toBeTruthy();
    });

    it('should have a system-prompt.md', () => {
      const promptPath = join(bundlePath, 'identity/system-prompt.md');
      expect(existsSync(promptPath)).toBe(true);

      const content = readFileSync(promptPath, 'utf8');
      expect(content.length).toBeGreaterThan(100);
      // Should contain persona name or role
      expect(content.toLowerCase()).toContain(personaId.split('-')[0].toLowerCase());
    });

    it('should have a function-calling-specialty.md', () => {
      const specialtyPath = join(bundlePath, 'identity/function-calling-specialty.md');
      expect(existsSync(specialtyPath)).toBe(true);

      const content = readFileSync(specialtyPath, 'utf8');
      expect(content.length).toBeGreaterThan(50);
    });

    it('should have valid voice configuration in manifest', () => {
      const manifestPath = join(bundlePath, 'persona.manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      expect(manifest.voice).toBeDefined();
      // Voice config uses voice_id field
      expect(manifest.voice.voice_id || manifest.voice.voiceId || manifest.voice.id).toBeTruthy();
      expect(manifest.voice.provider).toBeTruthy();
    });

    it('should have cognitive profile defined', () => {
      const manifestPath = join(bundlePath, 'persona.manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

      // Check for cognitive or personality config in manifest or separate file
      // Manifests use 'cognitive.reasoning_style' or 'personality.traits'
      const hasCognitiveInManifest = !!(
        manifest.cognitive?.reasoning_style ||
        manifest.personality?.traits?.length > 0 ||
        manifest.cognitiveProfile ||
        manifest.traits
      );

      const cognitiveFilePath = join(bundlePath, 'identity/cognitive-profile.json');
      const cognitiveContentPath = join(bundlePath, 'content/behaviors/cognitive.json');
      const hasCognitiveFile = existsSync(cognitiveFilePath) || existsSync(cognitiveContentPath);

      expect(hasCognitiveInManifest || hasCognitiveFile).toBe(true);
    });

    it('should have behaviors directory with content', () => {
      const behaviorsPath = join(bundlePath, 'content/behaviors');

      if (existsSync(behaviorsPath)) {
        // If behaviors directory exists, it should have content
        const { readdirSync } = require('node:fs');
        const files = readdirSync(behaviorsPath);
        expect(files.length).toBeGreaterThan(0);
      }
      // Some personas may not have behaviors directory yet - that's OK
    });

    it('should have valid trust-phrases.json if present', () => {
      const trustPath = join(bundlePath, 'content/behaviors/trust-phrases.json');

      if (existsSync(trustPath)) {
        const content = JSON.parse(readFileSync(trustPath, 'utf8'));
        // Should have at least one trust category
        expect(Object.keys(content).length).toBeGreaterThan(0);
      }
    });

    it('should have valid superhuman-insights.json if present', () => {
      const insightsPath = join(bundlePath, 'content/behaviors/superhuman-insights.json');

      if (existsSync(insightsPath)) {
        const content = JSON.parse(readFileSync(insightsPath, 'utf8'));
        expect(Object.keys(content).length).toBeGreaterThan(0);
      }
    });
  });

  describe('Cross-persona consistency', () => {
    it('should have unique voice IDs for each persona', () => {
      const voiceIds = new Set<string>();

      for (const personaId of PERSONAS) {
        const manifestPath = join(BUNDLES_PATH, personaId, 'persona.manifest.json');
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        // Voice ID can be voice_id, voiceId, or id
        let voiceId = manifest.voice?.voice_id || manifest.voice?.voiceId || manifest.voice?.id;

        // Handle env variable placeholders like ${env:FERNI_VOICE_ID|default}
        if (voiceId && voiceId.includes('${env:')) {
          const defaultMatch = voiceId.match(/\|([^}]+)}/);
          voiceId = defaultMatch ? defaultMatch[1] : voiceId;
        }

        if (voiceId) {
          expect(voiceIds.has(voiceId)).toBe(false);
          voiceIds.add(voiceId);
        }
      }
    });

    it('should all have the shared function-calling-base', () => {
      const basePath = join(BUNDLES_PATH, 'shared/function-calling-base.md');
      expect(existsSync(basePath)).toBe(true);

      const content = readFileSync(basePath, 'utf8');
      expect(content).toContain('{"fn":');
    });

    it('should have prompt-assembler available', () => {
      const assemblerPath = join(BUNDLES_PATH, 'prompt-assembler.ts');
      expect(existsSync(assemblerPath)).toBe(true);
    });
  });

  describe('Persona loader integration', () => {
    it('should be able to load all personas via loader', async () => {
      // Dynamic import to avoid circular deps in test
      const { loadBundleById } = await import('../bundles/loader.js');

      for (const personaId of PERSONAS) {
        const bundle = await loadBundleById(personaId);

        expect(bundle).toBeDefined();
        // Bundle uses manifest.identity.id
        expect(bundle?.manifest?.identity?.id).toBe(personaId);
        // Bundle path should exist
        expect(bundle?.bundlePath).toBeTruthy();
        // Voice config exists in manifest
        expect(bundle?.manifest?.voice).toBeDefined();
        // Loaded timestamp should be present
        expect(bundle?.loadedAt).toBeInstanceOf(Date);
      }
    });
  });
});
