import FerniDesign
import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// The call lifecycle against a fake room: the agent arriving (or not), what
/// it signals, dropped connections, and hanging up.
@MainActor
final class CallSessionTests: XCTestCase {

    /// A LiveKit room stand-in. `agentOnConnect` decides whether the agent is
    /// already there when we join; tests push further events with `send`.
    final class FakeRoom: VoiceRoom, @unchecked Sendable {
        let events: AsyncStream<RoomEvent>
        private let continuation: AsyncStream<RoomEvent>.Continuation
        var agentOnConnect: [String: String]?
        var connectError: Error?
        private(set) var connectedTo: (url: String, token: String)?
        private(set) var micStates: [Bool] = []
        private(set) var disconnects = 0

        init(agentOnConnect: [String: String]? = ["lk.agent.state": "listening"]) {
            (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
            self.agentOnConnect = agentOnConnect
        }
        func connect(url: String, token: String) async throws {
            if let connectError { throw connectError }
            connectedTo = (url, token)
            if let agentOnConnect { continuation.yield(.agentJoined(attributes: agentOnConnect)) }
        }
        func setMicrophone(enabled: Bool) async throws { micStates.append(enabled) }
        func disconnect() async {
            disconnects += 1
            continuation.finish()
        }
        func send(_ event: RoomEvent) { continuation.yield(event) }
    }

    final class FakeAudio: CallAudio, @unchecked Sendable {
        let interruptions: AsyncStream<AudioInterruption>
        let interrupt: AsyncStream<AudioInterruption>.Continuation
        var micAllowed = true
        private(set) var activations = 0
        private(set) var deactivations = 0
        init() { (interruptions, interrupt) = AsyncStream.makeStream(of: AudioInterruption.self) }
        func requestMicrophone() async -> Bool { micAllowed }
        func activate() throws { activations += 1 }
        func deactivate() { deactivations += 1 }
    }

    final class Rooms: @unchecked Sendable {
        var made: [FakeRoom] = []
        var next: () -> FakeRoom = { FakeRoom() }
    }

    final class Tokens: @unchecked Sendable {
        var requests: [String] = []
        var error: Error?
        var dispatched: Bool? = true
    }

    private var rooms = Rooms()
    private var tokens = Tokens()
    private var audio = FakeAudio()

    /// Timeouts: 5 s by default, so a Ferni who's there is never raced by the
    /// watchdog (his join reaches the session through the room's AsyncStream
    /// and a task hop, which on a loaded CI runner took longer than the old
    /// 200 ms; testFerniMissingTwiceEndsWithRetryNotSilence and
    /// testAFailedRejoinEndsTheCallAfterOneFreshRoom flaked on main). A test
    /// where Ferni is missing makes him missing without the clock (the token
    /// says not dispatched) or passes a short timeout and never sends him.
    private func makeSession(timeout: Duration = .seconds(5)) -> CallSession {
        let rooms = rooms, tokens = tokens
        return CallSession(
            fetchToken: { persona in
                tokens.requests.append(persona)
                if let error = tokens.error { throw error }
                return CallToken(token: "lk-\(tokens.requests.count)", url: "wss://lk.example.test",
                                 room: "ios-x", agentDispatched: tokens.dispatched)
            },
            makeRoom: {
                let room = rooms.next()
                rooms.made.append(room)
                return room
            },
            audio: audio,
            agentTimeout: timeout
        )
    }

    /// Lets the session's tasks run until `condition` holds (or fails after
    /// 10 s; a pass returns as soon as it holds, so only failures wait).
    private func until(_ condition: @autoclosure () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !condition(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(condition(), "timed out", file: file, line: line)
    }

    // MARK: - Joining

    func testTalkGetsATokenJoinsAndGoesLiveWhenFerniIsThere() async {
        let session = makeSession()
        session.start(personaID: "maya")

        await until(session.phase == .live)
        XCTAssertEqual(tokens.requests, ["maya"])
        XCTAssertEqual(rooms.made.first?.connectedTo?.token, "lk-1")
        XCTAssertEqual(rooms.made.first?.micStates, [true])
        XCTAssertEqual(audio.activations, 1)
        XCTAssertEqual(session.agentActivity, .listening)
    }

    func testWaitsForFerniWhoArrivesLate() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .seconds(2))
        session.start()

