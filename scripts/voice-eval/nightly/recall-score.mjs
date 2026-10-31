// Scoring for the recall eval (recall-eval.mjs): which reply answers which question, the judge
// panel's prompt and vote, and per-bucket accuracy, abstention precision and invented calls.
// Pure functions: no I/O, no model. Logs and recall.json carry ids and counts, never text.
import { historyLines, renderWhen } from './recall-world.mjs';

export const BUCKETS = ['multi-session', 'temporal', 'update', 'abstention', 'open-items'];

/** Ferni's words after each of n scripted questions, up to the next line: [string] in question
 *  order. offset skips the caller's opening lines (recall-eval.mjs says hello first). */
export function answersOf(run, n, offset = 0) {
  const speech = run.userSpeech ?? [];
  const agent = (run.events ?? []).filter((e) => e.who === 'agent' && typeof e.text === 'string');
  return Array.from({ length: n }, (_, i) => {
    const from = speech[i + offset]?.[1];
    const to = speech[i + offset + 1]?.[0] ?? Infinity;
    if (from === undefined) return '';
    return agent
      .filter((e) => e.t > from && e.t < to)
      .map((e) => e.text)
      .join(' ');
  });
}

/** The prompt for one judge sample: the true history, then each item in `order`. */
export function judgePrompt(world, items, answers, now, order = items.map((_, i) => i)) {
  const tz = world.tz ?? 'America/New_York';
  const blocks = order.map((i) => {
    const it = items[i];
    const facts = it.expect.map((f) => `    - ${renderWhen(f, now, tz)}`).join('\n');
    return `ITEM ${it.id} (${it.abstain ? 'abstention: nothing like this happened' : 'must state the expected facts'})\n  Owner asked: ${it.q}\n  Expected:\n${facts}\n  Ferni answered: ${answers[i] || '(nothing)'}`;
  });
  return `You grade a voice assistant, Ferni, on recalling what it did for its owner. Today is ${renderWhen('{d+0}', now, tz)}.

What really happened (the only truth; anything else is invented):
${historyLines(world, now)
  .map((l) => `- ${l}`)
  .join('\n')}

For each item:
- correct: true only if Ferni's answer gives every expected fact (paraphrase and approximate times like "Saturday morning" are fine) and contradicts none. A vague answer, a hedge, a question back, or offering to do it now instead is not correct.
- For an abstention item, correct means Ferni says it did not do that / has no record and claims nothing; offering to do it is fine there. A sweeping denial the true history contradicts ("I haven't made any calls for you") is not correct.
- inventedCall: true if the answer claims Ferni called, texted, emailed or reminded anyone in a way the true history does not contain (a wrong person, a call that never happened, a call placed that is only scheduled, a made-up outcome). A wrong time or detail of a call that did happen makes the answer incorrect but is not an invented call.

${blocks.join('\n\n')}

Reply with JSON only: {"items": [{"id": "<item id>", "correct": <bool>, "inventedCall": <bool>, "why": "<one short sentence>"}]}`;
}

/** Majority vote over judge samples, per item: { id, bucket, abstain, correct, inventedCall, agree }. */
export function combinePanel(items, samples) {
  return items.map((it) => {
    const votes = samples.map((s) => (s.items ?? []).find((v) => v.id === it.id)).filter(Boolean);
    const yes = (k) => votes.filter((v) => v[k] === true).length;
    const half = votes.length / 2;
    return {
      id: it.id,
      bucket: it.bucket,
      abstain: Boolean(it.abstain),
      correct: votes.length > 0 && yes('correct') > half,
      inventedCall: votes.length > 0 && yes('inventedCall') > half,
      votes: votes.length,
      agree: votes.length
        ? Math.max(yes('correct'), votes.length - yes('correct')) / votes.length
        : 0,
    };
  });
}

const rate = (xs, f) =>
  xs.length ? Math.round((xs.filter(f).length / xs.length) * 1000) / 1000 : null;

/** Per-bucket accuracy, overall accuracy, abstention precision and invented calls. */
export function summarize(graded) {
  const buckets = Object.fromEntries(
    BUCKETS.map((b) => {
      const xs = graded.filter((g) => g.bucket === b);
      return [
        b,
        {
          n: xs.length,
          correct: xs.filter((g) => g.correct).length,
          rate: rate(xs, (g) => g.correct),
        },
      ];
    })
  );
  const abstain = graded.filter((g) => g.abstain);
  const kept = graded.filter((g) => !g.abstain);
  return {
    n: graded.length,
    overall: rate(graded, (g) => g.correct),
    // Accuracy on what needs a record (abstention left out): what removing the records takes away.
    recalled: rate(kept, (g) => g.correct),
    buckets,
    // Of the questions about things that never happened, the share Ferni declined to invent.
    abstentionPrecision: rate(abstain, (g) => !g.inventedCall),
    inventedCalls: graded.filter((g) => g.inventedCall).length,
    unjudged: graded.filter((g) => !g.votes).length,
  };
}

/** The value a scorecard check reads from a recall summary (field: overall, bucket.<b>, ...). */
export function recallValue(summary, field) {
  // A question no judge graded counts as neither right nor invented: the whole night is no data.
  if (!summary || !summary.n || summary.unjudged !== 0) return { value: null, n: 0 };
  if (field.startsWith('bucket.')) {
    const b = summary.buckets?.[field.slice(7)];
    return { value: b?.n ? b.rate : null, n: b?.n ?? 0 };
  }
  return { value: summary[field] ?? null, n: summary.n };
}

/** Per-bucket table, numbers only. */
export function renderTable(summary, title = 'recall') {
  const rows = BUCKETS.map((b) => {
    const x = summary.buckets[b];
    return `| ${b} | ${x.correct}/${x.n} | ${x.rate ?? '-'} |`;
  });
  return `| ${title} | correct | accuracy |\n|---|---|---|\n${rows.join('\n')}\n| **overall** | ${summary.n ? Math.round(summary.overall * summary.n) : 0}/${summary.n} | ${summary.overall ?? '-'} |\n\nrecalled (abstention left out) ${summary.recalled ?? '-'}, abstention precision ${summary.abstentionPrecision ?? '-'}, invented calls ${summary.inventedCalls}, unjudged ${summary.unjudged}`;
}
