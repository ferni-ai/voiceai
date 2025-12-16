import XCTest
import Combine
@testable import FerniVoice

// MARK: - Voice Session Manager Tests

@MainActor
final class VoiceSessionTests: XCTestCase {
    
    var voiceManager: VoiceSessionManager!
    var cancellables: Set<AnyCancellable>!
    
    override func setUp() async throws {
        voiceManager = VoiceSessionManager()
        cancellables = Set<AnyCancellable>()
    }
    
    override func tearDown() async throws {
        voiceManager.stop()
        voiceManager = nil
        cancellables = nil
    }
    
    // MARK: - Initial State Tests
    
    func testInitialState() {
        XCTAssertEqual(voiceManager.state, .disconnected)
        XCTAssertEqual(voiceManager.currentPersonaId, "ferni")
        XCTAssertEqual(voiceManager.currentPersona.name, "Ferni")
    }
    
    func testInitialAudioLevels() {
        XCTAssertEqual(voiceManager.audioLevels.count, 8)
        XCTAssertTrue(voiceManager.audioLevels.allSatisfy { $0 >= 0 && $0 <= 1 })
    }
    
    func testInitialTranscriptions() {
        XCTAssertTrue(voiceManager.transcriptions.isEmpty)
    }
    
    // MARK: - Persona Switching Tests
    
    func testSwitchPersona() {
        voiceManager.switchPersona("maya")
        XCTAssertEqual(voiceManager.currentPersonaId, "maya")
        XCTAssertEqual(voiceManager.currentPersona.name, "Maya")
    }
    
    func testSwitchToSamePersona() {
        voiceManager.switchPersona("ferni")
        XCTAssertEqual(voiceManager.currentPersonaId, "ferni")
    }
    
    func testCurrentPersonaComputed() {
        voiceManager.currentPersonaId = "peter"
        XCTAssertEqual(voiceManager.currentPersona.id, "peter")
        XCTAssertEqual(voiceManager.currentPersona.name, "Peter")
    }
    
    // MARK: - Cloud Mode Tests
    
    func testCloudModeToggle() {
        let initial = voiceManager.useCloudMode
        voiceManager.useCloudMode.toggle()
        XCTAssertNotEqual(voiceManager.useCloudMode, initial)
        
        // Reset
        voiceManager.useCloudMode = initial
    }
    
    func testTokenServerUrl() {
        voiceManager.useCloudMode = true
        XCTAssertEqual(voiceManager.tokenServer, "https://app.ferni.ai")
        
        voiceManager.useCloudMode = false
        XCTAssertEqual(voiceManager.tokenServer, "http://localhost:3001")
    }
    
    // MARK: - State Observation Tests
    
    func testStatePublishes() {
        let expectation = XCTestExpectation(description: "State should publish")
        
        voiceManager.$state
            .dropFirst() // Skip initial value
            .sink { state in
                expectation.fulfill()
            }
            .store(in: &cancellables)
        
        // This will trigger a state change
        voiceManager.start()
        
        wait(for: [expectation], timeout: 1.0)
        voiceManager.stop()
    }
    
    // MARK: - Toggle Tests
    
    func testToggleFromDisconnected() {
        XCTAssertEqual(voiceManager.state, .disconnected)
        voiceManager.toggle()
        // Should transition to connecting
        XCTAssertEqual(voiceManager.state, .connecting)
        voiceManager.stop()
    }
    
    func testToggleFromConnecting() {
        voiceManager.start()
        XCTAssertEqual(voiceManager.state, .connecting)
        voiceManager.toggle()
        // Should stop
        XCTAssertEqual(voiceManager.state, .disconnected)
    }
}

// MARK: - Transcription Entry Tests

final class TranscriptionEntryTests: XCTestCase {
    
    func testEntryCreation() {
        let entry = TranscriptionEntry(
            speaker: "Ferni",
            text: "Hello!",
            isAgent: true,
            timestamp: Date()
        )
        
        XCTAssertEqual(entry.speaker, "Ferni")
        XCTAssertEqual(entry.text, "Hello!")
        XCTAssertTrue(entry.isAgent)
        XCTAssertNotNil(entry.id)
    }
    
    func testUniqueIds() {
        let entry1 = TranscriptionEntry(speaker: "You", text: "Hi", isAgent: false, timestamp: Date())
        let entry2 = TranscriptionEntry(speaker: "You", text: "Hi", isAgent: false, timestamp: Date())
        XCTAssertNotEqual(entry1.id, entry2.id)
    }
}

