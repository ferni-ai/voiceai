import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useTracks,
  useRoomContext,
} from '@livekit/components-react';
import {
  ConnectionState,
  Track,
  RoomEvent,
  RemoteTrack,
  RemoteParticipant,
  LocalParticipant,
  Room,
  RoomOptions,
  Participant,
} from 'livekit-client';
import { JackOrb } from './components/JackOrb';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8081';

interface TokenResponse {
  token: string;
  url: string;
  room?: string;
  username?: string;
}

// Device ID for cross-session memory
function getDeviceId(): string {
  const DEVICE_ID_KEY = 'jack_bogle_device_id';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = 'web:' + crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    console.log('🆕 New device ID:', deviceId);
  } else {
    console.log('🔑 Returning device ID:', deviceId);
  }

  return deviceId;
}

// Store/retrieve user name
function getStoredName(): string {
  return localStorage.getItem('jack_bogle_user_name') || '';
}

function setStoredName(name: string): void {
  if (name && name.trim()) {
    localStorage.setItem('jack_bogle_user_name', name.trim());
  }
}

// Check if returning user
function isReturningUser(): boolean {
  return localStorage.getItem('jack_bogle_has_talked') === 'true';
}

// Device tier detection for performance
function getDeviceTier(): 'high' | 'medium' | 'low' {
  const concurrency = navigator.hardwareConcurrency || 4;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    return concurrency >= 8 ? 'medium' : 'low';
  }

  return concurrency >= 8 ? 'high' : 'medium';
}

