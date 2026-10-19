/**
 * Whether a line is light enough for the Home Screen, which is semi-public
 * (seen over a shoulder, on a lock-screen-adjacent surface).
 *
 * Two classifiers already exist and neither is a superset of the other:
 *
 * - `isSensitiveThread` (agents/multi-agent/welcome-back.ts): grief, health,
 *   money, relationships and job loss. It is the opener's own "never open on
 *   something painful" list, so the Home line stays consistent with the call.
 * - `isSensitiveTopic` (services/coach-media/result-text.ts): health and money
 *   as general-info topics, plus fitness, sleep, diet, weight and injury, which
 *   the first one lets through ("my back pain", "workout plan").
 *
 * Home takes the union, the strictest reading, and adds a short legal list
 * because neither one covers legal trouble. A line is light only if none of the
 * three fire. When in doubt a line is heavy: the cost is a plain greeting, and
 * Ferni can still ask about it in the call.
 *
 * @module api/home/light-topic
 */
import { isSensitiveThread } from '../../agents/multi-agent/welcome-back.js';
import { isSensitiveTopic } from '../../services/coach-media/result-text.js';

// Whole words only, like the other two.
const LEGAL =
  /(?<![\p{L}])(legal|lawyers?|attorneys?|lawsuits?|suing|court|custody|immigration|visa|deportation|arrest\w*|police|probation|subpoena\w*|restraining order|eviction|harass\w*|abus\w*|assault\w*|addict\w*|rehab|overdos\w*|suicid\w*|self[- ]harm)(?![\p{L}])/iu;

export function isLightTopic(text: string): boolean {
  return !isSensitiveThread(text) && !isSensitiveTopic(text) && !LEGAL.test(text);
}
