/**
 * "Hear Ferni": plays one line in Ferni's real voice (Cartesia, through the
 * landing TTS endpoint voice-samples.js already uses) from the hero, so a voice
 * product can be heard before anything is read. Tap again to stop. If the voice
 * can't be fetched the button says so; it never falls back to the browser's
 * own voice, which isn't Ferni's.
 */
(function () {
  'use strict';

  const TTS = 'https://app.ferni.ai/api/landing/tts';
  const LINE =
    "Hi, I'm Ferni. You can tell me about your day, the big stuff or the small stuff, and I'll remember it. Whenever you're ready, I'm here.";

  const button = document.querySelector('[data-hear-ferni]');
  if (!button) return;
  const label = button.querySelector('[data-hear-ferni-label]');
  const idleText = label.textContent;
  let audio = null;
  let url = null;

  function setState(text, pressed, busy) {
    label.textContent = text;
    button.setAttribute('aria-pressed', String(pressed));
    button.disabled = Boolean(busy);
  }

  function stop() {
    if (audio) audio.pause();
    audio = null;
    setState(idleText, false, false);
  }

  async function play() {
    setState('Getting Ferni…', true, true);
    try {
      if (!url) {
        const res = await fetch(TTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: LINE, personaId: 'ferni' }),
        });
        if (!res.ok) throw new Error(`TTS ${res.status}`);
        url = URL.createObjectURL(await res.blob());
      }
      audio = new Audio(url);
      audio.addEventListener('ended', stop);
      setState('Stop', true, false);
      await audio.play();
    } catch (err) {
      // eslint-disable-next-line no-console -- report failures in the browser console
      console.warn('Hear Ferni failed:', err instanceof Error ? err.message : err);
      audio = null;
      setState("Couldn't reach Ferni's voice. Try again", false, false);
    }
  }

  button.addEventListener('click', () => {
    if (audio) stop();
    else play();
  });
})();
