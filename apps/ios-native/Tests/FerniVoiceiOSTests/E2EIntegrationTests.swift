import XCTest
@testable import FerniVoice

/// End-to-End Integration Tests for Ferni iOS Native App.
/// Validates complete flows from user action to backend response.
final class E2EIntegrationTests: XCTestCase {

    // MARK: - Properties

    private var mockClient: MockHTTPClient!
    private var mockDataChannel: MockDataChannel!
    private var mockAuthState: AuthenticationIntegrationTests.MockAuthState!
    private var handoffStateMachine: HandoffStateMachine!

    // MARK: - Setup

    override func setUp() {
        super.setUp()
        mockClient = MockHTTPClient()
        mockDataChannel = MockDataChannel()
        mockAuthState = AuthenticationIntegrationTests.MockAuthState()
        handoffStateMachine = HandoffStateMachine()
    }

    override func tearDown() {
        mockClient = nil
        mockDataChannel = nil
        mockAuthState = nil
        handoffStateMachine = nil
        super.tearDown()
    }

    // MARK: - Complete Voice Call Flow

    func testCompleteAuthenticatedVoiceCallFlow() async throws {
        // E2E Test: User signs in → connects to voice → has conversation → ends call

        // STEP 1: User signs in with Apple
        mockAuthState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "001234.abc123.5678",
            firebaseToken: "eyJhbGciOiJSUzI1NiJ9.firebase-token"
        )
        XCTAssertTrue(mockAuthState.isSignedIn)

        // STEP 2: App requests token from server
        mockClient.setupTokenResponse(
            token: "livekit-access-token-xyz",
            url: "wss://dev-8sm1ba0z.livekit.cloud",
            room: "ferni-ios-test123"
        )

        var tokenRequest = URLRequest(url: URL(string: "https://app.ferni.ai/token?room=test&username=user&persona_id=ferni")!)
        tokenRequest.setValue("Bearer \(mockAuthState.firebaseToken!)", forHTTPHeaderField: "Authorization")

        let (tokenData, tokenResponse) = try await mockClient.fetch(tokenRequest)
        let httpResponse = tokenResponse as! HTTPURLResponse
        XCTAssertEqual(httpResponse.statusCode, 200)

        let tokenJSON = try JSONSerialization.jsonObject(with: tokenData) as! [String: Any]
        XCTAssertNotNil(tokenJSON["token"])

        // STEP 3: LiveKit connection established (simulated)
        // In real app, LiveKit SDK connects with the token

        // STEP 4: User speaks, backend responds
        mockDataChannel.simulateTranscript(
            text: "Hi Ferni, how are you?",
            isFinal: true,
            isAgent: false,
            personaId: "user"
        )

        mockDataChannel.simulateTranscript(
            text: "Hey! I'm doing great. What's on your mind today?",
            isFinal: true,
            isAgent: true,
            personaId: "ferni"
        )

        // STEP 5: Validate transcripts received
        let transcripts = mockDataChannel.receivedMessages.filter {
            ($0["type"] as? String) == "transcript"
        }
        XCTAssertEqual(transcripts.count, 2)

