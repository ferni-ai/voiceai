/**
 * GROUP_CALL: the `[label] ` in front of a group call turn, saying who spoke (`[Sarah (guest)] `,
 * or `[unclear] ` when the room mix can't tell). The label is who spoke, not what they said, so
 * checks that count or compare words (barge-in, echo, the name fix) read the text after it.
 *
 * A label is taken off only on the call that put it on, and only one it put on: a bracket the
 * caller said, or STT wrote (`[note] hi there`), stays words. No call's labels reach another.
 *
 * @module agents/group-conversation/turn-label
 */

/** The characters a label may hold: letters, marks, digits, spaces and . ' ’ ( ) -, at most 40. */
const LABEL = String.raw`[\p{L}\p{M}\p{N} .'’()-]{1,40}`;
/** A turn's label as it is put on: `[` a label `] `, at the very start. */
const TURN_LABEL = new RegExp(`^\\[(${LABEL})\\] `, 'u');

/** The labels each call has put on its turns. */
const putOn = new WeakMap<object, Set<string>>();

/** `text` as a turn by `label` on `session`'s call, e.g. `[unclear] see you at six`. */
export function labelTurn(session: object, label: string, text: string): string {
  const labels = putOn.get(session) ?? new Set<string>();
  putOn.set(session, labels.add(label));
  return `[${label}] ${text}`;
}

/** `text` without the label `session`'s call put in front; anything else as it is. */
export function stripTurnLabel(session: object | undefined, text: string): string {
  const found = TURN_LABEL.exec(text);
  if (!session || found?.[1] === undefined || !putOn.get(session)?.has(found[1])) return text;
  return text.slice(found[0].length);
}

/**
 * `text` without any leading `[tag] ` of the label's shape, for the backchannel question
 * alone. The SDK asks it with no call to go by (installBackchannelHook), and a bracketed
 * tag before only "mm" is a backchannel whoever wrote it: `[unclear] mm`, `[laughs] mm`.
 */
export function withoutTag(text: string): string {
  return text.replace(TURN_LABEL, '');
}
