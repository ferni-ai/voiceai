/**
 * GROUP_CALL: the `[label] ` in front of a group call turn, saying who spoke (`[Sarah (guest)] `,
 * or `[unclear] ` when the room mix can't tell). The label is who spoke, not what they said, so
 * checks that count or compare words (barge-in, echo, the name fix) read the text after it.
 *
 * A label is taken off only on the call that put it on, and only one it put on: a bracket the
 * caller said, or STT wrote (`[note] hi there`), stays words. No call's labels reach another.
 * A whole turn is its finals joined with spaces (`[unclear] Mm. [unclear] Yeah.`), so a label
 * comes off at the start of the text and after any space.
 *
 * @module agents/group-conversation/turn-label
 */

/** The characters a label may hold: letters, marks, digits, spaces and . ' ’ ( ) -, at most 40. */
const LABEL = String.raw`[\p{L}\p{M}\p{N} .'’()-]{1,40}`;
/** A final's label as it is put on: `[` a label `] `, at the start of the text or after a space. */
const TURN_LABEL = new RegExp(`(?<=^|\\s)\\[(${LABEL})\\] `, 'gu');
const ALLOWED_LABEL = new RegExp(`^${LABEL}$`, 'u');

/** The labels each call has put on its turns. */
const putOn = new WeakMap<object, Set<string>>();

/**
 * A person's display name as a label: NFKC and trimmed if every character is allowed (above),
 * otherwise `unclear`. Anything else (a bracket of any script, a control, format or separator
 * character) could forge another person's label.
 */
export function safeLabel(name: string): string {
  const normalised = name.normalize('NFKC').trim();
  return ALLOWED_LABEL.test(normalised) ? normalised : 'unclear';
}

/** `text` as a turn by `label` on `session`'s call, e.g. `[unclear] see you at six`. */
export function labelTurn(session: object, label: string, text: string): string {
  const labels = putOn.get(session) ?? new Set<string>();
  putOn.set(session, labels.add(label));
  return `[${label}] ${text}`;
}

/** `text` without each label-shaped tag that `isLabel` accepts (above); the rest as it is. */
function dropLabels(text: string, isLabel: (label: string) => boolean): string {
  return text.replace(TURN_LABEL, (tag: string, label: string) => (isLabel(label) ? '' : tag));
}

/** `text` without each label `session`'s call put on its finals; anything else as it is. */
export function stripTurnLabel(session: object | undefined, text: string): string {
  const labels = session ? putOn.get(session) : undefined;
  return labels ? dropLabels(text, (label) => labels.has(label)) : text;
}

/**
 * `text` with `fix` run on each spoken part between the labels `session`'s call put on, those
 * labels kept where they are: in `[unclear] Hey Fred. [unclear] okay` it fixes `Hey Fred. ` and
 * `okay`. With no label put on, `fix` gets the whole text.
 */
export function fixSpoken(
  session: object | undefined,
  text: string,
  fix: (spoken: string) => string
): string {
  const labels = session ? putOn.get(session) : undefined;
  if (!labels) return fix(text);
  let out = '';
  let from = 0;
  for (const match of text.matchAll(TURN_LABEL)) {
    const at = match.index ?? 0;
    if (!labels.has(match[1] ?? '')) continue;
    out += fix(text.slice(from, at)) + match[0];
    from = at + match[0].length;
  }
  return out + fix(text.slice(from));
}

/**
 * `text` without every `[tag] ` of the label's shape, for the backchannel question
 * alone. The SDK asks it with no call to go by (installBackchannelHook), and a bracketed
 * tag before only "mm" is a backchannel whoever wrote it: `[unclear] mm`, `[laughs] mm`.
 */
export function withoutTag(text: string): string {
  return dropLabels(text, () => true);
}
