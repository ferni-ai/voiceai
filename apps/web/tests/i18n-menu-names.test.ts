/**
 * English copy: each menu row's panel is titled with the row's name, and no
 * locale value uses an em dash.
 *
 * 2026-10-18 UI audit: rows opened panels under other names ("When We've
 * Talked" opened "Past Chats", "How You're Feeling" opened "State of Me",
 * "Take Your Story" opened "Your Data"...), and 42 values in en-US used em
 * dashes, which the brand voice doesn't. The cute names stay; the titles match.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const ENGLISH = ['en-US', 'en-GB'] as const;
const load = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, `${name}.json`), 'utf8'));

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

function strings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Menu row label key → the key of the title on the panel it opens */
const ROW_TO_TITLE: Array<[string, string]> = [
  ['menu.items.journaling', 'chronicle.title'],
  ['menu.items.exportData', 'dataExport.title'],
  ['menu.items.whatsAhead', 'calendarView.yourSchedule'],
  ['menu.items.whatsAhead', 'calendarView.whatsAhead'],
  ['menu.items.conversationHistory', 'conversationHistory.title'],
  ['menu.mobileSheet.actions.history', 'conversationHistory.title'],
  ['menu.items.notifications', 'notificationSettings.title'],
  ['menu.items.contacts', 'yourPeople.title'],
  ['menu.mobileSheet.actions.people', 'yourPeople.title'],
  ['menu.items.allConnections', 'menu.sections.connectedLife'],
  ['menu.items.accountBilling', 'manageSubscription.title'],
  ['menu.items.wellbeingDashboard', 'wellbeing.stateOfMe'],
  ['menu.mobileSheet.actions.settings', 'menu.title'],
  ['menu.mobileSheet.actions.calendar', 'calendarView.whatsAhead'],
];

describe.each(ENGLISH)('%s', (name) => {
  const locale = load(name);

  it.each(ROW_TO_TITLE)('row %s names the panel it opens (%s)', (rowKey, titleKey) => {
    const row = valueOf(locale, rowKey);
    const title = valueOf(locale, titleKey);
    expect(typeof row).toBe('string');
    expect(title).toBe(row);
  });

  it('the data panel has a plain subtitle', () => {
    expect(valueOf(locale, 'dataExport.subtitle')).toBe("Download what we've shared");
  });

  it('no value uses an em dash', () => {
    const withDash = strings(locale).filter(([, v]) => v.includes('—')).map(([k]) => k);
    expect(withDash).toEqual([]);
  });
});
