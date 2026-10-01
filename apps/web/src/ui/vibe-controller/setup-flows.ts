/**
 * Vibe Controller - device setup flows (lights, thermostat, Ecobee PIN dialog)
 */

import { apiGet, apiPost } from '../../utils/api.js';
import { toast } from '../whisper.ui.js';
import { t } from '../../i18n/index.js';
import { createElement } from './dom.js';
import { currentState, loadingState, render } from './state.js';

// Setup view states (read by render-devices.ts)
export let showingLightsSetup = false;
export let showingThermostatSetup = false;

function showLightsSetup(): void {
  showingLightsSetup = true;
  render();
}

function showThermostatSetup(): void {
  showingThermostatSetup = true;
  render();
}

export function hideLightsSetup(): void {
  showingLightsSetup = false;
  render();
}

export function hideThermostatSetup(): void {
  showingThermostatSetup = false;
  render();
}

export async function connectLightsViaHomeAssistant(): Promise<void> {
  loadingState.connectingLights = true;
  render();
  toast.info(t('vibe.connectingToHA', 'Connecting to Home Assistant...'));

  try {
    // Start OAuth flow or show config dialog
    const result = await apiPost<{ success: boolean; authUrl?: string }>(
      '/api/vibe/lights/connect',
      { provider: 'home-assistant' }
    );
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.lightsConnected', 'Lights connected!'));
      currentState.lights.connected = true;
      showingLightsSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Home Assistant:', error);
    toast.error(t('vibe.couldNotConnectHA', "Couldn't connect. Check your Home Assistant URL."));
  } finally {
    loadingState.connectingLights = false;
    render();
  }
}

export async function connectLightsViaHue(): Promise<void> {
  loadingState.connectingLights = true;
  render();
  toast.info(t('vibe.lookingForHue', 'Looking for Philips Hue bridge...'));

  try {
    const result = await apiPost<{ success: boolean; authUrl?: string; message?: string }>(
      '/api/vibe/lights/connect',
      { provider: 'hue' }
    );
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.hueLightsConnected', 'Hue lights connected!'));
      currentState.lights.connected = true;
      showingLightsSetup = false;
    } else {
      toast.info(
        result.data?.message ||
          t('vibe.pressHueButton', 'Press the button on your Hue bridge, then try again')
      );
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Hue:', error);
    toast.error(t('vibe.couldNotFindHue', "Couldn't find Hue bridge. Is it on?"));
  } finally {
    loadingState.connectingLights = false;
    render();
  }
}

