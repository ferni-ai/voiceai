#!/usr/bin/env node
// One call's TURN_RECEIPT lines as a per-turn table (src/agents/shared/turn-receipt.ts).
//
// A receipt holds counts, ids, enums and timings only, so this prints no words:
// latency per step, the model's prompt tokens, what the request carried by
// section (when the receipt has sections), the director's notes kept/offered,
// tools offered/called, handoffs and the reply's size.
//
// usage: receipts.mjs <sessionId> [--freshness 7d] [--project johnb-2025] [--json]
//        receipts.mjs <sessionId> --file entries.json   (saved `gcloud logging read --format=json`)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const LOG = 'cloud-agents';

/** The gcloud filter for one call's receipts. */
export function logFilter(session, project) {
  if (!/^[\w.:-]+$/.test(session)) throw new Error(`not a session id: ${session}`);
  return `logName="projects/${project}/logs/${LOG}" AND textPayload:"TURN_RECEIPT" AND textPayload:"${session}"`;
}

/** The receipt in one log line (a pino JSON object, maybe after a prefix), or null. */
export function receiptOf(text) {
  const start = typeof text === 'string' ? text.indexOf('{') : -1;
  if (start < 0) return null;
  try {
    const r = JSON.parse(text.slice(start));
    return r && (r.event === 'TURN_RECEIPT' || r.msg === 'TURN_RECEIPT') ? r : null;
  } catch {
    return null;
  }
}

/** This call's receipts from log entries, oldest first, each turn once. */
export function receiptsFrom(entries, session) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const r = receiptOf(e.textPayload ?? (e.jsonPayload ? JSON.stringify(e.jsonPayload) : ''));
    if (!r || r.sessionId !== session) continue;
    const key = `${r.personaId}:${r.turn}:${r.endedBy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, at: e.timestamp ?? r.time ?? null });
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.turn - b.turn);
}

const num = (v) => (v === null || v === undefined ? '-' : String(v));

/** The biggest prompt sections, as name:tokens. */
function topSections(r, n = 3) {
  const sections = r.prompt?.sections ?? [];
  return [...sections]
    .sort((a, b) => b.tokensEst - a.tokensEst)
    .slice(0, n)
    .map((s) => `${s.name}:${s.tokensEst}`)
    .join(' ');
}

/** One row per turn. */
export function rows(receipts) {
  return receipts.map((r) => {
    const t = r.timing ?? {};
    const tok = r.tokens;
    const handoff = r.tools?.handoff;
    return {
      turn: num(r.turn),
      persona: num(r.personaId),
      user: num(r.userKind),
      end: num(r.endedBy),
      eou: num(t.eouDelayMs),
      ttft: num(t.llmTtftMs),
      ready: num(t.llmReadyMs),
      audio: num(t.firstAudioMs),
      done: num(t.replyDoneMs),
      prompt: tok
        ? `${tok.prompt}${tok.prompt ? ` (${Math.round((100 * tok.promptCached) / tok.prompt)}%c)` : ''}`
        : '-',
      est: num(r.prompt?.totalTokensEst),
      sections: topSections(r) || '-',
      director: r.director ? `${r.director.kept}/${r.director.offered}` : '-',
      tools: r.tools
        ? `${num(r.tools.offered)}→${r.tools.called.length ? r.tools.called.join(',') : '0'}`
        : '-',
      handoff: handoff?.attempted ? `${handoff.tool}:${handoff.result}` : '-',
      reply: r.reply
        ? `${r.reply.chars}c/${r.reply.sentences}s${r.reply.interrupted ? ' INT' : ''}`
        : '-',
    };
  });
}

/** A plain fixed-width table. */
export function table(rowList) {
  if (rowList.length === 0) return '(no TURN_RECEIPT lines)';
  const cols = Object.keys(rowList[0]);
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(c.length, ...rowList.map((r) => r[c].length))])
  );
  const line = (r) =>
    cols
      .map((c) => r[c].padEnd(width[c]))
      .join('  ')
      .trimEnd();
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), ...rowList.map(line)].join('\n');
}

function arg(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const session = args[0];
  if (!session || session.startsWith('--')) {
    console.error(
      'usage: receipts.mjs <sessionId> [--freshness 7d] [--project johnb-2025] [--json] [--file entries.json]'
    );
    process.exit(2);
  }
  const project = arg(args, '--project', 'johnb-2025');
  const file = arg(args, '--file', null);
  const raw = file
    ? readFileSync(file, 'utf8')
    : execFileSync(
        'gcloud',
        [
          'logging',
          'read',
          logFilter(session, project),
          `--project=${project}`,
          '--format=json',
          `--freshness=${arg(args, '--freshness', '7d')}`,
          '--limit=2000',
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      );
  const receipts = receiptsFrom(JSON.parse(raw || '[]'), session);
  if (args.includes('--json')) console.log(JSON.stringify(receipts, null, 2));
  else console.log(table(rows(receipts)));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
