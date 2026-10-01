/**
 * Vibe Controller - music section rendering
 */

import { t } from '../../i18n/index.js';
import { setMusicVolume, skipTrack, toggleMusic } from './actions.js';
import { createElement, createSvgIcon, ICONS } from './dom.js';
import { currentState, loadingState } from './state.js';

export function renderMusicSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.music));
  header.appendChild(iconWrapper);
  header.appendChild(
    createElement('h3', { className: 'vibe-section__title' }, [t('vibe.music.title', 'Music')])
  );
  header.appendChild(
    createElement(
      'span',
      {
        className: `vibe-section__status ${currentState.music.playing ? 'vibe-section__status--connected' : ''}`,
      },
      [
        currentState.music.playing
          ? t('vibe.music.playing', 'Playing')
          : t('vibe.music.paused', 'Paused'),
      ]
    )
  );
  section.appendChild(header);

  // Now Playing
  const music = createElement('div', { className: 'vibe-music' });

  const nowPlaying = createElement('div', { className: 'vibe-music__now-playing' });

  const cover = createElement('div', { className: 'vibe-music__cover' });
  cover.appendChild(createSvgIcon(ICONS.music));
  nowPlaying.appendChild(cover);

  const info = createElement('div', { className: 'vibe-music__info' });
  info.appendChild(
    createElement('div', { className: 'vibe-music__track' }, [
      currentState.music.track || t('vibe.music.chooseVibe', 'Choose a vibe to start music'),
    ])
  );
  info.appendChild(
    createElement('div', { className: 'vibe-music__artist' }, [
      currentState.music.artist || t('vibe.music.askFerni', 'Or ask Ferni to play something'),
    ])
  );
  nowPlaying.appendChild(info);

  const controls = createElement('div', { className: 'vibe-music__controls' });
  const playBtn = createElement('button', {
    className: 'vibe-music__btn',
    'aria-label': currentState.music.playing
      ? t('vibe.music.pause', 'Pause')
      : t('vibe.music.play', 'Play'),
  });
  playBtn.appendChild(createSvgIcon(currentState.music.playing ? ICONS.pause : ICONS.play));
  playBtn.addEventListener('click', toggleMusic);
  controls.appendChild(playBtn);

  const skipBtn = createElement('button', {
    className: 'vibe-music__btn vibe-music__btn--secondary',
    'aria-label': t('vibe.music.skip', 'Skip'),
  });
  skipBtn.appendChild(createSvgIcon(ICONS.skipForward));
  skipBtn.addEventListener('click', skipTrack);
  controls.appendChild(skipBtn);

  nowPlaying.appendChild(controls);
  music.appendChild(nowPlaying);

  // Volume slider
  const isVolumeLoading = loadingState.adjustingVolume;
  const volumeControl = createElement('div', {
    className: `vibe-control ${isVolumeLoading ? 'vibe-control--loading' : ''}`,
  });
  volumeControl.appendChild(
    createElement('span', { className: 'vibe-control__label' }, [t('vibe.volume', 'Volume')])
  );

  const volumeSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '0',
    max: '100',
    value: String(currentState.music.volume),
    'aria-label': t('vibe.volume', 'Volume'),
  });

  const volumeValue = createElement('span', { className: 'vibe-control__value' }, [
    `${currentState.music.volume}%`,
  ]);

  // Debounced volume change
  let volumeTimeout: ReturnType<typeof setTimeout> | null = null;
  volumeSlider.addEventListener('input', () => {
    currentState.music.volume = parseInt(volumeSlider.value, 10);
    volumeValue.textContent = `${currentState.music.volume}%`;

    // Debounce API call
    if (volumeTimeout) clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
      void setMusicVolume(currentState.music.volume);
    }, 150);
  });

  volumeControl.appendChild(volumeSlider);
  volumeControl.appendChild(volumeValue);
  music.appendChild(volumeControl);

  section.appendChild(music);
  return section;
}