        await until(session.phase == .waitingForFerni)
        rooms.made[0].send(.agentJoined(attributes: [:]))

        await until(session.phase == .live)
        XCTAssertEqual(rooms.made.count, 1)
    }

    func testFerniMissingIsRetriedOnceInAFreshRoom() async {
        // The first token says nobody was dispatched (missing at once, no
        // clock); the second, fetched after the first room, says he was.
        tokens.dispatched = false
        var first = true
        let tokens = tokens
        rooms.next = {
            defer { first = false; tokens.dispatched = true }
            return FakeRoom(agentOnConnect: first ? nil : [:])
        }
        let session = makeSession()
        session.start()

        await until(session.phase == .live)
        XCTAssertEqual(rooms.made.count, 2)
        XCTAssertEqual(rooms.made[0].disconnects, 1, "the empty room is left")
        XCTAssertEqual(tokens.requests.count, 2, "a fresh token re-dispatches the agent")
    }

    func testFerniMissingTwiceEndsWithRetryNotSilence() async {
        // Missing without the clock: neither token was dispatched. The
        // watchdog's own deadline is testTheWatchdogRetriesOnceThenGivesUp's.
        tokens.dispatched = false
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession()
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        XCTAssertEqual(rooms.made.count, 2)
        XCTAssertTrue(rooms.made.allSatisfy { $0.disconnects == 1 })
        XCTAssertEqual(audio.deactivations, 2)

        tokens.dispatched = true
        rooms.next = { FakeRoom() }
        session.start()
        await until(session.phase == .live)
    }

