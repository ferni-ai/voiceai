/**
 * Team Huddle and Team Observations are gone, and nothing still points at them.
 *
 * Both panels showed invented content: POST /api/huddles/start builds each
 * teammate's "comment" from Math.random over canned templates
 * (src/api/routes/team.ts), kept in memory. The settings menu had handlers but
 * no row; the only live way in was the voice trigger "what does the team think"
 * (engagement_trigger team_suggestion), and a feature hint promised
 * "Team Huddles are here!" at building-trust.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getFeatureHints } from '../../src/ui/feature-hints.ui.js';
import { openPanelForNotificationType } from '../../src/services/notification-navigation.js';

const SRC = join(__dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

describe('Team Huddle and Team Observations', () => {
  it('no feature hint announces team huddles', () => {
    const ids = getFeatureHints().map((hint) => hint.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('team-huddle-intro');
  });

  it('a team_huddle push opens nothing', () => {
    expect(openPanelForNotificationType('team_huddle')).toBe(false);
  });

  it('no source file imports either panel or opens a huddle', () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const text = readFileSync(file, 'utf-8');
      return (
        /team-huddle\.ui|team-observations-panel\.ui/.test(text) ||
        text.includes('ferni:open-team-huddle') ||
        text.includes('/api/huddles/start')
      );
    });
    expect(offenders).toEqual([]);
  });
});