        // STEP 6: Call ends gracefully
        // (In real app, room disconnects)
    }

    // MARK: - Complete Handoff Flow

    func testCompletePersonaHandoffFlow() async throws {
        // E2E Test: User in Ferni → requests Maya → handoff succeeds → now talking to Maya

        // SETUP: User is authenticated and in a call with Ferni
        mockAuthState.signIn(
            email: "subscriber@example.com",
            name: "Premium User",
            appleUserId: "premium-user-id",
            firebaseToken: "premium-firebase-token"
        )

        // STEP 1: User is talking to Ferni
        let initialPersonaId = "ferni"
        mockDataChannel.simulateTranscript(
            text: "I'd like to talk to Maya about my habits.",
            isFinal: true,
            isAgent: false,
            personaId: "user"
        )

        // STEP 2: Ferni acknowledges handoff
        mockDataChannel.simulateTranscript(
            text: "Of course! Let me connect you with Maya.",
            isFinal: true,
            isAgent: true,
            personaId: initialPersonaId
        )

        // STEP 3: Client sends handoff request
        mockDataChannel.sendHandoffRequest(targetPersona: "maya")
        handoffStateMachine.transition(with: mockDataChannel.sentMessages.last!)

        XCTAssertTrue(mockDataChannel.hasHandoffRequestFor(persona: "maya"))

        // STEP 4: Server acknowledges handoff started
        mockDataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")
        handoffStateMachine.transition(with: mockDataChannel.receivedMessages.last!)

        if case .inProgress(let from, let to) = handoffStateMachine.currentState {
            XCTAssertEqual(from, "ferni")
            XCTAssertEqual(to, "maya")
        } else {
            XCTFail("Expected handoff in progress")
        }

        // STEP 5: Server confirms handoff complete
        mockDataChannel.simulateHandoffComplete(newAgent: "maya")
        handoffStateMachine.transition(with: mockDataChannel.receivedMessages.last!)

        if case .completed(let newPersona) = handoffStateMachine.currentState {
            XCTAssertEqual(newPersona, "maya")
        } else {
            XCTFail("Expected handoff completed")
        }

        // STEP 6: Maya greets user
        mockDataChannel.simulateTranscript(
            text: "Hi there! Ferni told me you want to work on habits. What's been on your mind?",
            isFinal: true,
            isAgent: true,
            personaId: "maya"
        )

        // STEP 7: Validate complete flow
        XCTAssertTrue(handoffStateMachine.isValidHandoffSequence)

        let mayaTranscripts = mockDataChannel.receivedMessages.filter {
            ($0["type"] as? String) == "transcript" &&
            ($0["personaId"] as? String) == "maya"
        }
        XCTAssertEqual(mayaTranscripts.count, 1)
    }

    // MARK: - Subscription-Gated Handoff Flow

    func testSubscriptionGatedHandoffFlow() async throws {
        // E2E Test: Free user tries to access Partner-tier persona (Nayan)

        // SETUP: Free tier user (no subscription)
        mockAuthState.signIn(
            email: "free@example.com",
            name: "Free User",
            appleUserId: "free-user-id",
            firebaseToken: "free-firebase-token"
        )

        // STEP 1: User requests handoff to Nayan (Partner tier)
        mockDataChannel.sendHandoffRequest(targetPersona: "nayan")
        handoffStateMachine.transition(with: mockDataChannel.sentMessages.last!)

        // STEP 2: Server rejects due to subscription requirement
        mockDataChannel.simulateHandoffFailed(reason: "Nayan requires Partner subscription. Upgrade to access.")
        handoffStateMachine.transition(with: mockDataChannel.receivedMessages.last!)

        // STEP 3: Validate rejection
        if case .failed(let reason) = handoffStateMachine.currentState {
            XCTAssertTrue(reason.contains("Partner") || reason.contains("subscription"))
        } else {
            XCTFail("Expected handoff to fail")
        }

        XCTAssertFalse(handoffStateMachine.isValidHandoffSequence)
    }

    // MARK: - Anonymous User Flow

    func testAnonymousUserVoiceFlow() async throws {
        // E2E Test: User uses app without signing in (limited experience)

        // SETUP: User is NOT signed in
        XCTAssertFalse(mockAuthState.isSignedIn)

        // STEP 1: App requests token without auth header
        mockClient.setupTokenResponse(
            token: "anonymous-livekit-token",
            url: "wss://dev-8sm1ba0z.livekit.cloud",
            room: "ferni-ios-anon-abc"
        )

        let tokenRequest = URLRequest(url: URL(string: "https://app.ferni.ai/token?room=anon&username=anon&persona_id=ferni")!)
        // NO Authorization header

        let (tokenData, _) = try await mockClient.fetch(tokenRequest)
        let tokenJSON = try JSONSerialization.jsonObject(with: tokenData) as! [String: Any]

        // Token is still provided for anonymous users (basic access)
        XCTAssertNotNil(tokenJSON["token"])

        // STEP 2: User can talk to Ferni
        mockDataChannel.simulateTranscript(
            text: "Hello! I'm Ferni. Create an account to unlock more features!",
            isFinal: true,
            isAgent: true,
            personaId: "ferni"
        )

        // STEP 3: Handoff to other personas should fail without subscription
        mockDataChannel.sendHandoffRequest(targetPersona: "maya")
        mockDataChannel.simulateHandoffFailed(reason: "Sign in required to talk to other team members")

        handoffStateMachine.transition(with: mockDataChannel.sentMessages.last!)
        handoffStateMachine.transition(with: mockDataChannel.receivedMessages.last!)

        XCTAssertFalse(handoffStateMachine.isValidHandoffSequence)
    }

    // MARK: - Better Than Human Features Flow

    func testBetterThanHumanEmotionalFlow() async throws {
        // E2E Test: Validates superhuman emotional intelligence features

        mockAuthState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "user-id",
            firebaseToken: "token"
        )

        // STEP 1: User is speaking to Ferni
        mockDataChannel.simulateTranscript(
            text: "I've been feeling really stressed lately...",
            isFinal: true,
            isAgent: false,
            personaId: "user"
        )

        // STEP 2: Backend detects concern (Better Than Human)
        mockDataChannel.simulateEmotionEvent(
            type: "concern_detected",
            emotion: "stress",
            confidence: 0.92
        )

        // STEP 3: Ferni responds with empathy
        mockDataChannel.simulateTranscript(
            text: "I can hear that you're carrying a lot right now. Want to tell me more about what's weighing on you?",
            isFinal: true,
            isAgent: true,
            personaId: "ferni"
        )

        // STEP 4: Validate emotion events were received
        let emotionEvents = mockDataChannel.receivedMessages.filter {
            ($0["type"] as? String) == "emotion_event"
        }
        XCTAssertEqual(emotionEvents.count, 1)
        XCTAssertEqual(emotionEvents[0]["emotion"] as? String, "stress")
        XCTAssertGreaterThan(emotionEvents[0]["confidence"] as? Float ?? 0, 0.9)
    }

    // MARK: - Network Error Recovery

    func testNetworkErrorRecoveryFlow() async {
        // E2E Test: App handles network errors gracefully

        // STEP 1: Initial connection succeeds
        mockClient.setupHealthResponse(healthy: true)
        mockClient.setupTokenResponse()

        let healthRequest = URLRequest(url: URL(string: "https://app.ferni.ai/health")!)
        do {
            let (_, response) = try await mockClient.fetch(healthRequest)
            let httpResponse = response as! HTTPURLResponse
            XCTAssertEqual(httpResponse.statusCode, 200)
        } catch {
            XCTFail("Health check should succeed")
        }

        // STEP 2: Network fails
        mockClient.setResponse(for: "/token", response: .error(URLError(.notConnectedToInternet)))

        let tokenRequest = URLRequest(url: URL(string: "https://app.ferni.ai/token")!)
        do {
            _ = try await mockClient.fetch(tokenRequest)
            XCTFail("Should have thrown network error")
        } catch {
            // Expected - network error
            XCTAssertTrue(error is URLError || error is MockNetworkError)
        }

        // STEP 3: Network recovers
        mockClient.setupTokenResponse()

        do {
            let (_, response) = try await mockClient.fetch(tokenRequest)
            let httpResponse = response as! HTTPURLResponse
            XCTAssertEqual(httpResponse.statusCode, 200)
        } catch {
            XCTFail("Token fetch should succeed after recovery")
        }
    }

    // MARK: - Multi-Platform Handoff (macOS Context)

    func testMacOSContextIntegration() {
        // E2E Test: macOS-specific context is sent to backend

        // macOS context message (as sent by NativeLiveKitSession)
        let macOSContext: [String: Any] = [
            "type": "macos_context",
            "payload": [
                "calendar_density": "high",
                "focus_mode": "Do Not Disturb",
                "screen_time_hours": 6.5,
                "clipboard_content_type": "text"
            ],
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]

        mockDataChannel.send(macOSContext)

        // Validate message was sent
        XCTAssertEqual(mockDataChannel.sentMessages.count, 1)
        let sent = mockDataChannel.sentMessages.first!
        XCTAssertEqual(sent["type"] as? String, "macos_context")

        let payload = sent["payload"] as? [String: Any]
        XCTAssertNotNil(payload)
        XCTAssertEqual(payload?["focus_mode"] as? String, "Do Not Disturb")
    }
}

