import FerniDesign
import Observation
import XCTest
@testable import FerniVoice

/// The avatar state machine against a hand-driven clock (ios-motion-spec §7.1).
final class AvatarDirectorTests: XCTestCase {
    private func ms(_ value: Int) -> Duration { .milliseconds(value) }

    /// A call that has connected and heard its first turn (listening) at t = 0.
    private func live() -> AvatarDirector {
        var d = AvatarDirector()
        _ = d.send(.connectTapped(personaID: "ferni"), now: .zero)
        _ = d.send(.agentJoined, now: .zero)
        _ = d.send(.agentState(.listening), now: .zero)
        return d
    }

    /// Design audit P2 #4: muting changed nothing in Ferni. He settles while
    /// you're away, with a warm flash going and his eyes widening when you're back.
    func testMutingSettlesFerniUntilYouAreBack() {
        var d = live()
        XCTAssertEqual(d.expression, .listening)
        _ = d.send(.muted(true), now: ms(100))
        XCTAssertEqual(d.expression, .calm, "at ease, not listening hard to silence")
        XCTAssertEqual(d.micro?.expression, .warmth)
        _ = d.send(.agentState(.speaking), now: ms(200))
        _ = d.tick(now: ms(400))
        XCTAssertEqual(d.expression, .speaking, "he still talks to you")
        _ = d.send(.agentState(.listening), now: ms(500))
        _ = d.tick(now: ms(700))
        XCTAssertEqual(d.expression, .calm)
        _ = d.send(.muted(false), now: ms(800))
        XCTAssertEqual(d.expression, .listening, "back to listening")
        XCTAssertEqual(d.micro?.expression, .recognition, "with his eyes on you")
        let before = d.micro
        _ = d.send(.muted(false), now: ms(900))
        XCTAssertEqual(d.micro, before, "no flash for a mute that didn't change")
    }

    func testArrivingUntilFerniJoinsThenTheFirstTurnShowsAtOnce() {
        var d = AvatarDirector()
        _ = d.send(.connectTapped(personaID: "ferni"), now: .zero)
        XCTAssertEqual(d.pose, .arriving)
        XCTAssertEqual(d.send(.agentJoined, now: ms(500)), [], "the body's keyed join plays the chime and haptic (gap 4)")
        _ = d.send(.agentState(.speaking), now: ms(500))
        XCTAssertEqual(d.pose, .speaking, "the first turn of a call doesn't wait")
    }

    /// Under Reduce Motion there's no keyed join, so the director still gives
    /// the arrival its note and its tap.
    func testUnderReduceMotionTheJoinIsStillHeardAndFelt() {
        var d = AvatarDirector()
        d.reduceMotion = true
        _ = d.send(.connectTapped(personaID: "ferni"), now: .zero)
        XCTAssertEqual(d.send(.agentJoined, now: ms(500)), [.haptic(.presence), .earcon(.arrival)])
        XCTAssertEqual(d.send(.agentJoined, now: ms(900)), [], "once per call")
    }

    /// Micro-expressions (parity item 2): each one is its own beat, so the
    /// body flashes the same one twice in a row; the face underneath stays.
    func testEachMicroIsANewBeatOverTheSameFace() {
        var d = live()
        XCTAssertNil(d.micro)
        _ = d.send(.micro(.warmth), now: ms(100))
        let first = d.micro
        XCTAssertEqual(first?.expression, .warmth)
        _ = d.send(.micro(.warmth), now: ms(200))
        XCTAssertEqual(d.micro?.expression, .warmth)
        XCTAssertNotEqual(d.micro, first, "the second plays too")
        XCTAssertEqual(d.pose, .listening)
    }

    /// The screen hears a micro on its own, with nothing else changing (the
    /// avatar view replays it from `model.micro`).
    @MainActor
    func testAMicroAloneWakesTheScreen() {
        let model = AvatarModel()
        model.send(.connectTapped(personaID: "ferni"))
        let woke = Woke()
        withObservationTracking { _ = model.micro } onChange: { woke.set() }
        model.send(.micro(.delight))
        XCTAssertTrue(woke.value)
        XCTAssertEqual(model.micro?.expression, .delight)
    }

    /// Choreographed moments (parity item 1) are beats too: the same one
    /// twice plays twice, and a moment alone wakes the screen.
    @MainActor
    func testEachMomentIsANewBeat() {
        let model = AvatarModel()
        model.send(.connectTapped(personaID: "ferni"))
        XCTAssertNil(model.moment)
        let woke = Woke()
        withObservationTracking { _ = model.moment } onChange: { woke.set() }
        model.send(.moment("deep_moment"))
        XCTAssertTrue(woke.value)
        let first = model.moment
        XCTAssertEqual(first?.id, "deep_moment")
        model.send(.moment("deep_moment"))
        XCTAssertNotEqual(model.moment, first)
    }

    func testTheAgentsMicrosReadAsTheDesignSystems() {
        XCTAssertEqual(MicroExpressionType.protective.design, .concern)
        XCTAssertEqual(MicroExpressionType.connection.design, .warmth)
        for same in [MicroExpressionType.concern, .delight, .interest, .warmth, .recognition] {
            XCTAssertEqual(same.design.rawValue, same.rawValue)
        }
    }

    func testAQuickFlickerNeverShows() {
        var d = live()
        _ = d.send(.agentState(.speaking), now: ms(1000))
        _ = d.send(.agentState(.listening), now: ms(1100))
        _ = d.tick(now: ms(1300))
        XCTAssertEqual(d.pose, .listening)
        XCTAssertNil(d.nextDeadline)
    }

