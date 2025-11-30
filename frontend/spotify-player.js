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
        console.error('🎵 Spotify account error (Premium required?):', message);
        showSpotifyStatus('Spotify Premium required', 'error');
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
 * Show Spotify status in the UI
 */
function showSpotifyStatus(message, status) {
    // Find or create status element
    let statusEl = document.getElementById('spotify-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'spotify-status';
        statusEl.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            z-index: 1000;
            transition: all 0.3s ease;
            backdrop-filter: blur(10px);
        `;
        document.body.appendChild(statusEl);
    }
    
    // Style based on status
    const colors = {
        ready: { bg: 'rgba(30, 215, 96, 0.2)', color: '#1ed760', border: '1px solid rgba(30, 215, 96, 0.3)' },
        playing: { bg: 'rgba(30, 215, 96, 0.3)', color: '#1ed760', border: '1px solid rgba(30, 215, 96, 0.5)' },
        error: { bg: 'rgba(255, 100, 100, 0.2)', color: '#ff6464', border: '1px solid rgba(255, 100, 100, 0.3)' },
        offline: { bg: 'rgba(150, 150, 150, 0.2)', color: '#999', border: '1px solid rgba(150, 150, 150, 0.3)' },
    };
    
    const style = colors[status] || colors.offline;
    statusEl.style.backgroundColor = style.bg;
    statusEl.style.color = style.color;
    statusEl.style.border = style.border;
    statusEl.textContent = message;
    
    // Auto-hide after delay (except for 'playing')
    if (status !== 'playing') {
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => statusEl.remove(), 300);
        }, 3000);
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

// Auto-initialize when page loads (after a short delay)
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit for SDK to be ready, then check if we should init
    setTimeout(() => {
        if (typeof Spotify !== 'undefined') {
            console.log('🎵 Spotify SDK detected, will initialize when connected');
        }
    }, 1000);
});

