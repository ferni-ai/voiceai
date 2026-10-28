#!/usr/bin/env node
// Judge the calls review-calls.mjs rebuilt, and say what wasn't human.
//
// usage: judge-calls.mjs [day-dir]   (default: today's call-reviews folder)
//
// For each call with at least MIN_CALLER_TURNS caller turns and a whole
// transcript (not interleaved with another session on the pod):
// - judge.mjs scores it (subprocess, so a newer judge is picked up as is;
//   JUDGE_K defaults to 1 here, JUDGE_PROVIDERS passes through);
// - the transcript is checked for Ferni coming back to its own topics and for
//   claims of an action no tool call backs;
// - one model call reads the director's notes against the reply that followed
//   (ignored = the reply did what the note said not to) and lists the moments
//   that weren't human, in its own words.
// Then the day's failure clusters become candidate scenario stubs.
//
// Caller words never leave the evidence folder: every model-written line is
// checked against the caller's turns, and one that repeats four or more of
// their words in a row is dropped (leakCheck).
//
// Writes: calls.json (metrics.selfTopicRepeats, metrics.unbackedActionClaims,
// metrics.directorNotes.ignored, judge, notHuman per call), review.md and
// scenario-stubs/<cluster>.txt in the day folder.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { judgeModel } from '../lib/judge-model.mjs';

const run = promisify(execFile);
const HERE = new URL('.', import.meta.url).pathname;
const MIN_CALLER_TURNS = 4;
const MODEL = process.env.REVIEW_MODEL ?? judgeModel();

