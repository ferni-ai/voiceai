import FerniDesign
import XCTest
@testable import FerniVoice

/// The avatar state machine against a hand-driven clock (ios-motion-spec §7.1).
final class AvatarDirectorTests: XCTestCase {
    private func ms(_ value: Int) -> Duration { .milliseconds(value) }

    /// A call that has connected and heard its first turn (listening) at t = 0.
    private func live() -> AvatarDirector {
        var d = AvatarDirector()
        _ = d.send(.connectTapped, now: .zero)
        _ = d.send(.agentJoined, now: .zero)
        _ = d.send(.agentState(.listening), now: .zero)
        return d
    }

    func testArrivingUntilFerniJoinsThenTheFirstTurnShowsAtOnce() {
        var d = AvatarDirector()
        _ = d.send(.connectTapped, now: .zero)
        XCTAssertEqual(d.pose, .arriving)
        XCTAssertEqual(d.send(.agentJoined, now: ms(500)), [.haptic(.presence)])
        _ = d.send(.agentState(.speaking), now: ms(500))
        XCTAssertEqual(d.pose, .speaking, "the first turn of a call doesn't wait")
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
                       [.haptic(.handoff), .announce("Maya joined.")])
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
        XCTAssertEqual(d.expression, .sleepy)
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
        XCTAssertEqual(d.send(.ended, now: ms(5000)), [.haptic(.goodbye)])
        XCTAssertEqual(d.pose, .departing)
        _ = d.tick(now: ms(6500))
        XCTAssertEqual(d.pose, .idle)
        XCTAssertEqual(d.expression, .neutral)
    }

    func testCancellingBeforeFerniArrivesHasNoGoodbye() {
        var d = AvatarDirector()
        _ = d.send(.connectTapped, now: .zero)
        XCTAssertEqual(d.send(.ended, now: ms(800)), [])
    }

    func testNoEventEverPlaysTwoHaptics() {
        var d = AvatarDirector()
        let events: [CallEvent] = [.connectTapped, .agentJoined, .agentState(.speaking), .agentJoined,
                                   .reconnecting, .reconnected, .failed, .ended]
        for (i, event) in events.enumerated() {
            let haptics = d.send(event, now: ms(i * 2000)).filter { if case .haptic = $0 { true } else { false } }
            XCTAssertLessThanOrEqual(haptics.count, 1, "\(event)")
        }
    }
}
