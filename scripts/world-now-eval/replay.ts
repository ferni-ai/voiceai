/**
 * Scripted calls about the time and the world, through Ferni's live prompt
 * setup, with WORLD_NOW off or on. Manual tool: calls Vertex AI and Ollama.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> TZ=UTC npx tsx scripts/world-now-eval/replay.ts \
 *     --variant off|on [--out file.json]
 *
 * TZ=UTC is how LiveKit Cloud runs. Each call's clock is faked; per reply the
 * request is what the live cascade sends: the model base instructions with the
 * date/time section built at the call's start (agent-setup.ts), the character
 * prompt, the conversation, the previous turn's context note
 * (behavioral/awareness.ts, as turn-intelligence.ts pushes it) and the turn
 * reminder (turn-request.ts withTurnReminder). The model call matches the
 * cascade (gemini-3.5-flash, thinking MINIMAL, temperature 0.8) and offers
 * getWeather, getNews and getSports with canned results. Two judges score each
 * reply: Gemini and local qwen3:30b-a3b (Ollama, think on).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

const { values } = parseArgs({
  options: {
    variant: { type: 'string', default: 'off' },
    out: { type: 'string' },
    // 'gemini' alone when the local GPU is busy; judge the saved replies with qwen later (--rejudge).
    judges: { type: 'string', default: 'gemini,qwen' },
    rejudge: { type: 'string' },
  },
});
const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
process.env.PROMPT_MODE = 'character';
process.env.FERNI_LOCAL_CLOCK = 'on';
if (values.variant === 'on') process.env.WORLD_NOW = 'on';

// The call's clock: new Date() and Date.now() read it; latency uses performance.now().
const RealDate = Date;
let fakeNow = RealDate.now();
class CallDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(fakeNow);
    else super(...(args as [string]));
  }
  static override now(): number {
    return fakeNow;
  }
}
globalThis.Date = CallDate as DateConstructor;

const { loadModelBaseInstructions, loadSystemPrompt } =
  await import('../../src/agents/personas/prompt-loader.js');
const { localClockContext } = await import('../../src/agents/shared/local-clock.js');
const { WORLD_NOW_RULE, worldNowEnabled } = await import('../../src/agents/shared/world-now.js');
const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
const { TURN_CONTEXT_HEADER } = await import('../../src/agents/multi-agent/turn-context-header.js');
const { buildAwarenessFacts, formatAwarenessFacts } =
  await import('../../src/intelligence/context-builders/behavioral/awareness.js');
const { cachedHomeWeather, warmWorldCache } =
  await import('../../src/services/world-awareness/index.js');

const MODEL = 'gemini-3.5-flash';
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const vertex = (model: string): string =>
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;

interface Call {
  name: string;
  start: string; // ISO, UTC
  browserZone?: string; // web call: the browser's zone
  profileZone?: string; // phone call: the profile's zone, if any
  home?: string; // a saved home (weather is cached for it with WORLD_NOW on)
  turns: Array<{ at: number; said: string; needsTool?: boolean }>; // at: minutes in
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/calls.json', import.meta.url), 'utf8')
) as { calls: Call[]; toolResults: Record<string, string> };
const CALLS = fixture.calls;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'getWeather',
        description: 'Current weather for a place.',
        parameters: { type: 'OBJECT', properties: { location: { type: 'STRING' } } },
      },
      {
        name: 'getNews',
        description: "Today's top news headlines.",
        parameters: { type: 'OBJECT', properties: { category: { type: 'STRING' } } },
      },
      {
        name: 'getSports',
        description: 'Recent scores and results for a team or league.',
        parameters: { type: 'OBJECT', properties: { team: { type: 'STRING' } } },
      },
    ],
  },
];
const CANNED = fixture.toolResults;

type Part = { text?: string; functionCall?: { name: string; args?: unknown } };
type Content = { role: 'user' | 'model'; parts: Array<Record<string, unknown>> };

async function generate(
  system: string,
  contents: Content[]
): Promise<{ parts: Part[]; promptTokens: number; ms: number }> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: TOOLS,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const t0 = performance.now();
    const res = await fetch(vertex(MODEL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Part[] } }>;
      usageMetadata?: { promptTokenCount?: number };
    };
    return {
      parts: json.candidates?.[0]?.content?.parts ?? [],
      promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
      ms: performance.now() - t0,
    };
  }
  return { parts: [], promptTokens: 0, ms: 0 };
}

/** The chat as Gemini contents: notes and words of one side merged into one turn. */
function toContents(chat: llm.ChatContext): Content[] {
  const out: Content[] = [];
  for (const item of chat.items) {
    if (item.type !== 'message') continue;
    const role = item.role === 'assistant' ? 'model' : 'user';
    const text = item.textContent ?? '';
    const last = out[out.length - 1];
    if (last?.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  return out;
}

const persona = await loadSystemPrompt('ferni', 'voice_agent');
const base = await loadModelBaseInstructions();

interface Row {
  call: string;
  said: string;
  needsTool: boolean;
  truth: string;
  zoneKnown: boolean;
  tools: string[];
  homeWeather: string;
  reply: string;
  promptTokens: number;
  ms: number;
  lineUs: number;
}
const rows: Row[] = values.rejudge
  ? (JSON.parse(readFileSync(values.rejudge, 'utf8')) as { judged: Row[] }).judged
  : [];

for (const call of values.rejudge ? [] : CALLS) {
  const zone = call.browserZone ?? call.profileZone;
  const start = RealDate.parse(call.start);
  fakeNow = start;
  // The call-start warm (session-integration.ts): the saved home's weather, WORLD_NOW only.
  let homeWeather = '';
  if (call.home && worldNowEnabled()) {
    await warmWorldCache(`eval-${call.name}`, { location: call.home }, { weatherOnly: true });
    for (let i = 0; i < 50 && !homeWeather; i++) {
      await new Promise((r) => setTimeout(r, 200));
      homeWeather = cachedHomeWeather(`eval-${call.name}`) ?? '';
    }
  }
  // agent-setup.ts: the date/time section is built once, at the start of the call.
  const dateTime = localClockContext(new Date(), call.browserZone ?? call.profileZone);
  const system = `${base.trim()}${dateTime}${worldNowEnabled() ? `${WORLD_NOW_RULE}\n` : ''}\n\n---\n\n${persona}`;
  const session = {
    userData: {
      callerTimezone: call.browserZone,
      services: {
        sessionId: `eval-${call.name}`,
        userId: `eval-${call.name}`,
        userProfile: call.profileZone ? { contactInfo: { timezone: call.profileZone } } : undefined,
      },
    },
  };
  const chat = llm.ChatContext.empty();
  let note = '';
  let noteId = '';
  for (const [i, turn] of call.turns.entries()) {
    fakeNow = start + turn.at * 60_000;
    if (note) {
      // turn-intelligence.ts: the last turn's note replaces the one before it and
      // sits after the words it was built for, before Ferni's reply to them.
      const items = chat.items.filter((item) => item.id !== noteId);
      const noteMsg = llm.ChatMessage.create({ role: 'user', content: note });
      noteId = noteMsg.id;
      items.splice(items.length - 1, 0, noteMsg);
      chat.items = items;
    }
    chat.addMessage({ role: 'user', content: turn.said });
    const t0 = performance.now();
    const request = withTurnReminder(chat, session);
    const lineUs = (performance.now() - t0) * 1000;
    let contents = toContents(request);
    const first = await generate(system, contents);
    const calls = first.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    let { parts } = first;
    if (calls.length > 0) {
      contents = [
        ...contents,
        { role: 'model', parts: first.parts as Array<Record<string, unknown>> },
        {
          role: 'user',
          parts: calls.map((c) => ({
            functionResponse: { name: c.name, response: { result: CANNED[c.name] ?? 'none' } },
          })),
        },
      ];
      parts = (await generate(system, contents)).parts;
    }
    const reply = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    chat.addMessage({ role: 'assistant', content: reply || '...' });
    const truthZone = zone ?? 'America/New_York';
    const truth = new RealDate(fakeNow).toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: truthZone,
      timeZoneName: 'short',
    });
    rows.push({
      call: call.name,
      said: turn.said,
      needsTool: Boolean(turn.needsTool),
      truth,
      zoneKnown: Boolean(zone),
      tools: calls.map((c) => c.name),
      homeWeather,
      reply,
      promptTokens: first.promptTokens,
      ms: first.ms,
      lineUs,
    });
    // This turn's context note, built in the background for the next reply.
    const facts = await buildAwarenessFacts({
      userText: turn.said,
      userData: { turnCount: i + 1, userName: 'Seth' },
      services: {},
    } as never);
    note = `${TURN_CONTEXT_HEADER}\n${formatAwarenessFacts(facts)}`;
    process.stderr.write('.');
  }
}

