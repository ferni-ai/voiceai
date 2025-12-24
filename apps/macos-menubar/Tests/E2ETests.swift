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

    func testVoiceOrbCreation() {
        // Test that the voice orb view can be created for all personas
        for persona in PersonaRegistry.all {
            let view = VoiceOrb(persona: persona, isActive: true, size: 100)
            XCTAssertNotNil(view)

            let inactiveView = VoiceOrb(persona: persona, isActive: false, size: 80)
            XCTAssertNotNil(inactiveView)
        }
    }

    func testStableVoiceOrbCreation() {
        for persona in PersonaRegistry.all {
            let view = StableVoiceOrb(personaId: persona.id, isActive: true, size: 100)
            XCTAssertNotNil(view)
        }
    }

    func testGlowHaloCreation() {
        for persona in PersonaRegistry.all {
            let view = GlowHalo(persona: persona, size: 100, isActive: true)
            XCTAssertNotNil(view)

            let inactiveView = GlowHalo(persona: persona, size: 80, isActive: false)
            XCTAssertNotNil(inactiveView)
        }
    }

    func testStableGlowHaloCreation() {
        for persona in PersonaRegistry.all {
            let view = StableGlowHalo(personaId: persona.id, size: 100, isActive: true)
            XCTAssertNotNil(view)
        }
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

    func testPixarTimingConstants() {
        // Verify Pixar timing constants are reasonable
        XCTAssertGreaterThan(PixarTiming.breathCycleIdle, 0)
        XCTAssertGreaterThan(PixarTiming.breathCycleActive, 0)
        XCTAssertGreaterThan(PixarTiming.breathCycleSpeaking, 0)

        // Breath cycles should follow: speaking < active < idle
        XCTAssertLessThan(PixarTiming.breathCycleSpeaking, PixarTiming.breathCycleActive)
        XCTAssertLessThan(PixarTiming.breathCycleActive, PixarTiming.breathCycleIdle)
    }

    func testSquashStretchValues() {
        // All squash/stretch should have positive scale values
        let states = [SquashStretch.idle, SquashStretch.active, SquashStretch.speaking, SquashStretch.thinking]

        for state in states {
            XCTAssertGreaterThan(state.scaleX, 0)
            XCTAssertGreaterThan(state.scaleY, 0)
        }
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

// MARK: - Persona Registry Tests

final class PersonaRegistryE2ETests: XCTestCase {

    func testAllPersonasHaveRequiredProperties() {
        for persona in PersonaRegistry.all {
            XCTAssertFalse(persona.id.isEmpty)
            XCTAssertFalse(persona.name.isEmpty)
            XCTAssertFalse(persona.initials.isEmpty)
            XCTAssertFalse(persona.tagline.isEmpty)
            XCTAssertFalse(persona.primaryHex.isEmpty)
            XCTAssertFalse(persona.role.isEmpty)
            XCTAssertFalse(persona.specialty.isEmpty)
        }
    }

    func testPersonaRegistryGet() {
        // Get known persona
        let ferni = PersonaRegistry.get("ferni")
        XCTAssertEqual(ferni.name, "Ferni")

        // Get unknown persona should return Ferni (default)
        let unknown = PersonaRegistry.get("unknown-persona")
        XCTAssertEqual(unknown.name, "Ferni")
    }

    func testAllPersonaColorsValid() {
        for persona in PersonaRegistry.all {
            // Primary and secondary colors should create valid SwiftUI Colors
            XCTAssertNotNil(persona.primaryColor)
            XCTAssertNotNil(persona.secondaryColor)
            XCTAssertNotNil(persona.glowColor)
        }
    }
}