    func testAFailedDispatchDoesNotWaitOutTheTimeout() async {
        tokens.dispatched = false
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .seconds(30))
        let started = ContinuousClock.now
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        // Far under the 30 s timeout, with room for a stalled runner (2 s
        // failed when the test process froze for 2.5 s).
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(10))
    }

    /// The watchdog itself: dispatched, but Ferni never joins either room.
    /// Nobody is ever sent, so a stalled runner can only make it later.
    func testTheWatchdogRetriesOnceThenGivesUp() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .milliseconds(150))
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        try? await Task.sleep(for: .milliseconds(600)) // four more deadlines' worth
        XCTAssertEqual(rooms.made.count, 2)
        XCTAssertEqual(tokens.requests.count, 2)
        XCTAssertEqual(session.phase, .failed(.ferniDidNotJoin))
    }

    func testRefusedTokenSaysSoAndJoinsNothing() async {
        tokens.error = FerniAPIError.status(401)
        let session = makeSession()
        session.start()

        await until(session.phase == .failed(.notSignedIn))
        XCTAssertTrue(rooms.made.isEmpty)
        XCTAssertFalse(CallProblem.notSignedIn.message.isEmpty)
    }

    func testNoMicrophoneNoCall() async {
        audio.micAllowed = false
        let session = makeSession()
        session.start()

        await until(session.phase == .failed(.microphoneDenied))
        XCTAssertTrue(tokens.requests.isEmpty)
    }

    // MARK: - During the call

    func testAgentStateDrivesTheAvatar() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        XCTAssertEqual(session.avatar.pose, .listening, "the first turn shows at once")
        rooms.made[0].send(.agentAttributes(["lk.agent.state": "speaking"]))
        await until(session.avatar.pose == .speaking) // after the 150 ms settle
        XCTAssertEqual(session.avatar.expression, .speaking)

        rooms.made[0].send(.agentAttributes(["lk.agent.state": "thinking"]))
        await until(session.avatar.pose == .thinking)
        XCTAssertEqual(session.avatar.expression, .thinking)
    }

    func testSpeechStateAndExpressionMessagesAreRead() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        rooms.made[0].send(.data(Data(#"{"type":"speech_state","innerType":"speech_start"}"#.utf8)))
        await until(session.isUserSpeaking)
        rooms.made[0].send(.data(Data(#"{"type":"expression_update","expression":"warm"}"#.utf8)))
        await until(session.avatar.expression == .warm)
        rooms.made[0].send(.data(Data(#"{"type":"speech_state","innerType":"speech_end"}"#.utf8)))
        await until(!session.isUserSpeaking)
    }

    /// Untrusted numbers in a packet never crash the app (security review).
    func testHugeOrNegativeExpressionTimesAreClampedNotFatal() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        rooms.made[0].send(.data(Data(#"{"type":"expression_update","expression":"warm","duration":9223372036854775807}"#.utf8)))
        await until(session.avatar.expression == .warm)
        rooms.made[0].send(.data(Data(#"{"type":"expression_update","expression":"curious","hold":-5,"duration":1e308}"#.utf8)))
        await until(session.avatar.expression == .curious || session.avatar.expression == .listening)
        XCTAssertEqual(session.phase, .live)
    }

    func testCaptionsAssembleFromTheTranscriptStream() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        let room = rooms.made[0]
        room.send(.caption(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Hey, ", isFinal: false)))
        room.send(.caption(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "good to hear you.", isFinal: false)))
        room.send(.caption(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .you, text: "Hi", isFinal: true)))

        await until(session.captions.lines.count == 2)
        XCTAssertEqual(session.captions.lines.map(\.text), ["Hey, good to hear you.", "Hi"])
        XCTAssertEqual(session.captions.lines.map(\.speaker), [.ferni, .you])
    }

    func testMuteTurnsTheMicOffAndOn() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        await session.toggleMute()
        XCTAssertTrue(session.isMuted)
        await session.toggleMute()
        XCTAssertEqual(rooms.made[0].micStates, [true, false, true])
    }

    func testReconnectingShowsAndRecovers() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        rooms.made[0].send(.reconnecting)
        await until(session.phase == .reconnecting)
        rooms.made[0].send(.reconnected)
        await until(session.phase == .live)
    }

    func testADroppedCallRejoinsOnceInAFreshRoom() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        rooms.made[0].send(.disconnected(byUs: false))

        await until(rooms.made.count == 2 && session.phase == .live)
        XCTAssertEqual(tokens.requests.count, 2)
    }

    /// A dropped call whose rejoin Ferni never joins ends as a lost connection,
    /// after exactly one fresh room and token: no second rejoin attempt, and
    /// no rejoining again after the rejoin fails (the train's verifier: no
    /// test covered a failed rejoin, so either loop shipped green).
    func testAFailedRejoinEndsTheCallAfterOneFreshRoom() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        // The rejoin's Ferni is missing without the clock: its token says
        // nobody was dispatched, so the first join is never raced.
        tokens.dispatched = false
        rooms.next = { FakeRoom(agentOnConnect: nil) }

        rooms.made[0].send(.disconnected(byUs: false))

        await until(session.phase == .failed(.connectionLost))
        try? await Task.sleep(for: .milliseconds(600)) // four more deadlines' worth
        XCTAssertEqual(session.phase, .failed(.connectionLost))
        XCTAssertEqual(rooms.made.count, 2, "the first room and one fresh room")
        XCTAssertEqual(tokens.requests.count, 2, "and one fresh token")
    }

    func testFerniHangingUpEndsTheCall() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        rooms.made[0].send(.agentLeft)

        await until(session.phase == .ended)
        XCTAssertEqual(rooms.made[0].disconnects, 1)
        XCTAssertEqual(session.avatar.pose, .departing)
    }

    func testEndingWhileConnectingLeavesAndStaysEnded() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .seconds(5))
        session.start()
        await until(session.phase == .waitingForFerni)

        await session.end()

        XCTAssertEqual(session.phase, .ended)
        try? await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(session.phase, .ended, "the cancelled join doesn't come back to life")
        XCTAssertEqual(rooms.made.count, 1)
        XCTAssertEqual(rooms.made[0].disconnects, 1)
    }

    func testAnInterruptionThatEndsResumesTheMic() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        audio.interrupt.yield(.began)
        audio.interrupt.yield(.ended(shouldResume: true))

        await until(rooms.made[0].micStates == [true, true])
        XCTAssertEqual(audio.activations, 2)
    }
}

final class CaptionBookTests: XCTestCase {
    func testACorrectedSegmentReplacesItsText() {
        var book = CaptionBook()
        book.apply(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .you, text: "I wanna", isFinal: false))
        book.apply(CaptionChunk(streamID: "s2", segmentID: "a", speaker: .you, text: "I want to talk", isFinal: true))
        XCTAssertEqual(book.lines.map(\.text), ["I want to talk"])
        XCTAssertEqual(book.lines.first?.isFinal, true)
    }

    func testAnEmptyEndMarkerIsNotALine() {
        var book = CaptionBook()
        book.apply(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .you, text: "", isFinal: true))
        book.apply(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .you, text: "  ", isFinal: false))
        XCTAssertTrue(book.lines.isEmpty)
    }

    func testOnlyTheLastFewLinesAreKept() {
        var book = CaptionBook(keep: 2)
        for i in 0..<5 {
            book.apply(CaptionChunk(streamID: "s\(i)", segmentID: "\(i)", speaker: .ferni, text: "line \(i)", isFinal: true))
        }
        XCTAssertEqual(book.lines.map(\.text), ["line 3", "line 4"])
    }
}

