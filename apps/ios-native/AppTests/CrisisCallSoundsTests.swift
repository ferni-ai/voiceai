import FerniDesign
import FerniKit
import FerniVoice
import XCTest
@testable import Ferni

/// #2868 item 2: once a call is marked crisis, no decorative sound or haptic
/// plays, from the mark through the goodbye. VoiceOver, the call failing and
/// the call coming back still do, and a normal call keeps every one.
@MainActor
final class CrisisCallSoundsTests: XCTestCase {
    @MainActor final class Haptics: HapticPlaying {
        var played: [HapticCue] = []
        func play(_ cue: HapticCue) { played.append(cue) }
    }

    private let haptics = Haptics()
    private var sounds: [String] = []
    private var announced: [String] = []
    private var clock = Duration.zero

    override func setUp() async throws {
        CrisisMarker.reset()
        UserDefaults.standard.removeObject(forKey: CallFeedback.soundsKey) // Sounds on, the default
    }

    override func tearDown() async throws { CrisisMarker.reset() }

    private func feedback() -> CallFeedback {
        let feedback = CallFeedback(
            haptics: haptics,
            announce: { [unowned self] in announced.append($0) },
            sound: { [unowned self] in sounds.append($0) },
            now: { [unowned self] in clock }
        )
        feedback.newCall()
        return feedback
    }

    /// A whole call's feedback, in order.
    private let wholeCall: [AvatarEffect] = [
        .haptic(.presence), .earcon(.arrival), .haptic(.firstWord), .haptic(.touch),
        .haptic(.handoff), .earcon(.handoff(to: "maya")), .announce("Maya joined."),
        .haptic(.reconnected), .haptic(.error), .haptic(.goodbye), .earcon(.goodbye),
    ]
    private let everySound = ["arrival", "handoff-to-maya", "goodbye"]
    private let everyHaptic: [HapticCue] = [.presence, .firstWord, .touch, .handoff, .reconnected, .error, .goodbye]

    /// 30 s apart, so the sound director's own gaps never decide.
    private func play(_ effects: some Sequence<AvatarEffect>, on feedback: CallFeedback) {
        for effect in effects {
            clock += .seconds(30)
            feedback.play(effect)
        }
    }

    func testANormalCallPlaysEverySoundAndHaptic() {
        play(wholeCall, on: feedback())
        XCTAssertEqual(sounds, everySound)
        XCTAssertEqual(haptics.played, everyHaptic)
        XCTAssertEqual(announced, ["Maya joined."])
    }

    func testACrisisCallPlaysOnlyWhatThePersonReliesOn() {
        let feedback = feedback()
        CrisisMarker.mark()
        play(wholeCall, on: feedback)
        XCTAssertEqual(sounds, [], "no sound in a crisis")
        XCTAssertEqual(haptics.played, [.reconnected, .error])
        XCTAssertEqual(announced, ["Maya joined."], "VoiceOver still speaks")
    }

    func testSoundsBeforeTheMarkPlayAndAfterItDont() {
        let feedback = feedback()
        play(wholeCall.prefix(2), on: feedback)
        XCTAssertEqual(sounds, ["arrival"], "precondition: before the mark they play")
        CrisisMarker.mark()
        play(wholeCall.dropFirst(2), on: feedback)
        XCTAssertEqual(sounds, ["arrival"])
        XCTAssertEqual(haptics.played, [.presence, .reconnected, .error])
    }

    /// CallSession clears `thisCall` (`endCall()`) before the goodbye plays.
    func testTheGoodbyeAsTheCallEndsStaysQuiet() {
        let feedback = feedback()
        CrisisMarker.mark()
        _ = CrisisMarker.endCall()
        play([.haptic(.goodbye), .earcon(.goodbye)], on: feedback)
        XCTAssertEqual(sounds, [])
        XCTAssertEqual(haptics.played, [])
    }

    func testTheNextCallPlaysEverythingAgain() {
        let feedback = feedback()
        CrisisMarker.mark()
        _ = CrisisMarker.endCall()
        clock += .seconds(300)
        feedback.newCall()
        play(wholeCall, on: feedback)
        XCTAssertEqual(sounds, everySound)
        XCTAssertEqual(haptics.played, everyHaptic)
    }