    func testATurnShowsAfterHoldingFor150ms() {
        var d = live()
        _ = d.send(.agentState(.thinking), now: ms(1000))
        XCTAssertEqual(d.pose, .listening)
        XCTAssertEqual(d.nextDeadline, ms(1150))
        _ = d.tick(now: ms(1150))
        XCTAssertEqual(d.pose, .thinking)
        XCTAssertEqual(d.expression, .thinking)
    }

    func testReduceMotionSettlesLonger() {
        var d = live()
        d.reduceMotion = true
        _ = d.send(.agentState(.speaking), now: ms(1000))
        _ = d.tick(now: ms(1200))
        XCTAssertEqual(d.pose, .listening)
        _ = d.tick(now: ms(1400))
        XCTAssertEqual(d.pose, .speaking)
    }

    /// Regression for B6: an emotional face expires, and the turn face comes back.
    func testExpressionsHoldThenTheTurnFaceReturns() {
        var d = live()
        _ = d.send(.expression(.warm, hold: nil), now: ms(1000))
        XCTAssertEqual(d.expression, .warm)
        _ = d.send(.agentState(.thinking), now: ms(1000))
        _ = d.tick(now: ms(3499))
        XCTAssertEqual(d.expression, .warm)
        _ = d.tick(now: ms(3500))
        XCTAssertEqual(d.expression, .thinking)

        _ = d.send(.expression(.curious, hold: ms(800)), now: ms(4000))
        _ = d.tick(now: ms(4800))
        XCTAssertEqual(d.expression, .thinking)
    }

    func testFirstWordsHapticOncePerCallAndAgainAfterAHandoff() {
        var d = live()
        XCTAssertEqual(d.send(.agentState(.speaking), now: ms(100)), [])
        XCTAssertEqual(d.tick(now: ms(250)), [.haptic(.firstWord)])
        _ = d.send(.agentState(.listening), now: ms(300))
        _ = d.tick(now: ms(450))
        _ = d.send(.agentState(.speaking), now: ms(500))
        XCTAssertEqual(d.tick(now: ms(650)), [], "only the first words of a call")

        _ = d.send(.handoffStarted(to: "maya"), now: ms(700))
        XCTAssertEqual(d.pose, .handoffArriving(to: "maya"))
        XCTAssertEqual(d.send(.handoffCompleted(to: "maya", name: "Maya"), now: ms(900)),
                       [.haptic(.handoff), .earcon(.handoff(to: "maya")), .announce("Maya joined.")])
        XCTAssertEqual(d.personaID, "maya")
        _ = d.send(.agentState(.listening), now: ms(1000))
        _ = d.tick(now: ms(1150))
        _ = d.send(.agentState(.speaking), now: ms(1200))
        XCTAssertEqual(d.tick(now: ms(1350)), [.haptic(.firstWord)])
    }

    func testPriorityErrorOverReconnectingOverTurns() {
        var d = live()
        _ = d.send(.agentState(.speaking), now: ms(100))
        _ = d.tick(now: ms(250))
        _ = d.send(.reconnecting, now: ms(300))
        XCTAssertEqual(d.pose, .speaking, "a blip under a second doesn't show")
        _ = d.tick(now: ms(1300))
        XCTAssertEqual(d.pose, .reconnecting)
        XCTAssertEqual(d.expression, .attentive, "waiting, eyes open; sleepy read as asleep")
        XCTAssertEqual(d.send(.failed, now: ms(1400)), [.haptic(.error)])
        XCTAssertEqual(d.pose, .error)
        XCTAssertEqual(d.expression, .concerned)
    }

    func testAShortBlipRecoversWithoutAHaptic() {
        var d = live()
        _ = d.send(.reconnecting, now: ms(100))
        XCTAssertEqual(d.send(.reconnected, now: ms(600)), [])
        _ = d.send(.reconnecting, now: ms(1000))
        _ = d.tick(now: ms(2000))
        XCTAssertEqual(d.send(.reconnected, now: ms(2500)), [.haptic(.reconnected)])
        XCTAssertEqual(d.pose, .listening)
    }

    func testHangingUpSaysGoodbyeThenRests() {
        var d = live()
        XCTAssertEqual(d.send(.ended, now: ms(5000)), [.haptic(.goodbye), .earcon(.goodbye)])
        XCTAssertEqual(d.pose, .departing)
        _ = d.tick(now: ms(6500))
        XCTAssertEqual(d.pose, .idle)
        XCTAssertEqual(d.expression, .neutral)
    }

    func testCancellingBeforeFerniArrivesHasNoGoodbye() {
        var d = AvatarDirector()
        _ = d.send(.connectTapped(personaID: "ferni"), now: .zero)
        XCTAssertEqual(d.send(.ended, now: ms(800)), [])
    }

    func testNoEventEverPlaysTwoHaptics() {
        var d = AvatarDirector()
        let events: [CallEvent] = [.connectTapped(personaID: "ferni"), .agentJoined, .agentState(.speaking), .agentJoined,
                                   .reconnecting, .reconnected, .failed, .ended]
        for (i, event) in events.enumerated() {
            let haptics = d.send(event, now: ms(i * 2000)).filter { if case .haptic = $0 { true } else { false } }
            XCTAssertLessThanOrEqual(haptics.count, 1, "\(event)")
        }
    }
}

/// A flag the observation callback can set from any thread.
private final class Woke: @unchecked Sendable {
    private let lock = NSLock()
    private var flag = false
    var value: Bool { lock.withLock { flag } }
    func set() { lock.withLock { flag = true } }
}