// Main room component
const JackRoom: React.FC = () => {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const localParticipant = useLocalParticipant();
  const [transcription, setTranscription] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [statusText, setStatusText] = useState('Tap to connect');
  const [particleCount, setParticleCount] = useState(10000);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const connectSoundRef = useRef<HTMLAudioElement | null>(null);
  const disconnectSoundRef = useRef<HTMLAudioElement | null>(null);

  // Set particle count based on device tier
  useEffect(() => {
    const tier = getDeviceTier();
    switch (tier) {
      case 'high':
        setParticleCount(15000);
        break;
      case 'medium':
        setParticleCount(8000);
        break;
      case 'low':
        setParticleCount(3000);
        break;
    }
    console.log(`🚀 Device tier: ${tier}, Particles: ${particleCount}`);
  }, []);

  const isConnected = connectionState === ConnectionState.Connected;

  // Initialize sound effects
  useEffect(() => {
    connectSoundRef.current = new Audio('/connect.mp3');
    disconnectSoundRef.current = new Audio('/disconnect.mp3');

    return () => {
      connectSoundRef.current = null;
      disconnectSoundRef.current = null;
    };
  }, []);

  // Enable microphone when connected
  useEffect(() => {
    const enableMic = async () => {
      if (isConnected && localParticipant.localParticipant) {
        try {
          // Play connect sound
          connectSoundRef.current?.play().catch(() => { });

          await localParticipant.localParticipant.setMicrophoneEnabled(true);
          console.log('🎤 Microphone enabled');
          setStatusText('Ready');

          // Mark user as having talked to Jack
          localStorage.setItem('jack_bogle_has_talked', 'true');
        } catch (err) {
          console.error('Failed to enable microphone:', err);
          setStatusText('Please allow microphone access');
        }
      }
    };

    if (isConnected) {
      enableMic();
    }
  }, [isConnected, localParticipant]);

  // Prevent double-tap zoom
  useEffect(() => {
    let lastTap = 0;
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.preventDefault();
      }
      lastTap = now;
    };
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
    return () => document.removeEventListener('touchend', handleTouchEnd);
  }, []);

  // Handle room events
  useEffect(() => {
    if (!room) return;

    const handleTrackSubscribed = (
      track: RemoteTrack,
      publication: any,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log('🔊 Audio track from:', participant.identity);

        // Attach audio element
        const element = track.attach();
        element.setAttribute('autoplay', 'true');
        element.setAttribute('playsinline', 'true');
        element.volume = 1.0;

        // Store reference
        if (track.sid) {
          audioElementsRef.current.set(track.sid, element);
        }

        // Add to DOM
        document.body.appendChild(element);

        // Try to play with fallback for iOS/mobile
        element.play().then(() => {
          console.log('✅ Audio playing');
        }).catch((err) => {
          console.warn('Audio autoplay blocked:', err);
          // iOS/mobile may need user gesture - wait for tap
          const resume = () => {
            element.play().catch(() => { });
            document.removeEventListener('touchstart', resume);
            document.removeEventListener('click', resume);
          };
          document.addEventListener('touchstart', resume, { once: true });
          document.addEventListener('click', resume, { once: true });
        });
      }
    };

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      publication: any,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio && track.sid) {
        const element = audioElementsRef.current.get(track.sid);
        if (element) {
          track.detach(element);
          element.remove();
          audioElementsRef.current.delete(track.sid);
        }
      }
    };

    const handleActiveSpeakersChanged = (speakers: Participant[]) => {
      const agentSpeaking = speakers.some(s => s.identity !== localParticipant.localParticipant?.identity);
      const userSpeaking = speakers.some(s => s.identity === localParticipant.localParticipant?.identity);

      setIsSpeaking(agentSpeaking);
      setIsListening(!agentSpeaking);

      if (agentSpeaking) {
        setStatusText('Advisor is speaking...');
      } else if (userSpeaking) {
        setStatusText('Listening...');
      } else {
        setStatusText('Ready');
      }
    };

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      if (!participant.isLocal) {
        setStatusText('Advisor joined');
        setTimeout(() => setStatusText('Ready'), 1500);
      }
    };

    const handleDataReceived = (payload: Uint8Array, participant: any) => {
      // Handle transcriptions or other data
      try {
        const message = new TextDecoder().decode(payload);
        const data = JSON.parse(message);

        if (data.type === 'transcription') {
          setTranscription(data.text);
          // Clear transcription after a few seconds
          setTimeout(() => setTranscription(''), 5000);
        }
      } catch (err) {
        console.error('Failed to parse data:', err);
      }
    };

    const handleDisconnected = () => {
      console.log('📴 Disconnected from room');
      setStatusText('Disconnected');
      setIsListening(false);
      setIsSpeaking(false);

      // Play disconnect sound
      disconnectSoundRef.current?.play().catch(() => { });

      // Clean up audio elements
      audioElementsRef.current.forEach((element) => {
        element.remove();
      });
      audioElementsRef.current.clear();
    };

    // Add event listeners
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.DataReceived, handleDataReceived);
    room.on(RoomEvent.Disconnected, handleDisconnected);

    // Cleanup
    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      room.off(RoomEvent.Disconnected, handleDisconnected);
    };
  }, [room, localParticipant]);

  // Audio level monitoring
  useEffect(() => {
    if (!localParticipant.localParticipant) return;

    const interval = setInterval(() => {
      // Use getTrackPublication to get the track
      const publication = localParticipant.localParticipant?.getTrackPublication(Track.Source.Microphone);
      const audioTrack = publication?.track;

      if (audioTrack && 'getVolume' in audioTrack) {
        const level = (audioTrack as any).getVolume?.() || 0;
        setAudioLevel(level);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [localParticipant]);

  const handleOrbClick = useCallback(() => {
    // Could trigger push-to-talk or other interactions
    console.log('Orb clicked');

    // Try to resume audio if blocked
    audioElementsRef.current.forEach((element) => {
      element.play().catch(() => { });
    });
  }, []);

  return (
    <div className="jack-room">
      {/* Background gradient */}
      <div className="background-gradient" />

      {/* Main content */}
      <div className="content-container">
        {/* Title */}
        <motion.div
          className="title-container"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <h1 className="title">Vanguard</h1>
          <p className="subtitle">Personal Advisor Services</p>
          {isReturningUser() && getStoredName() && (
            <p className="welcome-back">Welcome back, {getStoredName()}</p>
          )}
        </motion.div>

        {/* Orb container */}
        <motion.div
          className="orb-wrapper"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
        >
          <JackOrb
            isListening={isListening}
            isSpeaking={isSpeaking}
            audioLevel={audioLevel}
            onClick={handleOrbClick}
            particleCount={particleCount}
          />

          {/* Status indicator */}
          <motion.div
            className="status-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <span className={`status-text ${isSpeaking ? 'speaking' : isListening ? 'listening' : isConnected ? 'ready' : 'connecting'}`}>
              {statusText}
            </span>
          </motion.div>
        </motion.div>

        {/* Transcription display */}
        <AnimatePresence>
          {transcription && (
            <motion.div
              className="transcription"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <p>{transcription}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <motion.div
          className="controls"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <button
            className="control-btn mute"
            onClick={async () => {
              if (localParticipant.localParticipant) {
                const enabled = localParticipant.isMicrophoneEnabled;
                await localParticipant.localParticipant.setMicrophoneEnabled(!enabled);
              }
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M19 11C19 7.13401 15.866 4 12 4C8.13401 4 5 7.13401 5 11V15C5 18.866 8.13401 22 12 22C15.866 22 19 18.866 19 15V11Z" stroke="currentColor" strokeWidth="2" />
              <path d="M12 4V1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          <button className="control-btn settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M12 1V6M12 18V23M23 12H18M6 12H1M20.5 5.5L16.5 9.5M7.5 14.5L3.5 18.5M20.5 18.5L16.5 14.5M7.5 9.5L3.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </motion.div>

        {/* Vanguard branding */}
        <motion.div
          className="branding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <p className="brand-text">Powered by Vanguard Wisdom</p>
        </motion.div>
      </div>
    </div>
  );
};

// Main app component
function App() {
  const [token, setToken] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Get device ID and user info
  const deviceId = getDeviceId();
  const storedName = getStoredName();

  // Fetch connection token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        // Generate room name with timestamp
        const roomName = `voice-${Date.now()}`;
        const username = storedName || `user_${Date.now()}`;

        // Include device ID for cross-session memory
        const params = new URLSearchParams({
          room: roomName,
          username: username,
          device_id: deviceId,
        });

        const response = await fetch(`${API_URL}/token?${params}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch token: ${response.statusText}`);
        }

        const data: TokenResponse = await response.json();
        setToken(data.token);
        setUrl(data.url);
      } catch (err) {
        console.error('Error fetching token:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [deviceId, storedName]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p className="loading-text">Initializing Advisor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!token || !url) {
    return (
      <div className="error-container">
        <h2>Configuration Error</h2>
        <p>Missing connection details</p>
      </div>
    );
  }

  // Room options
  const roomOptions: RoomOptions = {
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      audioPreset: {
        maxBitrate: 32000,
      },
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      audio={true}
      video={false}
      connect={true}
      options={roomOptions}
    >
      <JackRoom />
    </LiveKitRoom>
  );
}

export default App;