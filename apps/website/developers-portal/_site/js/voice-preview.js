/**
 * Voice Preview Player
 *
 * Handles voice preview audio generation and playback.
 * Uses safe DOM manipulation methods to prevent XSS.
 */

// API Base URL
const VOICE_API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3002'
  : 'https://john-bogle-ui-768716511401.us-central1.run.app';

// Audio player state
let currentAudio = null;
let isPlaying = false;
let isLoading = false;

/**
 * Preview a voice by generating and playing an audio sample
 * @param {string} voiceId - Cartesia voice ID
 * @param {string} [customText] - Optional custom text to speak
 */
async function previewVoice(voiceId, customText) {
  if (isLoading) return;

  const token = await window.getAuthToken();
  if (!token) {
    console.error('Not authenticated');
    return;
  }

  // Stop current audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    isPlaying = false;
  }

  isLoading = true;
  updatePlayerUI('loading');

  try {
    const response = await fetch(`${VOICE_API_BASE}/api/v1/developers/voices/preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        voice_id: voiceId,
        text: customText
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate preview');
    }

    const data = await response.json();

    if (!data.preview || !data.preview.audioUrl) {
      throw new Error('No audio URL in response');
    }

    // Create and play audio
    currentAudio = new Audio(data.preview.audioUrl);

    currentAudio.addEventListener('loadeddata', () => {
      isLoading = false;
      isPlaying = true;
      updatePlayerUI('playing', data.preview);
      currentAudio.play();
    });

    currentAudio.addEventListener('ended', () => {
      isPlaying = false;
      updatePlayerUI('stopped', data.preview);
    });

    currentAudio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      isLoading = false;
      isPlaying = false;
      updatePlayerUI('error');
    });

  } catch (error) {
    console.error('Error generating voice preview:', error);
    isLoading = false;
    updatePlayerUI('error');
  }
}

/**
 * Stop the currently playing audio
 */
function stopPreview() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    isPlaying = false;
    updatePlayerUI('stopped');
  }
}

/**
 * Toggle play/pause
 */
function togglePreview() {
  if (!currentAudio) return;

  if (isPlaying) {
    currentAudio.pause();
    isPlaying = false;
    updatePlayerUI('paused');
  } else {
    currentAudio.play();
    isPlaying = true;
    updatePlayerUI('playing');
  }
}

/**
 * Update the player UI based on state
 * @param {'loading'|'playing'|'paused'|'stopped'|'error'} state
 * @param {Object} [previewData] - Preview data from API
 */
function updatePlayerUI(state, previewData) {
  const playerEl = document.getElementById('voice-preview-player');
  if (!playerEl) return;

  // Clear safely
  while (playerEl.firstChild) {
    playerEl.removeChild(playerEl.firstChild);
  }

  switch (state) {
    case 'loading': {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'voice-player-loading';
      loadingDiv.textContent = 'Generating preview...';
      playerEl.appendChild(loadingDiv);
      break;
    }

    case 'playing':
    case 'paused': {
      const controls = createPlayerControls(state === 'playing', previewData);
      playerEl.appendChild(controls);
      break;
    }

    case 'stopped': {
      const stoppedDiv = document.createElement('div');
      stoppedDiv.className = 'voice-player-stopped';

      const replayBtn = document.createElement('button');
      replayBtn.className = 'btn btn-secondary btn-sm';
      replayBtn.textContent = '▶ Play Again';
      replayBtn.addEventListener('click', togglePreview);

      stoppedDiv.appendChild(replayBtn);

      if (previewData?.text) {
        const textDiv = document.createElement('div');
        textDiv.className = 'voice-player-text';
        textDiv.textContent = `"${previewData.text}"`;
        stoppedDiv.appendChild(textDiv);
      }

      playerEl.appendChild(stoppedDiv);
      break;
    }

    case 'error': {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'voice-player-error';
      errorDiv.textContent = 'Failed to generate preview. Please try again.';
      playerEl.appendChild(errorDiv);
      break;
    }

    default:
      break;
  }
}

/**
 * Create player controls element
 * @param {boolean} playing - Whether audio is currently playing
 * @param {Object} previewData - Preview data from API
 */
function createPlayerControls(playing, previewData) {
  const controls = document.createElement('div');
  controls.className = 'voice-player-controls';

  // Play/Pause button
  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'voice-player-btn';
  playPauseBtn.textContent = playing ? '⏸' : '▶';
  playPauseBtn.title = playing ? 'Pause' : 'Play';
  playPauseBtn.addEventListener('click', togglePreview);
  controls.appendChild(playPauseBtn);

  // Stop button
  const stopBtn = document.createElement('button');
  stopBtn.className = 'voice-player-btn';
  stopBtn.textContent = '⏹';
  stopBtn.title = 'Stop';
  stopBtn.addEventListener('click', stopPreview);
  controls.appendChild(stopBtn);

  // Status text
  const statusText = document.createElement('span');
  statusText.className = 'voice-player-status';
  statusText.textContent = playing ? 'Playing...' : 'Paused';
  controls.appendChild(statusText);

  // Duration
  if (previewData?.duration) {
    const durationText = document.createElement('span');
    durationText.className = 'voice-player-duration';
    durationText.textContent = `${previewData.duration}s`;
    controls.appendChild(durationText);
  }

  return controls;
}

// Add styles for player
const playerStyles = document.createElement('style');
playerStyles.textContent = `
  .voice-player-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    color: var(--text-secondary);
  }

  .voice-player-loading::before {
    content: '';
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-medium);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    margin-right: var(--space-2);
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .voice-player-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
  }

  .voice-player-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-elevated);
    border: 1px solid var(--border-medium);
    border-radius: var(--radius-full);
    font-size: var(--text-lg);
    cursor: pointer;
    transition: all 0.2s;
  }

  .voice-player-btn:hover {
    background: var(--accent-subtle);
    border-color: var(--accent-primary);
  }

  .voice-player-status {
    flex: 1;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .voice-player-duration {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .voice-player-stopped {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .voice-player-text {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    font-style: italic;
    max-width: 300px;
    text-align: center;
  }

  .voice-player-error {
    padding: var(--space-4);
    color: var(--error);
    text-align: center;
  }

  .btn-sm {
    padding: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
  }
`;
document.head.appendChild(playerStyles);

// Export for use in wizard
window.previewVoice = previewVoice;
window.stopPreview = stopPreview;
window.togglePreview = togglePreview;
