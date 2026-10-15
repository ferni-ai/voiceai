// Did a teammate's first line after a handoff claim a reason the caller never gave?
//
// The arrival direction once carried an example ("{from} said you're weighing the
// offer") that the model copied verbatim when the caller only asked for a teammate by
// name. That invented reason was then summarised into memory and followed up on for
// days. This check finds each arrival (the first agent line after handoff_complete, or
// the first line from a new agent participant) and flags it when it reports what the
// caller said or wants ("X said you're…", "told me you…") and that claim shares no
// content word with anything the caller said before the handoff. That is the same rule
// handoff-brief.ts's groundedReason uses: a paraphrase that keeps one of the caller's
// words ("your mornings") is grounded; a reason from nowhere ("the offer") is not.

const CLAIM =
  /\b(said|told me|mentioned|filled me in|says)\b[^.?!]{0,40}\byou(?:['’]re|['’]ve| are| were| want| need| have| had| might| may)?\b/i;
const ARRIVAL_LEAD_MS = 1500;
const STOP = new Set(
  'about after again also been before being could does doing done from going have having here hello just know like look looking make more much need over really right some such sure than that thats their them then there they thing this through want well were what when where which while will with would your youre yours hey there talk speak with please team teammate okay alrightsaid says told mentioned filled'.split(' ')
);

const words = (text) =>
  (String(text).toLowerCase().replace(/['’]/g, '').match(/\p{L}{4,}/gu) ?? []).filter(
    (w) => !STOP.has(w)
  );

/** Times (ms) at which a handoff completed, from the room data channel. */
function handoffTimes(run) {
  return (run.data ?? [])
    .filter((d) => /handoff_complete/i.test(d.topic ?? '') || /handoff_complete/i.test(JSON.stringify(d.payload ?? '')))
    .map((d) => d.t);
}

/** The first agent line after each handoff, with what the caller had said before it. */
export function arrivals(run, names = []) {
  const events = run.events ?? [];
  const agentLines = events.filter((e) => e.who === 'agent');
  const starts = new Set(handoffTimes(run));
  // A new agent participant speaking also marks an arrival (teammate as its own participant).
  let lastFrom = agentLines[0]?.from;
  for (const e of agentLines) {
    if (e.from && lastFrom && e.from !== lastFrom) starts.add(e.t - 1);
    lastFrom = e.from ?? lastFrom;
  }
  const nameWords = new Set(names.flatMap((n) => words(n)));
  const used = new Set();
  return [...starts]
    .sort((a, b) => a - b)
    .map((t) => {
      // The arrival caption can land a few ms before its handoff_complete data message
      // (seen live: 16 ms), so allow a small lead; the "bringing in X" line is seconds earlier.
      const line = agentLines.find((e) => e.t > t - ARRIVAL_LEAD_MS && !used.has(e));
      if (line) used.add(line);
      if (!line) return null;
      const said = new Set(
        events.filter((e) => e.who === 'user' && e.t < line.t).flatMap((e) => words(e.text))
      );
      const m = CLAIM.exec(line.text);
      if (!m) return { at: line.t, text: line.text, claims: false, invented: [], pass: true };
      // Only the claimed reason counts: from the claim to the end of its sentence.
      const clause = line.text.slice(m.index).split(/[.?!]/)[0];
      const claimWords = words(clause).filter((w) => !nameWords.has(w));
      const grounded = claimWords.some((w) => said.has(w));
      const invented = grounded ? [] : claimWords.filter((w) => !said.has(w));
      return { at: line.t, text: line.text, claims: true, invented, pass: grounded || claimWords.length === 0 };
    })
    .filter(Boolean);
}

/** Summary for score.mjs: every arrival must pass. */
export function handoffGrounding(run, names = []) {
  const list = arrivals(run, names);
  return { arrivals: list.length, failed: list.filter((a) => !a.pass), pass: list.every((a) => a.pass) };
}
