import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock LiveKit components
vi.mock('@livekit/components-react', () => ({
    LiveKitRoom: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useConnectionState: () => 'connected',
    useLocalParticipant: () => ({ localParticipant: { setMicrophoneEnabled: vi.fn() } }),
    useTracks: () => [],
    useRoomContext: () => ({
        on: vi.fn(),
        off: vi.fn(),
        state: 'connected',
    }),
}));

// Mock JackOrb to avoid Three.js rendering in tests
vi.mock('./components/JackOrb', () => ({
    JackOrb: () => <div data-testid="jack-orb">Jack Orb</div>,
}));

describe('App', () => {
    it('renders loading state initially', () => {
        render(<App />);
        expect(screen.getByText(/Initializing Advisor/i)).toBeInTheDocument();
    });
});
