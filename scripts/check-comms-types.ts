#!/usr/bin/env npx tsx
/**
 * Comms types declared more than once: an exported `type`, `interface` or `enum` in src/
 * whose name is on the comms list below and that more than one file declares.
 *
 * The way Ferni and the team contact people and follow through has one glossary
 * (docs/architecture/comms-glossary.md), but in code one idea often has several types:
 * seven `OutreachChannel`s with seven value sets, five `Commitment`s. Each later merge
 * deletes duplicates; this check lists what is left, so a merge can show the count going
 * down. The glossary's "Duplicates today" table must name exactly what this check finds
 * (its test reads both).
 *
 * Report-only for now: it always exits 0, unless `--max N` is given, which exits 1 when
 * the count is above N. That is for a later ratchet; no workflow runs this yet.
 *
 *   pnpm quality:comms-types           list the duplicates (exit 0)
 *   pnpm quality:comms-types --max 30  exit 1 when more than 30 names are duplicated
 *
 * A declaration is a top-level exported type alias, interface or enum with that name.
 * Imports, re-exports (`export { X }`, `export type { X } from`) and aliases are uses.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import ts from 'typescript';
import { fileURLToPath, pathToFileURL } from 'url';

/**
 * The comms names this check watches, grouped by glossary noun. The ONE list: the glossary
 * points here. A name joins when it is a glossary noun, or that noun's record with a
 * qualifier (Pending, Scheduled, Open, ...) or its status, type, priority or channel.
 */
export const COMMS_TYPE_NAMES: readonly string[] = [
  // Person
  'Person',
  // Thread
  'Thread',
  'ConversationThread',
  'OpenThread',
  'ThreadStatus',
  // Touch (one contact on a channel)
  'Touch',
  'ThreadTouch',
  'OutreachChannel',
  'DeliveryChannel',
  'EngagementChannel',
  'ScheduledOutreach',
  'OutreachType',
  'OutreachPriority',
  // Follow-up, and the commitments and promises it absorbs
  'FollowUp',
  'FollowUpItem',
  'PendingFollowUp',
  'FollowUpStatus',
  'FollowUpKind',
  'Commitment',
  'CommitmentStatus',
  'CommitmentType',
  // Reminder
  'Reminder',
  'EventReminder',
  'ReminderStatus',
  // Check-in
  'CheckIn',
  'PlannedCheckIn',
  'ScheduledCheckIn',
  'EmotionalCheckIn',
  'CheckInStatus',
  // Task
  'Task',
  'TaskStatus',
  'TaskPriority',
  // Errand
  'Errand',
  'ErrandState',
  'ErrandStatus',
  // Workflow
  'Workflow',
  'WorkflowStatus',
  // Action
  'Action',
  'ActionItem',
  'PendingAction',
  'ActionStatus',
  // Ask, Reply, Report, Message
  'Ask',
  'Reply',
  'Report',
  'Message',
  'MessageKind',
  // Suggestion
  'Suggestion',
  'OutreachSuggestion',
  // Handoff
  'Handoff',
  'HandoffRequest',
  'HandoffResult',
  'HandoffRecord',
  // Preference
  'Preference',
  'MessagingPrefs',
  'UserOutreachPreferences',
  'CommunicationPreference',
];

export interface CommsDeclaration {
  name: string;
  file: string;
  line: number;
}

/** A name exported from more than one file, with every declaration of it. */
export interface CommsDuplicate {
  name: string;
  sites: CommsDeclaration[];
}

const WATCHED = new Set(COMMS_TYPE_NAMES);
const MENTION = new RegExp(`\\b(${COMMS_TYPE_NAMES.join('|')})\\b`);

const isExported = (s: ts.Statement): boolean =>
  (ts.canHaveModifiers(s) ? ts.getModifiers(s) : undefined)?.some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword
  ) ?? false;

/** Every top-level exported declaration of a watched name in `files` (paths relative to `root`). */
export function commsDeclarations(root: string, files: string[]): CommsDeclaration[] {
  const out: CommsDeclaration[] = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!MENTION.test(text)) continue; // cheap prefilter: most files never mention them
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const s of sf.statements) {
      const declares =
        ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isEnumDeclaration(s);
      if (!declares || !isExported(s) || !WATCHED.has(s.name.text)) continue;
      out.push({
        name: s.name.text,
        file,
        line: sf.getLineAndCharacterOfPosition(s.getStart()).line + 1,
      });
    }
  }
  return out;
}

/** Names declared in more than one file, by name; sites sorted by file. */
export function commsDuplicates(decls: CommsDeclaration[]): CommsDuplicate[] {
  const byName = new Map<string, CommsDeclaration[]>();
  for (const d of decls) byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
  return [...byName]
    .filter(([, sites]) => new Set(sites.map((s) => s.file)).size > 1)
    .map(([name, sites]) => ({
      name,
      sites: [...sites].sort((a, b) => a.file.localeCompare(b.file)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every .ts/.tsx file under root/src, relative to root. */
export function sourceFiles(root: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (entry === 'node_modules') return [];
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx?$/.test(entry) ? [relative(root, path)] : [];
    });
  return walk(join(root, 'src'));
}

function parseMax(args: string[]): number | undefined {
  const at = args.findIndex((a) => a === '--max' || a.startsWith('--max='));
  if (at === -1) return undefined;
  const raw = args[at].startsWith('--max=') ? args[at].slice('--max='.length) : args[at + 1];
  const max = Number(raw);
  if (raw === undefined || raw === '' || !Number.isInteger(max) || max < 0) {
    throw new Error(`--max needs a whole number of 0 or more, got ${raw ?? 'nothing'}`);
  }
  return max;
}

/** The check: prints the duplicates and returns the exit code (1 only when over --max). */
export function run(root: string, args: string[], say: (t: string) => unknown): number {
  const max = parseMax(args);
  const dupes = commsDuplicates(commsDeclarations(root, sourceFiles(root)));
  say(`Comms type names exported from more than one file in src/: ${dupes.length}`);
  for (const d of dupes) {
    say(`  ${d.name} (${d.sites.length})`);
    for (const s of d.sites) say(`    ${s.file}:${s.line}`);
  }
  if (max !== undefined && dupes.length > max) {
    say(`\n${dupes.length} duplicated comms type names, above --max ${max}.`);
    say('Fix: import the canonical type named in docs/architecture/comms-glossary.md.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    process.exit(run(root, process.argv.slice(2), (t) => console.log(t)));
  } catch (error: unknown) {
    console.error(
      `quality:comms-types could not run: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
