/**
 * Vibe Controller - lights and temperature section rendering
 */

import { t } from '../../i18n/index.js';
import { adjustTemperature, setLightBrightness, setLightColorTemp } from './actions.js';
import { createElement, createSvgIcon, ICONS } from './dom.js';
import {
  connectLights,
  connectLightsViaHomeAssistant,
  connectLightsViaHue,
  connectThermostat,
  connectThermostatViaEcobee,
  connectThermostatViaHomeAssistant,
  connectThermostatViaNest,
  hideLightsSetup,
  hideThermostatSetup,
  showingLightsSetup,
  showingThermostatSetup,
} from './setup-flows.js';
import { currentState, loadingState } from './state.js';
import { formatTargetTemperature, formatTemperature } from './temperature-format.js';

function renderLightsSetup(): HTMLElement {
  const setup = createElement('div', { className: 'vibe-setup' });

  const icon = createElement('div', { className: 'vibe-setup__icon' });
  icon.appendChild(createSvgIcon(ICONS.sun));
  setup.appendChild(icon);

  setup.appendChild(
    createElement('h3', { className: 'vibe-setup__title' }, [
      t('vibe.lights.connectTitle', 'Connect Your Lights'),
    ])
  );
  setup.appendChild(
    createElement('p', { className: 'vibe-setup__desc' }, [
      t(
        'vibe.lights.connectDescription',
        "Ferni can control your smart lights to set the perfect ambiance. Choose how you'd like to connect:"
      ),
    ])
  );

  const options = createElement('div', { className: 'vibe-setup__options' });

  // Home Assistant option
  const haOption = createElement('button', { className: 'vibe-setup__option' });
  const haIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  haIcon.appendChild(createSvgIcon(ICONS.home));
  haOption.appendChild(haIcon);
  const haInfo = createElement('div', { className: 'vibe-setup__option-info' });
  haInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-name' }, [
      t('vibe.providers.homeAssistant', 'Home Assistant'),
    ])
  );
  haInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-desc' }, [
      t('vibe.providers.homeAssistantDesc', 'Works with all your devices'),
    ])
  );
  haOption.appendChild(haInfo);
  const haArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  haArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  haOption.appendChild(haArrow);
  haOption.addEventListener('click', () => void connectLightsViaHomeAssistant());
  options.appendChild(haOption);

  // Philips Hue option
  const hueOption = createElement('button', { className: 'vibe-setup__option' });
  const hueIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  hueIcon.appendChild(createSvgIcon(ICONS.hue));
  hueOption.appendChild(hueIcon);
  const hueInfo = createElement('div', { className: 'vibe-setup__option-info' });
  hueInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-name' }, [
      t('vibe.providers.philipsHue', 'Philips Hue'),
    ])
  );
  hueInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-desc' }, [
      t('vibe.providers.philipsHueDesc', 'Connect directly to your Hue bridge'),
    ])
  );
  hueOption.appendChild(hueInfo);
  const hueArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  hueArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  hueOption.appendChild(hueArrow);
  hueOption.addEventListener('click', () => void connectLightsViaHue());
  options.appendChild(hueOption);

  setup.appendChild(options);

  const skipBtn = createElement('button', { className: 'vibe-setup__skip' }, [
    t('vibe.skipForNow', 'Skip for now'),
  ]);
  skipBtn.addEventListener('click', () => hideLightsSetup());
  setup.appendChild(skipBtn);

  return setup;
}

