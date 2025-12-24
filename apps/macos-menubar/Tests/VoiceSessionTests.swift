import XCTest
@testable import FerniVoice

// MARK: - TranscriptionEntry Tests

final class TranscriptionEntryTests: XCTestCase {

    func testTranscriptionEntryCreation() {
        let entry = TranscriptionEntry(
            speaker: "Ferni",
            text: "Hello, how are you?",
            isAgent: true
        )

        XCTAssertEqual(entry.speaker, "Ferni")
        XCTAssertEqual(entry.text, "Hello, how are you?")
        XCTAssertTrue(entry.isAgent)
        XCTAssertNotNil(entry.id)
        XCTAssertNotNil(entry.timestamp)
    }

    func testTranscriptionEntryUserSpeaker() {
        let entry = TranscriptionEntry(
            speaker: "You",
            text: "I'm doing well",
            isAgent: false
        )

        XCTAssertEqual(entry.speaker, "You")
        XCTAssertFalse(entry.isAgent)
    }

    func testTranscriptionEntryWithCustomTimestamp() {
        let customDate = Date(timeIntervalSince1970: 1000)
        let entry = TranscriptionEntry(
            speaker: "Test",
            text: "Test message",
            isAgent: true,
            timestamp: customDate
        )

        XCTAssertEqual(entry.timestamp, customDate)
    }

    func testTranscriptionEntryEquatable() {
        let entry1 = TranscriptionEntry(speaker: "A", text: "Hello", isAgent: true)
        let entry2 = TranscriptionEntry(speaker: "A", text: "Hello", isAgent: true)

        // Each entry has unique ID, so they should not be equal
        XCTAssertNotEqual(entry1, entry2)
    }

    func testTranscriptionEntryUniqueIds() {
        let entry1 = TranscriptionEntry(speaker: "A", text: "1", isAgent: true)
        let entry2 = TranscriptionEntry(speaker: "A", text: "1", isAgent: true)

        XCTAssertNotEqual(entry1.id, entry2.id)
    }

    func testTranscriptionEntryEmptyText() {
        let entry = TranscriptionEntry(speaker: "", text: "", isAgent: false)
        XCTAssertEqual(entry.speaker, "")
        XCTAssertEqual(entry.text, "")
    }
}

// MARK: - VoiceManager Tests

@MainActor
final class VoiceManagerTests: XCTestCase {

    var sut: VoiceManager!

    override func setUp() async throws {
        try await super.setUp()
        sut = VoiceManager()
    }

    override func tearDown() async throws {
        await sut.stop()
        sut = nil
        try await super.tearDown()
    }

    // MARK: - Initial State Tests

    func testInitialStateIsDisconnected() {
        XCTAssertEqual(sut.state, .disconnected)
    }

    func testInitialPersonaIsFerni() {
        XCTAssertEqual(sut.currentPersonaId, "ferni")
    }

    func testCurrentPersonaReturnsCorrectPersona() {
        let persona = sut.currentPersona
        XCTAssertEqual(persona.id, "ferni")
        XCTAssertEqual(persona.name, "Ferni")
    }

    func testInitialAudioLevelsCount() {
        XCTAssertEqual(sut.audioLevels.count, 8)
    }

    func testInitialAudioLevelsAreValid() {
        for level in sut.audioLevels {
            XCTAssertGreaterThanOrEqual(level, 0)
            XCTAssertLessThanOrEqual(level, 1)
        }
    }

    func testInitialTranscriptionsEmpty() {
        XCTAssertTrue(sut.transcriptions.isEmpty)
    }

    func testInitialConnectionProgressEmpty() {
        XCTAssertEqual(sut.connectionProgress, "")
    }

    func testInitialRetryCountZero() {
        XCTAssertEqual(sut.retryCount, 0)
    }

    func testInitialHandoffNotInProgress() {
        XCTAssertFalse(sut.isHandoffInProgress)
    }

