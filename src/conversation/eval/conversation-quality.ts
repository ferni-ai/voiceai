/**
 * Conversation Quality Evaluator
 *
 * A lightweight heuristic scoring system for "better-than-human" behaviors.
 * This is intentionally simple + fast: it should be safe to run in tests or
 * dev tooling without model calls.
 */

export interface ConversationQualityInput {
  userMessage: string;
  responseText: string;
  /** Optional context hints to shape scoring. */
  userEmotion?: string;
  wasPersonalSharing?: boolean;
  turnNumber?: number;
}

export interface ConversationQualityScore {
  brevity: number; // 0..1
  validation: number; // 0..1
  repair: number; // 0..1
  followUp: number; // 0..1
  overall: number; // 0..1
  notes: string[];
  diagnostics: {
    responseWordCount: number;
    responseQuestionCount: number;
    responseHasSsml: boolean;
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function hasSsml(text: string): boolean {
  return /<\s*(prosody|break|emphasis|say-as|phoneme|audio|voice|amazon:effect)\b/i.test(text);
}

export function evaluateConversationQuality(
  input: ConversationQualityInput
): ConversationQualityScore {
  const notes: string[] = [];
  const responseWordCount = countWords(input.responseText);
  const responseQuestionCount = countQuestions(input.responseText);
  const responseHasSsml = hasSsml(input.responseText);

  // -------------------------------------------------------------------------
  // Brevity
  // -------------------------------------------------------------------------
  // Heuristic: keep responses compact when the user is vulnerable/heavy.
  const isSupportMoment =
    input.wasPersonalSharing === true ||
    (input.userEmotion
      ? /(sad|anxious|overwhelmed|grief|depressed|distressed|worried)/i.test(input.userEmotion)
      : false);
  const targetWords = isSupportMoment ? 55 : 90;
  const softness = isSupportMoment ? 45 : 70;
  const brevity = clamp01(1 - Math.max(0, responseWordCount - targetWords) / softness);
  if (responseWordCount > targetWords + softness) {
    notes.push('Response may be too long for the moment.');
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  // Look for reflective/validating language.
  const validationSignals = [
    /\b(i hear you|that makes sense|i can see why|of course|it makes total sense)\b/i,
    /\b(that sounds (really )?(hard|painful|heavy|scary)|i'm sorry|i'm really sorry)\b/i,
    /\b(i'm proud of you|that took courage|thank you for sharing)\b/i,
    /\b(it sounds like|what i'm hearing is|it seems like)\b/i,
  ];
  const validationHits = validationSignals.reduce(
    (acc, r) => acc + (r.test(input.responseText) ? 1 : 0),
    0
  );
  const validation = clamp01(validationHits / 2);
  if (isSupportMoment && validationHits === 0) {
    notes.push('Support moment detected but validation language is missing.');
  }

  // -------------------------------------------------------------------------
  // Repair
  // -------------------------------------------------------------------------
  // If the user expresses confusion / mismatch, reward explicit repair.
  const userNeedsRepair =
    /\b(what do you mean|i don't understand|that (doesn't|does not) make sense|no, that's not|you misunderstood)\b/i.test(
      input.userMessage
    );
  const repairSignals =
    /\b(let me rephrase|sorry—|sorry, i|i might have|that came out wrong|what i mean is)\b/i;
  const repair = userNeedsRepair ? (repairSignals.test(input.responseText) ? 1 : 0) : 1;
  if (userNeedsRepair && repair < 1) {
    notes.push('User confusion detected; consider a brief repair + rephrase.');
  }

  // -------------------------------------------------------------------------
  // Follow-up
  // -------------------------------------------------------------------------
  // Prefer a single gentle question when user didn't ask one.
  const userAskedQuestion =
    /\?\s*$/.test(input.userMessage.trim()) || input.userMessage.includes('?');
  let followUp = 0.5;
  if (!userAskedQuestion) {
    followUp = responseQuestionCount === 1 ? 1 : responseQuestionCount === 0 ? 0.3 : 0.2;
  } else {
    // If user asked a question, it's OK not to ask one back.
    followUp = responseQuestionCount <= 1 ? 0.8 : 0.4;
  }
  if (!userAskedQuestion && responseQuestionCount > 1) {
    notes.push('Consider ending with one gentle question (not many).');
  }

  // SSML leakage is always a quality issue for text surfaces.
  if (responseHasSsml) {
    notes.push('SSML tags detected in responseText (text output should be plain).');
  }

  const overall = clamp01((brevity + validation + repair + followUp) / 4);
  return {
    brevity,
    validation,
    repair,
    followUp,
    overall,
    notes,
    diagnostics: {
      responseWordCount,
      responseQuestionCount,
      responseHasSsml,
    },
  };
}