final class CallTokenTests: XCTestCase {
    /// The server's real field names (src/servers/api/routes/token.ts).
    func testDecodesTheServersTokenResponse() throws {
        let json = #"{"token":"t","url":"wss://x.livekit.cloud","room":"ios-1","username":"iphone","persona_id":"ferni","agent_dispatched":true,"city":"Tampa"}"#
        let token = try JSONDecoder().decode(CallToken.self, from: Data(json.utf8))
        XCTAssertEqual(token, CallToken(token: "t", url: "wss://x.livekit.cloud", room: "ios-1", agentDispatched: true))
    }

    func testTheTokenRequestAsksForAFreshRoomAsTheAccount() async throws {
        final class Seen: @unchecked Sendable { var request: URLRequest? }
        let seen = Seen()
        let api = FerniAPI(
            baseURL: URL(string: "https://app.example.test")!,
            idToken: { _ in "firebase-id" },
            send: { request in
                seen.request = request
                let body = Data(#"{"token":"t","url":"wss://u","room":"r","agent_dispatched":true}"#.utf8)
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
        )
        _ = try await CallTokens.fetcher(api: api)("peter")

        let request = try XCTUnwrap(seen.request)
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let query = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(request.url?.path, "/token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer firebase-id")
        XCTAssertEqual(query["persona_id"], "peter")
        XCTAssertTrue(query["room"]?.hasPrefix("ios-") == true)
        XCTAssertEqual(query["username"], "User", "a placeholder Ferni won't greet you by")
        XCTAssertEqual(query["timezone"], TimeZone.current.identifier)
    }
}

final class RemoteDurationTests: XCTestCase {
    func testAnythingAPacketSendsBecomesASafeDuration() {
        XCTAssertNil(RemoteDuration.seconds(nil))
        XCTAssertNil(RemoteDuration.seconds(.nan))
        XCTAssertEqual(RemoteDuration.seconds(.infinity), .seconds(60))
        XCTAssertEqual(RemoteDuration.seconds(-.infinity), .zero)
        XCTAssertEqual(RemoteDuration.seconds(1e308), .seconds(60))
        XCTAssertEqual(RemoteDuration.seconds(Double(Int.max)), .seconds(60))
        XCTAssertEqual(RemoteDuration.seconds(-5), .zero)
        XCTAssertEqual(RemoteDuration.seconds(1.5), .milliseconds(1500))
    }
}