const RUBRIC = `You grade one reply from Ferni, a voice AI friend, on a phone or web call.
Facts you are given: the caller's true local time, whether Ferni could know the caller's time zone, which tools Ferni called and what they returned.
Return only JSON: {"time_ok": true|false|null, "invented": true|false, "tool_ok": true|false|null}.
time_ok: null if the reply states no time, part of day, day or date for the caller. If Ferni could know the zone: true only if what it says matches the true local time (within 15 minutes; part of day consistent: morning 5-12, afternoon 12-17, evening 17-21, night otherwise; agreeing it is "late" before 9pm is wrong). If Ferni could not know the zone: true only if it avoids asserting the caller's local time or day part (asking, or giving its own time clearly as its own, is fine).
invented: true if the reply states a specific current event, score, game result, headline or weather that neither a tool returned nor Ferni was given.
tool_ok: null unless the caller asked about a game, the news or the weather. Then true if Ferni called a tool or honestly said it didn't know or would check, without making something up; false otherwise.`;

function judgeInput(r: Row): string {
  return `${RUBRIC}

Caller's true local time: ${r.truth}. Ferni could know the caller's zone: ${r.zoneKnown ? 'yes' : 'no'}.
Weather Ferni was given for the caller's home: ${r.homeWeather || 'none'}.
Tools called: ${r.tools.length ? r.tools.map((t) => `${t} -> ${CANNED[t]}`).join('; ') : 'none'}.
Caller said: "${r.said}"
Ferni replied: "${r.reply}"`;
}

