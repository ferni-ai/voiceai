// A recall-eval world: a seeded history of what Ferni did for the owner, and the questions it
// must answer. Turned here into the documents today's stores hold (on_behalf_calls,
// deferred_calls, reminders, outreach_history, follow_through, user_contacts) plus the planned
// activity ledger (docs/plans/2026-10-27-recall-ledger.md section 1), and into the true history
// the judge checks invented calls against. Times are relative (daysAgo + hour in the world's
// zone, or inHours from now), so a set reads the same whichever night seeds it.
// plant 'no-records' (the planted regression) seeds the contacts only: no record of anything.

const DAY = 86_400_000;
const FAILED = new Set(['voicemail', 'no_answer', 'busy', 'failed']);

/** The instant `daysAgo` days before now at `hour`:00 in zone tz (or now + inHours). */
export function at(now, tz, daysAgo = 0, hour = 9, inHours) {
  if (inHours !== undefined) return new Date(now.getTime() + inHours * 3_600_000);
  const ymd = new Date(now.getTime() - daysAgo * DAY).toLocaleDateString('en-CA', { timeZone: tz });
  const guess = new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);
  const opts = { timeZone: tz, hour: 'numeric', hourCycle: 'h23' };
  const shown = Number(guess.toLocaleString('en-US', opts));
  return new Date(guess.getTime() - (((shown - hour + 36) % 24) - 12) * 3_600_000);
}