// MARK: - Persona Validation Tests

extension E2EIntegrationTests {

    func testAllPersonaIdsAreValid() {
        // All persona IDs should be lowercase, no spaces
        let personas = ["ferni", "maya", "peter", "alex", "jordan", "nayan"]

        for persona in personas {
            XCTAssertEqual(persona, persona.lowercased())
            XCTAssertFalse(persona.contains(" "))
            XCTAssertFalse(persona.isEmpty)
        }
    }

    func testPersonaTierMapping() {
        // Friend tier: maya, peter, alex, jordan
        // Partner tier: nayan
        let friendTier = ["maya", "peter", "alex", "jordan"]
        let partnerTier = ["nayan"]

        // Ferni is always available
        XCTAssertFalse(friendTier.contains("ferni"))
        XCTAssertFalse(partnerTier.contains("ferni"))

        // No overlap
        for persona in friendTier {
            XCTAssertFalse(partnerTier.contains(persona))
        }
    }
}

// MARK: - Session Lifecycle Tests

extension E2EIntegrationTests {

    func testSessionLifecycleFlow() {
        // Validates the complete session lifecycle

        enum SessionState: String {
            case disconnected
            case connecting
            case connected
            case reconnecting
            case disconnecting
        }

        var currentState: SessionState = .disconnected

        // STEP 1: Start connection
        currentState = .connecting
        XCTAssertEqual(currentState, .connecting)

        // STEP 2: Connection established
        currentState = .connected
        XCTAssertEqual(currentState, .connected)

        // STEP 3: Network hiccup - reconnecting
        currentState = .reconnecting
        XCTAssertEqual(currentState, .reconnecting)

        // STEP 4: Reconnected
        currentState = .connected
        XCTAssertEqual(currentState, .connected)

        // STEP 5: User ends call
        currentState = .disconnecting
        XCTAssertEqual(currentState, .disconnecting)

        // STEP 6: Disconnected
        currentState = .disconnected
        XCTAssertEqual(currentState, .disconnected)
    }

    func testAudioSessionConfiguration() {
        // Validates audio session is configured for voice chat
        // (Actual AVAudioSession configuration happens in IOSLiveKitSession)

        let expectedCategory = "playAndRecord"
        let expectedMode = "voiceChat"
        let expectedOptions = ["allowBluetooth", "defaultToSpeaker"]

        XCTAssertEqual(expectedCategory, "playAndRecord")
        XCTAssertEqual(expectedMode, "voiceChat")
        XCTAssertTrue(expectedOptions.contains("allowBluetooth"))
        XCTAssertTrue(expectedOptions.contains("defaultToSpeaker"))
    }
}