    func testInitialHandoffTargetNil() {
        XCTAssertNil(sut.handoffTargetPersona)
    }

    // MARK: - Token Server Tests

    func testTokenServerCloudMode() {
        sut.useCloudMode = true
        XCTAssertEqual(sut.tokenServer, "https://app.ferni.ai")
    }

    func testTokenServerLocalMode() {
        sut.useCloudMode = false
        XCTAssertEqual(sut.tokenServer, "http://localhost:3001")
    }

    // MARK: - Persona Tests

    func testSetPersonaIdUpdatesCurrentPersona() {
        sut.currentPersonaId = "maya"
        XCTAssertEqual(sut.currentPersonaId, "maya")
        XCTAssertEqual(sut.currentPersona.name, "Maya")
    }

    func testAllPersonasCanBeSet() {
        let personaIds = ["ferni", "maya", "alex", "jordan", "peter", "nayan"]

        for id in personaIds {
            sut.currentPersonaId = id
            XCTAssertEqual(sut.currentPersonaId, id)
            XCTAssertEqual(sut.currentPersona.id, id)
        }
    }
}

// MARK: - DualModeVoiceManager Alias Tests

@MainActor
final class DualModeVoiceManagerAliasTests: XCTestCase {

    func testDualModeVoiceManagerIsVoiceManager() {
        let manager: DualModeVoiceManager = VoiceManager()
        XCTAssertTrue(manager is VoiceManager)
    }

    func testAliasHasSameProperties() {
        let manager = DualModeVoiceManager()
        XCTAssertEqual(manager.state, .disconnected)
        XCTAssertEqual(manager.currentPersonaId, "ferni")
    }
}

// MARK: - NativeLiveKitSession Tests

@MainActor
final class NativeLiveKitSessionTests: XCTestCase {

    func testInitialStateIsDisconnected() {
        let session = NativeLiveKitSession()
        XCTAssertEqual(session.state, .disconnected)
    }

    func testInitialPersonaIsFerni() {
        let session = NativeLiveKitSession()
        XCTAssertEqual(session.currentPersonaId, "ferni")
    }

    func testTokenServerCloudMode() {
        let session = NativeLiveKitSession()
        session.useCloudMode = true
        XCTAssertEqual(session.tokenServer, "https://app.ferni.ai")
    }

    func testTokenServerLocalMode() {
        let session = NativeLiveKitSession()
        session.useCloudMode = false
        XCTAssertEqual(session.tokenServer, "http://localhost:3001")
    }

    func testAudioLevelsCount() {
        let session = NativeLiveKitSession()
        XCTAssertEqual(session.audioLevels.count, 8)
    }

    func testTranscriptionsInitiallyEmpty() {
        let session = NativeLiveKitSession()
        XCTAssertTrue(session.transcriptions.isEmpty)
    }
}

// MARK: - Integration Tests

final class VoiceConnectionIntegrationTests: XCTestCase {

    func testHomeDirectoryAccessible() {
        XCTAssertFalse(NSHomeDirectory().isEmpty)
    }

    func testTokenServerURLIsValid() async throws {
        let url = URL(string: "https://app.ferni.ai/health")!

        let (_, response) = try await URLSession.shared.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        XCTAssertEqual(httpResponse?.statusCode, 200, "Token server should be reachable")
    }

    func testLiveKitTokenEndpoint() async throws {
        let room = "test-\(UUID().uuidString.prefix(8))"
        let url = URL(string: "https://app.ferni.ai/token?room=\(room)&username=test&persona_id=ferni")!

        let (data, response) = try await URLSession.shared.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        XCTAssertEqual(httpResponse?.statusCode, 200, "Token endpoint should return 200")

        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertNotNil(json?["token"], "Response should contain token")
        XCTAssertNotNil(json?["url"], "Response should contain LiveKit URL")
        XCTAssertNotNil(json?["room"], "Response should contain room")
    }
}