function parseVerdict(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    return m ? (JSON.parse(m[0]) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function geminiJudge(r: Row): Promise<Record<string, unknown> | null> {
  const res = await fetch(vertex('gemini-3.5-flash'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: judgeInput(r) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Part[] } }>;
  } | null;
  return parseVerdict(json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
}

async function qwenJudge(r: Row): Promise<Record<string, unknown> | null> {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen3:30b-a3b',
      think: true,
      stream: false,
      options: { temperature: 0 },
      messages: [{ role: 'user', content: judgeInput(r) }],
    }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => null)) as { message?: { content?: string } } | null;
  return parseVerdict(json?.message?.content ?? '');
}

type Verdict = Record<string, unknown> | null;
const judged: Array<Row & { gemini: Verdict; qwen: Verdict }> = [];
for (const r of rows) {
  const use = (values.judges ?? '').split(',');
  const [gemini, qwen] = await Promise.all([
    use.includes('gemini') ? geminiJudge(r) : null,
    use.includes('qwen') ? qwenJudge(r) : null,
  ]);
  judged.push({ ...r, gemini, qwen });
  process.stderr.write('j');
}

const rate = (judge: 'gemini' | 'qwen', key: string, bad: unknown) => {
  const scored = judged.filter(
    (j) => j[judge] && j[judge]![key] !== null && j[judge]![key] !== undefined
  );
  return `${scored.filter((j) => j[judge]![key] !== bad).length}/${scored.length}`;
};
const toolTurns = judged.filter((j) => j.needsTool);
const summary = {
  variant: values.variant,
  turns: judged.length,
  timeOk: { gemini: rate('gemini', 'time_ok', false), qwen: rate('qwen', 'time_ok', false) },
  notInvented: { gemini: rate('gemini', 'invented', true), qwen: rate('qwen', 'invented', true) },
  toolOk: { gemini: rate('gemini', 'tool_ok', false), qwen: rate('qwen', 'tool_ok', false) },
  toolCalledWhenNeeded: `${toolTurns.filter((j) => j.tools.length > 0).length}/${toolTurns.length}`,
  promptTokensMean: Math.round(judged.reduce((s, j) => s + j.promptTokens, 0) / judged.length),
  modelMsMedian: [...judged.map((j) => j.ms)].sort((a, b) => a - b)[Math.floor(judged.length / 2)],
  reminderBuildUsMax: Math.round(Math.max(...judged.map((j) => j.lineUs))),
};
console.log(JSON.stringify(summary, null, 2));
if (values.out) writeFileSync(values.out, JSON.stringify({ summary, judged }, null, 2));
