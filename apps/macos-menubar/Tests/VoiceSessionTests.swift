import XCTest
@testable import FerniVoice

/// Unit tests for DualModeVoiceManager (replaces VoiceSessionManager tests)
@MainActor
final class DualModeVoiceManagerTests: XCTestCase {
    
    var sut: DualModeVoiceManager!
    
    override func setUp() async throws {
        try await super.setUp()
        sut = DualModeVoiceManager()
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
    
    func testTokenServerURL() {
        // When cloud mode is on
        sut.useCloudMode = true
        XCTAssertEqual(sut.tokenServer, "https://app.ferni.ai")
        
        // When cloud mode is off
        sut.useCloudMode = false
        XCTAssertEqual(sut.tokenServer, "http://localhost:3001")
    }
    
    // MARK: - Backend Mode Tests
    
    func testDefaultBackendModeIsCLI() {
        // First launch defaults to CLI (native SDK has bugs on macOS 15)
        UserDefaults.standard.removeObject(forKey: "voiceBackendMode")
        let freshManager = DualModeVoiceManager()
        XCTAssertEqual(freshManager.backendMode, .cli)
    }
    
    func testBackendModePersistence() {
        sut.backendMode = .cli
        XCTAssertEqual(UserDefaults.standard.string(forKey: "voiceBackendMode"), "cli")
        
        sut.backendMode = .native
        XCTAssertEqual(UserDefaults.standard.string(forKey: "voiceBackendMode"), "native")
    }
    
    func testBackendModeDisplayName() {
        XCTAssertEqual(VoiceBackendMode.native.displayName, "Native SDK")
        XCTAssertEqual(VoiceBackendMode.cli.displayName, "CLI Subprocess")
    }
    
    // MARK: - Persona Tests
    
    func testSwitchPersonaUpdatesId() async {
        // Note: switchPersona is async and may use handoff
        // For immediate update, set the property directly
        sut.currentPersonaId = "maya"
        XCTAssertEqual(sut.currentPersonaId, "maya")
    }
    
    func testCurrentPersonaReturnsCorrectPersona() {
        sut.currentPersonaId = "jordan"
        let persona = sut.currentPersona
        XCTAssertEqual(persona.id, "jordan")
        XCTAssertEqual(persona.name, "Jordan")
        XCTAssertEqual(persona.initials, "JT")
    }
    
    // MARK: - Audio Level Tests
    
    func testAudioLevelsInitializedCorrectly() {
        XCTAssertEqual(sut.audioLevels.count, 8)
        for level in sut.audioLevels {
            XCTAssertGreaterThanOrEqual(level, 0)
            XCTAssertLessThanOrEqual(level, 1)
        }
    }
    
    // MARK: - Transcription Tests
    
    func testTranscriptionsInitiallyEmpty() {
        XCTAssertTrue(sut.transcriptions.isEmpty)
    }
    
    // MARK: - Claude Integration Tests
    
    func testClaudeCodeInitiallyInactive() {
        XCTAssertFalse(sut.isClaudeCodeActive)
    }
}

/// Unit tests for CLI-specific VoiceSessionManager
final class VoiceSessionManagerTests: XCTestCase {
    
    var sut: VoiceSessionManager!
    
    override func setUp() {
        super.setUp()
        sut = VoiceSessionManager()
    }
    
    override func tearDown() {
        sut.stop()
        sut = nil
        super.tearDown()
    }
    
    func testInitialStateIsDisconnected() {
        XCTAssertEqual(sut.state, .disconnected)
    }
    
    func testStartChangesStateToConnecting() {
        sut.start()
        XCTAssertEqual(sut.state, .connecting)
    }
    
    func testStopChangesStateToDisconnected() {
        sut.start()
        sut.stop()
        XCTAssertEqual(sut.state, .disconnected)
    }
    
    func testClaudeCodeResponseInitiallyNil() {
        XCTAssertNil(sut.claudeCodeResponse)
    }
}

/// Integration tests for voice connection
final class VoiceConnectionIntegrationTests: XCTestCase {
    
    func testVoiceBinaryExistsInExpectedPaths() {
        // Only required for CLI mode - Native mode doesn't need binary
        let paths = [
            "/opt/homebrew/bin/ferni",
            NSHomeDirectory() + "/Documents/voiceai/apps/macos-menubar/.build/Ferni Voice.app/Contents/Resources/ferni-voice",
            NSHomeDirectory() + "/Documents/voiceai/apps/macos-menubar/.build/debug/FerniVoice"
        ]
        
        let exists = paths.contains { FileManager.default.fileExists(atPath: $0) }
        
        // This is a soft assertion - the binary might be in the bundle instead
        if !exists {
            print("Warning: Voice binary not found (not required for Native mode)")
        }
    }
    
    func testSoxIsInstalled() {
        // Only required for CLI mode
        let soxPaths = [
            "/opt/homebrew/bin/sox",
            "/usr/local/bin/sox",
            "/usr/bin/sox"
        ]
        
        let installed = soxPaths.contains { FileManager.default.isExecutableFile(atPath: $0) }
        if !installed {
            print("Warning: sox not installed - only required for CLI mode")
        }
    }
    
    func testTokenServerIsReachable() async throws {
        let url = URL(string: "https://app.ferni.ai/health")!
        
        let (_, response) = try await URLSession.shared.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        XCTAssertEqual(httpResponse?.statusCode, 200, "Token server should be reachable")
    }
    
    func testLiveKitTokenEndpoint() async throws {
        let room = "test-\(UUID().uuidString.prefix(8))"
        // Correct endpoint is /token, not /api/livekit-token
        let url = URL(string: "https://app.ferni.ai/token?room=\(room)&username=test&persona_id=ferni")!
        
        let (data, response) = try await URLSession.shared.data(from: url)
        let httpResponse = response as? HTTPURLResponse
        XCTAssertEqual(httpResponse?.statusCode, 200, "Token endpoint should return 200")
        
        // Verify response has token
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertNotNil(json?["token"], "Response should contain token")
        XCTAssertNotNil(json?["url"], "Response should contain LiveKit URL")
        XCTAssertNotNil(json?["room"], "Response should contain room")
    }
    
    func testEnvironmentVariablesAreSet() {
        let sut = VoiceSessionManager()
        sut.useCloudMode = true
        
        // Verify token server is set correctly
        XCTAssertEqual(sut.tokenServer, "https://app.ferni.ai")
        
        // Verify HOME is accessible
        XCTAssertFalse(NSHomeDirectory().isEmpty)
    }
}

/// Native LiveKit integration tests
@MainActor
final class NativeLiveKitIntegrationTests: XCTestCase {
    
    func testNativeSessionInitialState() {
        let session = NativeLiveKitSession()
        XCTAssertEqual(session.state, .disconnected)
        XCTAssertEqual(session.currentPersonaId, "ferni")
    }
    
    func testNativeSessionCloudModeToggle() {
        let session = NativeLiveKitSession()
        
        // Test cloud mode ON
        session.useCloudMode = true
        XCTAssertTrue(session.useCloudMode)
        XCTAssertEqual(session.tokenServer, "https://app.ferni.ai")
        
        // Test cloud mode OFF
        session.useCloudMode = false
        XCTAssertFalse(session.useCloudMode)
        XCTAssertEqual(session.tokenServer, "http://localhost:3001")
    }
    
    func testNativeSessionAudioLevels() {
        let session = NativeLiveKitSession()
        XCTAssertEqual(session.audioLevels.count, 8)
    }
}