const STOP = new Set(
  'that this they them their with what have from about your just like been were when then there some would could should into only also very really going want know think yeah okay well right maybe kind little thing things still much even actually honestly pretty mean sure good feel time something anything back over make made here where which those these does doing done said says while because though again around always never other another first second minute down every whole completely totally definitely probably usually literally exactly basically sometimes already enough forever today tonight late early quite whatever everything nothing someone people moved'.split(
    ' '
  )
);
// Plural to singular only; contractions ("doesn't", "it's") are never topics.
const stem = (w) => w.replace(/(?<=[a-z]{3})s$/, '');
const topicWords = (t) =>
  new Set(
    (t.toLowerCase().match(/[a-z']+/g) ?? [])
      .filter((w) => !w.includes("'") && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 4 && !STOP.has(w))
  );

/**
 * Ferni coming back to a topic of its own: a word Ferni brought up first (not
 * the caller, and not in the greeting, which holds the caller's name) that is
 * in three or more of Ferni's turns. turns counts each return after the first
 * mention that the caller had not just prompted.
 */
export function selfTopicRepeats(events) {
  const firstBy = new Map(); // word -> 'user' | 'agent' | 'greeting'
  const uses = new Map();
  const returns = new Map();
  let lastCaller = new Set();
  let greeted = false;
  for (const e of events) {
    const ws = topicWords(e.text);
    if (e.who === 'user') {
      for (const w of ws) if (!firstBy.has(w)) firstBy.set(w, 'user');
      lastCaller = ws;
      continue;
    }
    for (const w of ws) {
      if (!firstBy.has(w)) firstBy.set(w, greeted ? 'agent' : 'greeting');
      uses.set(w, (uses.get(w) ?? 0) + 1);
      if (uses.get(w) > 1 && !lastCaller.has(w)) returns.set(w, (returns.get(w) ?? 0) + 1);
    }
    greeted = true;
  }
  const topics = [...uses]
    .filter(([w, n]) => n >= 3 && firstBy.get(w) === 'agent')
    .map(([word, turns]) => ({ word, turns }))
    .sort((a, b) => b.turns - a.turns);
  return { turns: topics.reduce((a, t) => a + (returns.get(t.word) ?? 0), 0), topics };
}

// Ferni saying it did something only a tool can do.
const ACTION_CLAIM =
  /\b(i('ve| have)? (just )?(set|added|scheduled|booked|saved|sent|texted|emailed|put) (a|the|your|it|that|you)\b|i('ve| have)? (just )?looked (it|that) up|i made a note|i('ll| will) remind you)\b/i;

/** Ferni turns claiming an action with no tool call between the caller's last turn and it. */
export function unbackedActionClaims(run) {
  const toolTimes = (run.tools ?? []).map((x) => x.t);
  let lastUserT = -Infinity;
  let n = 0;
  for (const e of run.events) {
    if (e.who === 'user') lastUserT = e.t;
    else if (ACTION_CLAIM.test(e.text) && !toolTimes.some((t) => t >= lastUserT && t <= e.t + 2000))
      n += 1;
  }
  return n;
}

const norm = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) ?? []).join(' ');

/** False when text repeats n or more of the caller's words in a row. */
export function leakCheck(text, callerTurns, n = 4) {
  const said = callerTurns.map(norm);
  const ws = norm(text).split(' ');
  for (let i = 0; i + n <= ws.length; i++) {
    const gram = ws.slice(i, i + n).join(' ');
    if (said.some((s) => ` ${s} `.includes(` ${gram} `))) return false;
  }
  return true;
}

/** Each director note paired with the first Ferni reply after it. */
export function notePairs(run) {
  const pairs = [];
  for (const { t, notes } of run.notes ?? []) {
    const reply = run.events.find((e) => e.who === 'agent' && e.t > t);
    if (!reply) continue;
    const turn = run.events.indexOf(reply) + 1;
    for (const note of notes) pairs.push({ note, turn, reply: reply.text });
  }
  return pairs;
}

export function reviewPrompt(run, metrics, judge) {
  const transcript = run.events
    .map((e, i) => `${i + 1}. ${e.who === 'agent' ? 'FERNI' : 'CALLER'}: ${e.text}`)
    .join('\n');
  const notes = notePairs(run)
    .map((p, i) => `${i + 1}. before turn ${p.turn}: ${p.note}`)
    .join('\n');
  return `You review a real phone call between Ferni (an AI friend who should sound fully human) and a caller. Transcripts come from speech recognition; ignore small transcription slips. Caller lines are cut at 100 characters.

CALL (numbered turns):
${transcript}

DIRECTOR NOTES (private notes Ferni read before the turn named):
${notes || '(none)'}

MEASURED: ${JSON.stringify({ replyGapMs: metrics.replyGapMs, callerTalkShare: metrics.callerTalkShare, presence: metrics.presence, crisis: metrics.crisis, selfTopicRepeats: metrics.selfTopicRepeats })}
JUDGE'S WORST MOMENT: ${JSON.stringify(judge?.worst ?? null)}

1. For each director note, say whether the turn after it did what the note told Ferni not to do, or plainly failed to do what it asked.
2. List the moments a real friend would not have done (at most 6, worst first). Describe each in your own words. NEVER quote or closely paraphrase what the caller said; describe the situation ("the caller asked a short follow-up and Ferni retold its own story"). Give each a short cluster name shared across calls (e.g. "own-topic loop", "false crisis alarm", "presence check too soon", "slow first reply", "dodged a direct question").

Reply with JSON only:
{"notes": [{"n": <note number>, "ignored": true|false}], "notHuman": [{"turn": <n>, "what": "<your words>", "cluster": "<name>"}]}`;
}

async function askModel(prompt, project) {
  const { stdout } = await run('gcloud', ['auth', 'print-access-token']);
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stdout.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 32768,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      `review model ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 300)}`
    );
  return JSON.parse((body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''));
}

/** The model's review, with ignored-note count and leaky lines dropped. */
export function applyReview(reply, run) {
  const caller = run.events.filter((e) => e.who === 'user').map((e) => e.text);
  const notHuman = (reply.notHuman ?? []).filter(
    (m) => typeof m.what === 'string' && leakCheck(m.what, caller)
  );
  return {
    ignored: (reply.notes ?? []).filter((n) => n.ignored === true).length,
    notHuman,
    dropped: (reply.notHuman ?? []).length - notHuman.length,
  };
}

const stubPrompt = (
  clusters
) => `These failure clusters came from today's real calls with Ferni, an AI friend on the phone:
${JSON.stringify(clusters, null, 1)}

For each cluster write a voice-eval scenario that would make the failure likely: 4 to 8 lines a caller says, one per line, in a casual voice. Invent new, ordinary content; never reuse wording from the descriptions. Reply with JSON only: {"stubs": [{"cluster": "<name>", "why": "<one line: what Ferni did and what a friend would do>", "lines": ["..."]}]}`;

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** review.md: numbers, flags and the paraphrased not-human list. No caller words. */
export function reviewMarkdown(day) {
  const rows = day.calls.map((c) => {
    const m = c.metrics;
    const flags = [
      m.crisis.disagreements && `crisis classifier disagreements ${m.crisis.disagreements}`,
      m.crisis.resourcesSpoken && `crisis resources spoken ${m.crisis.resourcesSpoken}`,
      m.presence.spokenChecks && `"still there?" checks ${m.presence.spokenChecks}`,
      Object.keys(m.presence.sounds).length &&
        `presence sounds ${JSON.stringify(m.presence.sounds)}`,
      m.selfTopicRepeats?.topics.length &&
        `kept returning to ${m.selfTopicRepeats.topics.map((t) => `${t.word}×${t.turns}`).join(', ')}`,
      m.summary.fallback && `summary fallback (${m.summary.source})`,
      m.unbackedActionClaims && `action claims with no tool call ${m.unbackedActionClaims}`,
      c.interleaved && 'another session shared the pod; unattributed lines dropped',
    ].filter(Boolean);
    const j = c.judge?.scores;
    return [
      `### ${c.env} ${c.userKind} ${c.sessionId} (${c.startedAt}, ${c.durationSec ?? '?'} s)`,
      `- reply gap p50 ${m.replyGapMs.p50} ms, p90 ${m.replyGapMs.p90} ms, first ${m.replyGapMs.first} ms (n=${m.replyGapMs.n}, ${m.replyGapMs.source})`,
      `- caller talk share ${m.callerTalkShare}; Ferni returned to its own topic ${m.selfTopicRepeats?.turns ?? '?'} times`,
      `- director notes ${m.directorNotes.notes}, ignored ${m.directorNotes.ignored ?? 'not judged'}`,
      j
        ? `- judge: ${Object.entries(j)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ')}; human likelihood ${c.judge.humanLikelihood}`
        : '- judge: not judged',
      ...flags.map((f) => `- FLAG: ${f}`),
      ...(c.notHuman?.length
        ? [
            "- what wasn't human:",
            ...c.notHuman.map((x) => `  - turn ${x.turn} [${x.cluster}]: ${x.what}`),
          ]
        : []),
    ].join('\n');
  });
  return `# Call review ${day.date}\n\nWindow ${day.window.since} to ${day.window.until}. ${day.calls.length} reviewed call(s); ${day.skipped} other session(s) not reviewed (no consent).\n\n${rows.join('\n\n')}\n`;
}

async function judgeCall(file, kind, r) {
  const env = {
    ...process.env,
    JUDGE_K: process.env.JUDGE_K ?? '1',
    JUDGE_CALLER_NAME: kind === 'owner' ? 'Seth' : 'Sam',
  };
  const verdict = file.replace(/\.json$/, '.judge.json');
  // A verdict from an earlier run of this script is reused; REJUDGE=1 asks again.
  if (!existsSync(verdict) || process.env.REJUDGE === '1')
    await run('node', [join(HERE, 'judge.mjs'), file], { env, maxBuffer: 1 << 26 });
  const v = JSON.parse(readFileSync(verdict, 'utf8'));
  const w = v.samples?.[0]?.worstMoment;
  return {
    scores: v.scores,
    humanLikelihood: v.humanLikelihood,
    model: v.model,
    k: v.k,
    worst:
      w &&
      leakCheck(
        w.why ?? '',
        r.events.filter((e) => e.who === 'user').map((e) => e.text)
      )
        ? { turn: w.turn, why: w.why }
        : null,
    inventedHistory: v.inventedHistory?.length ?? 0,
    fakedKnowledge: v.candorTurns?.fakedKnowledge ?? null,
  };
}

async function main() {
  const dir =
    process.argv[2] ??
    join(
      homedir(),
      'Documents/voiceai-evidence/call-reviews',
      new Date().toISOString().slice(0, 10)
    );
  const day = JSON.parse(readFileSync(join(dir, 'calls.json'), 'utf8'));
  const project = process.env.GCP_PROJECT ?? 'johnb-2025';
  // Four calls at a time: each is a judge run plus one review request.
  const queue = [...day.calls];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const file = join(dir, c.runFile);
      const r = JSON.parse(readFileSync(file, 'utf8'));
      c.metrics.selfTopicRepeats = selfTopicRepeats(r.events);
      c.metrics.unbackedActionClaims = unbackedActionClaims(r);
      // An interleaved call lost caller lines it couldn't attribute; judging it would be unfair.
      if (c.metrics.callerTurns < MIN_CALLER_TURNS || c.interleaved) continue;
      try {
        c.judge = await judgeCall(file, c.userKind, r);
        const review = applyReview(await askModel(reviewPrompt(r, c.metrics, c.judge), project), r);
        c.metrics.directorNotes.ignored = review.ignored;
        c.notHuman = review.notHuman;
        console.log(
          `${c.sessionId}: ${JSON.stringify(c.judge.scores)} ignored notes ${review.ignored}, ${review.notHuman.length} moments (${review.dropped} dropped by leak check)`
        );
      } catch (e) {
        console.error(`${c.sessionId}: ${e.message}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const clusters = {};
  for (const c of day.calls)
    for (const m of c.notHuman ?? []) (clusters[m.cluster] ??= []).push(m.what);
  writeFileSync(join(dir, 'calls.json'), JSON.stringify(day, null, 2));
  writeFileSync(join(dir, 'review.md'), reviewMarkdown(day));
  console.log(`review -> ${join(dir, 'review.md')}`);
  // The ten most common clusters, three examples each, keep the request small.
  const top = Object.entries(clusters)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([cluster, whats]) => ({ cluster, calls: whats.length, examples: whats.slice(0, 3) }));
  if (top.length) {
    const reply = await askModel(stubPrompt(top), project);
    const allCaller = day.calls.flatMap((c) =>
      JSON.parse(readFileSync(join(dir, c.runFile), 'utf8'))
        .events.filter((e) => e.who === 'user')
        .map((e) => e.text)
    );
    mkdirSync(join(dir, 'scenario-stubs'), { recursive: true });
    for (const s of reply.stubs ?? []) {
      const lines = (s.lines ?? []).filter((l) => leakCheck(l, allCaller));
      const f = join(dir, 'scenario-stubs', `${slug(s.cluster)}.txt`);
      if (lines.length && leakCheck(s.why ?? '', allCaller) && !existsSync(f))
        writeFileSync(
          f,
          `# CANDIDATE from the ${day.date} call review, for human review before use.\n# ${s.cluster}: ${s.why}\n${lines.join('\n')}\n`
        );
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
