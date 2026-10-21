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
        /// A slow connect that isn't cancelled by the call task (like a real one).
        var connectDelay: Duration?
        private(set) var connectedTo: (url: String, token: String)?
        private(set) var micStates: [Bool] = []
        private(set) var disconnects = 0

        init(agentOnConnect: [String: String]? = ["lk.agent.state": "listening"]) {
            (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
            self.agentOnConnect = agentOnConnect
        }
        func connect(url: String, token: String) async throws {
            if let connectDelay { await Task.detached { try? await Task.sleep(for: connectDelay) }.value }
            if let connectError { throw connectError }
            connectedTo = (url, token)
            if let agentOnConnect { continuation.yield(.agentJoined(attributes: agentOnConnect)) }
        }
        var order: Order?
        func setMicrophone(enabled: Bool) async throws {
            micStates.append(enabled)
            order?.steps.append("mic \(enabled)")
        }
        private(set) var sent: [Data] = []
        func send(_ data: Data) async throws { sent.append(data) }
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
        var order: Order?
        /// The next activation throws (the system still has the audio).
        var failNextActivation = false
        /// For each activation: did the system own the session?
        private(set) var ownership: [Bool] = []
        private(set) var systemStates: [Bool] = []
        func systemAudio(active: Bool) { systemStates.append(active) }
        func activate(systemOwned: Bool) throws {
            activations += 1
            ownership.append(systemOwned)
            if failNextActivation {
                failNextActivation = false
                throw NSError(domain: "AVAudioSession", code: 561_015_905) // '!pri': can't activate
            }
            order?.steps.append("activate")
        }
        func deactivate(systemOwned: Bool) { deactivations += 1 }
    }

    final class Order: @unchecked Sendable { var steps: [String] = [] }

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

    private func makeSession(
        timeout: Duration = .milliseconds(200), arriving: Duration = .milliseconds(50),
        defaults: UserDefaults = UserDefaults(suiteName: "call-tests-\(UUID().uuidString)")!
    ) -> CallSession {
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
            agentTimeout: timeout,
            arrivingAfter: arriving,
            defaults: defaults
        )
    }

    /// Lets the session's tasks run until `condition` holds (or fails after 2 s).
    private func until(_ condition: @autoclosure () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = ContinuousClock.now + .seconds(2)
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
        XCTAssertTrue(session.hasTalked)
    }

    /// Critic L1: after sign-out or account deletion the next person is new to
    /// Ferni, in memory as well as on disk ("Hi, I'm Ferni", not "Good evening").
    func testANewPersonHasNotTalkedYet() async {
        let defaults = UserDefaults(suiteName: "l1-\(UUID().uuidString)")!
        let session = makeSession(defaults: defaults)
        session.start(personaID: "ferni")
        await until(session.phase == .live)
        await session.end()
        XCTAssertTrue(session.hasTalked)
        session.forgetPerson()
        XCTAssertFalse(session.hasTalked)
        XCTAssertFalse(makeSession(defaults: defaults).hasTalked, "and not on disk either")
    }

    /// Haptics-while-recording is set up (in activate) before the mic goes on.
    func testTheAudioSessionIsReadyBeforeTheMicOpens() async {
        let order = Order()
        audio.order = order
        rooms.next = {
            let room = FakeRoom()
            room.order = order
            return room
        }
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        XCTAssertEqual(order.steps, ["activate", "mic true"])
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
        var first = true
        rooms.next = {
            defer { first = false }
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
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession()
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        XCTAssertEqual(rooms.made.count, 2)
        XCTAssertTrue(rooms.made.allSatisfy { $0.disconnects == 1 })
        XCTAssertEqual(audio.deactivations, 2)

        rooms.next = { FakeRoom() }
        session.start()
        await until(session.phase == .live)
    }

    // MARK: Ferni never arrives (2026-10-19: the only worker was busy for 14
    // minutes; the token said dispatched, no agent joined, and the app sat on "calling")

    /// "Calling…" first; "on the way" only once Ferni is late, not the moment
    /// the room connects.
    func testOnTheWayOnlyOnceFerniIsLate() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .seconds(3), arriving: .milliseconds(400))
        session.start()

        await until(rooms.made.first?.connectedTo != nil)
        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(session.phase, .connecting, "in the room, not late yet")
        await until(session.phase == .waitingForFerni)
        rooms.made[0].send(.agentJoined(attributes: [:]))
        await until(session.phase == .live)
    }

    /// The deadline covers the whole attempt: a join stuck before the room
    /// connects (token, connect) is abandoned too, then retried once.
    func testAStuckJoinIsAbandonedAtTheDeadlineAndRetriedOnce() async {
        rooms.next = {
            let room = FakeRoom(agentOnConnect: nil)
            room.connectDelay = .seconds(30)
            return room
        }
        let session = makeSession(timeout: .milliseconds(500), arriving: .milliseconds(150))
        session.start()

        await until(session.phase == .waitingForFerni)
        XCTAssertEqual(rooms.made.count, 1)
        await until(session.phase == .failed(.ferniDidNotJoin))
        XCTAssertEqual(rooms.made.count, 2, "one fresh room, once")
        XCTAssertEqual(tokens.requests.count, 2, "and a fresh token")
    }

    /// No retry loops: one automatic retry, then it's the person's Try again.
    func testAtMostOneAutomaticRetry() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .milliseconds(150), arriving: .milliseconds(50))
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        try? await Task.sleep(for: .milliseconds(600)) // four more deadlines' worth
        XCTAssertEqual(rooms.made.count, 2)
        XCTAssertEqual(tokens.requests.count, 2)
        XCTAssertEqual(session.phase, .failed(.ferniDidNotJoin))
    }

    /// A patience longer than the deadline never stretches the deadline.
    func testTheDeadlineHoldsWhateverThePatience() async {
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .milliseconds(150), arriving: .seconds(30))
        session.start()
        await until(session.phase == .failed(.ferniDidNotJoin))
    }

    func testCouldntJoinSaysWhenToTryAgain() {
        XCTAssertEqual(CallProblem.ferniDidNotJoin.message, "Ferni couldn't join right now. Try again in a minute.")
    }

    /// Critic L4: only a connectivity error says "check your connection".
    func testOnlyConnectivitySaysOffline() {
        XCTAssertEqual(CallProblem(FerniAPIError.unreachable), .offline)
        XCTAssertEqual(CallProblem(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(CallProblem(FerniAPIError.failed), .server(0))
        XCTAssertEqual(CallProblem(URLError(.serverCertificateUntrusted)), .server(0))
        XCTAssertEqual(CallProblem(NSError(domain: "x", code: 1)), .server(0))
    }

    func testAFailedDispatchDoesNotWaitOutTheTimeout() async {
        tokens.dispatched = false
        rooms.next = { FakeRoom(agentOnConnect: nil) }
        let session = makeSession(timeout: .seconds(30))
        let started = ContinuousClock.now
        session.start()

        await until(session.phase == .failed(.ferniDidNotJoin))
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2))
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

    /// A name the web's older expression code uses reaches the face it means,
    /// not neutral (expression audit P1 #9).
    func testAnAliasedExpressionReachesItsFace() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        rooms.made[0].send(.data(Data(#"{"type":"expression_update","expression":"celebrating"}"#.utf8)))
        await until(session.avatar.expression == .joyful)
        XCTAssertEqual(session.avatar.expression, .joyful)
    }

    /// The agent's humanization signals carry a micro-expression; it reaches
    /// the avatar (parity item 2), with the expression it comes with.
    func testAHumanizationSignalFlashesItsMicroExpression() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        XCTAssertNil(session.avatar.micro)
        rooms.made[0].send(.data(Data(#"{"type":"humanization_signal","signalType":"high_engagement"}"#.utf8)))
        await until(session.avatar.micro != nil)
        XCTAssertEqual(session.avatar.micro?.expression, .delight)
        XCTAssertEqual(session.avatar.expression, .happy, "happy, not excited: excited would play the big win over the small one")
        rooms.made[0].send(.data(Data(#"{"type":"humanization_signal","signalType":"concern_detected","concernLevel":"crisis"}"#.utf8)))
        await until(session.avatar.micro?.expression == .concern)
    }

    /// A breakthrough plays deep_moment and high engagement a small
    /// celebration (sequences.json), through the avatar to the body.
    func testSignalsPlayTheirMoments() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        XCTAssertNil(session.avatar.moment)
        rooms.made[0].send(.data(Data(#"{"type":"humanization_signal","signalType":"breakthrough"}"#.utf8)))
        await until(session.avatar.moment?.id == "deep_moment")
        rooms.made[0].send(.data(Data(#"{"type":"humanization_signal","signalType":"high_engagement"}"#.utf8)))
        await until(session.avatar.moment?.id == "celebration_small")
        rooms.made[0].send(.data(Data(#"{"type":"humanization_signal","signalType":"vulnerability"}"#.utf8)))
        await until(session.avatar.micro?.expression == .warmth)
        XCTAssertEqual(session.avatar.moment?.id, "celebration_small", "a vulnerable moment plays none")
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

    func testTappingFerniInterruptsOnlyWhileFerniIsTalking() async throws {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        let quiet = await session.interrupt()
        XCTAssertFalse(quiet, "nothing to interrupt while Ferni listens")
        XCTAssertTrue(rooms.made[0].sent.isEmpty)

        rooms.made[0].send(.agentAttributes(["lk.agent.state": "speaking"]))
        await until(session.avatar.pose == .speaking)
        let sent = await session.interrupt()
        XCTAssertTrue(sent)
        let message = try XCTUnwrap(rooms.made[0].sent.first)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: message) as? [String: Any])
        XCTAssertEqual(json["type"] as? String, "user_interrupt")
        XCTAssertNotNil(json["timestamp"] as? Int)
    }

    func testMuteTurnsTheMicOffAndOn() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        await session.toggleMute()
        XCTAssertTrue(session.isMuted)
        XCTAssertEqual(session.avatar.micro?.expression, .warmth, "Ferni reacts to it (design audit P2 #4)")
        await session.toggleMute()
        XCTAssertEqual(rooms.made[0].micStates, [true, false, true])
        XCTAssertEqual(session.avatar.micro?.expression, .recognition, "and to you coming back")
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
        let session = makeSession(timeout: .milliseconds(150), arriving: .milliseconds(50))
        session.start()
        await until(session.phase == .live)
        rooms.next = { FakeRoom(agentOnConnect: nil) }

        rooms.made[0].send(.disconnected(byUs: false))

        await until(session.phase == .failed(.connectionLost))
        try? await Task.sleep(for: .milliseconds(600)) // four more deadlines' worth
        XCTAssertEqual(session.phase, .failed(.connectionLost))
        XCTAssertEqual(rooms.made.count, 2, "the first room and one fresh room")
        XCTAssertEqual(tokens.requests.count, 2, "and one fresh token")
    }

    /// A different person doesn't inherit the last call's card or captions.
    func testForgettingTheLastCallClearsItsTraces() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        rooms.made[0].send(.caption(CaptionChunk(streamID: "s", segmentID: "a", speaker: .ferni, text: "Hi", isFinal: true)))
        await until(!session.captions.lines.isEmpty)

        session.forgetLastCall()
        XCTAssertNotNil(session.startedAt, "a call in progress is left alone")
        await session.end()
        session.forgetLastCall()
        XCTAssertNil(session.startedAt)
        XCTAssertEqual(session.phase, .idle)
        XCTAssertTrue(session.captions.lines.isEmpty)
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

    /// Critic H3: the agent's handoff messages (exact shapes from
    /// src/agents/voice-agent/phases/multi-agent-mode.ts and
    /// src/agents/multi-agent/handoff-messages.ts) move the call to the teammate.
    func testAHandoffFromTheAgentBringsTheTeammateOnScreen() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        let room = rooms.made[0]
        room.send(.data(Data(#"{"type":"handoff_started","target":"maya-santos","newAgent":"maya-santos","previousAgent":"ferni","timestamp":1}"#.utf8)))
        room.send(.data(Data(#"{"type":"handoff_progress","target":"maya-santos","elapsedMs":0,"timeoutMs":8000,"timestamp":1}"#.utf8)))
        room.send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"maya-santos","timestamp":2}"#.utf8)))
        await until(session.avatar.personaID == "maya")
        XCTAssertEqual(session.avatar.personaID, "maya")
    }

    /// Design audit P1-3: each caption line from Ferni's side says who said it,
    /// so after a handoff the screen can name Maya's words as hers.
    func testCaptionsRememberWhoSaidThem() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        let room = rooms.made[0]
        room.send(.caption(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Let me bring her in.", isFinal: true)))
        room.send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"maya-santos","timestamp":2}"#.utf8)))
        await until(session.avatar.personaID == "maya")
        room.send(.caption(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .ferni, text: "Hi! Which days?", isFinal: true)))
        await until(session.captions.lines.count == 3)
        XCTAssertEqual(session.captions.lines.map(\.personaID), ["ferni", "maya", "maya"])
        // Award upgrade 4: between them, "Maya joined".
        XCTAssertEqual(session.captions.lines.map(\.joined), [false, true, false])
    }

    /// Critic M-F: the agent re-sending handoff_complete for whoever is
    /// already speaking adds no "joined" line and no second swap.
    func testARepeatedHandoffToWhoeverIsSpeakingJoinsNoOne() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        let room = rooms.made[0]
        room.send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"maya-santos","timestamp":2}"#.utf8)))
        await until(session.avatar.personaID == "maya")
        room.send(.caption(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Hi!", isFinal: true)))
        room.send(.data(Data(#"{"type":"handoff_started","target":"maya-santos","newAgent":"maya-santos","previousAgent":"maya-santos","timestamp":3}"#.utf8)))
        room.send(.data(Data(#"{"type":"handoff_complete","from":"maya-santos","target":"maya-santos","timestamp":4}"#.utf8)))
        room.send(.caption(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .ferni, text: "Which days?", isFinal: true)))
        await until(session.captions.lines.count >= 3)
        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(session.captions.lines.map(\.joined), [true, false, false], "one join, at the real handoff")
        XCTAssertEqual(session.avatar.personaID, "maya")
    }

    /// Award upgrade 4: a handoff that doesn't land joins no one.
    func testAFailedOrUnknownHandoffJoinsNoOne() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        let room = rooms.made[0]
        room.send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"<b>x</b>","timestamp":2}"#.utf8)))
        room.send(.data(Data(#"{"type":"handoff_failed","target":"maya-santos","timestamp":3}"#.utf8)))
        room.send(.caption(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Still me.", isFinal: true)))
        await until(session.captions.lines.count == 1)
        XCTAssertFalse(session.captions.lines.contains(where: \.joined))
    }

    /// An id the app doesn't know (or a lookalike) never changes who's on screen.
    func testAHandoffToAnUnknownTeammateChangesNothing() async {
        let session = makeSession()
        session.start(personaID: "ferni")
        await until(session.phase == .live)
        rooms.made[0].send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"peter-lynch","timestamp":2}"#.utf8)))
        rooms.made[0].send(.data(Data(#"{"type":"handoff_complete","from":"ferni","target":"<b>x</b>","timestamp":3}"#.utf8)))
        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(session.avatar.personaID, "ferni")
    }

    // MARK: - Critic M6: what counts as a good call

    /// At least two minutes live, and the person hung up: that's a good call.
    func testALongCallYouEndIsAGoodCall() async {
        let session = makeSession()
        let clock = TestClock()
        session.now = { clock.now }
        session.start()
        await until(session.phase == .live)
        clock.advance(by: .seconds(121))
        await session.end()
        XCTAssertTrue(session.lastCallWasGood)
    }

    func testAShortCallIsNot() async {
        let session = makeSession()
        let clock = TestClock()
        session.now = { clock.now }
        session.start()
        await until(session.phase == .live)
        clock.advance(by: .seconds(90))
        await session.end()
        XCTAssertFalse(session.lastCallWasGood)
    }

    /// Ferni hanging up isn't the person ending it, however long it was.
    func testACallFerniEndsIsNot() async {
        let session = makeSession()
        let clock = TestClock()
        session.now = { clock.now }
        session.start()
        await until(session.phase == .live)
        clock.advance(by: .seconds(300))
        rooms.made[0].send(.agentLeft)
        await until(session.phase == .ended)
        XCTAssertFalse(session.lastCallWasGood)
    }

    final class TestClock: @unchecked Sendable {
        var now = ContinuousClock.now
        func advance(by d: Duration) { now = now.advanced(by: d) }
    }

    /// Critic C2: iOS often ends an interruption without "should resume" (Siri,
    /// an alarm, a declined call). A call the person is still in comes back anyway.
    func testAnInterruptionThatEndsWithoutShouldResumeStillBringsTheMicBack() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        audio.interrupt.yield(.began)
        await until(session.isOnHold)
        audio.interrupt.yield(.ended(shouldResume: false))

        await until(rooms.made[0].micStates == [true, true])
        XCTAssertEqual(audio.activations, 2)
        XCTAssertFalse(session.isOnHold)
    }

    /// If the audio can't come back, the screen says "On hold" (never
    /// "listening" over a dead mic) until the person taps Resume.
    func testIfTheAudioCantComeBackTheCallStaysOnHoldUntilResumed() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)

        audio.failNextActivation = true
        audio.interrupt.yield(.began)
        audio.interrupt.yield(.ended(shouldResume: true))
        await until(audio.activations == 2)
        try? await Task.sleep(for: .milliseconds(50))
        XCTAssertTrue(session.isOnHold)
        XCTAssertEqual(rooms.made[0].micStates, [true], "the mic isn't claimed while the audio is gone")

        await session.resume()
        XCTAssertEqual(audio.activations, 3)
        XCTAssertFalse(session.isOnHold)
        XCTAssertEqual(rooms.made[0].micStates, [true, true])
    }
}

final class CaptionBookTests: XCTestCase {
    /// Award upgrade 4: a join is its own line, in order, kept like words.
    func testAJoinSitsBetweenTheWordsAndAgesOut() {
        var book = CaptionBook(keep: 3)
        book.apply(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Let me bring her in.", isFinal: true))
        book.join("maya")
        book.apply(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .ferni, text: "Hi!", isFinal: true))
        XCTAssertEqual(book.lines.map(\.joined), [false, true, false])
        XCTAssertEqual(book.lines[1].personaID, "maya")
        book.join("peter")
        XCTAssertEqual(book.lines.count, 3, "joins count toward the lines kept")
        XCTAssertEqual(book.lines.map(\.joined), [true, false, true], "the oldest line went")
    }

    /// Critic M-F: joins with nothing said between them collapse to the latest.
    func testBackToBackJoinsAreOneLine() {
        var book = CaptionBook()
        book.apply(CaptionChunk(streamID: "s1", segmentID: "a", speaker: .ferni, text: "Let me bring her in.", isFinal: true))
        book.join("maya")
        book.join("ferni")
        XCTAssertEqual(book.lines.map(\.joined), [false, true])
        XCTAssertEqual(book.lines.last?.personaID, "ferni", "the latest join")
        book.apply(CaptionChunk(streamID: "s2", segmentID: "b", speaker: .ferni, text: "I'm back.", isFinal: true))
        book.join("maya")
        XCTAssertEqual(book.lines.map(\.joined), [false, true, false, true], "words between them keep both")
    }

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

// MARK: - The waitlist (#1988's screen, in the new app)

extension CallSessionTests {
    private static let inLine = WaitlistStatus(status: "waiting", position: 432, wavesAway: 4)

    /// Talk refused for the waitlist: their place, back to rest, and not a failure
    /// (no error face, sound or "Try again").
    func testAWaitlistedAccountGetsItsPlaceNotAnError() async {
        tokens.error = FerniAPIError.waitlisted(Self.inLine)
        let session = makeSession()
        XCTAssertNil(session.waitlist)
        session.start()
        await until(session.waitlist == Self.inLine)
        XCTAssertEqual(session.phase, .idle)
        XCTAssertTrue(rooms.made.isEmpty, "no room for someone still in line")
        XCTAssertEqual(tokens.requests.count, 1, "and no retry")
        session.closeWaitlist()
        XCTAssertNil(session.waitlist)
    }

    /// An admitted account never sees it.
    func testAnAdmittedAccountNeverSeesTheWaitlist() async {
        let session = makeSession()
        session.start()
        await until(session.phase == .live)
        XCTAssertNil(session.waitlist)
    }

    /// Any other refusal is still an error with words to act on.
    func testA403ThatIsNotTheWaitlistStaysAnError() async {
        tokens.error = FerniAPIError.status(403)
        let session = makeSession()
        session.start()
        await until(session.phase == .failed(.notSignedIn))
        XCTAssertNil(session.waitlist)
    }

    /// Talk again (their spot opened) starts clean.
    func testTalkingAgainClearsTheWaitlist() async {
        tokens.error = FerniAPIError.waitlisted(Self.inLine)
        let session = makeSession()
        session.start()
        await until(session.waitlist != nil)
        tokens.error = nil
        session.start()
        XCTAssertNil(session.waitlist)
        await until(session.phase == .live)
    }
}
