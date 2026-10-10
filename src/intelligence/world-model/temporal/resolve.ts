/**
 * What a call's observations do to the facts on file (pure; ingest.ts stores).
 * - Same subject, attribute and value: heard again (refresh).
 * - One-value attribute (status, job, ...) with a new value: supersedes.
 * - Otherwise, when the subject has open many-value facts (an event, a goal),
 *   an injected judge says which the new fact updates ("recovering from knee
 *   surgery" closes "knee surgery"). Only asked when there is something to judge.
 *
 * @module intelligence/world-model/temporal/resolve
 */

import {
  dayToIso,
  normaliseText,
  REPLACEABLE_ATTRIBUTES,
  subjectKeyOf,
  type TemporalFact,
  type WorldObservation,
} from './types.js';

/** Ids of `open` facts that `obs` replaces or resolves; [] when none. */
export type SupersedeJudge = (obs: WorldObservation, open: TemporalFact[]) => Promise<string[]>;

export interface ResolutionPlan {
  create: TemporalFact[];
  close: Array<{ id: string; validTo: string; supersededBy: string }>;
  refresh: Array<{ id: string; observedAt: string; confidence: number }>;
}

export interface ResolveOptions {
  judge?: SupersedeJudge;
  newId?: () => string;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `wf_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function sameValue(a: TemporalFact, obs: WorldObservation): boolean {
  return (
    normaliseText(a.value) === normaliseText(obs.value) &&
    (a.eventDate ?? '') === (obs.eventDate ?? '')
  );
}

export async function planResolution(
  existing: readonly TemporalFact[],
  observations: readonly WorldObservation[],
  options: ResolveOptions = {}
): Promise<ResolutionPlan> {
  const newId = options.newId ?? defaultId;
  const plan: ResolutionPlan = { create: [], close: [], refresh: [] };
  // Copies: facts made in this batch are updated in place, the caller's are not.
  const open = existing.filter((f) => f.validTo === null).map((f) => ({ ...f }));
  const isNew = (f: TemporalFact) => plan.create.includes(f);
  const ordered = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  for (const obs of ordered) {
    const subjectKey = subjectKeyOf(obs);
    const attribute = normaliseText(obs.attribute);
    const mine = open.filter((f) => f.subjectKey === subjectKey);
    const slot = mine.filter((f) => f.attribute === attribute);

    const heard = slot.find((f) => sameValue(f, obs));
    if (heard) {
      const observedAt = obs.observedAt > heard.observedAt ? obs.observedAt : heard.observedAt;
      const confidence = Math.max(heard.confidence, obs.confidence);
      Object.assign(heard, { observedAt, confidence });
      if (!isNew(heard)) plan.refresh.push({ id: heard.id, observedAt, confidence });
      continue;
    }

    const fact: TemporalFact = {
      ...obs,
      id: newId(),
      subjectKey,
      attribute,
      validFrom: obs.since ? dayToIso(obs.since) : obs.observedAt,
      validTo: null,
    };

    const replaced = REPLACEABLE_ATTRIBUTES.has(attribute) ? slot : [];
    const toJudge = mine.filter((f) => !REPLACEABLE_ATTRIBUTES.has(f.attribute));
    let judged: string[] = [];
    if (toJudge.length > 0 && options.judge) {
      const allowed = new Set(toJudge.map((f) => f.id));
      // A judge that fails closes nothing: an open fact beats a wrongly closed one.
      const ids = await options.judge(obs, toJudge).catch(() => []);
      judged = ids.filter((id) => allowed.has(id));
    }

    const closing = [...replaced, ...mine.filter((f) => judged.includes(f.id))];
    for (const old of closing) {
      const validTo = old.validFrom > fact.validFrom ? old.validFrom : fact.validFrom;
      Object.assign(old, { validTo, supersededBy: fact.id });
      if (!isNew(old)) plan.close.push({ id: old.id, validTo, supersededBy: fact.id });
      open.splice(open.indexOf(old), 1);
    }
    if (closing.length > 0) {
      fact.supersedes = closing.map((f) => f.id);
      if (replaced.length > 0) fact.replaced = replaced[replaced.length - 1].value;
    }

    plan.create.push(fact);
    open.push(fact);
  }

  return plan;
}
