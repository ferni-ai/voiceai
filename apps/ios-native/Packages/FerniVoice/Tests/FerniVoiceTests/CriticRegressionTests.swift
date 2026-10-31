import FerniKit
import Foundation
import LiveKit
import XCTest
@testable import FerniVoice

/// The critic's probes (2026-10-18 review: H1, H2, C2, M1), kept as regressions.
@MainActor
final class CriticRegressionTests: XCTestCase {
    final class Room: VoiceRoom, @unchecked Sendable {
        let events: AsyncStream<RoomEvent>
        private let c: AsyncStream<RoomEvent>.Continuation
        var mic: [Bool] = []
        init() { (events, c) = AsyncStream.makeStream(of: RoomEvent.self) }
        func connect(url: String, token: String) async throws { c.yield(.agentJoined(attributes: ["lk.agent.state": "listening"])) }
        func setMicrophone(enabled: Bool) async throws { mic.append(enabled) }
        func send(_ data: Data) async throws {}
        func disconnect() async { c.finish() }
    }

    final class Audio: CallAudio, @unchecked Sendable {
        let interruptions: AsyncStream<AudioInterruption>
        let i: AsyncStream<AudioInterruption>.Continuation
        var activations = 0
        init() { (interruptions, i) = AsyncStream.makeStream(of: AudioInterruption.self) }
        func requestMicrophone() async -> Bool { true }
        func activate(systemOwned: Bool) throws { activations += 1 }
        func deactivate(systemOwned: Bool) {}
        func systemAudio(active: Bool) {}
    }

    private func until(_ c: @autoclosure () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(2)
        while !c(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
    }

    /// Cancel while the token request is in flight, through the real FerniAPI + CallTokens path.
    func testCancelDuringTheTokenFetchStaysEnded() async {
        let api = FerniAPI(baseURL: URL(string: "https://x.test")!, idToken: { _ in "t" }) { _ in
            try await Task.sleep(for: .seconds(5)) // a slow /token; URLSession would throw URLError(.cancelled)
            throw URLError(.timedOut)
        }
        let session = CallSession(
            fetchToken: CallTokens.fetcher(api: api), makeRoom: { Room() }, audio: Audio(),
            defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await until(session.phase == .connecting)
        try? await Task.sleep(for: .milliseconds(100))
        await session.end()
        XCTAssertEqual(session.phase, .ended)
        try? await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(session.phase, .ended, "Cancel must not turn into an error screen")
    }

    /// Talk to Maya: does the face/name/Live Activity say Maya?
    func testTheChosenTeammateReachesTheAvatar() async {
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { Room() }, audio: Audio(), defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start(personaID: "maya")
        await until(session.phase == .live)
        XCTAssertEqual(session.avatar.personaID, "maya")
    }

    /// An interruption that ends without .shouldResume (common after Siri / a declined call).
    func testAnInterruptionWithoutShouldResumeBringsTheAudioBack() async {
        let room = Room()
        let audio = Audio()
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { room }, audio: audio, defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await until(session.phase == .live)
        audio.i.yield(.began)
        audio.i.yield(.ended(shouldResume: false))
        try? await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(audio.activations, 2, "audio re-activated after the interruption")
    }

    /// Mute carries into the next call.
    func testMuteDoesNotCarryIntoTheNextCall() async {
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { Room() }, audio: Audio(), defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await until(session.phase == .live)
        await session.toggleMute()
        await session.end()
        session.start()
        await until(session.phase == .live)
        XCTAssertFalse(session.isMuted, "a new call starts unmuted")
    }

    /// Critic H1, second half: a connect that finishes after the hang-up must
    /// not open the mic or bring back "Ferni's on the way…".
    func testAConnectThatFinishesAfterHangingUpChangesNothing() async {
        let room = CallSessionTests.FakeRoom(agentOnConnect: nil)
        room.connectDelay = .milliseconds(300)
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { room }, audio: Audio(), defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await until(session.phase == .connecting)
        try? await Task.sleep(for: .milliseconds(100))
        await session.end()
        try? await Task.sleep(for: .milliseconds(500))
        XCTAssertEqual(session.phase, .ended)
        XCTAssertEqual(room.micStates, [], "no mic after hanging up")
    }

    // MARK: - Guards the critic's mutants removed without a test noticing

    /// A room whose events keep arriving after the call moved on (the
    /// stream ignores cancellation, like an event already in flight).
    final class LateRoom: VoiceRoom, @unchecked Sendable {
        private var waiting: [CheckedContinuation<RoomEvent?, Never>] = []
        private var queued: [RoomEvent] = []
        private(set) lazy var events = AsyncStream<RoomEvent>(unfolding: { [unowned self] in await self.next() })
        func connect(url: String, token: String) async throws { push(.agentJoined(attributes: [:])) }
        func setMicrophone(enabled: Bool) async throws {}
        func send(_ data: Data) async throws {}
        func disconnect() async {}
        func push(_ event: RoomEvent) {
            if waiting.isEmpty { queued.append(event) } else { waiting.removeFirst().resume(returning: event) }
        }
        private func next() async -> RoomEvent? {
            if !queued.isEmpty { return queued.removeFirst() }
            return await withCheckedContinuation { waiting.append($0) }
        }
    }

    /// A late "agent left" from the previous call's room must not end the new call.
    func testALateEventFromTheLastRoomDoesNotEndTheNewCall() async {
        final class Made: @unchecked Sendable { var count = 0 }
        let late = LateRoom(), made = Made()
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: {
                made.count += 1
                return made.count == 1 ? late : Room()
            },
            audio: Audio(), defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await until(session.phase == .live)
        await session.end()
        session.start()
        await until(session.phase == .live)
        late.push(.agentLeft)
        late.push(.disconnected(byUs: false))
        try? await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(session.phase, .live, "the old room can't touch the new call")
    }

    /// The real LiveKit delegate drops data that isn't from the agent (here:
    /// no participant at all), so it can't steer the call.
    func testTheRoomDelegateDropsDataNotFromTheAgent() async {
        let voice = LiveKitVoiceRoom(agentLevel: AudioLevelMeter())
        let livekit = LiveKit.Room()
        voice.room(livekit, participant: nil, didReceiveData: Data(#"{"type":"speech_state"}"#.utf8),
                   forTopic: "", encryptionType: .none)
        voice.room(livekit, didStartReconnectWithMode: .quick) // a marker after it
        var events = voice.events.makeAsyncIterator()
        let first = await events.next()
        XCTAssertEqual(first, .reconnecting, "the untrusted data never reached the call")
    }

    /// Hanging up before the call's task has even started must stay hung up
    /// (found while fixing critic M2: the task's first step set "connecting").
    func testHangingUpAtOnceStaysEnded() async {
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x", room: "r", agentDispatched: true) },
            makeRoom: { Room() }, audio: Audio(), defaults: UserDefaults(suiteName: "probe-\(UUID())")!
        )
        session.start()
        await session.end()
        try? await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(session.phase, .ended)
    }
}

