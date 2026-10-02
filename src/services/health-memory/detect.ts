/**
 * High-precision detection of health statements the user makes about
 * themself ("I was diagnosed with asthma", "I take metformin 500mg",
 * "I slept four hours"). Pure; no I/O.
 *
 * This complements deep extraction (which labels facts `health`): it catches
 * plain first-person statements cheaply and works when extraction is off.
 * Only first-person, affirmative statements match; "my mom has diabetes" and
 * "I don't have asthma" do not.
 *
 * @module services/health-memory/detect
 */

import type { HealthKind, HealthStatus } from './types.js';

export interface HealthMention {
  readonly kind: HealthKind;
  readonly subject: string;
  readonly text: string;
  readonly status?: HealthStatus;
  readonly when?: string;
  readonly confidence: number;
}

const CONDITIONS =
  "type [12] diabetes|diabetes|asthma|migraines|arthritis|adhd|an anxiety disorder|anxiety|depression|ibs|crohn's|celiac disease|endometriosis|pcos|fibromyalgia|lupus|high blood pressure|hypertension|high cholesterol|epilepsy|long covid|chronic pain|insomnia|ptsd|ocd|bipolar disorder|sleep apnea|a thyroid condition|hypothyroidism|eczema|psoriasis|tinnitus";

const KNOWN_MEDS =
  /^(ibuprofen|paracetamol|acetaminophen|tylenol|advil|aspirin|metformin|insulin|sertraline|zoloft|lexapro|escitalopram|prozac|fluoxetine|wellbutrin|bupropion|adderall|ritalin|vyvanse|concerta|levothyroxine|synthroid|lisinopril|amlodipine|atorvastatin|statins?|melatonin|antidepressants?|antibiotics?|inhalers?|birth control|the pill|prednisone|gabapentin|omeprazole|propranolol)$/i;

const NOT_MEDS =
  /^(a|an|the|my|it|this|that|care|break|walk|nap|time|day|off|on|over|up|part|notes|class|course|photos?|pictures?|lessons?|turns|charge|steps|shower|bath|job|role|trip|call|risk|chance|look|seat|test)$/i;

const NUMBERS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function clean(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,!?;:]+$/, '');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 400);
}

type Detector = (s: string) => HealthMention[];

const condition: Detector = (s) => {
  const out: HealthMention[] = [];
  const diag = s.match(
    /\bI(?:'ve| have| was| got)(?: been| just been)? diagnosed with ([a-z0-9' -]{3,40}?)(?:\s+(?:last|this|in|a few|when|at|after|recently)\b|[.,!?]|$)/i
  );
  if (diag?.[1]) {
    const subject = clean(diag[1]).replace(/^(an?|the)\s+/i, '');
    out.push({
      kind: 'condition',
      subject,
      text: `Was diagnosed with ${subject}`,
      confidence: 0.9,
    });
  }
  const has = s.match(
    new RegExp(
      `\\bI(?:'ve got| have| live with| suffer from| struggle with| deal with) (${CONDITIONS})\\b`,
      'i'
    )
  );
  if (has?.[1] && !diag) {
    const subject = clean(has[1]).replace(/^(an?)\s+/i, '');
    out.push({ kind: 'condition', subject, text: `Has ${subject}`, confidence: 0.85 });
  }
  return out;
};