export function renderLightsSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.sun));
  header.appendChild(iconWrapper);
  header.appendChild(
    createElement('h3', { className: 'vibe-section__title' }, [t('vibe.lights.title', 'Lights')])
  );
  header.appendChild(
    createElement(
      'span',
      {
        className: `vibe-section__status ${currentState.lights.connected ? 'vibe-section__status--connected' : ''}`,
      },
      [
        currentState.lights.connected
          ? t('vibe.connected', 'Connected')
          : t('vibe.notConnected', 'Not connected'),
      ]
    )
  );
  section.appendChild(header);

  // Show setup flow if active
  if (showingLightsSetup) {
    section.appendChild(renderLightsSetup());
    return section;
  }

  if (!currentState.lights.connected) {
    const notConnected = createElement('div', { className: 'vibe-not-connected' });
    const icon = createElement('div', { className: 'vibe-not-connected__icon' });
    icon.appendChild(createSvgIcon(ICONS.sun));
    notConnected.appendChild(icon);
    notConnected.appendChild(
      createElement('p', { className: 'vibe-not-connected__text' }, [
        t('vibe.lights.notConnectedText', 'Connect your smart lights to control ambiance'),
      ])
    );
    const isConnecting = loadingState.connectingLights;
    const connectBtn = createElement(
      'button',
      {
        className: `vibe-not-connected__btn ${isConnecting ? 'vibe-not-connected__btn--loading' : ''}`,
      },
      [
        isConnecting
          ? t('vibe.connecting', 'Connecting...')
          : t('vibe.lights.connect', 'Connect Lights'),
      ]
    );
    connectBtn.addEventListener('click', () => void connectLights());
    notConnected.appendChild(connectBtn);
    section.appendChild(notConnected);
    return section;
  }

  // Brightness slider
  const isBrightnessLoading = loadingState.adjustingBrightness;
  const brightnessControl = createElement('div', {
    className: `vibe-control ${isBrightnessLoading ? 'vibe-control--loading' : ''}`,
  });
  brightnessControl.appendChild(
    createElement('span', { className: 'vibe-control__label' }, [
      t('vibe.lights.brightness', 'Brightness'),
    ])
  );

  const brightnessSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '0',
    max: '100',
    value: String(currentState.lights.brightness),
    'aria-label': t('vibe.lights.brightness', 'Brightness'),
  });

  const brightnessValue = createElement('span', { className: 'vibe-control__value' }, [
    `${currentState.lights.brightness}%`,
  ]);

  // Debounced brightness change
  let brightnessTimeout: ReturnType<typeof setTimeout> | null = null;
  brightnessSlider.addEventListener('input', () => {
    currentState.lights.brightness = parseInt(brightnessSlider.value, 10);
    brightnessValue.textContent = `${currentState.lights.brightness}%`;

    if (brightnessTimeout) clearTimeout(brightnessTimeout);
    brightnessTimeout = setTimeout(() => {
      void setLightBrightness(currentState.lights.brightness);
    }, 150);
  });

  brightnessControl.appendChild(brightnessSlider);
  brightnessControl.appendChild(brightnessValue);
  section.appendChild(brightnessControl);

  // Color temperature slider
  const isColorTempLoading = loadingState.adjustingColorTemp;
  const tempControl = createElement('div', {
    className: `vibe-control ${isColorTempLoading ? 'vibe-control--loading' : ''}`,
  });
  tempControl.appendChild(
    createElement('span', { className: 'vibe-control__label' }, [t('vibe.lights.warmth', 'Warmth')])
  );

  const tempSlider = createElement('input', {
    className: 'vibe-control__slider',
    type: 'range',
    min: '2700',
    max: '6500',
    value: String(currentState.lights.colorTemp),
    'aria-label': t('vibe.lights.colorTemperature', 'Color temperature'),
  });

  const getWarmthLabel = (temp: number): string => {
    if (temp < 4000) return t('vibe.lights.warm', 'Warm');
    if (temp > 5000) return t('vibe.lights.cool', 'Cool');
    return t('vibe.lights.neutral', 'Neutral');
  };

  const tempValue = createElement('span', { className: 'vibe-control__value' }, [
    getWarmthLabel(currentState.lights.colorTemp),
  ]);

  // Debounced color temp change
  let colorTempTimeout: ReturnType<typeof setTimeout> | null = null;
  tempSlider.addEventListener('input', () => {
    currentState.lights.colorTemp = parseInt(tempSlider.value, 10);
    tempValue.textContent = getWarmthLabel(currentState.lights.colorTemp);

    if (colorTempTimeout) clearTimeout(colorTempTimeout);
    colorTempTimeout = setTimeout(() => {
      void setLightColorTemp(currentState.lights.colorTemp);
    }, 150);
  });

  tempControl.appendChild(tempSlider);
  tempControl.appendChild(tempValue);
  section.appendChild(tempControl);

  return section;
}

