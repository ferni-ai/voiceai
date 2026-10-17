/**
 * Story timing against the REAL persona bundles.
 *
 * 2026-10-17 live call: the second turn with Nayan ("I'm pretty good.", text
 * emotion joy) crashed the whole turn with
 * `TypeError: Cannot read properties of undefined (reading 'some')`. Joy lifts
 * engagement out of "low", so story timing got past its gates and scored
 * Nayan's stories — none of which has a `triggers` array (his bundle keeps
 * them in `_index.json` as `topics`, and his story text in
 * `narrative.paragraphs`). Five of Maya's stories had the same gap.
 */
import { describe, expect, it } from 'vitest';

import { loadBundleAsPersona } from '../../personas/bundles/index.js';
import { StoryTimingEngine, type StoryTimingContext } from '../story-timing.js';

const PERSONAS = [
  'ferni',
  'maya-santos',
  'peter-john',
  'alex-chen',
  'jordan-taylor',
  'nayan-patel',
] as const;

/** The live-call state: deep into a call, engaged user, no story told yet. */
const joyTurn: StoryTimingContext = {
  turnCount: 43,
  conversationDurationMs: 7 * 60_000,
  storiesToldThisSession: [],
  userEngagement: 'high',
  userPacing: 'normal',
  currentTopic: undefined,
  recentTopics: [],
};

describe('story timing with real bundle stories', () => {
  it('scores Nayan on a joy turn without throwing, and returns tellable text', async () => {
    const nayan = await loadBundleAsPersona('nayan-patel');
    expect(nayan?.stories?.length).toBeGreaterThan(0);

    const rec = new StoryTimingEngine().evaluateStoryTiming(nayan!, joyTurn);

    expect(rec.shouldTell).toBe(true);
    // buildResponseGuidance slices this into the turn's story opportunity.
    expect(typeof rec.story?.content).toBe('string');
    expect(rec.story!.content.length).toBeGreaterThan(40);
  });

  // Prod 10-14 and 10-17 (Ferni): eight turns failed with "reading 'slice'". Kintsugi keeps
  // its text in core_teaching.content, so `story.content.slice(0, 200)` in
  // buildResponseGuidance read undefined; the story was never marked told, so it failed again.
  // All on short "Really?" / "Are you sure?" turns: no topic, so every story ties and the
  // index order picks; two told earlier in the call leaves kintsugi next.
  it("gives Ferni's kintsugi story text on a topic-less turn", async () => {
    const ferni = await loadBundleAsPersona('ferni');
    const rec = new StoryTimingEngine().evaluateStoryTiming(ferni!, {
      ...joyTurn,
      storiesToldThisSession: ['commodore-64', 'wyoming-patience'],
    });

    expect(rec.story?.id).toBe('kintsugi');
    expect(rec.story!.content.slice(0, 200)).toMatch(/\w{3,}/);
  });

  it.each(PERSONAS)('every %s story has triggers and text', async (id) => {
    const persona = await loadBundleAsPersona(id);
    const broken = (persona?.stories ?? [])
      .filter(
        (s) =>
          !Array.isArray(s.triggers) ||
          s.triggers.length === 0 ||
          typeof s.content !== 'string' ||
          s.content.trim() === ''
      )
      .map((s) => s.id);

    expect(broken).toEqual([]);
  });
});
