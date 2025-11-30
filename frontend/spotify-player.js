/**
 * Spotify Web Playback SDK Integration
 * 
 * Creates a virtual Spotify player in the browser that Jack can control!
 * This eliminates the need to have the Spotify app open.
 * 
 * Note: Requires Spotify Premium
 */

// Global state
window.SpotifyPlayer = {
    player: null,
    deviceId: null,
    isReady: false,
    isPlaying: false,
    currentTrack: null,
    accessToken: null,
    // Auto-ducking state
    normalVolume: 0.5,
    duckedVolume: 0.15,  // 15% when user speaks
    isDucked: false,
    duckingTimeout: null,
};

// Called when the Spotify SDK is ready
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('🎵 Spotify Web Playback SDK is ready');
    
    // Don't auto-initialize - wait for token
    // The token will be fetched when user connects
};

/**
 * Initialize the Spotify player with an access token
 */
async function initializeSpotifyPlayer() {
    console.log('🎵 Initializing Spotify Web Player...');
    
    // Get a fresh token from our server
    try {
        const response = await fetch('/spotify/token');
        if (!response.ok) {
            console.warn('🎵 Spotify not configured on server');
            return false;
        }
        const data = await response.json();
        window.SpotifyPlayer.accessToken = data.access_token;
    } catch (error) {
        console.warn('🎵 Could not get Spotify token:', error);
        return false;
    }
    
    if (!window.SpotifyPlayer.accessToken) {
        console.warn('🎵 No Spotify access token available');
        return false;
    }
    
    // Create the player
    const player = new Spotify.Player({
        name: 'Jack Bogle AI',
        getOAuthToken: cb => { cb(window.SpotifyPlayer.accessToken); },
        volume: 0.5,
    });
    
    // Error handling
    player.addListener('initialization_error', ({ message }) => {
        console.error('🎵 Spotify init error:', message);
    });
    
    player.addListener('authentication_error', ({ message }) => {
        console.error('🎵 Spotify auth error:', message);
        // Token might be expired, try to refresh
        refreshSpotifyToken();
    });
    
    player.addListener('account_error', ({ message }) => {
        console.error('🎵 Spotify account error:', message);
        // This usually means no Premium
        window.SpotifyPlayer.premiumRequired = true;
        showSpotifyStatus('Opens in Spotify app', 'info');
        console.log('🎵 No Premium - music will play through your Spotify app instead');
    });
    
    player.addListener('playback_error', ({ message }) => {
        console.error('🎵 Spotify playback error:', message);
    });
    
    // Playback status updates
    player.addListener('player_state_changed', state => {
        if (!state) return;
        
        window.SpotifyPlayer.isPlaying = !state.paused;
        window.SpotifyPlayer.currentTrack = state.track_window?.current_track;
        
        if (window.SpotifyPlayer.currentTrack) {
            const track = window.SpotifyPlayer.currentTrack;
            console.log(`🎵 Now playing: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
            showSpotifyStatus(`♪ ${track.name}`, 'playing');
        }
    });
    
    // Ready
    player.addListener('ready', ({ device_id }) => {
        console.log('🎵 Spotify Web Player ready! Device ID:', device_id);
        window.SpotifyPlayer.deviceId = device_id;
        window.SpotifyPlayer.isReady = true;
        window.SpotifyPlayer.player = player;
        
        // Register this device with our server
        registerSpotifyDevice(device_id);
        
        showSpotifyStatus('Spotify connected', 'ready');
    });
    
    // Not Ready
    player.addListener('not_ready', ({ device_id }) => {
        console.log('🎵 Spotify device went offline:', device_id);
        window.SpotifyPlayer.isReady = false;
        showSpotifyStatus('Spotify offline', 'offline');
    });
    
    // Connect!
    const success = await player.connect();
    if (success) {
        console.log('🎵 Spotify Web Player connected successfully!');
        return true;
    } else {
        console.error('🎵 Failed to connect Spotify Web Player');
        return false;
    }
}

/**
 * Refresh the Spotify access token
 */
async function refreshSpotifyToken() {
    try {
        const response = await fetch('/spotify/token');
        if (response.ok) {
            const data = await response.json();
            window.SpotifyPlayer.accessToken = data.access_token;
            console.log('🎵 Spotify token refreshed');
        }
    } catch (error) {
        console.error('🎵 Failed to refresh token:', error);
    }
}

/**
 * Register the device ID with our server so Jack can use it
 */
async function registerSpotifyDevice(deviceId) {
    try {
        await fetch('/spotify/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId }),
        });
        console.log('🎵 Device registered with server');
    } catch (error) {
        console.error('🎵 Failed to register device:', error);
    }
}

/**
 * Show Spotify status in the UI - positioned at top to not cover buttons
 */
function showSpotifyStatus(message, status) {
    // Find or create status element
    let statusEl = document.getElementById('spotify-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'spotify-status';
        statusEl.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            border-radius: 25px;
            font-size: 13px;
            font-weight: 500;
            z-index: 1000;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        document.body.appendChild(statusEl);
    }
    
    // Style based on status
    const colors = {
        ready: { bg: 'rgba(30, 215, 96, 0.15)', color: '#1ed760', border: '1px solid rgba(30, 215, 96, 0.3)', icon: '🎵' },
        playing: { bg: 'rgba(30, 215, 96, 0.25)', color: '#1ed760', border: '1px solid rgba(30, 215, 96, 0.5)', icon: '▶️' },
        info: { bg: 'rgba(100, 150, 255, 0.15)', color: '#88aaff', border: '1px solid rgba(100, 150, 255, 0.3)', icon: '💡' },
        error: { bg: 'rgba(255, 100, 100, 0.15)', color: '#ff6464', border: '1px solid rgba(255, 100, 100, 0.3)', icon: '⚠️' },
        offline: { bg: 'rgba(150, 150, 150, 0.15)', color: '#999', border: '1px solid rgba(150, 150, 150, 0.3)', icon: '🔇' },
    };
    
    const style = colors[status] || colors.offline;
    statusEl.style.backgroundColor = style.bg;
    statusEl.style.color = style.color;
    statusEl.style.border = style.border;
    statusEl.innerHTML = `<span>${style.icon}</span><span>${message}</span>`;
    statusEl.style.opacity = '1';
    
    // Update app state for CSS animations
    const app = document.getElementById('app');
    if (app) {
        if (status === 'playing') {
            app.classList.add('music-playing');
        } else {
            app.classList.remove('music-playing');
        }
    }
    
    // Auto-hide after delay (except for 'playing')
    if (status !== 'playing') {
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => {
                if (statusEl.style.opacity === '0') {
                    statusEl.remove();
                }
            }, 300);
        }, 3000);
    }
}

/**
 * Hide Spotify status
 */
function hideSpotifyStatus() {
    const statusEl = document.getElementById('spotify-status');
    if (statusEl) {
        statusEl.style.opacity = '0';
        setTimeout(() => statusEl.remove(), 300);
    }
    const app = document.getElementById('app');
    if (app) {
        app.classList.remove('music-playing');
    }
}

/**
 * Stop Spotify playback (for disconnect)
 */
async function stopSpotifyPlayback() {
    if (!window.SpotifyPlayer.isReady || !window.SpotifyPlayer.player) {
        return;
    }
    
    try {
        await window.SpotifyPlayer.player.pause();
        console.log('🎵 Spotify paused on disconnect');
        hideSpotifyStatus();
    } catch (e) {
        console.log('Could not pause Spotify:', e);
    }
}

// ============================================================================
// AUTO-DUCKING - Music fades when you speak!
// ============================================================================

/**
 * Duck the music (lower volume) when user starts speaking
 * This is called by the LiveKit VAD (Voice Activity Detection)
 */
function duckMusic() {
    if (!window.SpotifyPlayer.isPlaying || window.SpotifyPlayer.isDucked) {
        return;
    }
    
    window.SpotifyPlayer.isDucked = true;
    console.log('🎵 Ducking music for speech...');
    
    // Smooth fade to ducked volume
    smoothVolumeChange(window.SpotifyPlayer.duckedVolume, 300);
    
    // Clear any pending unduck
    if (window.SpotifyPlayer.duckingTimeout) {
        clearTimeout(window.SpotifyPlayer.duckingTimeout);
    }
}

/**
 * Unduck the music (restore volume) when user stops speaking
 */
function unduckMusic() {
    if (!window.SpotifyPlayer.isDucked) {
        return;
    }
    
    // Delay the unduck slightly to avoid rapid duck/unduck
    window.SpotifyPlayer.duckingTimeout = setTimeout(() => {
        if (!window.SpotifyPlayer.isDucked) return;
        
        console.log('🎵 Restoring music volume');
        window.SpotifyPlayer.isDucked = false;
        
        // Smooth fade back to normal
        smoothVolumeChange(window.SpotifyPlayer.normalVolume, 500);
    }, 800); // Wait 800ms after speech ends
}

/**
 * Smoothly change volume over time
 */
function smoothVolumeChange(targetVolume, durationMs) {
    if (!window.SpotifyPlayer.player) return;
    
    const startVolume = window.SpotifyPlayer.player._options?.volume || 0.5;
    const startTime = Date.now();
    const volumeDiff = targetVolume - startVolume;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        
        // Ease-out curve for natural feel
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentVolume = startVolume + (volumeDiff * eased);
        
        if (window.SpotifyPlayer.player) {
            window.SpotifyPlayer.player.setVolume(currentVolume).catch(() => {});
        }
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

/**
 * Set the normal (non-ducked) volume
 */
function setMusicVolume(volume) {
    // Clamp between 0 and 1
    volume = Math.max(0, Math.min(1, volume));
    window.SpotifyPlayer.normalVolume = volume;
    
    // If not ducked, apply immediately
    if (!window.SpotifyPlayer.isDucked && window.SpotifyPlayer.player) {
        smoothVolumeChange(volume, 300);
    }
    
    console.log('🎵 Music volume set to', Math.round(volume * 100) + '%');
}

/**
 * Quick pause for "stop" / "pause" commands
 */
async function quickPause() {
    if (!window.SpotifyPlayer.player) return;
    
    try {
        // Fade out quickly then pause
        smoothVolumeChange(0, 200);
        setTimeout(async () => {
            await window.SpotifyPlayer.player.pause();
            window.SpotifyPlayer.isPlaying = false;
            hideSpotifyStatus();
            console.log('🎵 Music paused');
        }, 250);
    } catch (e) {
        console.log('Pause error:', e);
    }
}

/**
 * Resume playback
 */
async function resumeMusic() {
    if (!window.SpotifyPlayer.player) return;
    
    try {
        await window.SpotifyPlayer.player.resume();
        smoothVolumeChange(window.SpotifyPlayer.normalVolume, 500);
        console.log('🎵 Music resumed');
    } catch (e) {
        console.log('Resume error:', e);
    }
}

/**
 * Play a track on the web player
 */
async function playOnWebPlayer(spotifyUri) {
    if (!window.SpotifyPlayer.isReady || !window.SpotifyPlayer.deviceId) {
        console.error('🎵 Web player not ready');
        return false;
    }
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${window.SpotifyPlayer.deviceId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${window.SpotifyPlayer.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uris: [spotifyUri],
            }),
        });
        
        if (response.ok || response.status === 204) {
            console.log('🎵 Playing on web player!');
            return true;
        } else {
            console.error('🎵 Play failed:', response.status);
            return false;
        }
    } catch (error) {
        console.error('🎵 Play error:', error);
        return false;
    }
}

// Export for use in other scripts
window.initializeSpotifyPlayer = initializeSpotifyPlayer;
window.playOnWebPlayer = playOnWebPlayer;
window.stopSpotifyPlayback = stopSpotifyPlayback;
window.hideSpotifyStatus = hideSpotifyStatus;

// Auto-ducking controls
window.duckMusic = duckMusic;
window.unduckMusic = unduckMusic;
window.setMusicVolume = setMusicVolume;
window.quickPause = quickPause;
window.resumeMusic = resumeMusic;

// Auto-initialize when page loads (after a short delay)
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for SDK to be ready, then check if we should init
    setTimeout(() => {
        if (typeof Spotify !== 'undefined') {
            console.log('🎵 Spotify SDK detected, will initialize when connected');
        }
    }, 1000);
});