function renderThermostatSetup(): HTMLElement {
  const setup = createElement('div', { className: 'vibe-setup' });

  const icon = createElement('div', { className: 'vibe-setup__icon' });
  icon.appendChild(createSvgIcon(ICONS.thermometer));
  setup.appendChild(icon);

  setup.appendChild(
    createElement('h3', { className: 'vibe-setup__title' }, [
      t('vibe.temperature.connectTitle', 'Connect Your Thermostat'),
    ])
  );
  setup.appendChild(
    createElement('p', { className: 'vibe-setup__desc' }, [
      t(
        'vibe.temperature.connectDescription',
        "Ferni can adjust your home's temperature to match your vibe. Choose your thermostat:"
      ),
    ])
  );

  const options = createElement('div', { className: 'vibe-setup__options' });

  // Ecobee option
  const ecobeeOption = createElement('button', { className: 'vibe-setup__option' });
  const ecobeeIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  ecobeeIcon.appendChild(createSvgIcon(ICONS.ecobee));
  ecobeeOption.appendChild(ecobeeIcon);
  const ecobeeInfo = createElement('div', { className: 'vibe-setup__option-info' });
  ecobeeInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-name' }, [
      t('vibe.providers.ecobee', 'Ecobee'),
    ])
  );
  ecobeeInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-desc' }, [
      t('vibe.providers.ecobeeDesc', 'Smart thermostat with room sensors'),
    ])
  );
  ecobeeOption.appendChild(ecobeeInfo);
  const ecobeeArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  ecobeeArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  ecobeeOption.appendChild(ecobeeArrow);
  ecobeeOption.addEventListener('click', () => void connectThermostatViaEcobee());
  options.appendChild(ecobeeOption);

  // Nest option
  const nestOption = createElement('button', { className: 'vibe-setup__option' });
  const nestIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  nestIcon.appendChild(createSvgIcon(ICONS.thermometer));
  nestOption.appendChild(nestIcon);
  const nestInfo = createElement('div', { className: 'vibe-setup__option-info' });
  nestInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-name' }, [
      t('vibe.providers.googleNest', 'Google Nest'),
    ])
  );
  nestInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-desc' }, [
      t('vibe.providers.googleNestDesc', 'Learning thermostat'),
    ])
  );
  nestOption.appendChild(nestInfo);
  const nestArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  nestArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  nestOption.appendChild(nestArrow);
  nestOption.addEventListener('click', () => void connectThermostatViaNest());
  options.appendChild(nestOption);

  // Home Assistant option
  const haOption = createElement('button', { className: 'vibe-setup__option' });
  const haIcon = createElement('div', { className: 'vibe-setup__option-icon' });
  haIcon.appendChild(createSvgIcon(ICONS.home));
  haOption.appendChild(haIcon);
  const haInfo = createElement('div', { className: 'vibe-setup__option-info' });
  haInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-name' }, [
      t('vibe.providers.homeAssistant', 'Home Assistant'),
    ])
  );
  haInfo.appendChild(
    createElement('div', { className: 'vibe-setup__option-desc' }, [
      t('vibe.providers.homeAssistantClimate', 'Any thermostat via Home Assistant'),
    ])
  );
  haOption.appendChild(haInfo);
  const haArrow = createElement('div', { className: 'vibe-setup__option-arrow' });
  haArrow.appendChild(createSvgIcon(ICONS.chevronRight));
  haOption.appendChild(haArrow);
  haOption.addEventListener('click', () => void connectThermostatViaHomeAssistant());
  options.appendChild(haOption);

  setup.appendChild(options);

  const skipBtn = createElement('button', { className: 'vibe-setup__skip' }, [
    t('vibe.skipForNow', 'Skip for now'),
  ]);
  skipBtn.addEventListener('click', () => hideThermostatSetup());
  setup.appendChild(skipBtn);

  return setup;
}