export async function connectThermostatViaEcobee(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.gettingEcobeePin', 'Getting Ecobee PIN...'));

  try {
    // Ecobee uses PIN-based OAuth - we get a PIN, user enters it at ecobee.com
    const result = await apiPost<{
      pin?: string;
      expiresInMinutes?: number;
      instructions?: string;
    }>('/api/ecobee/link/start', {});

    loadingState.connectingThermostat = false;
    render();

    if (result.ok && result.data?.pin) {
      // Show PIN to user with instructions
      showEcobeePinDialog(result.data.pin, result.data.expiresInMinutes || 10);

      // Poll for authorization
      const checkConnection = setInterval(async () => {
        const status = await apiGet<{ status: string }>('/api/ecobee/link/status');
        if (status.ok && status.data?.status === 'connected') {
          clearInterval(checkConnection);
          hideEcobeePinDialog();
          toast.success(t('vibe.thermostatConnected', 'Thermostat connected!'));
          currentState.temperature.connected = true;
          showingThermostatSetup = false;
          render();
        } else if (status.ok && status.data?.status === 'expired') {
          clearInterval(checkConnection);
          hideEcobeePinDialog();
          toast.warning(t('vibe.pinExpiredRetry', 'PIN expired. Try again?'));
        }
      }, 5000); // Poll every 5 seconds

      // Stop polling after 10 minutes (PIN expires)
      setTimeout(() => {
        clearInterval(checkConnection);
        hideEcobeePinDialog();
      }, 600000);
    } else {
      toast.error(t('vibe.couldNotGetPin', "Couldn't get PIN. Is Ecobee configured?"));
    }
  } catch (error) {
    loadingState.connectingThermostat = false;
    render();
    if (import.meta.env?.DEV) console.debug('Failed to connect Ecobee:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  }
}

// Ecobee PIN dialog helpers
let ecobeePinDialog: HTMLElement | null = null;

function showEcobeePinDialog(pin: string, expiresInMinutes: number): void {
  // Remove existing dialog if any
  hideEcobeePinDialog();

  ecobeePinDialog = createElement('div', { className: 'ecobee-pin-dialog' });

  const card = createElement('div', { className: 'ecobee-pin-card' });

  const title = createElement('h3', {}, [t('vibe.ecobee.connectTitle', 'Connect Ecobee')]);

  const instructions = createElement('p', { className: 'ecobee-pin-card__instructions' }, [
    t('vibe.ecobee.enterPin', 'Enter this PIN at ecobee.com:'),
  ]);

  const pinDisplay = createElement('div', { className: 'ecobee-pin-card__pin' }, [pin]);

  const steps = createElement('ol', { className: 'ecobee-pin-card__steps' });
  const stepTexts = [
    t('vibe.ecobee.step1', 'Go to ecobee.com/consumerportal'),
    t('vibe.ecobee.step2', 'Click "Add Application"'),
    t('vibe.ecobee.step3', 'Enter the PIN above'),
  ];
  stepTexts.forEach((stepText) => {
    const li = createElement('li', {}, [stepText]);
    steps.appendChild(li);
  });

  const expires = createElement('p', { className: 'ecobee-pin-card__expires' }, [
    t('vibe.ecobee.pinExpires', 'PIN expires in {minutes} minutes', {
      minutes: String(expiresInMinutes),
    }),
  ]);

  const cancelBtn = createElement(
    'button',
    {
      className: 'ecobee-pin-card__cancel',
      'aria-label': t('common.cancel', 'Cancel'),
    },
    [t('common.cancel', 'Cancel')]
  );
  cancelBtn.addEventListener('click', hideEcobeePinDialog);

  card.appendChild(title);
  card.appendChild(instructions);
  card.appendChild(pinDisplay);
  card.appendChild(steps);
  card.appendChild(expires);
  card.appendChild(cancelBtn);
  ecobeePinDialog.appendChild(card);
  document.body.appendChild(ecobeePinDialog);

  // Focus the cancel button for accessibility
  cancelBtn.focus();
}

function hideEcobeePinDialog(): void {
  if (ecobeePinDialog) {
    ecobeePinDialog.remove();
    ecobeePinDialog = null;
  }
}

export async function connectThermostatViaNest(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.connectingToNest', 'Connecting to Nest...'));

  try {
    const result = await apiPost<{ success: boolean; authUrl?: string }>(
      '/api/vibe/thermostat/connect',
      { provider: 'nest' }
    );
    if (result.ok && result.data?.authUrl) {
      window.open(result.data.authUrl, '_blank', 'width=600,height=700');
    } else if (result.ok && result.data?.success) {
      toast.success(t('vibe.nestConnected', 'Nest connected!'));
      currentState.temperature.connected = true;
      showingThermostatSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Nest:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  } finally {
    loadingState.connectingThermostat = false;
    render();
  }
}

export async function connectThermostatViaHomeAssistant(): Promise<void> {
  loadingState.connectingThermostat = true;
  render();
  toast.info(t('vibe.connectingToHAClimate', 'Using Home Assistant for climate control...'));

  try {
    const result = await apiPost<{ success: boolean }>('/api/vibe/thermostat/connect', {
      provider: 'home-assistant',
    });
    if (result.ok && result.data?.success) {
      toast.success(t('vibe.climateControlConnected', 'Climate control connected!'));
      currentState.temperature.connected = true;
      showingThermostatSetup = false;
    }
  } catch (error) {
    if (import.meta.env?.DEV) console.debug('Failed to connect Home Assistant climate:', error);
    toast.error(t('vibe.couldNotConnect', "Couldn't connect. Try again?"));
  } finally {
    loadingState.connectingThermostat = false;
    render();
  }
}

export async function connectLights(): Promise<void> {
  showLightsSetup();
}

export async function connectThermostat(): Promise<void> {
  showThermostatSetup();
}
