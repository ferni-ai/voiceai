/**
 * Jack Bogle Voice AI - Frontend
 * Professional UI with Uber/Delta/Google-style animations
 */

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const app = document.getElementById('app');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const messageText = document.getElementById('messageText');
    const helper = document.getElementById('helper');
    const connectSound = document.getElementById('connectSound');
    const disconnectSound = document.getElementById('disconnectSound');

    // State
    let room = null;
    let isConnecting = false;

    // Config
    const TOKEN_SERVER_URL = '/token';
    
    // ============================================================================
    // USER IDENTIFICATION - Jack remembers you across sessions!
    // ============================================================================
    
    /**
     * Get or create persistent device ID
     * This allows Jack to remember you even without login
     */
    function getDeviceId() {
        const DEVICE_ID_KEY = 'jack_bogle_device_id';
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        
        if (!deviceId) {
            // Generate a unique device ID
            deviceId = 'web:' + crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
            console.log('🆕 New device ID:', deviceId);
        } else {
            console.log('🔑 Returning device ID:', deviceId);
        }
        
        return deviceId;
    }
    
    /**
     * Get stored user name (if they told Jack before)
     */
    function getStoredName() {
        return localStorage.getItem('jack_bogle_user_name') || '';
    }
    
    /**
     * Store user name when Jack learns it
     */
    function setStoredName(name) {
        if (name && name.trim()) {
            localStorage.setItem('jack_bogle_user_name', name.trim());
        }
    }
    
    // Get device ID early
    const deviceId = getDeviceId();
    const storedName = getStoredName();
    
    // Check if this is a returning user
    const isReturning = localStorage.getItem('jack_bogle_has_talked') === 'true';
    if (isReturning && storedName) {
        console.log(`👋 Welcome back, ${storedName}!`);
    }

    // Jack Bogle quotes
    const quotes = [
        '"Stay the course."',
        '"Time is your friend; impulse is your enemy."',
        '"Don\'t look for the needle. Buy the haystack."',
        '"In investing, you get what you don\'t pay for."',
        '"The stock market is a giant distraction."',
        '"If you have trouble imagining a 20% loss, you shouldn\'t be in stocks."',
        '"The greatest enemy of a good plan is the dream of a perfect plan."',
        '"Owning the market remains the strategy of choice."',
    ];

    let quoteIndex = 0;

    // Quote rotation (when disconnected)
    setInterval(() => {
        if (!room || room.state !== 'connected') {
            quoteIndex = (quoteIndex + 1) % quotes.length;
            showMessage(quotes[quoteIndex], 'quote');
        }
    }, 7000);

    // Show message with animation
    function showMessage(text, type = 'normal') {
        messageText.classList.remove('visible');
        
        setTimeout(() => {
            messageText.textContent = text;
            messageText.className = 'message-text' + (type === 'quote' ? ' quote' : '');
            messageText.classList.add('visible');
        }, 250);
    }

    // Set app state
    function setState(state) {
        // Remove all state classes
        app.classList.remove('connected', 'connecting', 'listening', 'speaking');
        
        // Add new state
        if (state) {
            state.split(' ').forEach(s => app.classList.add(s));
        }
    }

    // Update UI for connection state
    function setConnected(connected) {
        if (connected) {
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'flex';
            helper.textContent = 'Connected';
            setState('connected listening');
            showMessage('Listening...');
        } else {
            connectBtn.style.display = 'flex';
            disconnectBtn.style.display = 'none';
            helper.textContent = 'Tap to talk with Jack';
            setState('');
            showMessage(quotes[quoteIndex], 'quote');
        }
    }

    // Connect to room
    async function connect() {
        if (isConnecting || (room && room.state === 'connected')) {
            return;
        }

        isConnecting = true;
        connectBtn.disabled = true;
        setState('connecting');
        showMessage('Connecting...');
        helper.textContent = 'Connecting...';

        // Play sound (also unlocks audio on iOS via user gesture)
        try {
            connectSound.currentTime = 0;
            await connectSound.play();
        } catch (e) {
            // Sound failed, try to unlock audio context for iOS
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === 'suspended') await ctx.resume();
            } catch (e2) {}
        }

        try {
            // Get token - include device ID for cross-session memory!
            const roomName = `voice-${Date.now()}`;
            const userName = storedName || 'User';
            const params = new URLSearchParams({
                room: roomName,
                username: userName,
                device_id: deviceId,
            });
            const res = await fetch(`${TOKEN_SERVER_URL}?${params}`);
            const data = await res.json();

            // Create room
            room = new LiveKit.Room({
                adaptiveStream: true,
                dynacast: true,
                audioCaptureDefaults: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            // Connect
            await room.connect(data.url, data.token);
            console.log('✅ Connected:', room.name);

            // Event handlers (register BEFORE enabling mic)
            room
                .on(LiveKit.RoomEvent.TrackSubscribed, onTrackSubscribed)
                .on(LiveKit.RoomEvent.ActiveSpeakersChanged, onSpeakersChanged)
                .on(LiveKit.RoomEvent.Disconnected, onDisconnected)
                .on(LiveKit.RoomEvent.ParticipantConnected, (p) => {
                    if (!p.isLocal) {
                        showMessage('Jack joined');
                        setTimeout(() => showMessage('Listening...'), 1500);
                    }
                });

            // Update UI (before mic, so we stay connected even if mic fails)
            setConnected(true);
            
            // Mark that user has talked to Jack (for returning user detection)
            localStorage.setItem('jack_bogle_has_talked', 'true');

            // Enable mic (with graceful error handling)
            try {
                await room.localParticipant.setMicrophoneEnabled(true);
                console.log('🎤 Mic enabled');
            } catch (micErr) {
                console.warn('⚠️ Mic permission denied:', micErr.message);
                showMessage('Allow mic to speak');
                helper.textContent = 'Mic access needed';
                // Still stay connected - user can hear Jack even without mic
            }

        } catch (err) {
            console.error('❌ Connection failed:', err);
            showMessage('Connection failed');
            helper.textContent = 'Tap to retry';
            setState('');
            if (room) room.disconnect();
            room = null;
            setTimeout(() => setConnected(false), 2000);
        } finally {
            isConnecting = false;
            connectBtn.disabled = false;
        }
    }

    // Handle audio track - SIMPLE version that works on desktop AND mobile
    function onTrackSubscribed(track, publication, participant) {
        if (track.kind === LiveKit.Track.Kind.Audio) {
            console.log('🔊 Audio from:', participant.identity);
            
            const el = track.attach();
            el.setAttribute('playsinline', '');
            el.setAttribute('autoplay', '');
            el.volume = 1.0;
            document.body.appendChild(el);

            // Try to play immediately (works on desktop)
            el.play().then(() => {
                console.log('✅ Audio playing');
            }).catch((err) => {
                // iOS/mobile may need user gesture - wait for tap
                console.log('⚠️ Audio blocked, waiting for tap:', err.message);
                const resume = () => {
                    el.play().catch(() => {});
                    document.removeEventListener('touchstart', resume);
                    document.removeEventListener('click', resume);
                };
                document.addEventListener('touchstart', resume, { once: true });
                document.addEventListener('click', resume, { once: true });
            });
        }
    }

    // Handle speaker changes
    function onSpeakersChanged(speakers) {
        const agentSpeaking = speakers.some(s => !s.isLocal);
        const userSpeaking = speakers.some(s => s.isLocal);

        if (agentSpeaking) {
            setState('connected speaking');
            showMessage('Jack is speaking...');
        } else if (userSpeaking) {
            setState('connected listening');
            showMessage('Listening to you...');
        } else {
            setState('connected listening');
            showMessage('Listening...');
        }
    }

    // Handle disconnect
    function onDisconnected() {
        console.log('📴 Disconnected');
        
        try {
            disconnectSound.currentTime = 0;
            disconnectSound.play();
        } catch (e) {}

        room = null;
        setConnected(false);
    }

    // Disconnect
    function disconnect() {
        if (room) {
            room.disconnect();
        }
    }

    // Event listeners
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);

    // Prevent double-tap zoom
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) e.preventDefault();
        lastTap = now;
    }, { passive: false });

    console.log('🎯 Jack Bogle UI ready');
});