export function renderTemperatureSection(): HTMLElement {
  const section = createElement('div', { className: 'vibe-section' });

  // Header
  const header = createElement('div', { className: 'vibe-section__header' });
  const iconWrapper = createElement('div', { className: 'vibe-section__icon' });
  iconWrapper.appendChild(createSvgIcon(ICONS.thermometer));
  header.appendChild(iconWrapper);
  header.appendChild(
    createElement('h3', { className: 'vibe-section__title' }, [
      t('vibe.temperature.title', 'Temperature'),
    ])
  );
  header.appendChild(
    createElement(
      'span',
      {
        className: `vibe-section__status ${currentState.temperature.connected ? 'vibe-section__status--connected' : ''}`,
      },
      [
        currentState.temperature.connected
          ? t('vibe.temperature.currentNow', '{temp} now', {
              temp: formatTemperature(currentState.temperature.current),
            })
          : t('vibe.notConnected', 'Not connected'),
      ]
    )
  );
  section.appendChild(header);

  // Show setup flow if active
  if (showingThermostatSetup) {
    section.appendChild(renderThermostatSetup());
    return section;
  }

  if (!currentState.temperature.connected) {
    const notConnected = createElement('div', { className: 'vibe-not-connected' });
    const icon = createElement('div', { className: 'vibe-not-connected__icon' });
    icon.appendChild(createSvgIcon(ICONS.thermometer));
    notConnected.appendChild(icon);
    notConnected.appendChild(
      createElement('p', { className: 'vibe-not-connected__text' }, [
        t('vibe.temperature.notConnectedText', 'Connect your thermostat for comfort control'),
      ])
    );
    const isConnecting = loadingState.connectingThermostat;
    const connectBtn = createElement(
      'button',
      {
        className: `vibe-not-connected__btn ${isConnecting ? 'vibe-not-connected__btn--loading' : ''}`,
      },
      [
        isConnecting
          ? t('vibe.connecting', 'Connecting...')
          : t('vibe.temperature.connect', 'Connect Thermostat'),
      ]
    );
    connectBtn.addEventListener('click', () => void connectThermostat());
    notConnected.appendChild(connectBtn);
    section.appendChild(notConnected);
    return section;
  }

  // Temperature controls
  const isLoading = loadingState.adjustingTemperature;
  const tempDisplay = createElement('div', {
    className: `vibe-temp ${isLoading ? 'vibe-control--loading' : ''}`,
  });

  const decreaseBtn = createElement(
    'button',
    {
      className: 'vibe-temp__btn',
      'aria-label': t('vibe.temperature.decrease', 'Decrease temperature'),
    },
    ['−']
  );
  decreaseBtn.addEventListener('click', () => void adjustTemperature(-1));
  tempDisplay.appendChild(decreaseBtn);

  const display = createElement('div', { className: 'vibe-temp__display' });
  display.appendChild(
    createElement('div', { className: 'vibe-temp__value' }, [
      formatTargetTemperature(currentState.temperature.target),
    ])
  );
  display.appendChild(
    createElement('div', { className: 'vibe-temp__label' }, [
      t('vibe.temperature.target', 'Target'),
    ])
  );
  tempDisplay.appendChild(display);

  const increaseBtn = createElement(
    'button',
    {
      className: 'vibe-temp__btn',
      'aria-label': t('vibe.temperature.increase', 'Increase temperature'),
    },
    ['+']
  );
  increaseBtn.addEventListener('click', () => void adjustTemperature(1));
  tempDisplay.appendChild(increaseBtn);

  section.appendChild(tempDisplay);
  return section;
}