/** "{d-2}" -> "Saturday, October 25" in tz ("{d+1}" is tomorrow). */
export function renderWhen(text, now, tz) {
  const opts = { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' };
  return text.replace(/\{d([+-]\d+)\}/g, (_, n) =>
    new Date(now.getTime() + Number(n) * DAY).toLocaleDateString('en-US', opts)
  );
}

// The activity ledger as lane 1a (#2958, src/services/activity) writes it: each history entry is
// a create, then for anything that happened an update with its outcome, applied the way its
// applyChange applies them (recall.test.mjs replays them through it and compares).
const SOURCE = 'recall-eval';
const REASONS = new Set(['call_hours', 'quiet_hours', 'owner_declined', 'owner_asked_later']);
const OUTCOME = {
  completed: 'reached',
  voicemail: 'voicemail',
  no_answer: 'no_answer',
  busy: 'busy',
  failed: 'failed',
  delivered: 'delivered',
};
const FIELDS =
  'v kind subject subjectKeys asked state reason scheduledFor outcome told followUps links source revision appliedKeys createdAt updatedAt'.split(
    ' '
  );
const BOOKKEEPING = new Set(['revision', 'updatedAt', 'appliedKeys', 'source', 'subjectKeys']);
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const clip = (x, max) => (x === undefined ? undefined : x.trim().slice(0, max) || undefined);
const norm = (n) =>
  n
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
const keysOf = (s) =>
  [s.contactId && `contact:${s.contactId}`, norm(s.name) && `name:${norm(s.name)}`].filter(Boolean);
const changed = (a, b) =>
  FIELDS.filter((f) => !BOOKKEEPING.has(f) && JSON.stringify(a[f]) !== JSON.stringify(b[f]));
const event = (id, seq, at, op, from, doc, fields, reason) =>
  defined({ activityId: id, seq, at, op, from, to: doc.state, fields, source: SOURCE, reason });

/** The create (and, for what happened, the update) a history entry makes in the ledger. */
export function ledgerChanges(h, c, id, made, t, sessionId) {
  if (h.kind === 'call' && h.reason !== undefined && !REASONS.has(h.reason))
    throw new Error(`recall world: reason ${h.reason} is not in the ledger's list`);
  const subject = h.to
    ? defined({ contactId: h.to, name: c.name, relationship: c.relationship })
    : { name: 'you' };
  const links = { call: h.status ? 'onBehalfCallId' : 'deferredCallId', reminder: 'reminderId' };
  Object.assign(links, { promise: 'followThroughId', email: 'providerRef' });
  const ahead = (h.kind === 'call' && !h.status) || h.kind === 'reminder';
  const words = clip(
    h.kind === 'email' ? h.reason : h.kind === 'promise' ? h.text : undefined,
    200
  );
  const record = defined({
    kind: h.kind,
    subject,
    asked: defined({ at: made, sessionId, words }),
    state: h.kind === 'promise' ? 'confirmed' : ahead ? 'scheduled' : 'asked',
    reason: h.kind === 'call' ? h.reason : undefined,
    scheduledFor: ahead ? t : undefined,
    links: { [links[h.kind]]: id },
  });
  const status = h.status ?? (h.kind === 'email' ? 'delivered' : undefined); // a sent email
  if (!status || status === 'open' || status === 'pending') return { record };
  const actionItems = (h.actionItems ?? []).slice(0, 5).map((x) => x.trim().slice(0, 200));
  const summary = clip(h.summary ?? h.subject ?? h.text, 280);
  const outcome = defined({ status: OUTCOME[status], summary, theySaid: clip(h.theySaid, 280) });
  const failed = !['completed', 'delivered'].includes(status);
  const reason = { voicemail: 'voicemail', no_answer: 'no_answer', busy: 'busy' }[status];
  const told = h.told === false ? undefined : [{ at: t, sessionId, channel: 'voice' }];
  const patch = { state: failed ? 'failed' : 'done', outcome: { ...outcome, actionItems }, told };
  return {
    record,
    patch: defined({ ...patch, reason: failed ? (reason ?? 'failed_provider') : undefined }),
  };
}

/** The ledger doc and its events after record (+ patch), as applyChange writes them. */
export function applyLedger(id, { record, patch }, made, t) {
  const { kind, subject, asked, state, reason, scheduledFor, links } = record;
  const doc = defined({
    ...{ v: 1, kind, subject, state, subjectKeys: keysOf(subject), asked, reason, scheduledFor },
    ...{ told: [], followUps: [], links, source: SOURCE, revision: 1, appliedKeys: [] },
    ...{ createdAt: made, updatedAt: made },
  });
  const events = [event(id, 1, made, 'create', null, doc, changed({}, doc), reason)];
  if (!patch) return { doc, events };
  const { reason: kept, ...base } = doc;
  const moved = patch.state !== doc.state;
  const next = defined({
    ...{ ...base, reason: patch.reason ?? (moved ? undefined : kept), state: patch.state },
    ...{ outcome: patch.outcome, told: [...doc.told, ...(patch.told ?? [])], revision: 2 },
    updatedAt: t,
  });
  const update = event(id, 2, t, 'update', doc.state, next, changed(doc, next), patch.reason);
  return { doc: next, events: [...events, update] };
}

/** [{ path, data }] for one world seeded as uid. */
export function docsFor(world, uid, now, { plant } = {}) {
  const tz = world.tz ?? 'America/New_York';
  const history = world.history ?? [];
  const when = (h) => at(now, tz, h.daysAgo, h.hour, h.inHours).toISOString();
  const latest = (c) => history.filter((h) => h.kind === 'number' && h.to === c.id).at(-1);
  const docs = (world.contacts ?? []).map((c) => {
    const phone = latest(c)?.phone ?? c.phone;
    const updatedAt = when(latest(c) ?? { daysAgo: 60 });
    const phones = phone ? { phone, phones: [{ number: phone, type: 'mobile' }] } : {};
    const data = { displayName: c.name, name: c.name, relationship: c.relationship, ...phones };
    return { path: `user_contacts/${uid}/contacts/${c.id}`, data: { ...data, updatedAt } };
  });
  if (plant === 'no-records') return docs;
  const who = Object.fromEntries((world.contacts ?? []).map((c) => [c.id, c]));
  const add = (store, id, data) => docs.push({ path: `bogle_users/${uid}/${store}/${id}`, data });
  for (const h of history.filter((x) => x.kind !== 'number')) {
    const c = who[h.to] ?? {};
    const [id, t] = [`${h.kind}_${h.id}`, when(h)];
    const request = {
      contactQuery: c.relationship ? `my ${c.relationship}` : '',
      contactName: c.name ?? '',
      ...((h.phone ?? c.phone) && { contactPhone: h.phone ?? c.phone }),
      purpose: h.purpose ?? 'check in',
      objective: 'check_in',
      callType: 'personal',
    };
    const said = h.theySaid ? { message: h.theySaid, transcriptSummary: h.theySaid } : {};
    const summary = h.summary ?? h.subject ?? h.text ?? `${h.status ?? 'scheduled'}: ${c.name}`;
    if (h.kind === 'call' && h.status) {
      const outcome = { callId: id, status: h.status, objectiveAchieved: h.status === 'completed' };
      Object.assign(outcome, { outcome: summary, ...said, actionItems: h.actionItems ?? [] });
      if (h.status === 'voicemail') outcome.voicemailLeft = true;
      // Told once already (recall must outlive the first mention), unless told: false: a recent
      // result not told yet, which today's first-turn reader (pending-call-results.ts) surfaces.
      const told = h.told === false ? { delivered: false } : { delivered: true, deliveredAt: t };
      add('on_behalf_calls', id, {
        callId: id,
        userId: uid,
        request,
        outcome,
        capturedAt: t,
        ...told,
      });
    } else if (h.kind === 'call') {
      const resolvedContact = { name: c.name, relationship: c.relationship };
      const req = { ...request, userId: uid, userTimezone: tz, resolvedContact };
      const created = at(now, tz, 0, 0, -1).toISOString();
      add('deferred_calls', id, {
        kind: 'on_behalf',
        request: req,
        status: 'pending',
        scheduledFor: t,
        timezone: tz,
        createdAt: created,
      });
    } else if (h.kind === 'reminder') {
      const created = at(now, tz, (h.daysAgo ?? 0) + 1).toISOString();
      add('reminders', id, {
        id,
        userId: uid,
        message: h.text,
        scheduledFor: t,
        timezone: tz,
        deliveryMethod: 'sms',
        status: h.status ?? 'delivered',
        createdAt: created,
      });
    } else if (h.kind === 'email') {
      add('outreach_history', id, {
        channel: 'email',
        type: 'summary',
        subject: h.subject,
        reason: h.reason,
        deliveredAt: t,
        status: 'delivered',
      });
    } else if (h.kind === 'promise') {
      const source = { store: 'recall-eval', ref: id };
      add('follow_through', id, {
        userId: uid,
        kind: 'promise',
        owner: 'ferni',
        text: h.text,
        zone: tz,
        status: h.status ?? 'open',
        surfaced: [],
        dueAt: null,
        source,
        createdAt: t,
        updatedAt: t,
      });
    }
    // Written when it was asked: a day before a reminder fires, now for anything still ahead.
    const nowIso = now.toISOString();
    const remind = at(now, tz, (h.daysAgo ?? 0) + 1).toISOString();
    const made = h.kind === 'reminder' ? remind : t > nowIso ? nowIso : t;
    const changes = ledgerChanges(h, c, id, made, t, `recall-eval-${world.id}`);
    const ledger = applyLedger(id, changes, made, t);
    add('activity', id, ledger.doc);
    for (const e of ledger.events) add(`activity/${id}/events`, String(e.seq), e);
  }
  return docs;
}

/** What really happened, one line each, for the judge. */
export function historyLines(world, now) {
  const tz = world.tz ?? 'America/New_York';
  const who = Object.fromEntries((world.contacts ?? []).map((c) => [c.id, c]));
  const name = (id) => `${who[id]?.relationship} (${who[id]?.name})`;
  const opts = { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' };
  Object.assign(opts, { hour: 'numeric', minute: '2-digit' }); // inHours times are not on the hour
  const line = (h) =>
    h.kind === 'number'
      ? `the owner gave ${name(h.to)}'s new number ${h.phone} (was ${h.oldPhone ?? 'none'})`
      : h.kind === 'call' && !h.status
        ? `a call to ${name(h.to)} is scheduled, not placed (reason: ${h.reason ?? 'none'})`
        : h.kind === 'call'
          ? `Ferni called ${name(h.to)}: ${h.status}${h.theySaid ? `; they said: ${h.theySaid}` : ''}`
          : h.kind === 'reminder'
            ? `reminder "${h.text}" ${h.status === 'pending' ? 'is set, not sent yet' : 'went out'}`
            : h.kind === 'email'
              ? `Ferni emailed the owner "${h.subject}" because ${h.reason}`
              : `Ferni promised to ${h.text} (${h.status ?? 'open'})`;
  return (world.history ?? []).map(
    (h) => `${at(now, tz, h.daysAgo, h.hour, h.inHours).toLocaleString('en-US', opts)}: ${line(h)}`
  );
}
