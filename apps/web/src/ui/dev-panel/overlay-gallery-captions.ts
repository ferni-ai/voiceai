/**
 * Heard scenes for the overlay gallery (overlay-gallery.ts), split out to keep
 * that file under the line limit. The caller's words are interim (listening),
 * or settled with Ferni's reply (the check).
 *
 * @module ui/dev-panel/overlay-gallery-captions
 */

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Heard, listening: the caller's words are still interim, so they show faint. */
export async function captionHeardListening(): Promise<void> {
  const { setConnectionState } = await import('../../state/app.state.js');
  setConnectionState('connected');
  window.dispatchEvent(
    new CustomEvent('ferni:transcript', {
      detail: {
        type: 'user',
        text: "My brother Leo starts his new job Monday and I'm weirdly nervous for him.",
        isFinal: false,
      },
    })
  );
  await wait(400);
}

/** Heard, replying: the caller's line has settled and Ferni has taken the turn (the check). */
export async function captionHeardReply(): Promise<void> {
  const { setConnectionState } = await import('../../state/app.state.js');
  setConnectionState('connected');
  const say = (type: string, text: string, isFinal: boolean): void => {
    window.dispatchEvent(new CustomEvent('ferni:transcript', { detail: { type, text, isFinal } }));
  };
  say('user', "My brother Leo starts his new job Monday and I'm weirdly nervous for him.", true);
  say('agent', "Nervous-for-someone is love in disguise. What's he walking into?", false);
  await wait(400);
}
