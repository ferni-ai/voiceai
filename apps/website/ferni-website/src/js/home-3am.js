/**
 * Home "3:47 AM" — the only script that owns the home hero.
 *
 * Voice orb: fetches Ferni's real voice from /api/landing/tts (rate limited,
 * cached for the session), drives the halo/bars from a Web Audio analyser and
 * reveals the caption word by word. If the voice can't load, the caption is
 * shown as text; never a browser voice pretending to be Ferni.
 */
(function () {
  'use strict';

  const root = document.querySelector('[data-voice]');
  if (!root) return;

  const button = root.querySelector('[data-voice-toggle]');
  const label = root.querySelector('[data-voice-label]');
  const caption = root.querySelector('[data-voice-caption]');
  const text = root.dataset.text || '';
  const TTS_ENDPOINT = '/api/landing/tts';

  let audio = null;
  let audioUrl = null;
  let context = null;
  let analyser = null;
  let frame = 0;

  // Caption words as spans, so they can light up as they are spoken
  const words = text.split(/\s+/).filter(Boolean);
  function renderCaption() {
    caption.textContent = '';
    for (const w of words) {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w + ' ';
      caption.appendChild(span);
    }
  }

  function setState(playing) {
    button.setAttribute('aria-pressed', String(playing));
    label.textContent = playing ? 'Pause' : 'Hear Ferni';
    root.classList.toggle('is-speaking', playing);
    if (!playing) root.style.setProperty('--level', '0');
  }

  async function loadAudio() {
    if (audio) return audio;
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, personaId: 'ferni' }),
    });
    if (!response.ok) throw new Error('TTS ' + response.status);
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('audio')) throw new Error('TTS returned no audio');
    audioUrl = URL.createObjectURL(blob);
    audio = new Audio(audioUrl);
    audio.addEventListener('ended', stop);
    return audio;
  }

  function connectAnalyser(el) {
    if (analyser) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    context = new Ctx();
    const source = context.createMediaElementSource(el);
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
  }

  function tick() {
    if (!audio || audio.paused) return;
    // Level from the analyser (0-1), softened
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) * (v - 128);
      const rms = Math.sqrt(sum / data.length) / 128;
      root.style.setProperty('--level', Math.min(1, rms * 3.2).toFixed(3));
    }
    // Words light up in proportion to playback progress
    if (audio.duration) {
      const said = Math.ceil((audio.currentTime / audio.duration) * words.length);
      caption.querySelectorAll('.word').forEach((w, i) => w.classList.toggle('is-said', i < said));
    }
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    if (audio) {
      audio.pause();
      if (audio.ended) audio.currentTime = 0;
    }
    caption.querySelectorAll('.word').forEach((w) => w.classList.add('is-said'));
    setState(false);
  }

  function showTextFallback() {
    caption.textContent = '"' + text + '"';
    const note = document.createElement('small');
    note.textContent = "Ferni's voice is resting right now. Call or open the app to hear it live.";
    caption.appendChild(note);
    setState(false);
  }

  button.addEventListener('click', async () => {
    if (audio && !audio.paused) {
      stop();
      return;
    }
    label.textContent = 'Waking up…';
    try {
      const el = await loadAudio();
      connectAnalyser(el);
      if (context && context.state === 'suspended') await context.resume();
      if (el.ended || el.currentTime === 0) renderCaption();
      await el.play();
      setState(true);
      frame = requestAnimationFrame(tick);
    } catch (error) {
      if (window.console) console.warn('[home] voice unavailable', error);
      showTextFallback();
    }
  });

  window.addEventListener('pagehide', () => {
    stop();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  });
})();
