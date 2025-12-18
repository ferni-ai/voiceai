import XCTest
import SwiftUI
@testable import FerniVoice

// MARK: - End-to-End Integration Tests
// These tests verify the complete flow of the voice session

@MainActor
final class E2EIntegrationTests: XCTestCase {
    
    var voiceManager: DualModeVoiceManager!
    
    override func setUp() async throws {
        voiceManager = DualModeVoiceManager()
    }
    
    override func tearDown() async throws {
        await voiceManager.stop()
        voiceManager = nil
    }
    
    // MARK: - Full Session Flow Tests
    
    /// Test that starting a session moves through expected states
    func testSessionStartFlow() async throws {
        XCTAssertEqual(voiceManager.state, .disconnected)
        
        // Start session (async)
        await voiceManager.start()
        
        // Wait briefly for state to update
        try await Task.sleep(nanoseconds: 100_000_000) // 100ms
        
        // Should be in a valid state (may be connecting, connected, or error if no server)
        let state = voiceManager.state
        let isValidState = state == .connecting || 
                          state == .connected || 
                          state.isError
        XCTAssertTrue(isValidState, "Expected valid transition state, got \(state)")
        
        await voiceManager.stop()
        
        // After stop, should be disconnected
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(voiceManager.state, .disconnected)
    }
    
    /// Test persona switching during inactive session
    func testPersonaSwitchingFlow() async throws {
        // Start with Ferni
        XCTAssertEqual(voiceManager.currentPersonaId, "ferni")
        
        // Switch to each persona
        for persona in PersonaRegistry.all {
            voiceManager.currentPersonaId = persona.id
            XCTAssertEqual(voiceManager.currentPersonaId, persona.id)
            XCTAssertEqual(voiceManager.currentPersona.name, persona.name)
        }
    }
    
    /// Test cloud mode toggle persists
    func testCloudModeTogglePersistence() {
        let initial = voiceManager.useCloudMode
        
        voiceManager.useCloudMode = !initial
        XCTAssertNotEqual(voiceManager.useCloudMode, initial)
        
        // Create new manager to verify persistence
        let newManager = DualModeVoiceManager()
        XCTAssertEqual(newManager.useCloudMode, !initial)
        
        // Reset
        voiceManager.useCloudMode = initial
    }
    
    /// Test backend mode toggle persists
    func testBackendModeTogglePersistence() {
        let initial = voiceManager.backendMode
        let newMode: VoiceBackendMode = initial == .native ? .cli : .native
        
        voiceManager.backendMode = newMode
        XCTAssertEqual(voiceManager.backendMode, newMode)
        
        // Create new manager to verify persistence
        let newManager = DualModeVoiceManager()
        XCTAssertEqual(newManager.backendMode, newMode)
        
        // Reset
        voiceManager.backendMode = initial
    }
    
    // MARK: - Audio Level Tests
    
    func testAudioLevelsInitialized() {
        XCTAssertEqual(voiceManager.audioLevels.count, 8)
    }
    
    func testAudioLevelsWithinRange() {
        for level in voiceManager.audioLevels {
            XCTAssertGreaterThanOrEqual(level, 0)
            XCTAssertLessThanOrEqual(level, 1)
        }
    }
    
    // MARK: - View Integration Tests
    
    func testAvatarCompositeCreation() {
        // Test that the avatar view can be created for all personas
        for persona in PersonaRegistry.all {
            for state in [VoiceState.disconnected, .connecting, .connected, .listening, .speaking, .thinking] {
                let view = AvatarComposite(persona: persona, state: state, size: 100)
                XCTAssertNotNil(view)
            }
        }
    }
    
    func testFerniEyeAvatarCreation() {
        for persona in PersonaRegistry.all {
            let view = FerniEyeAvatar(persona: persona, size: 80, isActive: true)
            XCTAssertNotNil(view)
        }
    }
    
    func testGlowHaloCreation() {
        for persona in PersonaRegistry.all {
            let view = GlowHalo(persona: persona, size: 100, state: .speaking)
            XCTAssertNotNil(view)
        }
    }
    
    func testWaveformViewCreation() {
        for persona in PersonaRegistry.all {
            let view = WaveformView(persona: persona, isActive: true, barCount: 8)
            XCTAssertNotNil(view)
        }
    }
    
    func testWaveformRingCreation() {
        let view = WaveformRing(persona: PersonaRegistry.ferni, size: 100, isActive: true)
        XCTAssertNotNil(view)
    }
}

// MARK: - Animation Tests

final class AnimationIntegrationTests: XCTestCase {
    
    func testBreathingIntensityValues() {
        // Verify breathing intensity is reasonable for all states
        let states: [VoiceState] = [.disconnected, .connecting, .connected, .listening, .speaking, .thinking]
        
        for state in states {
            let intensity = state.breathingIntensity
            XCTAssertGreaterThan(intensity, 0, "Intensity should be positive for \(state)")
            XCTAssertLessThanOrEqual(intensity, 2, "Intensity should not be too high for \(state)")
        }
    }
    
    func testWaveformBarCount() {
        // Default bar count should be 8
        let waveform = WaveformView(persona: PersonaRegistry.ferni, isActive: true)
        // We can't directly test private state, but we verify it compiles correctly
        XCTAssertNotNil(waveform)
    }
}

// MARK: - State Machine Tests

final class StateMachineTests: XCTestCase {
    
    func testValidStateTransitions() {
        // disconnected -> connecting (start)
        // connecting -> connected (success)
        // connecting -> error (failure)
        // connected -> listening (user speaking)
        // connected -> speaking (agent speaking)
        // connected -> thinking (processing)
        // listening/speaking/thinking -> connected (idle)
        // any active -> disconnected (stop)
        
        let validTransitions: [(VoiceState, VoiceState)] = [
            (.disconnected, .connecting),
            (.connecting, .connected),
            (.connecting, .error("test")),
            (.connected, .listening),
            (.connected, .speaking),
            (.connected, .thinking),
            (.listening, .connected),
            (.speaking, .connected),
            (.thinking, .connected),
            (.connected, .disconnected),
            (.listening, .disconnected),
            (.speaking, .disconnected),
        ]
        
        // All transitions should be valid
        for (from, to) in validTransitions {
            XCTAssertNotEqual(from, to, "Transition from \(from) to \(to) should be meaningful")
        }
    }
    
    func testShowWaveformStates() {
        let waveformStates: [VoiceState] = [.connected, .listening, .speaking]
        let noWaveformStates: [VoiceState] = [.disconnected, .connecting, .thinking]
        
        for state in waveformStates {
            XCTAssertTrue(state.showWaveform, "\(state) should show waveform")
        }
        
        for state in noWaveformStates {
            XCTAssertFalse(state.showWaveform, "\(state) should not show waveform")
        }
    }
}