const medication: Detector = (s) => {
  const m = s.match(
    /\bI(?: take| 'm taking|'m taking| am taking|'m on| am on| started taking| was prescribed| got prescribed| have been taking|'ve been taking) ([a-z][a-z-]{2,30}(?: control| pill)?)(?:\s+(\d+\s?mg))?(?:\s+(?:for|because of)\s+(?:my\s+)?([a-z' ]{3,30}?))?(?:[.,!?]|\s+(?:every|each|twice|daily|at|in|now|again)\b|$)/i
  );
  if (!m?.[1]) return [];
  const name = clean(m[1]);
  const dose = m[2] ? clean(m[2]) : undefined;
  const reason = m[3] ? clean(m[3]) : undefined;
  const prescribed = /prescribed/i.test(m[0]);
  if (NOT_MEDS.test(name)) return [];
  if (!dose && !reason && !prescribed && !KNOWN_MEDS.test(name)) return [];
  const text = `Takes ${name}${dose ? ` ${dose}` : ''}${reason ? ` for ${reason}` : ''}`;
  return [{ kind: 'medication', subject: name, text, confidence: 0.85 }];
};

const injury: Detector = (s) => {
  const m = s.match(
    /\bI(?: just)? (hurt|injured|sprained|broke|twisted|pulled|tore|strained|fractured|dislocated) my ([a-z ]{3,25}?)(?:\s+(?:yesterday|today|last|this|playing|while|at|on|when|again|running|skiing)\b|[.,!?]|$)/i
  );
  if (!m?.[1] || !m[2]) return [];
  const part = clean(m[2]);
  return [
    {
      kind: 'injury',
      subject: part,
      text: `${cap(m[1].toLowerCase())} their ${part}`,
      confidence: 0.8,
    },
  ];
};

const appointment: Detector = (s) => {
  if (!/\b(I|I've|I'm|my)\b/i.test(s)) return [];
  const m = s.match(
    /\b(doctor'?s?|dentist|therapy|therapist|physio|cardiologist|dermatologist|gp|eye|hospital|medical|follow-up|blood test|specialist)\s+(appointment|visit|session|check-?up)\b(?:\s+(?:is\s+)?((?:on|next|this|tomorrow|today|in)\b[^.,!?]{0,30}))?/i
  );
  if (!m?.[1] || !m[2]) return [];
  const subject = clean(`${m[1].replace(/'s$/i, '')} ${m[2]}`).toLowerCase();
  const when = m[3] ? clean(m[3]) : undefined;
  return [
    {
      kind: 'appointment',
      subject,
      text: `${cap(subject)}${when ? ` ${when}` : ''}`,
      status: 'upcoming',
      ...(when ? { when } : {}),
      confidence: 0.8,
    },
  ];
};

const symptom: Detector = (s) => {
  const m =
    s.match(
      /\bI(?:'ve| have)?(?: had| have| got|'ve got| am having|'m having| woke up with) (?:a |an |some |this |the )?(headache|migraine|fever|cold|flu|sore throat|cough|nausea|back pain|stomach ache|stomachache|cramps|chest pain|rash|dizzy spells|panic attack)\b/i
    ) ??
    s.match(
      /\bmy (head|back|knee|stomach|throat|chest|neck|shoulder) (?:hurts|is killing me|aches|is sore)\b/i
    );
  if (!m?.[1]) return [];
  const raw = clean(m[1]).toLowerCase();
  const subject = /^(head|back|knee|stomach|throat|chest|neck|shoulder)$/.test(raw)
    ? `${raw} pain`
    : raw;
  const article = /(pain|nausea|cramps|spells)$/.test(subject)
    ? ''
    : /^[aeiou]/.test(subject)
      ? 'an '
      : 'a ';
  return [{ kind: 'symptom', subject, text: `Had ${article}${subject}`, confidence: 0.8 }];
};

const sleep: Detector = (s) => {
  const hours = s.match(
    /\bI(?:'ve| have)? (?:only |barely )?(?:slept|got) (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) hours?(?: of sleep)?\b/i
  );
  if (hours?.[1]) {
    const n = NUMBERS[hours[1].toLowerCase()] ?? Number(hours[1]);
    if (n >= 0 && n <= 16)
      return [
        {
          kind: 'sleep',
          subject: 'sleep',
          text: `Slept ${n} hour${n === 1 ? '' : 's'}`,
          confidence: 0.85,
        },
      ];
  }
  if (
    /\bI (?:couldn't|could not|can't|didn't|did not|barely) sleep\b|\bI was up all night\b/i.test(s)
  ) {
    return [{ kind: 'sleep', subject: 'sleep', text: "Didn't sleep well", confidence: 0.8 }];
  }
  const quality = s.match(
    /\bI slept (badly|terribly|awfully|great|well|really well|like a baby)\b/i
  );
  if (quality?.[1])
    return [
      {
        kind: 'sleep',
        subject: 'sleep',
        text: `Slept ${quality[1].toLowerCase()}`,
        confidence: 0.8,
      },
    ];
  return [];
};

const exercise: Detector = (s) => {
  const did = s.match(
    /\bI (?:just )?(?:went for|did|had|finished) (?:a |an |my )?(run|jog|walk|swim|bike ride|hike|yoga class|yoga|workout|gym session|spin class|pilates class|pilates)\b/i
  );
  if (did?.[1]) {
    const what = did[1].toLowerCase();
    const verb = /^(yoga|pilates)$/.test(what)
      ? 'Did'
      : /^(workout|gym session|yoga class|pilates class|spin class)$/.test(what)
        ? 'Did a'
        : 'Went for a';
    return [{ kind: 'exercise', subject: what, text: `${verb} ${what}`, confidence: 0.8 }];
  }
  const dist = s.match(
    /\bI (ran|walked|swam|cycled|biked|hiked) (\d+(?:\.\d+)?\s?(?:k|km|miles?|minutes|mins))\b/i
  );
  if (dist?.[1] && dist[2]) {
    return [
      {
        kind: 'exercise',
        subject: dist[1].toLowerCase(),
        text: `${cap(dist[1].toLowerCase())} ${dist[2]}`,
        confidence: 0.85,
      },
    ];
  }
  if (/\bI went to the gym\b/i.test(s)) {
    return [{ kind: 'exercise', subject: 'gym', text: 'Went to the gym', confidence: 0.8 }];
  }
  return [];
};

const energy: Detector = (s) => {
  const m = s.match(
    /\bI(?:'m| am| feel| felt| have been|'ve been| was) (?:so |really |completely |totally |pretty |just )?(exhausted|drained|wiped out|burnt out|burned out|running on empty|full of energy|energi[sz]ed|tired all the time|fatigued)\b/i
  );
  if (!m?.[1]) return [];
  const word = m[1].toLowerCase();
  return [{ kind: 'energy', subject: 'energy', text: `Felt ${word}`, confidence: 0.75 }];
};

const DETECTORS: readonly Detector[] = [
  condition,
  medication,
  injury,
  appointment,
  symptom,
  sleep,
  exercise,
  energy,
];

/** Every health statement in a user turn (deduped by kind + subject). */
export function detectHealthMentions(text: string): HealthMention[] {
  const out = new Map<string, HealthMention>();
  for (const sentence of sentences(text ?? '')) {
    for (const detect of DETECTORS) {
      for (const m of detect(sentence)) {
        const key = `${m.kind}|${m.subject.toLowerCase()}`;
        if (!out.has(key)) out.set(key, m);
      }
    }
  }
  return [...out.values()];
}