    /// The cues from Ferni's body (the join's note and tap, a touch's tap) pass the same check.
    func testTheCuesFromFerniBodyStopToo() {
        let feedback = feedback()
        feedback.play(KeyedCue.land)
        XCTAssertEqual(haptics.played, [.presence], "precondition: before the mark they play")
        CrisisMarker.mark()
        clock += .seconds(30)
        [KeyedCue.arrivalChime, .land, .touch].forEach(feedback.play)
        XCTAssertEqual(sounds, [])
        XCTAssertEqual(haptics.played, [.presence])
    }

    // MARK: - Through a real call

    final class Room: VoiceRoom, @unchecked Sendable {
        let events: AsyncStream<RoomEvent>
        let c: AsyncStream<RoomEvent>.Continuation
        init() { (events, c) = AsyncStream.makeStream(of: RoomEvent.self) }
        func connect(url: String, token: String) async throws { c.yield(.agentJoined(attributes: ["lk.agent.state": "listening"])) }
        func setMicrophone(enabled: Bool) async throws {}
        func send(_ data: Data) async throws {}
        func disconnect() async { c.finish() }
    }

    final class Audio: CallAudio, @unchecked Sendable {
        let interruptions = AsyncStream<AudioInterruption> { _ in }
        func requestMicrophone() async -> Bool { true }
        func activate(systemOwned: Bool) throws {}
        func deactivate(systemOwned: Bool) {}
        func systemAudio(active: Bool) {}
    }

    final class Rooms: @unchecked Sendable { var made: [Room] = [] }

    private let crisis = try! JSONSerialization.data(withJSONObject: [
        "type": "humanization_signal", "signalType": "concern_detected", "concernLevel": "crisis", "timestamp": 0.0,
    ])

    private func until(_ c: @autoclosure () -> Bool) async {
        let deadline = ContinuousClock.now + .seconds(10)
        while !c(), ContinuousClock.now < deadline { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(c(), "timed out")
    }

    /// A call through CallSession and the avatar, as the app wires them; ended by the person.
    private func call(crisis: Bool) async {
        let feedback = feedback()
        let avatar = AvatarModel(play: { feedback.play($0) })
        avatar.reduceMotion = true // the join's note and tap come from the director, not the view
        let rooms = Rooms()
        let session = CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://x.test", room: "r", agentDispatched: true) },
            makeRoom: { let room = Room(); rooms.made.append(room); return room },
            audio: Audio(), avatar: avatar,
            defaults: UserDefaults(suiteName: "crisis-sounds-\(UUID().uuidString)")!
        )
        session.start()
        await until(session.phase == .live)
        XCTAssertEqual(sounds, ["arrival"], "precondition: the call's sounds play")
        if crisis {
            rooms.made.last?.c.yield(.data(self.crisis))
            await until(CrisisMarker.thisCall)
        }
        clock += .seconds(30)
        await session.end()
    }

    func testThroughARealCallANormalCallSaysGoodbye() async {
        await call(crisis: false)
        XCTAssertEqual(sounds, ["arrival", "goodbye"])
        XCTAssertEqual(haptics.played, [.presence, .goodbye])
    }

    func testThroughARealCallTheServersCrisisSignalSilencesTheGoodbye() async {
        await call(crisis: true)
        XCTAssertEqual(sounds, ["arrival"], "no goodbye chime after a crisis")
        XCTAssertEqual(haptics.played, [.presence])
    }

    /// Talk mid-call starts nothing, so it mustn't make the running crisis call loud again.
    func testTalkDuringACrisisCallKeepsItQuiet() async {
        let model = AppModel(config: UITestScenario.config, firebaseReady: false, scenario: "call")
        XCTAssertTrue(model.call.isActive, "precondition: a call is running")
        XCTAssertFalse(model.account.needsSignIn, "precondition: Talk reaches the feedback")
        CrisisMarker.mark()
        model.talk()
        XCTAssertTrue(CrisisMarker.latestCallHadCrisis)
        await model.call.end()
    }
}
